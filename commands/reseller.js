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

const RESELLER_PACKAGES = {
  "1bulan": {
    label: "1 Bulan",
    price: Number(process.env.RESELLER_PRICE_1_MONTH || 10000),
    durationMs: 30 * 24 * 60 * 60 * 1000
  },
  "1tahun": {
    label: "1 Tahun",
    price: Number(process.env.RESELLER_PRICE_1_YEAR || 50000),
    durationMs: 365 * 24 * 60 * 60 * 1000
  }
}

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim().toLowerCase()
  if (!isResellerCommand(text)) return

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

📦 Stok:
stok

🛒 Order:
buy <id>

💰 Deposit:
deposit 50000
━━━━━━━━━━━━━━━━━━`
        })
      }

      return sock.sendMessage(userId, { text: buildResellerMenu() })
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

    const selectedPackage = parsePackage(text)
    if (!selectedPackage) {
      return sock.sendMessage(userId, { text: buildResellerMenu() })
    }

    const response = await API.createDeposit(selectedPackage.price)
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
      amount: selectedPackage.price,
      packageKey: selectedPackage.key,
      packageLabel: selectedPackage.label,
      durationMs: selectedPackage.durationMs,
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

📦 Paket:
${selectedPackage.label}

💰 Harga:
${formatRupiah(response.data.total_bayar || selectedPackage.price)}

📄 Invoice:
${invoice}

⏳ Berlaku:
5 menit

Scan QR untuk gabung reseller.
━━━━━━━━━━━━━━━━━━`)

    await paymentService.startPolling(invoice, userId, sock)

    const { db: paidDb, tx } = paymentService.validatePaidInvoice(invoice, userId, "reseller_join")
    const paidUser = ensureUser(paidDb, userId)
    const now = Date.now()

    paidUser.role = "reseller"
    paidUser.saldo = 0
    paidUser.expiredAt = now + Number(tx.durationMs || selectedPackage.durationMs)
    tx.status = "completed"
    tx.processedAt = now
    saveDB(paidDb)

    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
✅ *RESELLER AKTIF*
━━━━━━━━━━━━━━━━━━

👑 Paket:
${tx.packageLabel || selectedPackage.label}

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

function isResellerCommand(text) {
  return text === "reseller" ||
    text === "joinreseller" ||
    text.startsWith("joinreseller ") ||
    text === "join reseller" ||
    text.startsWith("join reseller ") ||
    text === "gabung reseller" ||
    text.startsWith("gabung reseller ")
}

function parsePackage(text) {
  if (/\b(1tahun|tahun|1 tahun|12bulan|12 bulan|year)\b/.test(text)) {
    return { key: "1tahun", ...RESELLER_PACKAGES["1tahun"] }
  }

  if (/\b(1bulan|bulan|1 bulan|month)\b/.test(text)) {
    return { key: "1bulan", ...RESELLER_PACKAGES["1bulan"] }
  }

  if (text === "joinreseller" || text === "join reseller" || text === "gabung reseller") {
    return { key: "1bulan", ...RESELLER_PACKAGES["1bulan"] }
  }

  return null
}

function buildResellerMenu() {
  return `━━━━━━━━━━━━━━━━━━
👑 *RESELLER PREMIUMIN*
━━━━━━━━━━━━━━━━━━

Keuntungan:

💸 Harga lebih murah
⚡ Proses instan
🔒 Transaksi aman

━━━━━━━━━━━━━━━━━━
💰 Harga:
1 Bulan: ${formatRupiah(RESELLER_PACKAGES["1bulan"].price)}
1 Tahun: ${formatRupiah(RESELLER_PACKAGES["1tahun"].price)}

━━━━━━━━━━━━━━━━━━
🛒 Ketik:
joinreseller 1bulan
joinreseller 1tahun

━━━━━━━━━━━━━━━━━━
Jika ingin bangun bot, hubungi admin.
Harga bisa kita negosiasikan.

Terima kasih, cuan bareng 🙏
━━━━━━━━━━━━━━━━━━`
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
