const { createRouter } = require('../utils/router')
const { sanitizeText, formatCurrency, buildQrMedia, buildHeader } = require('../utils/format')
const { getFinalPrice } = require('../utils/pricing')
const { logInfo, logError } = require('../utils/logger')
const premku = require('../service/premku.service')
const payment = require('../service/payment.service')
const resellerService = require('../service/reseller.service')
const transactionService = require('../service/transaction.service')
const db = require('../../database/db')
const { API_KEY } = require('../config')

async function greetingHandler({ client, msg }) {
  const text = sanitizeText(msg.body).toLowerCase()
  if (['p', 'ping', 'halo', 'test', 'assalamualaikum'].includes(text)) {
    const hour = new Date().getHours()
    let greeting = 'Selamat Malam 🌙'
    if (hour >= 4 && hour < 10) greeting = 'Selamat Pagi 🌅'
    else if (hour < 15) greeting = 'Selamat Siang ☀️'
    else if (hour < 18.5) greeting = 'Selamat Sore 🌆'

    return client.sendMessage(msg.from,
`${buildHeader('Sapa Pengguna')}\n${greeting}!\n\nSelamat datang di *Premiumin Plus* 🚀\nPusat akun premium legal, murah, dan otomatis.\n\n*Menu Cepat:*\n• ketik *STOK* untuk lihat produk\n• ketik *MENU* untuk menu lengkap\n• ketik *ADMIN* untuk kontak admin\n`)
  }
}

async function menuHandler({ client, msg }) {
  return client.sendMessage(msg.from,
`${buildHeader('Menu Premiumin Plus')}\n📌 _Panduan singkat penggunaan bot_\n\n• *STOK* → daftar produk ready\n• *BUY <id>* atau *BUY<id>* → mulai transaksi\n• *CANCEL INV-...* → batalkan pembayaran\n• *ADMIN* → kontak admin cepat\n• *RESELLER* → info paket reseller\n`)
}

async function adminHandler({ client, msg }) {
  return client.sendMessage(msg.from, '📞 *Kontak Admin:* 083129999931')
}

async function websiteHandler({ client, msg }) {
  return client.sendMessage(msg.from, '🌐 https://digitalpanelsmm.com')
}

async function resellerHandler({ client, msg }) {
  const message = `
🔥 *IDE BAGUS JADI RESELLER* 🔥

Kamu bisa menghasilkan cuan 💰
dengan harga lebih murah & auto sistem!

━━━━━━━━━━━━━━━

💸 *PAKET RESELLER*
1️⃣ Bulanan → 10.000
2️⃣ Tahunan → 50.000
3️⃣ Unlimited → 100.000

━━━━━━━━━━━━━━━

🚀 Mau lebih serius?
Bisa dibuatkan:
🤖 Bot auto jualan
📊 Dashboard pantau pendapatan

👉 Chat admin untuk nego price 😎

━━━━━━━━━━━━━━━

📥 Ketik:
gabung 1 / gabung 2 / gabung 3
`
  return client.sendMessage(msg.from, message)
}

async function stockHandler({ client, msg }) {
  try {
    const response = await premku.getProducts(API_KEY)
    const products = Array.isArray(response.products) ? response.products.slice() : []

    const availableProducts = products
      .filter(product => product && Number(product.stock) > 0)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id-ID'))

    if (!availableProducts.length) {
      return client.sendMessage(msg.from, '🔎 Maaf, stok produk belum tersedia saat ini.')
    }

    let message = `📦 *DAFTAR PRODUK TERSEDIA*\n`
    message += `━━━━━━━━━━━━━━━\n\n`
    availableProducts.forEach(product => {
      const name = (product.name || 'Produk Premium').toUpperCase()
      const stock = Number(product.stock) || 0
      const basePrice = Number(product.price) || 0
      const pricing = getFinalPrice(basePrice, false) // Show normal price for stock list
      const price = pricing.finalPrice
      const code = product.id || '-'
      message += `📦 ${name} || STOK : ${stock} AKUN\n`
      message += `💰 PRICE : Rp ${formatCurrency(price)} || 🔑 CODE : buy ${code}\n\n`
    })

    message += `━━━━━━━━━━━━━━━\n`
    message += `📥 Cara beli:\n`
    message += `buy <kode>\n\n`
    message += `🎉 Reseller dapat harga reseller!\n`
    message += `❓ Kurang paham? Hubungi admin 😎`

    return client.sendMessage(msg.from, message)
  } catch (error) {
    logError('Failed to fetch stock', error)
    return client.sendMessage(msg.from, '❌ Gagal mengambil stok produk. Silakan coba lagi sebentar.')
  }
}

