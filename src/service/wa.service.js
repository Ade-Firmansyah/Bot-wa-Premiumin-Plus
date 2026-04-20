const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const qrcode = require('qrcode-terminal')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const { logInfo, logError } = require('../utils/logger')
const { SESSION_PATH } = require('../config')

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

function createClient() {
  ensureSessionPath()

  // For Railway deployment, use different configuration
  const isRailway = process.env.RAILWAY_ENVIRONMENT

  if (isRailway) {
    clearSessionData()
    killExistingBrowsers()
  }

  // For local development, always use unique session path to avoid conflicts
  let sessionPath = SESSION_PATH
  if (!isRailway) {
    sessionPath = path.join(SESSION_PATH, `session_${Date.now()}`)
  } else {
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
      executablePath: isRailway ? undefined : undefined, // Let Puppeteer find Chrome
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

  return client
}

module.exports = {
  createClient,
  killExistingBrowsers,
  MessageMedia
}
