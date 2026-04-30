import { API } from "../services/api.js"
import { orderQueue } from "../services/queue.js"
import { paymentService } from "../services/payment.js"
import {
  calculatePrice,
  createInvoice,
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
  const rawText = msg.message?.conversation || ""
  const text = rawText.trim().toLowerCase()
  if (!text.startsWith("buy")) return

  const userId = msg.key.participant || msg.key.remoteJid
  const productId = text.split(/\s+/)[1]

  if (!/^\d+$/.test(productId || "")) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
🛒 *FORMAT BELI*

Ketik:
buy <id_produk>

Contoh:
buy 12
━━━━━━━━━━━━━━━━━━`
    })
  }

  try {
    const product = await findProduct(Number(productId))
    if (!product) {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
❌ *PRODUK TIDAK DITEMUKAN*

Ketik *stok* untuk melihat daftar produk aktif.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    if (Number(product.stock || 0) <= 0 || product.status === "soldout") {
      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
📦 *STOK HABIS*

Produk:
${product.name}

Silakan pilih produk lain dari menu *stok*.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    const db = loadDB()
    const user = downgradeExpiredUser(db, userId)

    if (isResellerActive(user)) {
      if (orderQueue.hasPending(userId)) {
        return sock.sendMessage(userId, {
          text: `━━━━━━━━━━━━━━━━━━
⏳ *ORDER MASIH DIPROSES*

Satu reseller hanya boleh memiliki satu proses order aktif.
Mohon tunggu sampai selesai.
━━━━━━━━━━━━━━━━━━`
        })
      }

      orderQueue.add(userId, { product })
      return orderQueue.process(userId, ({ product }) => processResellerOrder(sock, userId, product))
    }

    return processNormalOrder(sock, userId, product)
  } catch (error) {
    log("ORDER", `Gagal memproses order ${userId}: ${error.message}`)
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *ORDER GAGAL*

Sistem belum bisa memproses pesanan.
Silakan coba beberapa saat lagi.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }
}

async function findProduct(productId) {
  const response = await API.products()
  const products = response?.products || response?.data?.products || []
  if (!response?.success || !Array.isArray(products)) return null
  return products.find(product => Number(product.id) === Number(productId)) || null
}

async function processNormalOrder(sock, userId, product) {
  const amount = calculatePrice(product.price, "NORMAL")
  const deposit = await API.createDeposit(amount)

  if (!deposit?.success || !deposit?.data?.invoice) {
    throw new Error(deposit?.message || "Gagal membuat pembayaran")
  }

  const invoice = deposit.data.invoice
  const db = loadDB()
  ensureUser(db, userId)
  db.transactions[invoice] = {
    type: "order_payment",
    method: "qris",
    userId,
    productId: product.id,
    productName: product.name,
    amount,
    basePrice: Number(product.price || 0),
    status: "pending",
    createdAt: Date.now(),
    expireAt: Date.now() + 5 * 60 * 1000,
    paidAt: null,
    processedAt: null
  }
  saveDB(db)

  await sendQr(sock, userId, deposit.data, `━━━━━━━━━━━━━━━━━━
🧾 *PEMBAYARAN ORDER*

📦 Produk: ${product.name}
💰 Total: ${formatRupiah(amount)}
🧾 Invoice: ${invoice}

📱 Scan QRIS untuk membayar.
⏳ Batas waktu: 5 menit

Setelah pembayaran sukses, order dibuat otomatis.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`)

  await paymentService.startPolling(invoice, userId, sock)

  const { db: paidDb, tx } = paymentService.validatePaidInvoice(invoice, userId, "order_payment")
  const orderResult = await API.order(product.id, 1, invoice)

  if (!orderResult?.success) {
    tx.status = "order_failed"
    tx.failedReason = orderResult?.message || "API order gagal"
    tx.processedAt = Date.now()
    saveDB(paidDb)

    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
⚠️ *ORDER PERLU BANTUAN ADMIN*

Pembayaran sudah diterima, tetapi order gagal dibuat otomatis.

📦 Produk: ${product.name}
🧾 Invoice: ${invoice}

Saldo tidak digunakan untuk user biasa. Admin akan bantu proses manual.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }

  tx.status = "completed"
  tx.processedAt = Date.now()
  tx.orderedAt = Date.now()
  tx.orderData = orderResult.data || orderResult
  saveDB(paidDb)

  return sock.sendMessage(userId, {
    text: buildOrderSuccess("ORDER BERHASIL", product.name, amount, orderResult.data || orderResult, invoice)
  })
}

async function processResellerOrder(sock, userId, product) {
  const price = Number(product.price_reseller || calculatePrice(product.price, "RESELLER"))
  const invoice = createInvoice("RS")

  const db = loadDB()
  const user = downgradeExpiredUser(db, userId)

  if (!isResellerActive(user)) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *RESELLER TIDAK AKTIF*

Silakan ketik *reseller* untuk gabung atau perpanjang.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
    })
  }

  if (user.saldo <= 0) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
💳 *SALDO KOSONG*

Saldo reseller kamu: ${formatRupiah(user.saldo)}

Silakan deposit dulu:
deposit 10000
━━━━━━━━━━━━━━━━━━`
    })
  }

  if (user.saldo < price) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *SALDO TIDAK CUKUP*

