const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')
const qrcode = require('qrcode-terminal')
const QRCode = require('qrcode')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const { logInfo, logError } = require('../utils/logger')
const { SESSION_PATH } = require('../config')

let latestQrDataUrl = null
let qrServer = null

function ensureSessionPath() {
  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }
}

function killExistingBrowsers() {
  return new Promise((resolve) => {
    try {
      // Kill Chrome processes on Windows
      const kill = spawn('taskkill', ['/f', '/im', 'chrome.exe', '/t'], { stdio: 'inherit' })
      kill.on('close', () => {
        logInfo('Killed existing Chrome processes')
        resolve()
      })
      kill.on('error', () => {
        // Ignore errors if no processes found
        resolve()
      })
    } catch (error) {
      logError('Failed to kill existing browsers', error)
      resolve()
    }
  })
}

function clearSessionData() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      const files = fs.readdirSync(SESSION_PATH)
      for (const file of files) {
        const filePath = path.join(SESSION_PATH, file)
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath)
        }
      }
      logInfo('Cleared existing session data')
    }
  } catch (error) {
    logError('Failed to clear session data', error)
  }
}

function startQrHttpServer(port = process.env.PORT || 3000) {
  if (qrServer) {
    return
  }

  qrServer = http.createServer((req, res) => {
    if (req.url !== '/' && req.url !== '/qr') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('Not found')
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>WhatsApp QR</title>
  <style>body{font-family:Arial,sans-serif;text-align:center;padding:30px;background:#111;color:#fff}img{max-width:100%;height:auto;border:4px solid #fff;box-shadow:0 0 20px rgba(255,255,255,.2)}.hint{margin-top:16px;font-size:16px;opacity:.8;}</style>
</head>
<body>
  <h1>Scan WhatsApp QR</h1>
  ${latestQrDataUrl ? `<img src="${latestQrDataUrl}" alt="WhatsApp QR Code"/>` : '<p>Menunggu QR baru...</p>'}
  <p class="hint">Reload halaman jika QR belum muncul.</p>
</body>
</html>`

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  })

  qrServer.on('error', (err) => {
    logError('QR HTTP server error', err)
  })

  qrServer.listen(port, () => {
    logInfo(`QR page available on http://localhost:${port} (use Railway public URL)`)
  })
}

function createClient() {
  ensureSessionPath()

  // For Railway deployment, use different configuration
  const isRailway = process.env.RAILWAY_ENVIRONMENT

  if (isRailway) {
    clearSessionData()
    killExistingBrowsers()
  }

  // For Railway, browser processes are killed in createClient
  // For local development, use unique session path to avoid conflicts
  let sessionPath = SESSION_PATH
  if (!isRailway) {
    sessionPath = path.join(SESSION_PATH, `session_${Date.now()}`)
  }

  // Use stable session configuration to prevent random logouts
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: "bot-session",
      dataPath: "./sessions"
    }),
    puppeteer: {
      headless: true,
      executablePath: isRailway ? '/usr/bin/chromium' : undefined, // Use Chromium binary path on Debian/Railway
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-extensions',
        '--disable-features=TranslateUI',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-preconnect',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--enable-automation',
        '--no-first-run',
        '--no-pings',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-resources',
        '--disable-component-extensions-with-background-pages',
        '--disable-component-update',
        '--disable-background-networking', // Optimasi: kurangi background networking
        '--disable-background-timer-throttling', // Optimasi: kurangi throttling untuk memory
        '--memory-pressure-off', // Optimasi: matikan memory pressure handling
        '--max_old_space_size=512', // Optimasi: batasi heap size untuk stability
        '--optimize-for-size', // Optimasi: optimasi untuk ukuran kecil
        '--disable-logging', // Optimasi: disable logging untuk performa
        '--disable-dev-tools', // Optimasi: disable dev tools
        '--disable-software-rasterizer', // Optimasi: disable software rasterizer
        ...(isRailway ? [
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-features=UserMediaScreenCapturing',
          '--memory-pressure-off'
        ] : [])
      ]
    }
  })

  client.on('qr', qr => {
    logInfo('QR code generated, scan with WhatsApp mobile app')
    qrcode.generate(qr, { small: true })

    QRCode.toDataURL(qr)
      .then((url) => {
        latestQrDataUrl = url
        logInfo('QR image generated for browser preview')
      })
      .catch((error) => {
        logError('Failed to generate QR image', error)
      })
  })

  client.on('ready', () => {
    logInfo('WhatsApp client ready')
  })

  client.on('auth_failure', (msg) => {
    logError('WhatsApp authentication failure', { message: msg })
    // Only log, don't attempt reconnect to avoid loops
  })

  client.on('disconnected', (reason) => {
    if (reason === 'LOGOUT') {
      logInfo('User logged out from phone - session ended')
      // Don't reconnect if user logged out
    } else {
      logError('WhatsApp disconnected unexpectedly', { reason })
      // Attempt to reconnect for non-logout disconnections
      setTimeout(() => {
        logInfo('Attempting WhatsApp reconnect after unexpected disconnect')
        client.initialize().catch(err => logError('WhatsApp reconnect error', err))
      }, 5000)
    }
  })

  if (process.env.PORT || process.env.RAILWAY_ENVIRONMENT) {
    startQrHttpServer()
  }

  return client
}

module.exports = {
  createClient,
  killExistingBrowsers,
  MessageMedia
}
