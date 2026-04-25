const { API_KEY } = require('../config')
const payment = require('../service/payment.service')
const premku = require('../service/premku.service')
const db = require('../../database/db')
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
        // Skip orders that are already being processed
        if (order.status === 'ORDER_CREATED') {
          continue
        }

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
        logError('Payment check failed', {
          invoice: order.invoice,
          error: error.message,
          stack: error.stack
        })
      }
    }
  } catch (error) {
    logError('Process pending orders failed', {
      error: error.message,
      stack: error.stack
    })
  } finally {
    isProcessingOrders = false
  }
}

async function fulfillOrder(client, order) {
  const existing = db.getOrder(order.invoice)
  if (!existing || existing.status !== 'WAITING') {
    return
  }

  try {
    // Step 1: Create order via Premku API
    const orderResponse = await premku.createOrder(API_KEY, order.product_id, 1, order.invoice)
    if (!orderResponse.success) {
      logError('Premku order creation failed', {
        invoice: order.invoice,
        response: orderResponse
      })
      return
    }

    // Update order with Premku invoice
    db.updateOrder(order.invoice, {
      premku_invoice: orderResponse.invoice,
      status: 'ORDER_CREATED'
    })

    logInfo('Order created in Premku', {
      invoice: order.invoice,
      premku_invoice: orderResponse.invoice
    })

    // Step 2: Check order status until ready (with retry logic)
    await checkOrderStatusUntilReady(client, order.invoice, orderResponse.invoice, order)

  } catch (error) {
    logError('Fulfill order failed', {
      invoice: order.invoice,
      error: error.message,
      stack: error.stack
    })
  }
}

async function checkOrderStatusUntilReady(client, localInvoice, premkuInvoice, order, attempts = 0) {
  const MAX_ATTEMPTS = 20 // Check for up to ~5 minutes (20 * 15s)
  const CHECK_INTERVAL = 15000 // 15 seconds

  if (attempts >= MAX_ATTEMPTS) {
    logError('Order status check timeout', { invoice: localInvoice, premku_invoice: premkuInvoice })
    await client.sendMessage(order.user, `⏳ Pesanan ${localInvoice} sedang diproses. Jika belum menerima akun dalam 10 menit, hubungi admin.`)
    return
  }

  try {
    const statusResponse = await premku.checkOrder(API_KEY, premkuInvoice)

    if (statusResponse.success && statusResponse.status === 'success' &&
        Array.isArray(statusResponse.accounts) && statusResponse.accounts.length > 0) {

      // Order is ready, send account data
      await sendAccountData(client, localInvoice, order, statusResponse.accounts[0])
      return
    }

    // Order not ready yet, schedule next check
    logInfo('Order not ready yet, will check again', {
      invoice: localInvoice,
      premku_invoice: premkuInvoice,
      status: statusResponse.status,
      attempt: attempts + 1
    })

    setTimeout(() => {
      checkOrderStatusUntilReady(client, localInvoice, premkuInvoice, order, attempts + 1)
    }, CHECK_INTERVAL)

  } catch (error) {
    logError('Order status check failed', {
      invoice: localInvoice,
      premku_invoice: premkuInvoice,
      error: error.message,
      attempt: attempts + 1
    })

    // Retry after error
    setTimeout(() => {
      checkOrderStatusUntilReady(client, localInvoice, premkuInvoice, order, attempts + 1)
    }, CHECK_INTERVAL)
  }
}

async function sendAccountData(client, invoice, order, account) {
  try {
    // Delete QR message if exists
    if (order.qr_message_id && typeof client.deleteMessage === 'function') {
      await client.deleteMessage(order.user, order.qr_message_id, false)
    }
  } catch (deleteError) {
    logError('Failed to remove QR message', {
      invoice: invoice,
      error: deleteError.message
    })
  }

  // Parse password and notes
  const [password, ...noteParts] = (account.password || '').split(' - ')
  const note = noteParts.filter(Boolean).join(' - ')

  const successMessage =
`✅ *PEMBAYARAN BERHASIL*\n\n📦 Produk: *${order.product_name}*\n💰 Total: Rp *${formatCurrency(order.total)}*\n\n📧 Username: ${account.username}\n🔑 Password: ${password || '-'}\n${note ? `\n📝 Catatan: ${note}` : ''}\n\n📄 Invoice: *${invoice}*\n\nTerima kasih telah menggunakan *Premiumin Plus* 🚀`

  try {
    await client.sendMessage(order.user, successMessage)
    db.updateOrder(invoice, { status: 'SUCCESS' })
    logInfo('Order fulfilled successfully', { invoice: invoice })
  } catch (sendError) {
    logError('Failed to send success message', {
      invoice: invoice,
      error: sendError.message
    })
    // Still mark as success since account was delivered
    db.updateOrder(invoice, { status: 'SUCCESS' })
  }
}

async function expireOldOrders(client) {
  if (isExpiringOrders) return
  isExpiringOrders = true
  try {
    const orders = db.getActiveOrders()
    const now = Date.now()

    for (const order of orders) {
      // Don't expire orders that are already being processed
      if (order.status === 'ORDER_CREATED') {
        continue
      }

      if (now - order.created_at > 5 * 60 * 1000) { // 5 minutes
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
  // Increased intervals to reduce CPU load
  // Check pending orders every 15 seconds (was 10)
  const orderCheckInterval = setInterval(() => {
    processPendingOrders(client).catch(error => logError('Pending order checker failed', error))
  }, 15 * 1000)

  // Check expiring orders every 90 seconds (was 60)
  const expirationInterval = setInterval(() => {
    expireOldOrders(client).catch(error => logError('Order expiration failed', error))
  }, 90 * 1000)

  // Cleanup function for graceful shutdown
  return {
    stop: () => {
      clearInterval(orderCheckInterval)
      clearInterval(expirationInterval)
    }
  }
}

module.exports = {
  startOrderWatcher
}
