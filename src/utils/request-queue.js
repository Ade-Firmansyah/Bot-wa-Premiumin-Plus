const { logRetry, logError } = require('./logger')

const MAX_CONCURRENCY = 2
const queue = []
let activeCount = 0
const pendingRequests = new Map()

async function processQueue() {
  if (activeCount >= MAX_CONCURRENCY || queue.length === 0) {
    return
  }

  const job = queue.shift()
  activeCount += 1

  try {
    const result = await job.fn()
    job.resolve(result)
  } catch (error) {
    job.reject(error)
  } finally {
    activeCount -= 1
    processQueue().catch(err => logError('Request queue processing failed', err))
  }
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject })
    processQueue().catch(err => logError('Request queue failed', err))
  })
}

function dedupe(key, fn) {
  if (!key) {
    return enqueue(fn)
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)
  }

  const promise = enqueue(fn)
    .finally(() => pendingRequests.delete(key))

  pendingRequests.set(key, promise)
  return promise
}

module.exports = {
  enqueue,
  dedupe
}
