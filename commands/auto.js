import { greeting } from "../services/time.js"

const menuTrigger = [
  "p", "ping", "test", "bang", "om", "ka", "kak",
  "assalamualaikum", "hy", "hai", "halo", "menu", "help", "admin"
]

export default async (sock, msg) => {
  const text = (msg.message?.conversation || "").trim().toLowerCase()
  if (!menuTrigger.includes(text)) return

  if (text === "admin") {
    return sock.sendMessage(msg.key.remoteJid, {
      text: `━━━━━━━━━━━━━━━━━━
📞 *ADMIN PREMIUMIN PLUS*

wa.me/6285888009931

Ketik *stok* untuk mulai beli ya 😊
━━━━━━━━━━━━━━━━━━`
    })
  }

  const message = `━━━━━━━━━━━━━━━━━━
✨ *PREMIUMIN PLUS*

${greeting()}

Selamat datang 👋
Pusat akun premium murah & otomatis 🚀

Ketik *stok* untuk mulai beli ya 😊

━━━━━━━━━━━━━━━━━━
📌 *Menu Cepat*

📦 Ketik: *STOK*
🛒 Ketik: *BUY <id>*
📄 Ketik: *STATUS <invoice>*
👑 Ketik: *RESELLER*
📞 Ketik: *ADMIN*

━━━━━━━━━━━━━━━━━━
💡 Contoh:
buy 1
━━━━━━━━━━━━━━━━━━`

  await sock.sendMessage(msg.key.remoteJid, { text: message })
}
