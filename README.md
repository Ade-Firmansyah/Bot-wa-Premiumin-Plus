# Premiumin Plus WhatsApp Bot

Premiumin Plus adalah bot WhatsApp berbasis Baileys untuk menjual akun premium secara otomatis. Bot ini mendukung user biasa, reseller berbayar, pembayaran QRIS, saldo reseller, queue order, dan database JSON lokal yang ringan untuk Railway.

## Fitur

- User biasa selalu membeli dengan QRIS.
- User biasa tidak pernah memakai saldo.
- Reseller memakai saldo dan wajib punya membership aktif.
- Paket reseller:
  - 1 bulan: Rp 10.000
  - 1 tahun: Rp 50.000
- Deposit saldo hanya untuk reseller aktif.
- Payment timeout 5 menit, polling setiap 5 detik.
- Invoice divalidasi agar tidak bisa dipakai user lain atau dipakai ulang.
- Order reseller memotong saldo sebelum API call dan refund otomatis jika API gagal.
- Queue reseller membatasi 1 order aktif per user.
- Database JSON divalidasi dan ditulis secara atomic.

## Instalasi

```bash
npm install
```

## Setup `.env`

Buat file `.env`:

```env
API_KEY=isi_api_key_premku
PORT=3000
RESELLER_PRICE_1_MONTH=10000
RESELLER_PRICE_1_YEAR=50000
LOG_LEVEL=silent
```

## Menjalankan Bot

```bash
npm start
```

Buka QR login:

```text
http://localhost:3000
```

Scan QR dari WhatsApp > Linked Devices.

## Perintah WhatsApp

```text
menu
admin
stok
buy <id>
status <invoice>
cancel <invoice>
reseller
joinreseller 1bulan
joinreseller 1tahun
deposit <jumlah>
```

## Flow User Biasa

```text
stok
buy <id>
bot membuat QRIS
user bayar
bot validasi invoice
bot order ke API
bot kirim username/password
```

Aturan penting:

- Tidak cek saldo.
- Tidak bisa kena pesan saldo tidak cukup.
- Jika payment expired, order dibatalkan.
- Jika sudah bayar tetapi API order gagal, transaksi ditandai `order_failed` dan admin perlu bantu manual.

## Flow Reseller

```text
reseller
joinreseller 1bulan / joinreseller 1tahun
bayar QRIS membership
deposit <jumlah>
buy <id>
saldo dipotong
order API
akun dikirim
refund jika API gagal
```

Aturan penting:

- Harus `role = reseller`.
- `expiredAt` harus masih aktif.
- Wajib memakai saldo.
- Order masuk queue 1 proses per user.

## Format Database

File:

```text
database/db.json
```

Untuk repo publik, gunakan contoh:

```text
database/db.example.json
```

`database/db.json` berisi data live user/transaksi dan sengaja masuk `.gitignore`.

Schema:

```json
{
  "users": {
    "628xxx@s.whatsapp.net": {
      "role": "user",
      "saldo": 0,
      "expiredAt": null
    }
  },
  "transactions": {}
}
```

Reseller:

```json
{
  "role": "reseller",
  "saldo": 15000,
  "expiredAt": 1715000000000
}
```

## Deploy Railway

1. Push project ke GitHub.
2. Buat project baru di Railway.
3. Hubungkan repository.
4. Isi environment variables:
   - `API_KEY`
   - `PORT`
   - `RESELLER_PRICE_1_MONTH`
   - `RESELLER_PRICE_1_YEAR`
   - `LOG_LEVEL`
5. Jalankan command:

```bash
npm start
```

6. Buka domain Railway untuk scan QR.

## Troubleshooting

- QR tidak muncul: buka `/` dan cek log koneksi.
- Kena `401`: bot akan clear session dan membuat QR baru otomatis.
- Muncul `MessageCounterError` atau gagal decrypt pesan lama: bot akan membersihkan Signal session lama otomatis. Bisa juga jalankan `npm run repair-session`.
- Ingin login ulang total: jalankan `npm run clear-session`, lalu `npm start` dan scan QR baru.
- Payment pending terus: cek invoice dengan `status <invoice>`.
- Reseller tidak bisa order: cek masa aktif dan saldo.
- Akun tidak terkirim: cek `status <invoice>` atau hubungi admin.

## Session Stability Fix

Bot memakai `useMultiFileAuthState("./session")` dan wajib menyimpan update kredensial melalui:

```js
sock.ev.on("creds.update", saveCreds)
```

Perilaku reconnect production:

- Timeout, restart, koneksi putus, dan network error tidak menghapus session.
- `creds.json` tidak dihapus kecuali real logout/manual reset/session corrupt berat.
- File Signal session lama dapat dibersihkan tanpa menghapus login WhatsApp.
- Reconnect memakai backoff 5s, 10s, 20s, lalu maksimal 30s.
- Bot mencegah init ganda dan membersihkan listener socket lama sebelum membuat socket baru.
- Keep-alive ringan dikirim berkala saat WhatsApp sudah connected.

Jika bot logout sendiri:

1. Jalankan:

```bash
npm run repair-session
npm start
```

2. Jika masih gagal dan benar-benar ingin login ulang:

```bash
npm run clear-session
npm start
```

3. Scan QR baru di halaman web.

## Checklist Production

Jalankan sebelum deploy atau push:

```bash
npm install
npm test
npm audit --audit-level=critical
npm start
```

Pastikan hasilnya:

- `npm test` tidak error.
- `npm audit --audit-level=critical` menampilkan `found 0 vulnerabilities`.
- Web QR aktif di port yang diset pada `.env`.
- User biasa membeli lewat QRIS, bukan saldo.
- Reseller aktif membeli lewat saldo dan refund jika API gagal.
- `database/db.json` tidak ikut commit karena berisi data live.

## Struktur Project

```text
index.js
  - koneksi Baileys
  - web QR login
  - reconnect/session recovery

handler.js
  - normalisasi pesan
  - rate limit
  - command sequential

commands/
  auto.js       menu dan admin
  stok.js       daftar stok
  order.js      order user/reseller
  deposit.js    deposit saldo reseller
  reseller.js   join/status reseller
  status.js     cek transaksi
  cancel.js     cancel QR pending

services/
  api.js        wrapper API provider
  payment.js    polling QRIS dan invoice validation
  queue.js      queue reseller
  session.js    session recovery
  web.js        halaman QR dan health check

utils/
  helper.js     database, pricing, formatter, migrasi
```

## Admin

```text
wa.me/6285888009931
```
