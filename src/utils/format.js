const { MessageMedia } = require('whatsapp-web.js')

function sanitizeText(text) {
  return text ? text.toString().trim() : ''
}

function formatCurrency(amount) {
  if (typeof amount !== 'number') {
    amount = Number(amount) || 0
  }
  return amount.toLocaleString('id-ID')
}

function buildQrMedia(qrImage) {
  if (!qrImage) return null
  const imageData = qrImage.includes(',') ? qrImage.split(',')[1] : qrImage
  return new MessageMedia('image/png', imageData)
}

function buildHeader(title) {
  return `✨ *PREMIUMIN PLUS*\n\n*${title}*\n`
}

module.exports = {
  sanitizeText,
  formatCurrency,
  buildQrMedia,
  buildHeader
}
