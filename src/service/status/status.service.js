const fs = require('fs')
const path = require('path')
const { MessageMedia } = require('whatsapp-web.js')

const { ensureAssetDirs, getVideos, getImages, VIDEO_DIR, IMAGE_DIR } = require('./status.assets')
const { getRandomCaption } = require('./status.captions')
const { addToHistory, setLastSlot, getLastSlot } = require('./status.memory')
const { logSuccess, logError, logInfo } = require('./status.logger')
const { determineSlot, getAssetTypeForSlot, selectRandomAsset } = require('./status.scheduler')

const STATUS_BROADCAST = 'status@broadcast'
const MAX_RETRIES = 2

let isPosting = false

async function retryPost(client, file, media, caption, assetType, slot, retries = 0) {
  try {
    await client.sendMessage(STATUS_BROADCAST, media, { caption })
    addToHistory(assetType, file)
    logSuccess(file, { assetType, slot })
    return true
  } catch (error) {
    if (retries < MAX_RETRIES) {
      logInfo('Retry posting', { file, attempt: retries + 1, error: error.message })
      await new Promise(resolve => setTimeout(resolve, 2000))
      return retryPost(client, file, media, caption, assetType, slot, retries + 1)
    }

    logError('Failed to post after retries', { file, error: error.message })
    return false
  }
}

async function loadFileAsMedia(filepath, mimeType, filename) {
  try {
    if (!fs.existsSync(filepath)) {
      logError('File not found', { filepath })
      return null
    }

    const data = fs.readFileSync(filepath)
    const base64 = data.toString('base64')
    return new MessageMedia(mimeType, base64, filename)
  } catch (error) {
    logError('Failed to load file as media', { file: filename, error: error.message })
    return null
  }
}

async function postStatus(client) {
  if (isPosting) {
    return
  }

  if (!client || !client.info) {
    logInfo('Client not ready, skipping status post')
    return
  }

  isPosting = true

  try {
    ensureAssetDirs()

    const slot = determineSlot()
    if (!slot) {
      logInfo('No schedule window at this time, skipping')
      return
    }

    const lastSlot = getLastSlot()
    if (lastSlot === slot) {
      logInfo('Already posted in current slot', { slot })
      return
    }

    const assetType = getAssetTypeForSlot(slot)
    if (!assetType) {
      logError('Unable to determine asset type for slot', { slot })
      return
    }

    const file = selectRandomAsset(assetType)
    if (!file) {
      logError('No assets available for status post', { assetType, slot })
      return
    }

    const assetDir = assetType === 'video' ? VIDEO_DIR : IMAGE_DIR
    const filepath = path.join(assetDir, file)

    const ext = path.extname(file).toLowerCase()
    let mimeType = 'video/mp4'
    if (assetType === 'image') {
      if (ext === '.png') mimeType = 'image/png'
      else mimeType = 'image/jpeg'
    }

    const media = await loadFileAsMedia(filepath, mimeType, file)
    if (!media) {
      return
    }

    const { caption } = getRandomCaption(assetType)
    const success = await retryPost(client, file, media, caption, assetType, slot)

    if (success) {
      setLastSlot(slot)
      logInfo('Status posted successfully', { slot, assetType, file })
    }
  } catch (error) {
    logError('Unexpected error in postStatus', { error: error.message })
  } finally {
    isPosting = false
  }
}

module.exports = {
  postStatus,
  determineSlot
}
