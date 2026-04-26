const { validateSystem } = require('../../utils/validator')
const { postStatus } = require('./status.service')
const { logInfo, logError } = require('./status.logger')

const SCHEDULE_INTERVAL_MS = 10 * 60 * 1000
let schedulerTimer = null
let isSchedulerRunning = false

function validateAndInitialize() {
  if (!validateSystem()) {
    logError('Status scheduler system validation failed')
    return false
  }

  logInfo('Status scheduler system validated and ready')
  return true
}

function scheduleNext(client) {
  if (!isSchedulerRunning) return
  schedulerTimer = setTimeout(async () => {
    try {
      await postStatus(client)
    } catch (error) {
      logError('Error in scheduler cycle', { error: error.message })
    } finally {
      scheduleNext(client)
    }
  }, SCHEDULE_INTERVAL_MS)
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
  logInfo('Status scheduler started', { interval: '10 minutes' })

  postStatus(client)
    .catch(error => logError('Initial status post failed', { error: error.message }))
    .finally(() => scheduleNext(client))
}

function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer)
    schedulerTimer = null
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
