const axios = require('axios')
const { retry } = require('../utils/retry')
const { logInfo } = require('../utils/logger')

// Optimasi: Cache untuk API responses (simple in-memory cache)
const responseCache = new Map()
const CACHE_TTL = 30000 // 30 seconds

// Cleanup cache periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of responseCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      responseCache.delete(key)
    }
  }
}, 60000)

const client = axios.create({
  baseURL: 'https://premku.com/api',
  timeout: 10000
})

async function createDeposit(apiKey, amount) {
  return retry(async () => {
    const response = await client.post('/pay', { api_key: apiKey, amount })
    // Optimasi: kurangi log untuk performa
    // logInfo('Payment createDeposit', { status: response.status, amount })
    return response.data
  })
}

async function checkDeposit(apiKey, invoice) {
  // Don't cache payment status checks - they need to be fresh
  // const cacheKey = `check_${apiKey}_${invoice}`
  // const cached = responseCache.get(cacheKey)
  // if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
  //   return cached.data // Return cached response
  // }

  return retry(async () => {
    const response = await client.post('/pay_status', { api_key: apiKey, invoice })

    // Enhanced logging for payment status
    const status = response.data?.data?.status || response.data?.status || 'unknown'
    logInfo('Payment status check', {
      invoice,
      status,
      success: response.data?.success,
      message: response.data?.message
    })

    // Don't cache payment status - always get fresh data
    // responseCache.set(cacheKey, { data: response.data, timestamp: Date.now() })
    return response.data
  }, 3, 2000) // 3 retries, 2 second delay
}

async function cancelDeposit(apiKey, invoice) {
  return retry(async () => {
    const response = await client.post('/cancel_pay', { api_key: apiKey, invoice })
    // Optimasi: kurangi log
    // logInfo('Payment cancelDeposit', { status: response.status, invoice })
    return response.data
  })
}

module.exports = {
  createDeposit,
  checkDeposit,
  cancelDeposit
}
