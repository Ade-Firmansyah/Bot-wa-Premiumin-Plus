/**
 * Dynamic Pricing System for WhatsApp Bot
 * Calculates final selling prices with markup, profit protection, and unique codes
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
      { max: 5000, percent: 0.19 },
      { max: 10000, percent: 0.10 },
      { max: 20000, percent: 0.08 },
      { max: Infinity, percent: 0.01 }
    ],
    minProfit: 500
  }
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
 * Generate unique payment code (1-500)
 * @returns {number} Random integer between 1-500
 */
function generateUniqueCode() {
  return Math.floor(Math.random() * 500) + 1
}

/**
 * Calculate final price with markup, profit protection, and unique code
 * @param {number} basePrice - The supplier/base price
 * @param {boolean} isReseller - Whether the user is a reseller
 * @returns {object} Detailed pricing breakdown
 * @throws {Error} If basePrice is invalid
 */
function getFinalPrice(basePrice, isReseller = false) {
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

  // Generate unique code
  const uniqueCode = generateUniqueCode()

  // Final price = price with markup + unique code
  const finalPrice = Math.ceil(priceWithMarkup + uniqueCode)

  return {
    basePrice,
    markupPercent,
    profit: adjustedProfit,
    uniqueCode,
    finalPrice,
    isReseller,
    minProfitApplied: adjustedProfit > profit
  }
}

module.exports = {
  getFinalPrice,
  PRICING_RULES
}
