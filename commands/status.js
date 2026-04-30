import { API } from "../services/api.js"
import { formatDate, formatRupiah, loadDB, log, SUPPORT_TEXT } from "../utils/helper.js"

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim()
  if (!text.toLowerCase().startsWith("status")) return

  const userId = msg.key.participant || msg.key.remoteJid
  const invoice = text.split(/\s+/)[1]

  if (!invoice) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
📊 *CEK STATUS*

Format:
status <invoice>

Contoh:
status INV123456
━━━━━━━━━━━━━━━━━━`
    })
  }

  try {
    const db = loadDB()
    const tx = db.transactions?.[invoice]

    if (tx) {
      if (tx.userId !== userId) {
        return sock.sendMessage(userId, {
          text: `━━━━━━━━━━━━━━━━━━
🔐 *AKSES DITOLAK*

Invoice ini bukan milik akun kamu.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
        })
      }

      return sock.sendMessage(userId, { text: buildLocalStatus(invoice, tx) })
    }

    const response = await API.status(invoice)
    if (!response?.success) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
❌ *INVOICE TIDAK DITEMUKAN*

Invoice tidak ada di database bot atau provider.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    const status = response.status || response.data?.status || "Unknown"
    const amount = response.total || response.data?.amount || 0
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
📊 *STATUS INVOICE*

🧾 Invoice: ${invoice}
📌 Status: ${status}
💰 Total: ${formatRupiah(amount)}
━━━━━━━━━━━━━━━━━━`
    })
  } catch (error) {
    log("STATUS", `Gagal cek ${invoice}: ${error.message}`)
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *STATUS GAGAL*

Silakan coba lagi nanti.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }
}

function buildLocalStatus(invoice, tx) {
  const typeLabel = {
    deposit: "Deposit Saldo",
    order_payment: "Pembayaran Order",
    reseller_join: "Join Reseller",
    order: "Order Reseller"
  }[tx.type] || tx.type

  let message = `━━━━━━━━━━━━━━━━━━
📊 *STATUS TRANSAKSI*

🧾 Invoice: ${invoice}
📌 Jenis: ${typeLabel}
📍 Status: ${tx.status}
💰 Total: ${formatRupiah(tx.amount || tx.price || 0)}
🕒 Dibuat: ${formatDate(tx.createdAt)}
`

  if (tx.productName) {
    message += `📦 Produk: ${tx.productName}\n`
  }

  if (tx.status === "completed" && tx.orderData) {
    message += `
🔐 *DATA AKUN*
${formatAccountData(tx.orderData.account_data || tx.orderData.accounts || tx.orderData)}
`
  }

  if (tx.failedReason || tx.errorMessage) {
    message += `
⚠️ Catatan:
${tx.failedReason || tx.errorMessage}
`
  }

  return `${message}━━━━━━━━━━━━━━━━━━`
}

function formatAccountData(data) {
  if (Array.isArray(data)) {
    return data.map((item, index) => `${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n")
  }

  if (data && typeof data === "object") {
    return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join("\n")
  }

  return String(data || "Tidak tersedia")
}
