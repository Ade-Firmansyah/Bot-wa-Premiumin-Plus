import { greeting } from "../services/time.js"

const trigger = [
  "p", "ping", "test", "bang", "om", "ka", "kak",
  "assalamualaikum", "hy", "hai", "halo", "menu", "help"
]

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim().toLowerCase()
  if (!trigger.includes(text)) return

  const waktu = greeting()

  const message = `━━━━━━━━━━━━━━━━━━
✨ *PREMIUMIN PLUS*

Selamat ${waktu}!

📦 Lihat produk:
stok

🛒 Beli produk:
buy <id_produk>

📊 Cek transaksi:
status <invoice>

❌ Batalkan QR pending:
cancel <invoice>

👑 Reseller:
reseller

📞 Admin:
wa.me/6285888009931
━━━━━━━━━━━━━━━━━━`

  await sock.sendMessage(msg.key.remoteJid, { text: message })
}
