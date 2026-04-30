import { config } from "dotenv"
config()

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  Browsers
} from "@whiskeysockets/baileys"
import pino from "pino"

import handler from "./handler.js"
import { PORT } from "./config.js"
import { sessionManager, shouldClearSession } from "./services/session.js"
import { clearQR, setConnected, setQR, startWeb } from "./services/web.js"
import { log } from "./utils/helper.js"

const logger = pino({
  level: process.env.LOG_LEVEL || "silent",
  timestamp: pino.stdTimeFunctions.isoTime
})

let sock = null
let reconnectDelay = 5000
let reconnectTimer = null
let keepAliveTimer = null
let isShuttingDown = false
let isInitializing = false
let isConnected = false
let socketGeneration = 0

const MAX_RECONNECT_DELAY = 30000
const KEEP_ALIVE_INTERVAL = 4 * 60 * 1000
let signalErrorCount = 0
let lastSignalRepairAt = 0

installSignalErrorGuard()

async function initBot() {
  if (isInitializing) {
    log("STARTUP", "Init masih berjalan, skip init ganda")
    return
  }

  if (sock && isConnected) {
    log("CONNECTED", "✅ WhatsApp sudah terhubung, skip init ganda")
    return
  }

  isInitializing = true

  try {
    log("STARTUP", "Menyiapkan WhatsApp bot Premiumin Plus")

    if (!sessionManager.ensure()) {
      throw new Error("Folder session tidak bisa dibuat")
    }

    if (sessionManager.isCorrupted()) {
      log("SESSION", "🔐 Session memiliki file kosong, menjalankan soft repair")
      sessionManager.removeEmptySessionFiles()
    }

    if (sessionManager.isCorrupted() && !sessionManager.hasValidCreds()) {
      log("SESSION", "❌ Session corrupt tanpa creds valid, reset penuh diperlukan")
      sessionManager.clear()
      sessionManager.ensure()
    }

    cleanupSocketListeners()

    const { state, saveCreds } = await useMultiFileAuthState("./session")
    const { version } = await fetchLatestBaileysVersion()
    const currentGeneration = ++socketGeneration

    if (sessionManager.hasValidCreds()) {
      log("SESSION", "🔐 Session loaded")
    } else {
      log("SESSION", "🔐 Session baru, menunggu QR login")
    }

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.macOS("Premiumin Plus"),
      version,
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 20000,
      defaultQueryTimeoutMs: 60000,
      markOnlineOnConnect: true,
      logger,
      retryRequestDelayMs: 10,
      maxRetries: 5
    })

    sock.ev.on("creds.update", saveCreds)
    sock.ev.on("connection.update", update => {
      if (currentGeneration === socketGeneration) handleConnectionUpdate(update)
    })
    sock.ev.on("messages.upsert", payload => {
      if (currentGeneration === socketGeneration) handleMessagesUpsert(payload)
    })

    log("STARTUP", `Socket aktif dengan Baileys ${version.join(".")}`)
  } catch (error) {
    log("ERROR", `❌ Init gagal: ${error.message}`)
    scheduleReconnect()
  } finally {
    isInitializing = false
  }
}

function handleConnectionUpdate(update) {
  const { connection, lastDisconnect, qr } = update

  if (qr) {
    setQR(qr)
    log("WHATSAPP", `QR tersedia di http://localhost:${PORT}`)
  }

  if (connection === "open") {
    setConnected(true)
    isConnected = true
    reconnectDelay = 5000
    log("CONNECTED", "✅ WhatsApp connected")
    log("SESSION", "🔐 Session restored successfully")
    startKeepAlive()
  }

  if (connection === "close") {
    setConnected(false)
    isConnected = false
    stopKeepAlive()
    const statusCode = lastDisconnect?.error?.output?.statusCode
    const reason = lastDisconnect?.error?.output?.payload?.statusCode
    const disconnectCode = statusCode || reason || "unknown"
    log("RECONNECT", `🔄 Connection closed, code=${disconnectCode}`)

    if (statusCode === DisconnectReason.loggedOut) {
      resetSessionAndReconnect("Real logout terdeteksi")
      return
    }

    if (
      shouldClearSession(statusCode, lastDisconnect?.error)
    ) {
      resetSessionAndReconnect("Session corrupt terkonfirmasi")
      return
    }

    if (
      statusCode === DisconnectReason.connectionReplaced ||
      statusCode === DisconnectReason.badSession ||
      reason === DisconnectReason.connectionReplaced ||
      [440, 515].includes(statusCode)
    ) {
      log("SESSION", "🔐 Menjaga creds.json, hanya repair file Signal lalu reconnect")
      sessionManager.softReset()
    }

    scheduleReconnect()
  }
}

