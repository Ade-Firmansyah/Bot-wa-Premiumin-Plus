const axios = require('axios')
const { retry } = require('../utils/retry')
const { logInfo, logError } = require('../utils/logger')

const client = axios.create({
  baseURL: 'https://premku.com/api',
  timeout: 10000
})

async function getProducts(apiKey) {
  return retry(async () => {
    const response = await client.post('/products', { api_key: apiKey })
    logInfo('Premku getProducts', { status: response.status })
    return response.data
  })
}

async function createOrder(apiKey, productId, quantity, refId) {
  return retry(async () => {
    const response = await client.post('/order', {
      api_key: apiKey,
      product_id: productId,
      qty: quantity,
      ref_id: refId
    })
    logInfo('Premku createOrder', { status: response.status, refId })
    return response.data
  })
}

async function checkOrder(apiKey, invoice) {
  return retry(async () => {
    const response = await client.post('/status', {
      api_key: apiKey,
      invoice
    })
    logInfo('Premku checkOrder', { status: response.status, invoice })
    return response.data
  })
}

module.exports = {
  getProducts,
  createOrder,
  checkOrder
}
