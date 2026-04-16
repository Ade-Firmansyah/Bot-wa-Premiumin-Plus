const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const VIDEO_DIR = path.join(process.cwd(), 'main', 'asset', 'video')
const IMAGE_DIR = path.join(process.cwd(), 'main', 'asset', 'image')

let videoCacheTime = 0
let imageCacheTime = 0
let videoCache = []
let imageCache = []
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

function ensureAssetDirs() {
  if (!fs.existsSync(VIDEO_DIR)) {
    fs.mkdirSync(VIDEO_DIR, { recursive: true })
  }

  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true })
  }
}

function getFiles(dir, extensions) {
  try {
    if (!fs.existsSync(dir)) {
      return []
    }

    const files = fs.readdirSync(dir)
    return files.filter(f => {
      const ext = path.extname(f).toLowerCase()
      return extensions.includes(ext)
    })
  } catch (error) {
    return []
  }
}

function getVideos(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && videoCacheTime && now - videoCacheTime < CACHE_TTL && videoCache.length > 0) {
    return videoCache
  }

  ensureAssetDirs()
  const videos = getFiles(VIDEO_DIR, ['.mp4'])
  videoCache = videos
  videoCacheTime = now
  return videos
}

function getImages(forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && imageCacheTime && now - imageCacheTime < CACHE_TTL && imageCache.length > 0) {
    return imageCache
  }

  ensureAssetDirs()
  const images = getFiles(IMAGE_DIR, ['.jpg', '.jpeg', '.png'])
  imageCache = images
  imageCacheTime = now
  return images
}

function computeFileHash(filepath) {
  const buffer = fs.readFileSync(filepath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function cleanDuplicateVideos(logFn = null) {
  ensureAssetDirs()
  const files = getFiles(VIDEO_DIR, ['.mp4'])
  const seenHashes = new Map()
  const removedFiles = []

  files.forEach(file => {
    const filepath = path.join(VIDEO_DIR, file)
    const stats = fs.statSync(filepath)

    if (!stats.isFile()) {
      return
    }

    const fileHash = computeFileHash(filepath)
    const hashKey = `${fileHash}:${stats.size}`

    if (seenHashes.has(hashKey)) {
      fs.unlinkSync(filepath)
      removedFiles.push(file)
      if (typeof logFn === 'function') {
        logFn('Duplicate video removed', { file, duplicateOf: seenHashes.get(hashKey), size: stats.size })
      }
    } else {
      seenHashes.set(hashKey, file)
    }
  })

  if (removedFiles.length > 0) {
    invalidateCache()
  }

  return removedFiles
}

function invalidateCache() {
  videoCacheTime = 0
  imageCacheTime = 0
  videoCache = []
  imageCache = []
}

module.exports = {
  ensureAssetDirs,
  getVideos,
  getImages,
  cleanDuplicateVideos,
  invalidateCache,
  VIDEO_DIR,
  IMAGE_DIR
}
