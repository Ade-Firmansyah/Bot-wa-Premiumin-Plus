const { validateSystem } = require('../../utils/validator')
const { postStatus } = require('./status.service')
const { logInfo, logError } = require('./status.logger')

let schedulerIntervalId = null
let isSchedulerRunning = false

function validateAndInitialize() {
  if (!validateSystem()) {
    logError('Status scheduler system validation failed')
    return false
  }

  logInfo('Status scheduler system validated and ready')
  return true
}

function startScheduler(client) {
  if (isSchedulerRunning) {
    logInfo('Scheduler already running')
    return
  }

  if (!validateAndInitialize()) {
    logError('Validation failed, scheduler not started')
    return
  }

  isSchedulerRunning = true

  schedulerIntervalId = setInterval(() => {
    postStatus(client).catch(error => {
      logError('Error in scheduler interval', { error: error.message })
    })
  }, 10 * 60 * 1000)

  logInfo('Status scheduler started', { interval: '10 minutes' })

  postStatus(client).catch(error => {
    logError('Initial status post failed', { error: error.message })
  })
}

function stopScheduler() {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId)
    schedulerIntervalId = null
  }
  isSchedulerRunning = false
  logInfo('Status scheduler stopped')
}

module.exports = {
  startScheduler,
  stopScheduler,
  validateAndInitialize,
  isSchedulerRunning: () => isSchedulerRunning
}
