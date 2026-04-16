const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(process.cwd(), 'database', 'status_history.json')

const DEFAULT_HISTORY = {
  lastVideos: [],
  lastImages: [],
  lastPostTime: 0,
  lastSlot: null
}

function normalizeHistory(rawHistory) {
  if (!rawHistory || typeof rawHistory !== 'object') {
    return { ...DEFAULT_HISTORY }
  }

  return {
    lastVideos: Array.isArray(rawHistory.lastVideos) ? rawHistory.lastVideos : [],
    lastImages: Array.isArray(rawHistory.lastImages) ? rawHistory.lastImages : [],
    lastPostTime: typeof rawHistory.lastPostTime === 'number' ? rawHistory.lastPostTime : 0,
    lastSlot: typeof rawHistory.lastSlot === 'string' ? rawHistory.lastSlot : null
  }
}

function ensureHistoryFile() {
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_HISTORY, null, 2), 'utf8')
    return { ...DEFAULT_HISTORY }
  }

  try {
    const data = fs.readFileSync(DB_PATH, 'utf8')
    const parsed = JSON.parse(data)
    const normalized = normalizeHistory(parsed)
    fs.writeFileSync(DB_PATH, JSON.stringify(normalized, null, 2), 'utf8')
    return normalized
  } catch (error) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_HISTORY, null, 2), 'utf8')
    return { ...DEFAULT_HISTORY }
  }
}

function loadHistory() {
  try {
    return ensureHistoryFile()
  } catch (error) {
    return { ...DEFAULT_HISTORY }
  }
}

function saveHistory(history) {
  try {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(normalizeHistory(history), null, 2), 'utf8')
    return true
  } catch (error) {
    return false
  }
}

function addToHistory(type, filename) {
  const history = loadHistory()
  if (type === 'video') {
    history.lastVideos.unshift(filename)
    if (history.lastVideos.length > 10) {
      history.lastVideos.pop()
    }
  } else if (type === 'image') {
    history.lastImages.unshift(filename)
    if (history.lastImages.length > 10) {
      history.lastImages.pop()
    }
  }
  history.lastPostTime = Date.now()
  saveHistory(history)
}

function getRecentHistory(type, count = 3) {
  const history = loadHistory()
  if (type === 'video') {
    return history.lastVideos.slice(0, count)
  } else if (type === 'image') {
    return history.lastImages.slice(0, count)
  }
  return []
}

function setLastSlot(slot) {
  const history = loadHistory()
  history.lastSlot = slot
  saveHistory(history)
}

function getLastSlot() {
  const history = loadHistory()
  return history.lastSlot
}

function resetHistoryIfNeeded(type, totalFiles) {
  const history = loadHistory()
  const historyList = type === 'video' ? history.lastVideos : history.lastImages
  if (historyList.length >= totalFiles) {
    if (type === 'video') {
      history.lastVideos = []
    } else {
      history.lastImages = []
    }
    saveHistory(history)
  }
}

module.exports = {
  ensureHistoryFile,
  loadHistory,
  saveHistory,
  addToHistory,
  getRecentHistory,
  setLastSlot,
  getLastSlot,
  resetHistoryIfNeeded
}
