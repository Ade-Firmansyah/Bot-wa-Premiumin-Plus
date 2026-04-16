const fs = require('fs')
const path = require('path')

const LOGS_DIR = path.join(process.cwd(), 'logs')
const LOG_FILE = path.join(LOGS_DIR, 'status.log')

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true })
  }
}

function formatTimestamp() {
  return new Date().toISOString()
}

function logToFile(level, message, data = {}) {
  try {
    ensureLogsDir()
    const timestamp = formatTimestamp()
    const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data) : ''
    const logLine = `[${timestamp}] ${level} | ${message} ${dataStr}\n`
    fs.appendFileSync(LOG_FILE, logLine, 'utf8')
  } catch (error) {
    console.error('Failed to write to log file:', error.message)
  }
}

function logSuccess(filename, data = {}) {
  logToFile('SUCCESS', `Posted ${filename}`, data)
}

function logError(message, data = {}) {
  logToFile('ERROR', message, data)
}

function logInfo(message, data = {}) {
  logToFile('INFO', message, data)
}

module.exports = {
  ensureLogsDir,
  logToFile,
  logSuccess,
  logError,
  logInfo
}
