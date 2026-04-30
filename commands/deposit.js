import { API } from "../services/api.js"
import { paymentService } from "../services/payment.js"
import {
  downgradeExpiredUser,
  ensureUser,
  formatRupiah,
  isResellerActive,
  loadDB,
  log,
  saveDB,
  SUPPORT_TEXT
} from "../utils/helper.js"

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim().toLowerCase()
  if (!text.startsWith("deposit")) return

  const userId = msg.key.participant || msg.key.remoteJid
  const amount = Number(text.split(/\s+/)[1])

  if (!Number.isInteger(amount) || amount < 10000) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
💰 *DEPOSIT SALDO*
━━━━━━━━━━━━━━━━━━

Minimal:
${formatRupiah(10000)}

Contoh:
deposit 50000
━━━━━━━━━━━━━━━━━━`
    })
  }

  if (amount > 50000000) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *DEPOSIT DITOLAK*

Maksimal deposit:
${formatRupiah(50000000)}${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }

  try {
    const db = loadDB()
    const user = downgradeExpiredUser(db, userId)

    if (!isResellerActive(user)) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
🔒 *KHUSUS RESELLER*

Deposit saldo hanya untuk reseller aktif.

User biasa cukup ketik:
buy <id>

Ketik *reseller* untuk gabung reseller.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    const response = await API.createDeposit(amount)
    if (!response?.success || !response?.data?.invoice) {
      throw new Error(response?.message || "Gagal membuat deposit")
    }

    const invoice = response.data.invoice
    const freshDb = loadDB()
    ensureUser(freshDb, userId)
    freshDb.transactions[invoice] = {
      type: "deposit",
      method: "qris",
      userId,
      amount,
      status: "pending",
      createdAt: Date.now(),
      expireAt: Date.now() + 5 * 60 * 1000,
      paidAt: null,
      processedAt: null
    }
    saveDB(freshDb)

    await sendQr(sock, userId, response.data, `━━━━━━━━━━━━━━━━━━
💰 *DEPOSIT SALDO*
━━━━━━━━━━━━━━━━━━

Jumlah:
${formatRupiah(response.data.total_bayar || amount)}

📄 Invoice:
${invoice}

⏳ Berlaku:
5 menit

Scan QR untuk isi saldo
━━━━━━━━━━━━━━━━━━`)

    await paymentService.startPolling(invoice, userId, sock)

    const { db: paidDb, tx } = paymentService.validatePaidInvoice(invoice, userId, "deposit")
    const paidUser = ensureUser(paidDb, userId)
    paidUser.saldo += Number(tx.amount || amount)
    tx.status = "completed"
    tx.processedAt = Date.now()
    saveDB(paidDb)

    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
✅ *DEPOSIT BERHASIL*
━━━━━━━━━━━━━━━━━━

📄 Invoice:
${invoice}

💰 Masuk:
${formatRupiah(tx.amount || amount)}

💰 Saldo sekarang:
${formatRupiah(paidUser.saldo)}

Ketik *stok* untuk melihat produk reseller.
━━━━━━━━━━━━━━━━━━`
    })
  } catch (error) {
    log("DEPOSIT", `Deposit gagal untuk ${userId}: ${error.message}`)
    if (/timeout|cancelled|dibatalkan|expired/i.test(error.message)) return null

    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *DEPOSIT GAGAL*

Sistem belum bisa membuat deposit.
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
