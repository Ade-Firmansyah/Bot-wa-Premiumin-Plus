const path = require('path')
const dotenv = require('dotenv')
const { decrypt } = require('../utils/crypto')

dotenv.config()

const SESSION_PATH = path.resolve(process.cwd(), 'sessions')
const { ENCRYPTED_API_KEY, CRYPTO_SECRET, API_KEY: RAW_API_KEY } = process.env

let API_KEY = ''

if (ENCRYPTED_API_KEY) {
  if (!CRYPTO_SECRET) {
    console.warn('⚠️ CRYPTO_SECRET tidak ditemukan. ENCRYPTED_API_KEY tidak dapat didekripsi.')
  } else {
    try {
      API_KEY = decrypt(ENCRYPTED_API_KEY, CRYPTO_SECRET)
    } catch (error) {
      console.warn('⚠️ Gagal mendekripsi ENCRYPTED_API_KEY:', error.message)
    }
  }
}

if (!API_KEY && RAW_API_KEY) {
  API_KEY = RAW_API_KEY
}

if (!API_KEY) {
  console.warn('⚠️ API_KEY tidak dikonfigurasi. Tambahkan ENCRYPTED_API_KEY atau API_KEY di file .env.')
}

module.exports = {
  API_KEY,
  SESSION_PATH
}
