import fs from "fs"
import path from "path"
import { log } from "../utils/helper.js"

const SESSION_DIR = "./session"

function ensureSessionDir() {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true })
      log("SESSION", "Folder session dibuat")
    }
    return true
  } catch (error) {
    log("SESSION", `Gagal membuat folder session: ${error.message}`)
    return false
  }
}

function isSessionCorrupted() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return false
    const files = fs.readdirSync(SESSION_DIR)
    if (files.length === 0) return false
    return files.some(file => fs.statSync(path.join(SESSION_DIR, file)).size === 0)
  } catch {
    return true
  }
}

function repairSignalSessions() {
  try {
    if (!fs.existsSync(SESSION_DIR)) return 0

    let removed = 0
    const stalePrefixes = [
      "session-",
      "sender-key-"
    ]

    for (const file of fs.readdirSync(SESSION_DIR)) {
      if (!stalePrefixes.some(prefix => file.startsWith(prefix))) continue

      fs.unlinkSync(path.join(SESSION_DIR, file))
      removed += 1
    }

    if (removed > 0) {
      log("SESSION", `${removed} Signal session lama dibersihkan`)
    }

    return removed
  } catch (error) {
    log("SESSION", `Gagal membersihkan Signal session: ${error.message}`)
    return 0
  }
}

export const sessionManager = {
  ensure: ensureSessionDir,

  clear: () => {
    try {
      if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true })
        log("SESSION", "Session dibersihkan")
      }
      return true
    } catch (error) {
      log("SESSION", `Gagal membersihkan session: ${error.message}`)
      return false
    }
  },

  isCorrupted: () => isSessionCorrupted(),

  repairSignalSessions,

  softReset: () => {
    try {
      if (!fs.existsSync(SESSION_DIR)) return true

      for (const file of fs.readdirSync(SESSION_DIR)) {
        const filePath = path.join(SESSION_DIR, file)
        try {
          if (fs.statSync(filePath).size === 0) fs.unlinkSync(filePath)
        } catch {
          // Ignore individual session file issues.
        }
      }

      log("SESSION", "Soft reset selesai")
      return true
    } catch (error) {
      log("SESSION", `Soft reset gagal: ${error.message}`)
      return false
    }
  }
}

export function shouldClearSession(statusCode, error) {
  if ([401, 440, 500].includes(statusCode)) {
    log("SESSION", `Status ${statusCode} membutuhkan reset session`)
    return true
  }

  const message = error?.message?.toString().toLowerCase() || ""
  const badSessionKeywords = [
    "conflict",
    "bad mac",
    "no matching sessions",
    "messagecountererror",
    "invalid prekey",
    "broken pipe",
    "sessionerror",
    "prekeyerror",
    "bad session",
    "auth",
    "invalid session"
  ]

  return badSessionKeywords.some(keyword => message.includes(keyword))
}
