const fs = require('fs')
const path = require('path')

const CAPTIONS = [
  `🔥 *PROMO PREMIUMIN PLUS* 🔥

🎬 Netflix | Capcut | Spotify
💰 Mulai 5RB

⚡ Auto Proses
⚡ Fast Respon

👉 Ketik *STOK*
👉 Ketik *BUY*

💸 Mau reseller?
Ketik *ADMIN*`,

  `✨ *PREMIUMIN PLUS STORE* ✨

Premium account dengan harga TERJANGKAU!

📦 Tersedia:
• Netflix
• Capcut Pro
• Spotify
• dan lainnya

💰 Harga mulai Rp 5.000

⚡ Instant delivery
✅ Garansi valid

👉 Ketik *STOK* untuk lihat semua`,

  `🚀 *DAPATKAN PREMIUM ACCOUNT MURAH!*

Ngga perlu monthly subscription!

🎯 Kenapa pilih kami?
✅ Harga paling murah
✅ Instant delivered
✅ Support 24/7
✅ Akun guaranteed valid

💸 Promo spesial hari ini!

👉 Ketik *STOK*`,

  `⏰ *LIMITED TIME PROMO* ⏰

Stock terbatas! Pesan sekarang!

🎬 Netflix | Spotify | Capcut
Instagram | Canva | Grammarly

Dari Rp 5.000 - Rp 100.000

JANGAN TERLEWATKAN!

👉 *STOK*
👉 *BUY*`,

  `💎 *OFFICIAL PREMIUMIN PLUS* 💎

Reseller juga welcome!

Dapatkan harga spesial:
• Bronze: Diskon 10%
• Silver: Diskon 15%
• Gold: Diskon 20%

Cara daftar cepat:
👉 Ketik *RESELLER*

Stock 100% ready 🔥`,

  `🎁 *FLASH SALE PREMIUMIN PLUS* 🎁

Stok premium sangat TERBATAS!

Buruan order sebelum kehabisan:
👉 Ketik *STOK*

Sistem otomatis → terima akun instant!

🏆 Dipercaya ratusan pembeli
⭐ Rating 5 bintang`
]

const VIDEO_CAPTIONS = CAPTIONS.slice(0, 4)
const IMAGE_CAPTIONS = CAPTIONS.slice(0, 3)

function getRandomCaption(type = 'video') {
  const captions = type === 'video' ? VIDEO_CAPTIONS : IMAGE_CAPTIONS
  const randomIndex = Math.floor(Math.random() * captions.length)
  return { caption: captions[randomIndex], index: randomIndex }
}

module.exports = {
  CAPTIONS,
  VIDEO_CAPTIONS,
  IMAGE_CAPTIONS,
  getRandomCaption
}
