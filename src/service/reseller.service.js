const fs = require('fs')
const path = require('path')
const { logInfo, logError } = require('../utils/logger')

const RESELLER_FILE = path.join(__dirname, '../../database/reseller.json')

function loadReseller() {
  try {
    if (!fs.existsSync(RESELLER_FILE)) {
      fs.writeFileSync(RESELLER_FILE, JSON.stringify({}, null, 2))
      return {}
    }
    const data = fs.readFileSync(RESELLER_FILE, 'utf8')
    return JSON.parse(data) || {}
  } catch (error) {
    logError('Failed to load reseller data', error)
    return {}
  }
}

function saveReseller(data) {
  try {
    fs.writeFileSync(RESELLER_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    logError('Failed to save reseller data', error)
  }
}

function add(user, resellerData) {
  const data = loadReseller()
  data[user] = {
    ...resellerData,
    joined_at: Date.now()
  }
  saveReseller(data)
  logInfo('Reseller added', { user, type: resellerData.type })
}

function get(user) {
  const data = loadReseller()
  return data[user] || null
}

function isReseller(user) {
  const reseller = get(user)
  if (!reseller) return false
  if (!reseller.expired_at) return true // unlimited
  return Date.now() < reseller.expired_at
}

function getUserRole(user) {
  if (isReseller(user)) {
    return 'reseller'
  }
  return 'user'
}

function remove(user) {
  const data = loadReseller()
  if (data[user]) {
    delete data[user]
    saveReseller(data)
    logInfo('Reseller removed', { user })
  }
}

function removeExpired(client = null) {
  const data = loadReseller()
  let removed = 0

  for (const user in data) {
    const r = data[user]
    if (r.expired_at && Date.now() > r.expired_at) {
      delete data[user]
      removed++

      // Send notification if client provided
      if (client) {
        client.sendMessage(user,
`⚠️ RESELLER ANDA SUDAH EXPIRED

Silakan perpanjang ya 🙏
`
        ).catch(err => logError('Failed to send expire notification', err))
      }
    }
  }

  if (removed > 0) {
    saveReseller(data)
    logInfo('Expired resellers removed', { count: removed })
  }

  return removed
}

function getAll() {
  return loadReseller()
}

module.exports = {
  add,
  get,
  isReseller,
  getUserRole,
  remove,
  removeExpired,
  getAll
}