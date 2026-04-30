import { API } from "../services/api.js"
import { paymentService } from "../services/payment.js"
import {
  downgradeExpiredUser,
  ensureUser,
  formatDate,
  formatRupiah,
  isResellerActive,
  loadDB,
  log,
  saveDB,
  SUPPORT_TEXT
} from "../utils/helper.js"

const RESELLER_PRICE = Number(process.env.RESELLER_PRICE || 50000)
const RESELLER_DURATION = 30 * 24 * 60 * 60 * 1000

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim().toLowerCase()
  const allowed = ["reseller", "joinreseller", "join reseller", "gabung reseller"]
  if (!allowed.includes(text)) return

  const userId = msg.key.participant || msg.key.remoteJid

  try {
    const db = loadDB()
    const user = downgradeExpiredUser(db, userId)

    if (text === "reseller") {
      if (isResellerActive(user)) {
        return sock.sendMessage(userId, {
          text: `━━━━━━━━━━━━━━━━━━
👑 *RESELLER AKTIF*
━━━━━━━━━━━━━━━━━━

💰 Saldo:
${formatRupiah(user.saldo)}

📆 Expired:
${formatDate(user.expiredAt)}

📦 Ketik:
stok

🛒 Order:
buy <id>

💰 Deposit:
deposit 50000
━━━━━━━━━━━━━━━━━━`
        })
      }

      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
👑 *RESELLER PREMIUMIN*
━━━━━━━━━━━━━━━━━━

Keuntungan:

💸 Harga lebih murah
⚡ Proses instan
🔒 Transaksi aman

━━━━━━━━━━━━━━━━━━
💰 Harga:
${formatRupiah(RESELLER_PRICE)}

📆 Aktif:
30 hari

━━━━━━━━━━━━━━━━━━
🛒 Ketik:
joinreseller
━━━━━━━━━━━━━━━━━━`
      })
    }

    if (isResellerActive(user)) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
✅ *SUDAH RESELLER*

📆 Expired:
${formatDate(user.expiredAt)}

💰 Saldo:
${formatRupiah(user.saldo)}
━━━━━━━━━━━━━━━━━━`
      })
    }

    const response = await API.createDeposit(RESELLER_PRICE)
    if (!response?.success || !response?.data?.invoice) {
      throw new Error(response?.message || "Gagal membuat pembayaran reseller")
    }

    const invoice = response.data.invoice
    const freshDb = loadDB()
    ensureUser(freshDb, userId)
    freshDb.transactions[invoice] = {
      type: "reseller_join",
      method: "qris",
      userId,
      amount: RESELLER_PRICE,
      status: "pending",
      createdAt: Date.now(),
      expireAt: Date.now() + 5 * 60 * 1000,
      paidAt: null,
      processedAt: null
    }
    saveDB(freshDb)

    await sendQr(sock, userId, response.data, `━━━━━━━━━━━━━━━━━━
👑 *PEMBAYARAN RESELLER*
━━━━━━━━━━━━━━━━━━

💰 Harga:
${formatRupiah(response.data.total_bayar || RESELLER_PRICE)}

📆 Aktif:
30 hari

📄 Invoice:
${invoice}

⏳ Berlaku:
5 menit

Scan QR untuk gabung reseller
━━━━━━━━━━━━━━━━━━`)

    await paymentService.startPolling(invoice, userId, sock)

    const { db: paidDb, tx } = paymentService.validatePaidInvoice(invoice, userId, "reseller_join")
    const paidUser = ensureUser(paidDb, userId)
    const now = Date.now()

    paidUser.role = "reseller"
    paidUser.saldo = 0
    paidUser.expiredAt = now + RESELLER_DURATION
    tx.status = "completed"
    tx.processedAt = now
    saveDB(paidDb)

    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
✅ *RESELLER AKTIF*
━━━━━━━━━━━━━━━━━━

👑 Role:
reseller

📆 Expired:
${formatDate(paidUser.expiredAt)}

💰 Saldo awal:
${formatRupiah(0)}

Silakan isi saldo:
deposit 50000
━━━━━━━━━━━━━━━━━━`
    })
  } catch (error) {
    log("RESELLER", `Reseller gagal untuk ${userId}: ${error.message}`)
    if (/timeout|cancelled|dibatalkan|expired/i.test(error.message)) return null

    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *RESELLER GAGAL*

Sistem belum bisa memproses reseller.
Silakan coba lagi nanti.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }
}

async function sendQr(sock, userId, data, caption) {
  const qrRaw = data?.qr_image || data?.qr || data?.qris || ""
  const qrImage = typeof qrRaw === "string" && qrRaw.startsWith("data:image") ? qrRaw.split(",")[1] : qrRaw

  if (!qrImage) {
    return sock.sendMessage(userId, {
      text: "❌ QR tidak tersedia, silakan ulangi transaksi"
    })
  }

  return sock.sendMessage(userId, {
    image: Buffer.from(qrImage, "base64"),
    caption
  })
}
