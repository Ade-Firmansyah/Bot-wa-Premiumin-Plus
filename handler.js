import auto from "./commands/auto.js"
import stok from "./commands/stok.js"
import order from "./commands/order.js"
import status from "./commands/status.js"
import cancel from "./commands/cancel.js"
import deposit from "./commands/deposit.js"
import reseller from "./commands/reseller.js"
import { rateLimiter } from "./services/queue.js"
import { log } from "./utils/helper.js"

const commands = [
  auto,
  stok,
  deposit,
  order,
  status,
  cancel,
  reseller
]

export default async function handler(sock, msg) {
  const userId = msg.key.participant || msg.key.remoteJid

  try {
    const rawText = msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""

    if (!rawText.trim()) return

    if (!rateLimiter.check(userId)) {
      return sock.sendMessage(msg.key.remoteJid, {
        text: `━━━━━━━━━━━━━━━━━━
⏳ *TERLALU CEPAT*

Tunggu beberapa detik, lalu coba lagi.
━━━━━━━━━━━━━━━━━━`
      })
    }

    const normalizedMsg = {
      ...msg,
      message: {
        ...msg.message,
        conversation: rawText
      }
    }

    log("HANDLER", `${userId}: ${rawText.slice(0, 40)}`)

    for (const command of commands) {
      await command(sock, normalizedMsg)
    }
  } catch (error) {
    log("HANDLER", `Fatal untuk ${userId}: ${error.message}`)
  }
}
