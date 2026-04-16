const { logInfo, logError } = require('./logger')

const queue = []
let isProcessing = false

async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  while (queue.length > 0) {
    const job = queue.shift()
    try {
      logInfo('Processing queued message', { from: job.msg.from, body: job.msg.body })
      await job.handler(job.client, job.msg)
    } catch (error) {
      logError('Queue job failed', { error: error.message, from: job.msg.from })
    }
  }

  isProcessing = false
}

function enqueue(client, msg, handler) {
  queue.push({ client, msg, handler })
  processQueue().catch(error => {
    logError('Queue processing failed', error)
  })
}

module.exports = {
  enqueue
}
