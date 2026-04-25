const { enqueue } = require('../utils/queue')
const { handleCommand } = require('./command.handler')
const { logInfo } = require('../utils/logger')

const ALLOWED_COMMANDS = [
  'menu', 'help',
  'stok', 'stock',
  'buy',
  'status',
  'cancel',
  'admin',
  'ping', 'p', 'cek',
  'testpay',
  'reseller', 'gabung',
  'website',
  'halo', 'test', 'assalamualaikum'
]

function isValidCommand(text) {
  const normalized = String(text).toLowerCase().trim()

  // Check exact command matches first
  if (ALLOWED_COMMANDS.includes(normalized)) {
    return true
  }

  // Check if message starts with any allowed command
  return ALLOWED_COMMANDS.some(cmd => normalized.startsWith(cmd + ' ') || normalized === cmd)
}

async function handleIncomingMessage(client, msg) {
  if (!msg.body) return

  const from = msg.from || ''
  const text = msg.body.toString()

  // Ignore broadcast/status messages
  if (from === 'status@broadcast' || from.includes('broadcast')) {
    return
  }

  // Optionally ignore group messages (uncomment to enable)
  // if (from.endsWith('@g.us')) {
  //   return
  // }

  // Only process valid commands
  if (!isValidCommand(text)) {
    // Senior mode: Don't respond to invalid commands
    return
  }

  logInfo('Received command', { from, body: text })
  enqueue(client, msg, handleCommand)
}

module.exports = {
  handleIncomingMessage
}