function parseId(args) {
  if (!args || !args.length) return null
  const idString = args[0].toString().trim()
  const match = idString.match(/^(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

async function buyHandler({ client, msg }, args) {
  const productId = parseId(args)
  if (!productId) {
    return client.sendMessage(msg.from, '❌ Format salah. Gunakan: *BUY 1* atau *BUY1*')
  }

  try {
    const productsResponse = await premku.getProducts(API_KEY)
    const product = (productsResponse.products || []).find(item => item.id === productId)
    if (!product) {
      return client.sendMessage(msg.from, '❌ Produk tidak ditemukan. Coba lagi dengan ID yang benar.')
    }

    const basePrice = Number(product.price) || 0
    const isReseller = resellerService.isReseller(msg.from)
    const pricing = getFinalPrice(basePrice, isReseller)

    const paymentResponse = await payment.createDeposit(API_KEY, pricing.finalPrice)
    const payData = paymentResponse.data || paymentResponse
    if (!payData || !payData.invoice) {
      throw new Error('Respons pembayaran tidak valid')
    }

    const total = payData.total_bayar || pricing.finalPrice
    const invoiceId = `INV-${Date.now()}`

    const orderRecord = {
      invoice: invoiceId,
      user: msg.from,
      product_id: product.id,
      product_name: product.name,
      total: total,
      code: payData.kode_unik || pricing.uniqueCode,
      invoice_pay: payData.invoice,
      status: 'WAITING',
      created_at: Date.now(),
      qr_message_id: null,
      is_reseller: isReseller
    }

    db.addOrder(orderRecord)

    const discountText = isReseller ? '\n🎉 *Harga Reseller Applied!*' : ''

    const caption =
`${buildHeader('Tagihan Pembayaran')}\n\n📦 Produk: *${product.name}*\n💰 Total: *Rp ${formatCurrency(total)}*\n📄 Invoice: *${invoiceId}*${discountText}\n\n⚠️ Bayar tepat sesuai nominal\n⏳ Batas waktu: 5 menit\n🔄 Otomatis diproses setelah bayar\n\n*Batal jika ingin membatalkan:*\ncancel ${invoiceId}`

    const media = buildQrMedia(payData.qr_image)
    if (media) {
      const sent = await client.sendMessage(msg.from, media, { caption })
      if (sent && sent.id) {
        db.updateOrder(invoiceId, { qr_message_id: sent.id._serialized || sent.id })
      }
      return sent
    }

    return client.sendMessage(msg.from,
`${caption}\n\n💳 QRIS:\n${payData.qr_raw || 'Tidak tersedia. Silakan ulangi.'}`
    )
  } catch (error) {
    logError('Buy handler failed', error)
    return client.sendMessage(msg.from, `❌ Gagal membuat pembayaran: ${error.message}`)
  }
}

async function cancelHandler({ client, msg }, args) {
  const invoice = args[0] ? args[0].toString().trim().toUpperCase() : null
  if (!invoice || !invoice.startsWith('INV-')) {
    return client.sendMessage(msg.from, '❌ Format cancel salah. Gunakan: *cancel INV-123456789*')
  }

  const order = db.getOrder(invoice)
  if (!order || order.user !== msg.from) {
    return client.sendMessage(msg.from, '❌ Invoice tidak ditemukan atau bukan milik Anda.')
  }

  if (order.status !== 'WAITING') {
    return client.sendMessage(msg.from, `❌ Status invoice: ${order.status}. Tidak bisa dibatalkan.`)
  }

  try {
    const cancelResult = await payment.cancelDeposit(API_KEY, order.invoice_pay)
    const success = cancelResult?.success === true || cancelResult?.status === 'success' || String(cancelResult?.message || '').toLowerCase().includes('batal')

    if (!success) {
      return client.sendMessage(msg.from, '❌ Pembatalan gagal. Silakan coba lagi nanti.')
    }

    db.updateOrder(invoice, { status: 'CANCELLED' })
    return client.sendMessage(msg.from, `✅ Pesanan ${invoice} berhasil dibatalkan.`)
  } catch (error) {
    logError('Cancel handler failed', error)
    return client.sendMessage(msg.from, `❌ Gagal membatalkan pesanan: ${error.message}`)
  }
}

async function testPayHandler({ client, msg }, args) {
  const invoice = args[0] ? args[0].toString().trim().toUpperCase() : null
  if (!invoice || !invoice.startsWith('INV-')) {
    return client.sendMessage(msg.from, '❌ Format testpay salah. Gunakan: *testpay INV-123456789*')
  }

  const order = db.getOrder(invoice)
  if (!order || order.user !== msg.from) {
    return client.sendMessage(msg.from, '❌ Invoice tidak ditemukan atau bukan milik Anda.')
  }

  if (order.status !== 'WAITING') {
    return client.sendMessage(msg.from, `❌ Status invoice: ${order.status}. Sudah diproses.`)
  }

  // Simulate successful payment
  db.updateOrder(invoice, { status: 'SUCCESS' })
  return client.sendMessage(msg.from, '✅ Pembayaran berhasil! Silakan tunggu data segera dikirimkan.')
}

async function gabungHandler({ client, msg }, args) {
  const pilihan = args[0]
  const user = msg.from

  // Check if already reseller
  if (resellerService.isReseller(user)) {
    return client.sendMessage(user, '❌ Anda sudah menjadi reseller!')
  }

  // Check if has pending transaction
  const pending = transactionService.getPendingByUser(user)
  if (pending) {
    return client.sendMessage(user, '❌ Anda memiliki pembayaran reseller yang belum selesai. Silakan selesaikan terlebih dahulu.')
  }

  const prices = {
    '1': 10000,
    '2': 50000,
    '3': 100000
  }

  const types = {
    '1': '1bulan',
    '2': '12bulan',
    '3': 'unlimited'
  }

  if (!prices[pilihan]) {
    return client.sendMessage(user, '❌ Pilihan tidak valid. Gunakan: gabung 1, gabung 2, atau gabung 3')
  }

  const amount = prices[pilihan]
  const type = types[pilihan]

  try {
    const pay = await payment.createDeposit(API_KEY, amount)
    const invoice = pay.data.invoice

    // Save transaction
    transactionService.save(invoice, {
      user,
      type,
      amount,
      status: 'pending'
    })

    await client.sendMessage(user,
`💳 *PEMBAYARAN RESELLER*

💰 Total: Rp ${formatCurrency(pay.data.total_bayar)}
📄 Invoice: ${invoice}

Scan QR untuk bayar ya 👇`
    )

    const qrMedia = buildQrMedia(pay.data.qr_image)
    if (qrMedia) {
      await client.sendMessage(user, qrMedia)
    }

    // Start checking payment
    checkResellerPayment(client, user, invoice)

  } catch (err) {
    logError('Gabung reseller failed', err)
    return client.sendMessage(user, '❌ Gagal membuat pembayaran. Silakan coba lagi.')
  }
}

async function checkResellerPayment(client, user, invoice) {
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000)) // delay 10 seconds

    try {
      const res = await payment.checkDeposit(API_KEY, invoice)

      if (res.data.status === 'success') {
        await activateReseller(client, user, invoice)
        return
      }
    } catch (err) {
      logError('Check reseller payment failed', {
        invoice,
        attempt: i + 1,
        error: err.message,
        stack: err.stack
      })
      // Continue checking
    }
  }

  // Payment failed/expired
  try {
    transactionService.update(invoice, { status: 'expired' })
    await client.sendMessage(user, '❌ Pembayaran expired / gagal. Silakan coba lagi.')
  } catch (err) {
    logError('Failed to update expired reseller payment', {
      invoice,
      error: err.message
    })
  }
}

