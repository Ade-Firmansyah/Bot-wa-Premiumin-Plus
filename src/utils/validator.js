const fs = require('fs')
const path = require('path')
const { logInfo, logError } = require('./logger')
const { ensureAssetDirs } = require('../service/status/status.assets')
const { ensureHistoryFile } = require('../service/status/status.memory')
const { ensureLogsDir } = require('../service/status/status.logger')

const DATABASE_DIR = path.join(process.cwd(), 'database')
const LOGS_DIR = path.join(process.cwd(), 'logs')
const STATUS_LOG_FILE = path.join(LOGS_DIR, 'status.log')

const DEFAULT_HISTORY = {
  lastVideos: [],
  lastImages: [],
  lastPostTime: 0,
  lastSlot: null
}

function ensureDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true })
  }
}

function ensureJsonFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf8')
  }
}

function ensureLogFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf8')
  }
}

function validateSystem() {
  try {
    ensureAssetDirs()
    ensureDirectory(DATABASE_DIR)
    ensureDirectory(LOGS_DIR)

    ensureJsonFile(path.join(DATABASE_DIR, 'status_history.json'), DEFAULT_HISTORY)
    ensureLogFile(STATUS_LOG_FILE)
    ensureHistoryFile()

    logInfo('System validation completed successfully')
    return true
  } catch (error) {
    logError('System validation failed', { error: error.message })
    return false
  }
}

module.exports = {
  validateSystem
}
