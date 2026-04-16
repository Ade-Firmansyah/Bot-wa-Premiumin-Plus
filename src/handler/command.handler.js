const { createRouter } = require('../utils/router')
const { sanitizeText, formatCurrency, buildQrMedia, buildHeader } = require('../utils/format')
const { calculateSalePrice, buildUniqueTotal } = require('../utils/pricing')
const { logInfo, logError } = require('../utils/logger')
const premku = require('../service/premku.service')
const payment = require('../service/payment.service')
const db = require('../database/db')
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
  return client.sendMessage(msg.from,
`${buildHeader('Program Reseller')}\n\n✅ Harga lebih kompetitif\n✅ Komisi otomatis\n✅ Support 24/7\n\n*Cara daftar:*\n1. Deposit minimal Rp 50.000\n2. Hubungi admin untuk aktivasi\n3. Dapat panel reseller pribadi\n\n📞 *Chat Admin:* 083129999931`
  )
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

    let message = `${buildHeader('Katalog Premiumin Plus')}\n\n`
    availableProducts.forEach(product => {
      const name = product.name || 'Produk Premium'
      const stock = Number(product.stock) || 0
      const price = calculateSalePrice(Number(product.price) || 0)
      const code = product.id || '-'
      message += `📦 *${name}*\n`
      message += `📊 Stok: ${stock} Akun\n`
      message += `💰 Rp ${formatCurrency(price)}\n`
      message += `🔑 Code: buy ${code}\n\n`
    })

    message += '━━━━━━━━━━━━━━━\n'
    message += '📌 *Cara Order:*\n'
    message += 'Ketik: buy [kode]\n'
    message += 'Contoh: buy 14'

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

    const basePrice = calculateSalePrice(product.price)
    const unique = buildUniqueTotal(basePrice, db.getPendingTotals())
    const invoiceId = `INV-${Date.now()}`

    const paymentResponse = await payment.createDeposit(API_KEY, unique.total)
    const payData = paymentResponse.data || paymentResponse
    if (!payData || !payData.invoice) {
      throw new Error('Respons pembayaran tidak valid')
    }

    const orderRecord = {
      invoice: invoiceId,
      user: msg.from,
      product_id: product.id,
      product_name: product.name,
      total: unique.total,
      code: unique.code,
      invoice_pay: payData.invoice,
      status: 'WAITING',
      created_at: Date.now(),
      qr_message_id: null
    }

    db.addOrder(orderRecord)

    const caption =
`${buildHeader('Tagihan Pembayaran')}\n\n📦 Produk: *${product.name}*\n💰 Total: *Rp ${formatCurrency(unique.total)}*\n📄 Invoice: *${invoiceId}*\n\n⚠️ Bayar tepat sesuai nominal\n⏳ Batas waktu: 5 menit\n🔄 Otomatis diproses setelah bayar\n\n*Batal jika ingin membatalkan:*\ncancel ${invoiceId}`

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
  admin: adminHandler,
  website: websiteHandler,
  reseller: resellerHandler,
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
    logError('Command handler failed', error)
  }
}

module.exports = {
  handleCommand
}
