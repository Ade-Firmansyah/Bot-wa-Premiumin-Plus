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

    const available = products.filter(product => isProductAvailable(product))
    const empty = products.filter(product => !isProductAvailable(product))

    let message = `━━━━━━━━━━━━━━━━━━
📦 *STOK PREMIUMIN PLUS*
━━━━━━━━━━━━━━━━━━

`

    if (available.length > 0) {
      message += available.map(product => {
        const role = reseller ? "RESELLER" : "NORMAL"
        const price = Number(product.price_reseller && reseller ? product.price_reseller : calculatePrice(product.price, role))

        return `📦 ${product.name} || STOK : ${Number(product.stock || 0)} AKUN
💰 PRICE : ${formatRupiah(price)} || 🔑 CODE : buy ${product.id}`
      }).join("\n\n")
    } else {
      message += "STOK READY SEDANG KOSONG\n"
    }

    message += `\n\n━━━━━━━━━━━━━━━━━━
❌ *STOK KOSONG*

${buildEmptyStockList(empty)}

(STOK AKAN UPDATE SETIAP HARI)
━━━━━━━━━━━━━━━━━━
🛒 Cara beli:
buy <id>

👑 Reseller:
reseller
${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`

    await sock.sendMessage(userId, { text: message })
    log("STOK", `${userId} melihat stok sebagai ${reseller ? "reseller" : "user"}`)
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

function isProductAvailable(product) {
  const stock = Number(product.stock || 0)
  const status = String(product.status || "").toLowerCase()
  return stock > 0 && !["soldout", "empty", "habis", "unavailable"].includes(status)
}

function buildEmptyStockList(products) {
  if (!products.length) return "- Tidak ada stok kosong saat ini"
  return products
    .slice(0, 30)
    .map(product => `-${product.name}`)
    .join("\n")
}
