const { logInfo, logError } = require('./logger')

const queue = []
let isProcessing = false
const MAX_QUEUE_SIZE = 50 // Limit queue size to prevent memory bloat

// Optimasi: Debounce map untuk mencegah spam dari user yang sama
const debounceMap = new Map()
const DEBOUNCE_TIME = 2000 // 2 detik debounce per user

// Optimasi: Cleanup debounce map periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, timestamp] of debounceMap.entries()) {
    if (now - timestamp > DEBOUNCE_TIME * 2) {
      debounceMap.delete(key)
    }
  }
}, 60000) // Cleanup every minute

async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  while (queue.length > 0) {
    const job = queue.shift()
    try {
      // Optimasi: Skip log untuk performa
      // logInfo('Processing queued message', { from: job.msg.from, body: job.msg.body })
      await job.handler(job.client, job.msg)
    } catch (error) {
      logError('Queue job failed', { error: error.message, from: job.msg.from })
    }
  }

  isProcessing = false
}

function enqueue(client, msg, handler) {
  const userId = msg.from
  const now = Date.now()

  // Optimasi: Debounce untuk mencegah spam
  if (debounceMap.has(userId)) {
    const lastTime = debounceMap.get(userId)
    if (now - lastTime < DEBOUNCE_TIME) {
      // logInfo('Debounced message', { from: userId }) // Skip log untuk performa
      return
    }
  }
  debounceMap.set(userId, now)

  // Prevent queue from growing too large
  if (queue.length >= MAX_QUEUE_SIZE) {
    logError('Queue overflow', { size: queue.length })
    return
  }

  queue.push({ client, msg, handler })
  processQueue().catch(error => {
    logError('Queue processing failed', error)
  })
}

module.exports = {
  enqueue
}
