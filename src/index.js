const { createClient } = require('./service/wa.service')
const { handleIncomingMessage } = require('./handler/message.handler')
const { startOrderWatcher } = require('./handler/order.handler')
const { startScheduler: startStatusScheduler, stopScheduler: stopStatusScheduler } = require('./service/status.service')
const { validateSystem } = require('./utils/validator')
const resellerService = require('./service/reseller.service')
const { logInfo, logError } = require('./utils/logger')

// Global error handlers
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception', { error: error.message, stack: error.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection', { reason: reason?.message || reason, promise })
  // Don't exit, just log
})

process.on('warning', (warning) => {
  logError('Process Warning', { warning: warning.message, stack: warning.stack })
})

// Enable aggressive garbage collection for memory optimization
if (global.gc) {
  setInterval(() => {
    global.gc()
  }, 60000) // Run GC every 60 seconds
}

let botClient = null
let orderWatcherStarted = false

function initializeBot() {
  logInfo('🚀 Starting Premiumin Plus WhatsApp bot')

  if (!validateSystem()) {
    logError('System validation failed, aborting startup')
    return
  }

  stopStatusScheduler()
  orderWatcherStarted = false

  botClient = createClient()

  botClient.on('message', async msg => {
    try {
      await handleIncomingMessage(botClient, msg)
    } catch (error) {
      logError('Message handler failed', { error: error.message, from: msg.from })
    }
  })

  botClient.on('ready', () => {
    logInfo('✅ WhatsApp client ready - initializing services')

    if (!orderWatcherStarted) {
      logInfo('Starting order watcher')
      startOrderWatcher(botClient)
      orderWatcherStarted = true
    }

    logInfo('Starting status scheduler')
    startStatusScheduler(botClient)

    // Start reseller expire checker
    setInterval(() => {
      try {
        resellerService.removeExpired(botClient)
      } catch (error) {
        logError('Reseller expire check failed', {
          error: error.message,
          stack: error.stack
        })
      }
    }, 60 * 60 * 1000) // Check every hour

    logInfo('Reseller expire checker started')
  })

  botClient.initialize()
}

function scheduleRestart(delay = 5000) {
  logInfo('Scheduling bot restart', { delay })
  stopStatusScheduler()
  orderWatcherStarted = false

  setTimeout(() => {
    try {
      initializeBot()
    } catch (error) {
      logError('Restart failed', { error: error.message })
      scheduleRestart(delay)
    }
  }, delay)
}

process.on('uncaughtException', error => {
  logError('Uncaught exception', error)
  scheduleRestart()
})

process.on('unhandledRejection', error => {
  logError('Unhandled rejection', error)
  scheduleRestart()
})

initializeBot()
