# 🤖 WhatsApp Bot Premiumku

Bot WhatsApp otomatis untuk jual akun premium (auto stok, auto pembayaran, auto kirim akun).

---

## 🚀 INSTALL (DARI 0)

### 1. Clone / Download Project

```bash
git clone https://github.com/digitalpanel2024-ai/wa-bot-premium.git
cd wa-bot-premium
```

---

### 2. Install Dependency

```bash
npm install
```

---

### 3. Setup ENV

Buat file `.env`

**Opsi 1: Menggunakan API Key Langsung (Direkomendasikan untuk Pemula)**

```env
API_KEY=ISI_API_PREMKU_KAMU
```

**Opsi 2: Menggunakan API Key Terenkripsi (Lebih Aman)**

Untuk keamanan tambahan, Anda dapat menggunakan API key yang dienkripsi. Jalankan script berikut untuk menghasilkan `CRYPTO_SECRET` dan `ENCRYPTED_API_KEY`:

```bash
node -e "
const crypto = require('crypto');
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
function deriveKey(secret) { return crypto.createHash('sha256').update(String(secret)).digest(); }
function encrypt(text, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return \`\${iv.toString('base64')}:\${encrypted.toString('base64')}\`;
}
const CRYPTO_SECRET = crypto.randomBytes(32).toString('hex');
const API_KEY = 'ISI_API_PREMKU_KAMU'; // Ganti dengan API key Anda
const ENCRYPTED_API_KEY = encrypt(API_KEY, CRYPTO_SECRET);
console.log('CRYPTO_SECRET=' + CRYPTO_SECRET);
console.log('ENCRYPTED_API_KEY=' + ENCRYPTED_API_KEY);
"
```

Kemudian tambahkan ke `.env`:

```env
CRYPTO_SECRET=GENERATED_CRYPTO_SECRET_HERE
ENCRYPTED_API_KEY=GENERATED_ENCRYPTED_API_KEY_HERE
```

**Validasi Setup ENV:**

Jalankan bot dan periksa log. Jika berhasil, Anda akan melihat pesan "injected env" tanpa warning error dekripsi.

---

### 4. Jalankan Bot

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

**Dengan PM2 (Recommended untuk 24/7):**
```bash
npm run start:pm2
```

Scan QR → selesai ✅

---

## 📌 COMMAND USER

* `ping / p / cek` → test bot
* `menu` → menu utama
* `stok` → lihat produk
* `buy [id]` → beli produk

Contoh:

```bash
buy 1
```

---

## 💳 FLOW PEMBELIAN

1. User ketik `buy`
2. Bot generate harga + kode unik
3. Bot kirim QRIS
4. User bayar
5. Bot auto cek pembayaran
6. Bot auto order ke Premku
7. Bot kirim akun ke user

---

## 🔐 KEAMANAN

JANGAN upload:

* `.env`
* `sessions/`
* `node_modules/`

---

## ⚙️ LIBRARY

* whatsapp-web.js
* axios
* dotenv
* qrcode-terminal

Install manual:

```bash
npm install whatsapp-web.js axios dotenv qrcode-terminal
```

---

## 🧠 FITUR

✔ Auto stok dari Premku
✔ Auto generate pembayaran
✔ Auto cek pembayaran
✔ Auto kirim akun
✔ Anti duplicate transaksi

---

## ⚠️ NOTE

* QR kadang delay → normal
* Pastikan API_KEY benar
* Gunakan Node.js v18+

---

## 🔥 NEXT

Upgrade:

* Auto cancel 5 menit
* UI premium
* Multi API provider
* Deploy VPS 24 jam

---

## ⚡ OPTIMASI UNTUK PRODUCTION (Ubuntu/VPS)

### Memory Optimization
Bot sudah dioptimasi untuk penggunaan RAM minimal:
- GC otomatis setiap 60 detik
- Cache cleanup otomatis
- Debounce message untuk anti-spam
- Queue limit 50 messages

### PM2 Production Setup
```bash
# Install PM2 globally
npm install -g pm2

# Start dengan PM2
npm run start:pm2

# Monitor
npm run pm2:monit

# Logs
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

### Ubuntu Server Tuning
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y chromium-browser nodejs npm

# Optimize untuk headless
echo "kernel.core_pattern=|/bin/false" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Disable swap (opsional, untuk memory dedicated)
sudo swapoff -a
```

### Railway Deployment
Bot sudah teroptimasi untuk Railway:
- QR code via HTTP server
- Auto reconnect
- Memory limit 300MB
- Production logging

### Performance Tips
- Bot menggunakan single process untuk stability
- Puppeteer args dioptimasi untuk low memory
- API responses di-cache 30 detik
- Logging dikurangi di production

🚀 Bot siap dipakai jualan otomatis
