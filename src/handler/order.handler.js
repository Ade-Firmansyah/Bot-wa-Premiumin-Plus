const { API_KEY } = require('../config')
const payment = require('../service/payment.service')
const premku = require('../service/premku.service')
const db = require('../database/db')
const { logInfo, logError } = require('../utils/logger')
const { formatCurrency } = require('../utils/format')

let isProcessingOrders = false
let isExpiringOrders = false

async function processPendingOrders(client) {
  if (isProcessingOrders) return
  isProcessingOrders = true

  try {
    const orders = db.getActiveOrders()
    if (!orders.length) return

    for (const order of orders) {
      try {
        const paymentStatus = await payment.checkDeposit(API_KEY, order.invoice_pay)
        const status = paymentStatus.data?.status || paymentStatus.status || ''
        logInfo('Checking payment status', { invoice: order.invoice, status })

        if (status === 'success') {
          await fulfillOrder(client, order)
        } else if (status === 'expired' || status === 'failed') {
          db.updateOrder(order.invoice, { status: 'EXPIRED' })
          await client.sendMessage(order.user, `⏳ Pesanan ${order.invoice} kedaluwarsa. Silakan buat ulang jika masih ingin membeli.`)
        }
      } catch (error) {
        logError('Payment check failed', { invoice: order.invoice, error: error.message })
      }
    }
  } finally {
    isProcessingOrders = false
  }
}

async function fulfillOrder(client, order) {
  const existing = db.getOrder(order.invoice)
  if (!existing || existing.status !== 'WAITING') {
    return
  }

  const orderResponse = await premku.createOrder(API_KEY, order.product_id, 1, order.invoice)
  if (!orderResponse.success) {
    logError('Premku order creation failed', { invoice: order.invoice, response: orderResponse })
    return
  }

  const statusResponse = await premku.checkOrder(API_KEY, orderResponse.invoice)
  if (statusResponse.status !== 'success' || !Array.isArray(statusResponse.accounts) || !statusResponse.accounts.length) {
    logInfo('Order not ready yet', { invoice: order.invoice, status: statusResponse.status })
    return
  }

  const account = statusResponse.accounts[0]
  const [password, ...noteParts] = (account.password || '').split(' - ')
  const note = noteParts.filter(Boolean).join(' - ')

  try {
    if (order.qr_message_id && typeof client.deleteMessage === 'function') {
      await client.deleteMessage(order.user, order.qr_message_id, false)
    }
  } catch (deleteError) {
    logError('Failed to remove QR message', { invoice: order.invoice, error: deleteError.message })
  }

  const successMessage =
`✅ *PEMBAYARAN BERHASIL*\n\n📦 Produk: *${order.product_name}*\n💰 Total: Rp *${formatCurrency(order.total)}*\n\n📧 Username: ${account.username}\n🔑 Password: ${password || '-'}\n${note ? `\n📝 Catatan: ${note}` : ''}\n\n📄 Invoice: *${order.invoice}*\n\nTerima kasih telah menggunakan *Premiumin Plus* 🚀`

  await client.sendMessage(order.user, successMessage)
  db.updateOrder(order.invoice, { status: 'SUCCESS' })
  logInfo('Order fulfilled', { invoice: order.invoice })
}

async function expireOldOrders(client) {
  if (isExpiringOrders) return
  isExpiringOrders = true
  try {
    const orders = db.getActiveOrders()
    const now = Date.now()

    for (const order of orders) {
      if (now - order.created_at > 5 * 60 * 1000) {
        db.updateOrder(order.invoice, { status: 'EXPIRED' })
        await client.sendMessage(order.user, `⏳ Waktu pembayaran untuk ${order.invoice} telah berakhir. Silakan buat kembali jika masih ingin membeli.`)
        logInfo('Order expired due timeout', { invoice: order.invoice })
      }
    }
  } catch (error) {
    logError('Order expiration failed', error)
  } finally {
    isExpiringOrders = false
  }
}

function startOrderWatcher(client) {
  setInterval(() => {
    processPendingOrders(client).catch(error => logError('Pending order checker failed', error))
  }, 10 * 1000)

  setInterval(() => {
    expireOldOrders(client).catch(error => logError('Order expiration failed', error))
  }, 60 * 1000)
}

module.exports = {
  startOrderWatcher
}
