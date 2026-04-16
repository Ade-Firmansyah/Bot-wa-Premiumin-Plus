// Legacy compatibility - delegate to new modular system
const { startScheduler, stopScheduler, validateAndInitialize } = require('./status')

module.exports = {
  startScheduler,
  stopScheduler,
  validateAndInitialize,
  startStatusScheduler: startScheduler
}
