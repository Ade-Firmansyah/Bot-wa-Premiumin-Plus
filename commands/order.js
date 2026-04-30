import { API } from "../services/api.js"
import { orderQueue } from "../services/queue.js"
import { paymentService } from "../services/payment.js"
import {
  calculatePrice,
  createInvoice,
  createUniqueCode,
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

    if (!isProductAvailable(product)) {
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

function isProductAvailable(product) {
  const status = String(product.status || "").toLowerCase()
  return Number(product.stock || 0) > 0 && !["soldout", "empty", "habis", "unavailable"].includes(status)
}

async function processNormalOrder(sock, userId, product) {
  const price = calculatePrice(product.price, "NORMAL")
  const uniqueCode = createUniqueCode()
  const totalPay = price + uniqueCode
  const deposit = await API.createDeposit(totalPay)

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
    price,
    uniqueCode,
    amount: totalPay,
    basePrice: Number(product.price || 0),
    status: "pending",
    createdAt: Date.now(),
    expireAt: Date.now() + 5 * 60 * 1000,
    paidAt: null,
    processedAt: null
  }
  saveDB(db)

  await sendQr(sock, userId, deposit.data, buildPaymentCaption(product.name, price, uniqueCode, totalPay, invoice))
  await paymentService.startPolling(invoice, userId, sock)

  const { db: paidDb, tx } = paymentService.validatePaidInvoice(invoice, userId, "order_payment")
  const orderResult = await API.order(product.id, 1, invoice)

  if (!orderResult?.success) {
    tx.status = "order_failed"
    tx.failedReason = orderResult?.message || "API order gagal"
    tx.processedAt = Date.now()
    saveDB(paidDb)
    return notifyManualHelp(sock, userId, product.name, invoice)
  }

  const finalOrderData = await enrichOrderData(orderResult, invoice)
  tx.status = "completed"
  tx.processedAt = Date.now()
  tx.orderedAt = Date.now()
  tx.orderData = finalOrderData
  saveDB(paidDb)

  return sock.sendMessage(userId, {
    text: `${buildOrderSuccess(product.name, totalPay, finalOrderData, invoice)}

💡 Mau lebih murah?

Gabung reseller sekarang 👇
ketik: reseller`
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
💰 *SALDO KOSONG*

Saldo reseller kamu:
${formatRupiah(user.saldo)}

Silakan deposit dulu:
deposit 10000
━━━━━━━━━━━━━━━━━━`
    })
  }

  if (user.saldo < price) {
    return sock.sendMessage(userId, {
      text: `━━━━━━━━━━━━━━━━━━
❌ *SALDO TIDAK CUKUP*

📦 Produk:
${product.name}

💰 Harga reseller:
${formatRupiah(price)}

💰 Saldo kamu:
${formatRupiah(user.saldo)}

Minimal saldo disarankan:
${formatRupiah(10000)}
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

📦 Produk:
${product.name}

💰 Refund:
${formatRupiah(price)}

💰 Saldo sekarang:
${formatRupiah(latestUser.saldo)}

Silakan coba lagi nanti.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
      })
    }

    const finalOrderData = await enrichOrderData(orderResult, invoice)
    tx.status = "completed"
    tx.processedAt = Date.now()
    tx.orderedAt = Date.now()
    tx.orderData = finalOrderData
    saveDB(latestDb)

    return sock.sendMessage(userId, {
      text: `${buildOrderSuccess(product.name, price, finalOrderData, invoice)}

💰 Saldo tersisa:
${formatRupiah(latestUser.saldo)}`
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

async function enrichOrderData(orderResult, invoice) {
  if (hasAccountData(orderResult)) return orderResult.data || orderResult

  try {
    const status = await API.status(invoice)
    if (status?.success && hasAccountData(status)) {
      return status.data || status
    }
  } catch (error) {
    log("ORDER", `Gagal mengambil detail akun ${invoice}: ${error.message}`)
  }

  return orderResult.data || orderResult
}

async function notifyManualHelp(sock, userId, productName, invoice) {
  return sock.sendMessage(userId, {
    text: `━━━━━━━━━━━━━━━━━━
⚠️ *ORDER PERLU BANTUAN ADMIN*

Pembayaran sudah diterima, tetapi order gagal dibuat otomatis.

📦 Produk:
${productName}

📄 Invoice:
${invoice}

Admin akan bantu proses manual.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`
  })
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

function buildPaymentCaption(productName, price, uniqueCode, totalPay, invoice) {
  return `━━━━━━━━━━━━━━━━━━
🛒 *PEMBELIAN PRODUK*
━━━━━━━━━━━━━━━━━━

📦 Produk:
${productName}

💰 Harga:
${formatRupiah(price)}

🔢 Kode Unik:
${uniqueCode}

💵 Total Bayar:
${formatRupiah(totalPay)}

📄 Invoice:
${invoice}

━━━━━━━━━━━━━━━━━━
📱 *Scan QR di atas untuk bayar*

⏳ Berlaku: 5 menit

━━━━━━━━━━━━━━━━━━
📌 *Cara bayar:*
1. Scan QRIS
2. Selesaikan pembayaran
3. Tunggu otomatis diproses

⚠️ Harus sesuai nominal
━━━━━━━━━━━━━━━━━━

❌ Batal:
cancel ${invoice}
━━━━━━━━━━━━━━━━━━`
}

function buildOrderSuccess(productName, totalPay, orderData, invoice) {
  return `━━━━━━━━━━━━━━━━━━
✅ *PEMBAYARAN BERHASIL*
━━━━━━━━━━━━━━━━━━

📦 Produk:
${productName}

💰 Total:
${formatRupiah(totalPay)}

━━━━━━━━━━━━━━━━━━
🔐 *DATA AKUN*

${formatAccountData(orderData)}

━━━━━━━━━━━━━━━━━━
📄 Invoice:
${invoice}

🙏 Terima kasih sudah order!
Jika ada masalah bisa hubungi kami.
━━━━━━━━━━━━━━━━━━`
}

function hasAccountData(data) {
  return extractAccounts(data).length > 0
}

function formatAccountData(data) {
  const accounts = extractAccounts(data)

  if (accounts.length === 0) {
    return "Data akun belum tersedia dari provider.\nSilakan cek *status <invoice>* atau hubungi admin."
  }

  return accounts.map(account => {
    const product = account.productName ? `${account.productName}\n\n` : ""
    const username = account.username ? `📧 Username: ${account.username}` : ""
    const password = account.password ? `🔑 Password: ${account.password}` : ""
    const access = !account.password && account.access ? `🔑 Akses: ${account.access}` : ""
    const note = account.note ? `📝 Catatan: ${account.note}` : ""

    return `${product}${[username, password, access, note].filter(Boolean).join("\n")}`.trim()
  }).join("\n\n")
}

function extractAccounts(data, depth = 0) {
  if (!data || depth > 4) return []

  if (typeof data === "string") {
    const parsed = parseAccountString(data)
    return parsed ? [parsed] : []
  }

  if (Array.isArray(data)) {
    return data.flatMap(item => extractAccounts(item, depth + 1))
  }

  if (typeof data !== "object") return []

  const direct = normalizeAccountObject(data)
  if (direct) return [direct]

  const keys = ["account_data", "account", "accounts", "data", "result", "order", "orders", "items"]
  for (const key of keys) {
    const found = extractAccounts(data[key], depth + 1)
    if (found.length) return found
  }

  return []
}

function normalizeAccountObject(obj) {
  const username = pickValue(obj, ["username", "user", "email", "login", "akun"])
  const password = pickValue(obj, ["password", "pass", "pwd", "sandi"])
  const access = pickValue(obj, ["access", "akses", "link", "url", "note", "credential"])
  const productName = pickValue(obj, ["productName", "product_name", "produk", "product"])

  if (!username && !password && !access) return null

  return {
    productName,
    username,
    password,
    access,
    note: pickValue(obj, ["note", "catatan", "keterangan"])
  }
}

function pickValue(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
      return String(obj[key]).trim()
    }
  }
  return ""
}

function parseAccountString(value) {
  const text = value.trim()
  if (!text || /akan dikirim|pending|processing/i.test(text)) return null

  const usernameMatch = text.match(/(?:username|email|user|login)\s*[:=]\s*([^\n|,]+)/i)
  const passwordMatch = text.match(/(?:password|pass|pwd|sandi)\s*[:=]\s*([^\n|,]+)/i)

  if (usernameMatch || passwordMatch) {
    return {
      username: usernameMatch?.[1]?.trim() || "",
      password: passwordMatch?.[1]?.trim() || "",
      access: !passwordMatch ? text : ""
    }
  }

  const parts = text.split(/[|,;\n]/).map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2 && /@|http|www|[a-z0-9]/i.test(parts[0])) {
    return {
      username: parts[0],
      password: parts[1]
    }
  }

  if (/https?:\/\//i.test(text)) {
    return { access: text }
  }

  return null
}
