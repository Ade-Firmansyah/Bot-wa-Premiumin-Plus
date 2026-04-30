import { API } from "../services/api.js"
import { formatRupiah, loadDB, log, saveDB, SUPPORT_TEXT } from "../utils/helper.js"

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim()
  if (!text.toLowerCase().startsWith("cancel")) return

  const userId = msg.key.participant || msg.key.remoteJid
  const invoice = text.split(/\s+/)[1]

  if (!invoice) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *FORMAT CANCEL*

Ketik:
cancel <invoice>
━━━━━━━━━━━━━━━━━━`
    })
  }

  try {
    const db = loadDB()
    const tx = db.transactions?.[invoice]

    if (!tx) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
❌ *INVOICE TIDAK DITEMUKAN*

Periksa kembali nomor invoice.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    if (tx.userId !== userId) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
🔐 *AKSES DITOLAK*

Invoice ini bukan milik akun kamu.
━━━━━━━━━━━━━━━━━━`
      })
    }

    if (!["deposit", "order_payment", "reseller_join"].includes(tx.type) || tx.status !== "pending") {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
❌ *TIDAK BISA DICANCEL*

Hanya pembayaran QRIS yang masih pending yang bisa dibatalkan.
━━━━━━━━━━━━━━━━━━`
      })
    }

    const response = await API.cancelDeposit(invoice)
    if (!response?.success) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
❌ *CANCEL GAGAL*

${response?.message || "Provider menolak pembatalan."}${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    tx.status = "cancelled"
    tx.cancelledAt = Date.now()
    saveDB(db)

    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
✅ *PEMBAYARAN DIBATALKAN*

🧾 Invoice: ${invoice}
💰 Total: ${formatRupiah(tx.amount || 0)}

Tidak ada saldo, reseller, atau order yang diproses.
━━━━━━━━━━━━━━━━━━`
    })
  } catch (error) {
    log("CANCEL", `Gagal cancel ${invoice}: ${error.message}`)
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *CANCEL ERROR*

Silakan coba lagi nanti.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }
}
