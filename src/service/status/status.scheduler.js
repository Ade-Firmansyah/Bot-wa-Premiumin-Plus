const { getVideos, getImages } = require('./status.assets')
const { getRecentHistory, resetHistoryIfNeeded } = require('./status.memory')

function getCurrentTimeInJakarta() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(now)
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10)
  const minute = parseInt(parts.find(p => p.type === 'minute').value, 10)
  return { hour, minute, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
}

function determineSlot() {
  const { hour } = getCurrentTimeInJakarta()

  if (hour >= 7 && hour < 10) {
    return 'PAGI'
  }

  if (hour >= 12 && hour < 15) {
    return 'SIANG'
  }

  if (hour >= 19 && hour < 22) {
    return 'MALAM'
  }

  return null
}

function getAssetTypeForSlot(slot) {
  if (slot === 'PAGI') {
    return 'image'
  }

  if (slot === 'SIANG' || slot === 'MALAM') {
    return 'video'
  }

  return null
}

function selectRandomAsset(assetType) {
  const files = assetType === 'video' ? getVideos() : getImages()

  if (!files || files.length === 0) {
    return null
  }

  const recent = getRecentHistory(assetType, Math.min(3, files.length))

  const available = files.filter(file => !recent.includes(file))
  if (available.length === 0) {
    resetHistoryIfNeeded(assetType, files.length)
    return files[Math.floor(Math.random() * files.length)]
  }

  return available[Math.floor(Math.random() * available.length)]
}

module.exports = {
  getCurrentTimeInJakarta,
  determineSlot,
  getAssetTypeForSlot,
  selectRandomAsset
}
