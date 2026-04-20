const fs = require('fs')
const path = require('path')
const { logInfo, logError } = require('../utils/logger')

const TRANSACTIONS_FILE = path.join(__dirname, '../../database/reseller_transactions.json')

function loadTransactions() {
  try {
    if (!fs.existsSync(TRANSACTIONS_FILE)) {
      fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify({}, null, 2))
      return {}
    }
    const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf8')
    return JSON.parse(data) || {}
  } catch (error) {
    logError('Failed to load transactions', error)
    return {}
  }
}

function saveTransactions(data) {
  try {
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    logError('Failed to save transactions', error)
  }
}

function save(invoice, transaction) {
  const data = loadTransactions()
  data[invoice] = {
    ...transaction,
    created_at: Date.now()
  }
  saveTransactions(data)
  logInfo('Transaction saved', { invoice, user: transaction.user })
}

function get(invoice) {
  const data = loadTransactions()
  return data[invoice] || null
}

function update(invoice, updates) {
  const data = loadTransactions()
  if (data[invoice]) {
    data[invoice] = { ...data[invoice], ...updates }
    saveTransactions(data)
    logInfo('Transaction updated', { invoice, updates })
  }
}

function remove(invoice) {
  const data = loadTransactions()
  if (data[invoice]) {
    delete data[invoice]
    saveTransactions(data)
    logInfo('Transaction removed', { invoice })
  }
}

function getPendingByUser(user) {
  const data = loadTransactions()
  return Object.values(data).find(trx => trx.user === user && trx.status === 'pending')
}

module.exports = {
  save,
  get,
  update,
  remove,
  getPendingByUser
}