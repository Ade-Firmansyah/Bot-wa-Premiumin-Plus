import { API } from "./api.js"
import { formatRupiah, loadDB, log, saveDB, SUPPORT_TEXT } from "../utils/helper.js"

const PAID_STATUS = new Set(["PAID", "SUCCESS", "SETTLED"])
const FAILED_STATUS = new Set(["CANCELLED", "CANCELED", "FAILED", "EXPIRED"])

class PaymentService {
  constructor() {
    this.activePolls = new Map()
    this.POLL_INTERVAL = 5000
    this.TIMEOUT = 5 * 60 * 1000
    this.MAX_PAID_AGE = 10 * 60 * 1000
  }

  assertInvoice(invoice, userId) {
    const tx = loadDB().transactions?.[invoice]

    if (!tx) throw new Error("Invoice tidak ditemukan")
    if (tx.userId !== userId) throw new Error("Invoice bukan milik user ini")
    if (tx.status !== "pending") throw new Error("Invoice sudah dipakai atau tidak aktif")
    if (tx.processedAt) throw new Error("Invoice sudah pernah diproses")

    return tx
  }

  validatePaidInvoice(invoice, userId, expectedType) {
    const db = loadDB()
    const tx = db.transactions?.[invoice]

    if (!tx) throw new Error("Invoice tidak ditemukan")
    if (tx.userId !== userId) throw new Error("Invoice bukan milik user ini")
    if (expectedType && tx.type !== expectedType) throw new Error("Tipe invoice tidak sesuai")
    if (tx.status !== "paid") throw new Error("Invoice belum dibayar")
    if (tx.processedAt) throw new Error("Invoice sudah pernah diproses")
    if (!tx.paidAt || Date.now() - tx.paidAt > this.MAX_PAID_AGE) {
      throw new Error("Pembayaran sudah terlalu lama")
    }

    return { db, tx }
  }

  startPolling(invoice, userId, sock) {
    const existing = this.activePolls.get(invoice)
    if (existing) return existing.promise

    try {
      this.assertInvoice(invoice, userId)
    } catch (error) {
      return Promise.reject(error)
    }

    let settled = false
    let intervalId = null
    let timeoutId = null

    const cleanup = () => {
      if (settled) return
      settled = true
      if (intervalId) clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
      this.activePolls.delete(invoice)
    }

    const promise = new Promise((resolve, reject) => {
      const finish = (error, result) => {
        cleanup()
        if (error) reject(error)
        else resolve(result)
      }

      const markCancelled = async (reason = "EXPIRED") => {
        try {
          await API.cancelDeposit(invoice)
        } catch (error) {
          log("PAYMENT", `Cancel API failed for ${invoice}: ${error.message}`)
        }

        const db = loadDB()
        const tx = db.transactions?.[invoice]
        if (tx && tx.status === "pending") {
          tx.status = "cancelled"
          tx.cancelledAt = Date.now()
          tx.cancelReason = reason
          saveDB(db)
        }

        await this.safeSend(sock, userId, `━━━━━━━━━━━━━━━━━━
⏰ *PEMBAYARAN EXPIRED*

🧾 Invoice: ${invoice}
⏳ Batas waktu: 5 menit

Silakan buat pembayaran baru jika masih ingin melanjutkan.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`)

        finish(new Error("Payment timeout"), null)
      }

      const checkPayment = async () => {
        if (settled) return

        try {
          const db = loadDB()
          const tx = db.transactions?.[invoice]

          if (!tx) return finish(new Error("Transaksi tidak ditemukan"), null)
          if (tx.userId !== userId) return finish(new Error("Invoice bukan milik user ini"), null)
          if (tx.status !== "pending") return finish(null, { status: tx.status })
          if (Date.now() - tx.createdAt > this.TIMEOUT) return markCancelled("LOCAL_TIMEOUT")

          const response = await API.checkDeposit(invoice)
          const status = String(response?.data?.status || response?.status || "").toUpperCase()

          if (PAID_STATUS.has(status)) {
            tx.status = "paid"
            tx.paidAt = Date.now()
            saveDB(db)

            await this.safeSend(sock, userId, `━━━━━━━━━━━━━━━━━━
✅ *PEMBAYARAN DITERIMA*

🧾 Invoice: ${invoice}
💰 Total: ${formatRupiah(tx.amount || tx.price || 0)}

Pesanan sedang diproses otomatis.
━━━━━━━━━━━━━━━━━━`)

            return finish(null, { success: true, status: "paid" })
          }

          if (FAILED_STATUS.has(status)) {
            tx.status = "cancelled"
            tx.cancelledAt = Date.now()
            tx.cancelReason = status
            saveDB(db)

            await this.safeSend(sock, userId, `━━━━━━━━━━━━━━━━━━
❌ *PEMBAYARAN GAGAL*

🧾 Invoice: ${invoice}
📌 Status: ${status}

Tidak ada saldo atau akses yang ditambahkan.${SUPPORT_TEXT}
━━━━━━━━━━━━━━━━━━`)

            return finish(new Error("Payment cancelled"), null)
          }
        } catch (error) {
          log("PAYMENT", `Polling ${invoice} gagal: ${error.message}`)
        }
      }

      intervalId = setInterval(checkPayment, this.POLL_INTERVAL)
      timeoutId = setTimeout(() => markCancelled("TIMEOUT"), this.TIMEOUT)
      checkPayment()
    })

    this.activePolls.set(invoice, {
      promise,
      cancel: () => {
        cleanup()
      }
    })

    return promise
  }

  async safeSend(sock, userId, text) {
    try {
      await sock.sendMessage(userId, { text })
    } catch (error) {
      log("PAYMENT", `Gagal mengirim notifikasi ke ${userId}: ${error.message}`)
    }
  }
}

export const paymentService = new PaymentService()
