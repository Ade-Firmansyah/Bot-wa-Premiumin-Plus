import fs from "fs"
import path from "path"

const DB_FILE = "./database/db.json"
const ADMIN_CONTACT = "wa.me/6285888009931"

const DEFAULT_DB = {
  users: {},
  transactions: {}
}

export const SUPPORT_TEXT = `\n\n📞 Admin:\n${ADMIN_CONTACT}`

function cloneDefaultDB() {
  return JSON.parse(JSON.stringify(DEFAULT_DB))
}

function normalizeTransaction(transaction) {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    return null
  }

  const normalized = { ...transaction }

  if (normalized.user !== undefined && normalized.userId === undefined) {
    normalized.userId = normalized.user
    delete normalized.user
  }

  if (normalized.created !== undefined && normalized.createdAt === undefined) {
    normalized.createdAt = normalized.created
    delete normalized.created
  }

  normalized.type = normalized.type || "unknown"
  normalized.status = normalized.status || "pending"
  normalized.createdAt = Number(normalized.createdAt || Date.now())

  if (normalized.status === "pending" && Number(normalized.expireAt || 0) > 0 && Date.now() > Number(normalized.expireAt)) {
    normalized.status = "cancelled"
    normalized.cancelledAt = normalized.cancelledAt || Date.now()
    normalized.cancelReason = normalized.cancelReason || "STALE_TRANSACTION"
  }

  return normalized
}

function normalizeUser(value) {
  if (typeof value === "number") {
    return {
      role: "normal",
      saldo: Math.max(0, value),
      expiredAt: null
    }
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      role: "normal",
      saldo: 0,
      expiredAt: null
    }
  }

  const role = value.role === "reseller" ? "reseller" : "normal"
  const expiredAt = Number(value.expiredAt || 0) || null

  return {
    ...value,
    role,
    saldo: Math.max(0, Number(value.saldo || 0)),
    expiredAt: role === "reseller" ? expiredAt : null
  }
}

function normalizeDB(rawDb = {}) {
  const db = cloneDefaultDB()

  if (rawDb.users && typeof rawDb.users === "object" && !Array.isArray(rawDb.users)) {
    for (const [userId, user] of Object.entries(rawDb.users)) {
      db.users[userId] = normalizeUser(user)
    }
  }

  if (rawDb.resellers && typeof rawDb.resellers === "object" && !Array.isArray(rawDb.resellers)) {
    for (const [userId, reseller] of Object.entries(rawDb.resellers)) {
      const current = db.users[userId] || normalizeUser(null)
      const active = Boolean(reseller?.isActive && Number(reseller.expiredAt || 0) > Date.now())
      db.users[userId] = {
        ...current,
        role: active ? "reseller" : current.role,
        saldo: Math.max(0, Number(current.saldo || 0)),
        expiredAt: active ? Number(reseller.expiredAt) : current.expiredAt
      }
    }
  }

  if (rawDb.transactions && typeof rawDb.transactions === "object" && !Array.isArray(rawDb.transactions)) {
    for (const [invoice, transaction] of Object.entries(rawDb.transactions)) {
      const normalized = normalizeTransaction(transaction)
      if (normalized) db.transactions[invoice] = normalized
    }
  }

  return db
}

function validateDB(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid database root")
  }

  if (!data.users || typeof data.users !== "object" || Array.isArray(data.users)) {
    throw new Error("Invalid database users")
  }

  if (!data.transactions || typeof data.transactions !== "object" || Array.isArray(data.transactions)) {
    throw new Error("Invalid database transactions")
  }

  return normalizeDB(data)
}

export function loadDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8")
    const parsed = raw ? JSON.parse(raw) : cloneDefaultDB()
    const normalized = validateDB(parsed)

    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      saveDB(normalized)
    }

    return normalized
  } catch (error) {
    if (error.code === "ENOENT") {
      const fresh = cloneDefaultDB()
      saveDB(fresh)
      return fresh
    }

    throw new Error(`Database tidak valid: ${error.message}`)
  }
}

export function saveDB(data) {
  const normalized = validateDB(data)
  const dir = path.dirname(DB_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const tempFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempFile, JSON.stringify(normalized, null, 2))
  JSON.parse(fs.readFileSync(tempFile, "utf8"))
  fs.renameSync(tempFile, DB_FILE)
}

export function ensureUser(db, userId) {
  db.users[userId] = normalizeUser(db.users[userId])
  return db.users[userId]
}

export function getUser(userId) {
  const db = loadDB()
  return ensureUser(db, userId)
}

export function downgradeExpiredUser(db, userId) {
  const user = ensureUser(db, userId)
  if (user.role === "reseller" && user.expiredAt && Date.now() >= user.expiredAt) {
    user.role = "normal"
    user.expiredAt = null
    saveDB(db)
  }
  return user
}

export function isResellerActive(user) {
  return Boolean(user?.role === "reseller" && user.expiredAt && Date.now() < user.expiredAt)
}

export function formatRupiah(amount) {
  return `Rp ${Number(amount || 0).toLocaleString("id-ID")}`
}

export function formatDate(timestamp) {
  if (!timestamp) return "-"
  return new Date(timestamp).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short"
  })
}

export function createInvoice(prefix = "INV") {
  const random = Math.floor(Math.random() * 900000 + 100000)
  return `${prefix}${Date.now()}${random}`
}

export function log(type, msg) {
  console.log(`[${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}] [${type}] ${msg}`)
}

const PRICING_RULES = {
  NORMAL: {
    markup: [
      { max: 5000, percent: 0.82 },
      { max: 10000, percent: 0.62 },
      { max: 20000, percent: 0.32 },
      { max: Infinity, percent: 0.12 }
    ],
    minProfit: 1100
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

export function calculatePrice(basePrice, role = "NORMAL") {
  const rule = PRICING_RULES[role] || PRICING_RULES.NORMAL
  const base = Number(basePrice || 0)
  const bracket = rule.markup.find(item => base <= item.max) || rule.markup.at(-1)
  const profit = Math.max(base * bracket.percent, rule.minProfit)
  return Math.ceil(base + profit)
}