📦 Produk: ${product.name}
💰 Harga reseller: ${formatRupiah(price)}
💳 Saldo kamu: ${formatRupiah(user.saldo)}

Minimal saldo disarankan: ${formatRupiah(10000)}
━━━━━━━━━━━━━━━━━━`
    })
  }

  user.saldo -= price
  db.transactions[invoice] = {
    type: "order",
    method: "saldo_reseller",
    userId,
    productId: product.id,
    productName: product.name,
    amount: price,
    status: "processing",
    createdAt: Date.now(),
    processedAt: null
  }
  saveDB(db)

  try {
    const orderResult = await API.order(product.id, 1, invoice)

    const latestDb = loadDB()
    const latestUser = ensureUser(latestDb, userId)
    const tx = latestDb.transactions[invoice]

    if (!orderResult?.success) {
      latestUser.saldo += price
      tx.status = "failed"
      tx.failedReason = orderResult?.message || "API order gagal"
      tx.refundedAt = Date.now()
      saveDB(latestDb)

      return sock.sendMessage(userId, {
        text: `━━━━━━━━━━━━━━━━━━
❌ *ORDER RESELLER GAGAL*

📦 Produk: ${product.name}
💰 Refund: ${formatRupiah(price)}
💳 Saldo sekarang: ${formatRupiah(latestUser.saldo)}

Silakan coba lagi nanti.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    tx.status = "completed"
    tx.processedAt = Date.now()
    tx.orderedAt = Date.now()
    tx.orderData = orderResult.data || orderResult
    saveDB(latestDb)

    return sock.sendMessage(userId, {
      text: `${buildOrderSuccess("ORDER RESELLER BERHASIL", product.name, price, orderResult.data || orderResult, invoice)}

💳 Saldo tersisa: ${formatRupiah(latestUser.saldo)}`
    })
  } catch (error) {
    const latestDb = loadDB()
    const latestUser = ensureUser(latestDb, userId)
    const tx = latestDb.transactions[invoice]
    if (tx && tx.status === "processing") {
      latestUser.saldo += price
      tx.status = "error"
      tx.errorMessage = error.message
      tx.refundedAt = Date.now()
      saveDB(latestDb)
    }
    throw error
  }
}

async function sendQr(sock, userId, data, caption) {
  const qrRaw = data?.qr_image || data?.qr || data?.qris || ""
  const qrImage = typeof qrRaw === "string" && qrRaw.startsWith("data:image") ? qrRaw.split(",")[1] : qrRaw

  if (qrImage) {
    return sock.sendMessage(userId, {
      image: Buffer.from(qrImage, "base64"),
      caption
    })
  }

  return sock.sendMessage(userId, {
    text: `${caption}\n\n⚠️ QR belum tersedia dari provider. Coba ulangi atau hubungi admin.`
  })
}

function buildOrderSuccess(title, productName, amount, orderData, invoice) {
  const accountData = orderData?.account_data || orderData?.accounts || orderData?.data || "Data akun akan dikirim otomatis oleh sistem."

  return `━━━━━━━━━━━━━━━━━━
✅ *${title}*

📦 Produk: ${productName}
💰 Total: ${formatRupiah(amount)}
🧾 Invoice: ${invoice}

🔐 *DATA AKUN*
${formatAccountData(accountData)}

Terima kasih 🙏
━━━━━━━━━━━━━━━━━━`
}

function formatAccountData(data) {
  if (Array.isArray(data)) {
    return data.map((item, index) => {
      if (typeof item === "string") return `${index + 1}. ${item}`
      return `${index + 1}. ${Object.entries(item).map(([key, value]) => `${key}: ${value}`).join("\n")}`
    }).join("\n\n")
  }

  if (data && typeof data === "object") {
    return Object.entries(data).map(([key, value]) => `${key}: ${value}`).join("\n")
  }

  return String(data || "Tidak tersedia")
}
