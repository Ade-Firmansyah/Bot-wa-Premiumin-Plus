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
let isShuttingDown = false

const MAX_RECONNECT_DELAY = 60000
let signalErrorCount = 0
let lastSignalRepairAt = 0

installSignalErrorGuard()

async function initBot() {
  try {
    log("STARTUP", "Menyiapkan WhatsApp bot Premiumin Plus")

    if (!sessionManager.ensure()) {
      throw new Error("Folder session tidak bisa dibuat")
    }

    if (sessionManager.isCorrupted()) {
      log("SESSION", "Session rusak, reset otomatis")
      sessionManager.clear()
      sessionManager.ensure()
    }

    const { state, saveCreds } = await useMultiFileAuthState("./session")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.macOS("Premiumin Plus"),
      version,
      syncFullHistory: false,
      logger,
      retryRequestDelayMs: 10,
      maxRetries: 5
    })

    sock.ev.on("creds.update", saveCreds)
    sock.ev.on("connection.update", handleConnectionUpdate)
    sock.ev.on("messages.upsert", handleMessagesUpsert)

    log("STARTUP", `Socket aktif dengan Baileys ${version.join(".")}`)
  } catch (error) {
    log("STARTUP", `Init gagal: ${error.message}`)
    scheduleReconnect()
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
    reconnectDelay = 5000
    log("WHATSAPP", "Terhubung dan siap menerima pesan")
  }

  if (connection === "close") {
    setConnected(false)
    const statusCode = lastDisconnect?.error?.output?.statusCode
    const reason = lastDisconnect?.error?.output?.payload?.statusCode
    log("WHATSAPP", `Koneksi tertutup, code=${statusCode || reason || "unknown"}`)

    if (statusCode === DisconnectReason.loggedOut) {
      resetSessionAndReconnect("Akun logout atau session 401")
      return
    }

    if (
      statusCode === DisconnectReason.connectionReplaced ||
      statusCode === DisconnectReason.badSession ||
      reason === DisconnectReason.connectionReplaced ||
      shouldClearSession(statusCode, lastDisconnect?.error)
    ) {
      resetSessionAndReconnect("Session invalid atau terganti")
      return
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
  log("RECONNECT", `Mencoba ulang dalam ${Math.round(delay / 1000)} detik`)

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY)
    if (!isShuttingDown) await initBot()
  }, delay)
}

function gracefulShutdown(signal) {
  log("SHUTDOWN", `${signal} diterima, bot berhenti`)
  isShuttingDown = true

  if (reconnectTimer) clearTimeout(reconnectTimer)

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
