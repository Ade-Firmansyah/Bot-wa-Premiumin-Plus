const { createClient, killExistingBrowsers } = require('./service/wa.service')
const { handleIncomingMessage } = require('./handler/message.handler')
const { startOrderWatcher } = require('./handler/order.handler')
const { startScheduler: startStatusScheduler, stopScheduler: stopStatusScheduler } = require('./service/status.service')
const { validateSystem } = require('./utils/validator')
const resellerService = require('./service/reseller.service')
const { logInfo, logError } = require('./utils/logger')

// Global error handlers
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception', { error: error.message, stack: error.stack })
<<<<<<< HEAD
  // Optimasi: graceful restart instead of exit
  scheduleRestart(10000) // Restart after 10 seconds
})

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection', { reason: reason?.message || reason, promise })
  // Optimasi: don't exit, just log and continue
=======
  // Attempt restart instead of immediate exit
  setTimeout(() => scheduleRestart(), 3000)
})

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection', { reason: reason?.message || reason })
  // Don't exit, just log
>>>>>>> 91481e4 (Fix: Critical bot initialization issues and Railway deployment preparation)
})

process.on('warning', (warning) => {
  // Optimasi: skip warning logs untuk performa
  // logError('Process Warning', { warning: warning.message, stack: warning.stack })
})

// Enable aggressive garbage collection for memory optimization
if (global.gc) {
  setInterval(() => {
    global.gc()
  }, 60000) // Run GC every 60 seconds
}

// Optimasi: Cache cleanup untuk mencegah memory leak
const cacheCleanup = new Map()
setInterval(() => {
  // Cleanup expired cache entries
  const now = Date.now()
  for (const [key, value] of cacheCleanup.entries()) {
    if (now - value.timestamp > 300000) { // 5 minutes
      cacheCleanup.delete(key)
    }
  }
  logInfo(`Cache cleanup: ${cacheCleanup.size} entries remaining`)
}, 300000) // Every 5 minutes

let botClient = null
let orderWatcherStarted = false
let isInitializing = false

async function initializeBot() {
  if (isInitializing) {
    logInfo('Bot initialization already in progress, skipping')
    return
  }

  isInitializing = true
  logInfo('🚀 Starting Premiumin Plus WhatsApp bot')

  if (!validateSystem()) {
    logError('System validation failed, aborting startup')
    isInitializing = false
    return
  }

  stopStatusScheduler()
  orderWatcherStarted = false

  // For Railway, browser processes are killed in createClient
  // For local development, we use different session paths to avoid conflicts

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
    isInitializing = false

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

  botClient.initialize().catch(error => {
    logError('Failed to initialize WhatsApp client', error)
    isInitializing = false
    scheduleRestart()
  })
}

function scheduleRestart(delay = 5000) {
  logInfo('Scheduling bot restart', { delay })
  stopStatusScheduler()
  orderWatcherStarted = false
  isInitializing = false

  setTimeout(() => {
    try {
      initializeBot()
    } catch (error) {
      logError('Restart failed', { error: error.message })
      scheduleRestart(delay)
    }
  }, delay)
}

// Start the bot
initializeBot()
