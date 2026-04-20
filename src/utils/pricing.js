const fs = require('fs').promises
const path = require('path')

const TRANSACTIONS_FILE = path.resolve(__dirname, '../../database/transactions.json')
const TRANSACTION_CACHE_TTL_MS = 60 * 1000
const LOW_DEMAND_PERIOD_MS = 30 * 24 * 60 * 60 * 1000
const SUCCESSFUL_TRANSACTION_STATUSES = new Set(['success', 'paid', 'completed', 'settled', 'sukses'])

// Constants for pricing rules
const PRICING_RULES = {
  NORMAL: {
    markup: [
      { max: 5000, percent: 0.82 },
      { max: 10000, percent: 0.62 },
      { max: 20000, percent: 0.32 },
      { max: Infinity, percent: 0.12 }
    ],
    minProfit: 1200
  },
  RESELLER: {
    markup: [
      { max: 5000, percent: 0.17 },
      { max: 10000, percent: 0.10 },
      { max: 20000, percent: 0.06 },
      { max: Infinity, percent: 0.04 }
    ],
    minProfit: 400
  }
}

// Unique code range
const UNIQUE_CODE_MIN = 101
const UNIQUE_CODE_MAX = 404

let transactionCache = []
let cacheExpiresAt = 0

async function loadTransactionCache() {
  if (Date.now() < cacheExpiresAt && Array.isArray(transactionCache)) {
    return transactionCache
  }

  try {
    const raw = await fs.readFile(TRANSACTIONS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    transactionCache = Array.isArray(parsed) ? parsed : []
  } catch (error) {
    transactionCache = []
  }

  cacheExpiresAt = Date.now() + TRANSACTION_CACHE_TTL_MS
  return transactionCache
}

function isSuccessfulTransactionStatus(status) {
  if (!status || typeof status !== 'string') return false
  return SUCCESSFUL_TRANSACTION_STATUSES.has(status.trim().toLowerCase())
}

function countProductSales(transactions, productId, sinceTimestamp = 0) {
  return transactions.reduce((count, transaction) => {
    if (!transaction || Number(transaction.product_id) !== Number(productId)) {
      return count
    }

    if (!isSuccessfulTransactionStatus(transaction.status)) {
      return count
    }

    const createdAt = Number(transaction.created_at) || 0
    if (sinceTimestamp && createdAt < sinceTimestamp) {
      return count
    }

    return count + 1
  }, 0)
}

function getStockAdjustment(stock) {
  const normalized = Number(stock) || 0
  if (normalized <= 3) return 0.16
  if (normalized <= 10) return 0.11
  if (normalized <= 20) return 0.06
  return 0
}

async function getDemandAdjustment(productId) {
  const transactions = await loadTransactionCache()
  const count = countProductSales(transactions, productId)

  if (count > 20) return 0.16
  if (count > 10) return 0.11
  if (count > 5) return 0.06
  return 0
}

async function getLowDemandDiscount(productId) {
  const transactions = await loadTransactionCache()
  const sinceTimestamp = Date.now() - LOW_DEMAND_PERIOD_MS
  const recentCount = countProductSales(transactions, productId, sinceTimestamp)
  return recentCount === 0 ? -0.06 : 0
}

/**
 * Generate deterministic user offset from userId (0-500)
 * @param {string} userId - WhatsApp user ID
 * @returns {number} Deterministic offset between 0-500
 */
function getUserOffset(userId) {
  if (!userId || typeof userId !== 'string') {
    return 0
  }

  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  const positiveHash = Math.abs(hash)
  return positiveHash % 501
}

/**
 * Get markup percentage based on base price and user type
 * @param {number} basePrice - The supplier/base price
 * @param {boolean} isReseller - Whether the user is a reseller
 * @returns {number} Markup percentage (0-1)
 */
function getMarkupPercent(basePrice, isReseller) {
  const rules = isReseller ? PRICING_RULES.RESELLER.markup : PRICING_RULES.NORMAL.markup

  for (const rule of rules) {
    if (basePrice < rule.max) {
      return rule.percent
    }
  }

  return rules[rules.length - 1].percent
}

/**
 * Generate unique payment code (99-300)
 * @returns {number} Random integer between 99-300
 */
function generateUniqueCode() {
  return Math.floor(Math.random() * (UNIQUE_CODE_MAX - UNIQUE_CODE_MIN + 1)) + UNIQUE_CODE_MIN
}

/**
 * Round price to nearest 100 (optional anti-screenshot feature)
 * @param {number} price - Price to round
 * @returns {number} Rounded price
 */
function roundToNearest100(price) {
  return Math.round(price / 100) * 100
}

/**
 * Calculate final price with markup, dynamic AI adjustments, profit protection, user offset, and unique code
 * @param {number} basePrice - The supplier/base price
 * @param {string} userId - WhatsApp user ID for offset calculation
 * @param {boolean} isReseller - Whether the user is a reseller
 * @param {object} productData - Product metadata { id, stock }
 * @returns {Promise<object>} Detailed pricing breakdown
 * @throws {Error} If inputs are invalid
 */
async function getFinalPrice(basePrice, userId, isReseller = false, productData = {}) {
  if (basePrice === null || basePrice === undefined) {
    throw new Error('Base price cannot be null or undefined')
  }

  if (typeof basePrice !== 'number' || isNaN(basePrice)) {
    throw new Error('Base price must be a valid number')
  }

  if (basePrice < 0) {
    throw new Error('Base price cannot be negative')
  }

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID must be a valid string')
  }

  const productId = productData && (productData.id || productData.product_id)
  const stock = productData && Number(productData.stock)
  if (productId === null || productId === undefined) {
    throw new Error('Product data must include a valid id')
  }

  if (typeof stock !== 'number' || isNaN(stock) || stock < 0) {
    throw new Error('Product data must include a valid stock number')
  }

  const rules = isReseller ? PRICING_RULES.RESELLER : PRICING_RULES.NORMAL
  const markupPercent = getMarkupPercent(basePrice, isReseller)
  const markupAmount = Math.ceil(basePrice * markupPercent)
  const adjustedProfit = Math.max(markupAmount, rules.minProfit)

  const stockAdjustmentPercent = getStockAdjustment(stock)
  const demandAdjustmentPercent = await getDemandAdjustment(productId)
  const lowDemandDiscountPercent = await getLowDemandDiscount(productId)

  const stockAdjustment = Math.ceil(basePrice * stockAdjustmentPercent)
  const demandAdjustment = Math.ceil(basePrice * demandAdjustmentPercent)
  const lowDemandDiscount = Math.ceil(Math.abs(basePrice * lowDemandDiscountPercent))

  const minimumPrice = basePrice + adjustedProfit
  const priceBeforeOffset = Math.max(
    basePrice + adjustedProfit + demandAdjustment + stockAdjustment - lowDemandDiscount,
    minimumPrice
  )

  const userOffset = getUserOffset(userId)
  const uniqueCode = generateUniqueCode()
  const finalPrice = Math.max(priceBeforeOffset + userOffset + uniqueCode, 0)

  return {
    basePrice,
    isReseller,
    markupPercent,
    markupAmount,
    adjustedProfit,
    minProfit: rules.minProfit,
    minProfitApplied: adjustedProfit > markupAmount,
    stock,
    stockAdjustmentPercent,
    stockAdjustment,
    demandAdjustmentPercent,
    demandAdjustment,
    lowDemandDiscountPercent,
    lowDemandDiscount,
    userOffset,
    uniqueCode,
    priceBeforeOffset,
    finalPrice: Math.round(finalPrice)
  }
}

module.exports = {
  getFinalPrice,
  getStockAdjustment,
  getDemandAdjustment,
  getLowDemandDiscount,
  getUserOffset,
  PRICING_RULES,
  UNIQUE_CODE_MIN,
  UNIQUE_CODE_MAX
}
