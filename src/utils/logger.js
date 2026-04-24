const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT

function formatPrefix(level) {
  const time = new Date().toISOString()
  return `[${level}] ${time}`
}

function logInfo(message, meta) {
  // Optimasi: kurangi log info di production untuk hemat memory dan performa
  if (isProduction && !message.includes('ready') && !message.includes('error') && !message.includes('failed')) {
    return // Skip non-critical info logs in production
  }
  if (meta !== undefined) {
    console.log(`${formatPrefix('INFO')} ${message}`, meta)
  } else {
    console.log(`${formatPrefix('INFO')} ${message}`)
  }
}

function logError(message, meta) {
  if (meta !== undefined) {
    console.error(`${formatPrefix('ERROR')} ${message}`, meta)
  } else {
    console.error(`${formatPrefix('ERROR')} ${message}`)
  }
}

function logRetry(message, meta) {
  // Optimasi: kurangi retry logs untuk menghindari spam
  if (isProduction) return
  if (meta !== undefined) {
    console.warn(`${formatPrefix('RETRY')} ${message}`, meta)
  } else {
    console.warn(`${formatPrefix('RETRY')} ${message}`)
  }
}

module.exports = {
  logInfo,
  logError,
  logRetry
}
