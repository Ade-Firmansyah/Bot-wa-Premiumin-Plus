const fs = require('fs')
const path = require('path')
const qrcode = require('qrcode-terminal')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const { logInfo, logError } = require('../utils/logger')
const { SESSION_PATH } = require('../config')

function ensureSessionPath() {
  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH, { recursive: true })
  }
}

function createClient() {
  ensureSessionPath()

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
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

  client.on('auth_failure', failure => {
    logError('WhatsApp authentication failure', failure)
    setTimeout(() => {
      logInfo('Attempting WhatsApp reinitialization after auth failure')
      client.initialize().catch(err => logError('WhatsApp reinitialize error', err))
    }, 5000)
  })

  client.on('disconnected', reason => {
    logError('WhatsApp disconnected', reason)
    setTimeout(() => {
      logInfo('Attempting WhatsApp reconnect after disconnect')
      client.initialize().catch(err => logError('WhatsApp reconnect error', err))
    }, 5000)
  })

  return client
}

module.exports = {
  createClient,
  MessageMedia
}
