/**
 * Advanced Dynamic Pricing System for WhatsApp Bot
 * Anti-leak pricing with per-user offsets and controlled reseller margins
 */

// Constants for pricing rules
const PRICING_RULES = {
  NORMAL: {
    markup: [
      { max: 5000, percent: 0.80 },
      { max: 10000, percent: 0.60 },
      { max: 20000, percent: 0.30 },
      { max: Infinity, percent: 0.10 }
    ],
    minProfit: 1000
  },
  RESELLER: {
    markup: [
      { max: 5000, percent: 0.15 },
      { max: 10000, percent: 0.08 },
      { max: 20000, percent: 0.04 },
      { max: Infinity, percent: 0.02 }
    ],
    minProfit: 300
  }
}

// Unique code range
const UNIQUE_CODE_MIN = 99
const UNIQUE_CODE_MAX = 300

/**
 * Generate deterministic user offset from userId (0-500)
 * @param {string} userId - WhatsApp user ID
 * @returns {number} Deterministic offset between 0-500
 */
function getUserOffset(userId) {
  if (!userId || typeof userId !== 'string') {
    return 0
  }

  // Simple hash function for deterministic offset
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Ensure positive and within range
  const positiveHash = Math.abs(hash)
  return positiveHash % 501 // 0-500 inclusive
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
 * Calculate final price with markup, profit protection, user offset, and unique code
 * @param {number} basePrice - The supplier/base price
 * @param {string} userId - WhatsApp user ID for offset calculation
 * @param {boolean} isReseller - Whether the user is a reseller
 * @returns {object} Detailed pricing breakdown
 * @throws {Error} If inputs are invalid
 */
function getFinalPrice(basePrice, userId, isReseller = false) {
  // Input validation
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

  // Get pricing rules
  const rules = isReseller ? PRICING_RULES.RESELLER : PRICING_RULES.NORMAL
  const markupPercent = getMarkupPercent(basePrice, isReseller)

  // Calculate markup amount
  const markupAmount = Math.ceil(basePrice * markupPercent)

  // Calculate profit
  const profit = markupAmount

  // Apply minimum profit protection
  const minProfit = rules.minProfit
  const adjustedProfit = Math.max(profit, minProfit)

  // Calculate price with markup
  const priceWithMarkup = basePrice + adjustedProfit

  // Add user offset for anti-leak protection
  const userOffset = getUserOffset(userId)
  const priceWithOffset = priceWithMarkup + userOffset

  // Generate unique code
  const uniqueCode = generateUniqueCode()

  // Final price = price with markup + offset + unique code
  const finalPrice = priceWithOffset + uniqueCode

  // Optional: Round to nearest 100 for cleaner display
  const roundedFinalPrice = roundToNearest100(finalPrice)

  return {
    basePrice,
    markupPercent,
    profit: adjustedProfit,
    userOffset,
    uniqueCode,
    finalPrice: roundedFinalPrice,
    isReseller,
    minProfitApplied: adjustedProfit > profit
  }
}

module.exports = {
  getFinalPrice,
  getUserOffset,
  PRICING_RULES,
  UNIQUE_CODE_MIN,
  UNIQUE_CODE_MAX
}
