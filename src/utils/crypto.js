const crypto = require('crypto')

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest()
}

function encrypt(text, secret) {
  if (!secret) {
    throw new Error('Missing crypto secret for encryption')
  }

  const key = deriveKey(secret)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
  return `${iv.toString('base64')}:${encrypted.toString('base64')}`
}

function decrypt(encryptedText, secret) {
  if (!secret) {
    throw new Error('Missing crypto secret for decryption')
  }

  const [ivPart, encryptedPart] = String(encryptedText).split(':')
  if (!ivPart || !encryptedPart) {
    throw new Error('Encrypted text is invalid')
  }

  const key = deriveKey(secret)
  const iv = Buffer.from(ivPart, 'base64')
  const encryptedBuffer = Buffer.from(encryptedPart, 'base64')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()])
  return decrypted.toString('utf8')
}

module.exports = {
  encrypt,
  decrypt
}
