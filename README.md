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

```bash
node main/index.js
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

🚀 Bot siap dipakai jualan otomatis