async function activateReseller(client, user, invoice) {
  const trx = transactionService.get(invoice)
  if (!trx) {
    logError('Transaction not found for activation', { invoice, user })
    return
  }

  try {
    let expired = null

    if (trx.type === '1bulan') {
      expired = Date.now() + (30 * 24 * 60 * 60 * 1000)
    } else if (trx.type === '12bulan') {
      expired = Date.now() + (365 * 24 * 60 * 60 * 1000)
    }
    // unlimited: expired = null

    resellerService.add(user, {
      type: trx.type,
      expired_at: expired
    })

    transactionService.update(invoice, { status: 'success' })

    const expiredText = expired ? `⏳ Expired: ${new Date(expired).toLocaleDateString('id-ID')}` : '♾️ Unlimited'

    await client.sendMessage(user,
`🎉 *RESELLER AKTIF*

Status: ${trx.type}

${expiredText}

🔥 Sekarang kamu dapat harga reseller!
`
    )

    logInfo('Reseller activated', { user, type: trx.type, invoice })
  } catch (error) {
    logError('Activate reseller failed', {
      user,
      invoice,
      error: error.message,
      stack: error.stack
    })
  }
}

async function noopHandler({ client, msg }) {
  return
}

const route = createRouter({
  menu: menuHandler,
  help: menuHandler,
  stok: stockHandler,
  stock: stockHandler,
  buy: buyHandler,
  cancel: cancelHandler,
  testpay: testPayHandler,
  admin: adminHandler,
  website: websiteHandler,
  reseller: resellerHandler,
  gabung: gabungHandler,
  ping: greetingHandler,
  p: greetingHandler,
  halo: greetingHandler,
  test: greetingHandler,
  assalamualaikum: greetingHandler,
  cek: greetingHandler,
  default: noopHandler
})

async function handleCommand(client, msg) {
  const text = sanitizeText(msg.body)
  if (!text) return

  try {
    await route(text, { client, msg })
  } catch (error) {
    logError('Command handler failed', {
      error: error.message,
      stack: error.stack,
      command: text,
      user: msg.from
    })

    // Send user-friendly error message
    try {
      await client.sendMessage(msg.from, '❌ Terjadi kesalahan sistem. Silakan coba lagi dalam beberapa saat.')
    } catch (sendError) {
      logError('Failed to send error message to user', {
        sendError: sendError.message,
        user: msg.from
      })
    }
  }
}

module.exports = {
  handleCommand
}
