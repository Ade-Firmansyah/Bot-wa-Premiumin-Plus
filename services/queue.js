import { log } from "../utils/helper.js"

class OrderQueue {
  constructor() {
    this.queues = new Map()
    this.processing = new Map()
    this.timeout = 60 * 1000
    this.maxRetries = 3
  }

  add(userId, orderData) {
    if (this.hasPending(userId)) {
      return 0
    }

    const job = {
      id: `${userId}-${Date.now()}`,
      userId,
      data: orderData,
      createdAt: Date.now(),
      retries: 0
    }

    this.queues.set(userId, [job])
    log("QUEUE", `Job added for ${userId}`)
    return 1
  }

  hasPending(userId) {
    return this.processing.get(userId) === true || (this.queues.get(userId)?.length || 0) > 0
  }

  async process(userId, handler) {
    if (this.processing.get(userId)) {
      throw new Error("User masih memiliki proses berjalan")
    }

    const job = this.queues.get(userId)?.[0]
    if (!job) return null

    this.processing.set(userId, true)

    try {
      while (job.retries < this.maxRetries) {
        job.retries += 1

        try {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Queue timeout 60 detik")), this.timeout)
          })

          const result = await Promise.race([handler(job.data), timeoutPromise])
          log("QUEUE", `Job completed for ${userId}`)
          return result
        } catch (error) {
          log("QUEUE", `Job failed for ${userId} attempt ${job.retries}: ${error.message}`)
          if (job.retries >= this.maxRetries) throw error
        }
      }

      return null
    } finally {
      this.queues.delete(userId)
      this.processing.delete(userId)
    }
  }

  clear(userId) {
    this.queues.delete(userId)
    this.processing.delete(userId)
  }

  getStats() {
    const totalQueues = this.queues.size
    const processing = Array.from(this.processing.values()).filter(Boolean).length
    return { totalQueues, totalOrders: totalQueues, processing }
  }
}

export const orderQueue = new OrderQueue()

class RateLimiter {
  constructor(maxRequests = 20, windowMs = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    this.requests = new Map()
  }

  check(userId) {
    const now = Date.now()
    const validRequests = (this.requests.get(userId) || []).filter(time => now - time < this.windowMs)

    if (validRequests.length >= this.maxRequests) {
      this.requests.set(userId, validRequests)
      return false
    }

    validRequests.push(now)
    this.requests.set(userId, validRequests)
    return true
  }
}

export const rateLimiter = new RateLimiter(20, 60000)