function resetSessionAndReconnect(reason) {
  log("SESSION", `${reason}, membuat QR login baru`)
  clearQR()
  sessionManager.clear()
  sessionManager.ensure()
  reconnectDelay = 1000
  scheduleReconnect()
}

async function handleMessagesUpsert({ messages, type }) {
  if (type !== "notify" || !messages?.length) return

  const msg = messages[0]
  if (!msg?.message) return
  if (msg.key?.fromMe) return
  if (msg.key?.remoteJid === "status@broadcast") return

  await handler(sock, msg)
}

function scheduleReconnect() {
  if (reconnectTimer || isShuttingDown) return

  const delay = Math.min(reconnectDelay, MAX_RECONNECT_DELAY)
  log("RECONNECT", `🔄 Reconnecting in ${Math.round(delay / 1000)}s`)

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
    if (!isShuttingDown) await initBot()
  }, delay)
}

function startKeepAlive() {
  stopKeepAlive()

  keepAliveTimer = setInterval(async () => {
    if (!sock || !isConnected || isShuttingDown) return

    try {
      await sock.sendPresenceUpdate("available")
      log("CONNECTED", "✅ Keep-alive sent")
    } catch (error) {
      log("ERROR", `❌ Keep-alive failed: ${error.message}`)
    }
  }, KEEP_ALIVE_INTERVAL)
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

function cleanupSocketListeners() {
  if (!sock?.ev?.removeAllListeners) return

  try {
    sock.ev.removeAllListeners("connection.update")
    sock.ev.removeAllListeners("messages.upsert")
    sock.ev.removeAllListeners("creds.update")
  } catch (error) {
    log("ERROR", `❌ Gagal membersihkan listener socket lama: ${error.message}`)
  }
}

function gracefulShutdown(signal) {
  log("SHUTDOWN", `${signal} diterima, bot berhenti`)
  isShuttingDown = true

  if (reconnectTimer) clearTimeout(reconnectTimer)
  stopKeepAlive()
  cleanupSocketListeners()

  try {
    sock?.end()
  } catch (error) {
    log("SHUTDOWN", `Gagal menutup socket: ${error.message}`)
  }

  process.exit(0)
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"))
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))

process.on("uncaughtException", error => {
  log("ERROR", `Uncaught exception: ${error.message}`)
  process.exit(1)
})

process.on("unhandledRejection", reason => {
  log("ERROR", `Unhandled rejection: ${reason}`)
  process.exit(1)
})

startWeb(PORT)
initBot()

function installSignalErrorGuard() {
  const originalConsoleError = console.error.bind(console)

  console.error = (...args) => {
    const message = args.map(arg => {
      if (arg instanceof Error) return arg.message
      return String(arg)
    }).join(" ")

    if (isSignalSessionNoise(message)) {
      signalErrorCount += 1

      if (signalErrorCount === 1) {
        log("SESSION", "Terdeteksi Signal session lama. Pesan lama yang gagal decrypt akan diabaikan.")
      }

      const now = Date.now()
      if (signalErrorCount >= 3 && now - lastSignalRepairAt > 30000) {
        lastSignalRepairAt = now
        const removed = sessionManager.repairSignalSessions()
        if (removed > 0) {
          log("SESSION", "Signal session diperbaiki. Jika ada pesan lama yang gagal, minta user kirim ulang.")
        }
      }

      return
    }

    originalConsoleError(...args)
  }
}

function isSignalSessionNoise(message) {
  const lower = message.toLowerCase()
  return lower.includes("failed to decrypt message with any known session") ||
    lower.includes("messagecountererror") ||
    lower.includes("key used already or never filled") ||
    lower.includes("session error:")
}
