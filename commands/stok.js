import { API } from "../services/api.js"
import {
  calculatePrice,
  downgradeExpiredUser,
  formatRupiah,
  isResellerActive,
  loadDB,
  log,
  SUPPORT_TEXT
} from "../utils/helper.js"

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim().toLowerCase()
  if (text !== "stok") return

  const userId = msg.key.participant || msg.key.remoteJid

  try {
    const db = loadDB()
    const user = downgradeExpiredUser(db, userId)
    const reseller = isResellerActive(user)
    const response = await API.products()
    const products = response?.products || response?.data?.products || []

    if (!response?.success || !Array.isArray(products)) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
❌ *STOK BELUM TERSEDIA*

Gagal mengambil data produk.
Silakan coba beberapa saat lagi.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    const available = products.filter(product => Number(product.stock || 0) > 0 && product.status !== "soldout")
    const empty = products.filter(product => Number(product.stock || 0) <= 0 || product.status === "soldout")

    let message = `━━━━━━━━━━━━━━━━━━
📦 *STOK PREMIUMIN PLUS*

👤 Status: ${reseller ? "Reseller" : "User biasa"}
${reseller ? `💳 Saldo: ${formatRupiah(user.saldo)}\n` : "💳 Pembelian: langsung QRIS\n"}━━━━━━━━━━━━━━━━━━

`

    if (available.length === 0) {
      message += `Stok ready sedang kosong.

Produk habis hari ini:
${empty.slice(0, 10).map(product => `❌ ${product.name}`).join("\n") || "-"}
`
    } else {
      message += available.map(product => {
        const role = reseller ? "RESELLER" : "NORMAL"
        const price = Number(product.price_reseller && reseller ? product.price_reseller : calculatePrice(product.price, role))
        return `📦 *${product.name}*
Stok: ${product.stock}
Harga: ${formatRupiah(price)}
Kode: buy ${product.id}`
      }).join("\n\n")
    }

    message += `

━━━━━━━━━━━━━━━━━━
🛒 Cara beli:
buy <id_produk>

👑 Reseller:
reseller

${reseller ? "💳 Deposit saldo:\ndeposit 50000" : "User biasa tidak perlu deposit saldo."}${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`

    await sock.sendMessage(userId, { text: message })
    log("STOK", `${userId} melihat stok sebagai ${reseller ? "reseller" : "normal"}`)
  } catch (error) {
    log("STOK", `Gagal: ${error.message}`)
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *GAGAL MEMUAT STOK*

Silakan coba lagi nanti.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }
}
