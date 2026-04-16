function formatPrefix(level) {
  const time = new Date().toISOString()
  return `[${level}] ${time}`
}

function logInfo(message, meta) {
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
