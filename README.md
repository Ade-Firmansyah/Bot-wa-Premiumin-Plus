# Premiumin Plus WhatsApp Bot

Bot WhatsApp berbasis Baileys untuk jual produk digital Premiumin Plus dengan QRIS, sistem reseller, saldo reseller, queue aman, dan penyimpanan JSON lokal.

## Fitur Utama

- User biasa membeli produk langsung dengan QRIS.
- Reseller wajib memakai saldo dan membership aktif.
- Join reseller memakai QRIS, bukan potong saldo.
- Deposit saldo hanya untuk reseller aktif.
- Polling pembayaran setiap 5 detik dengan timeout 5 menit.
- Invoice divalidasi agar tidak bisa dipakai ulang atau dipakai user lain.
- Order reseller memotong saldo sebelum API call dan refund otomatis jika gagal.
- Database JSON divalidasi sebelum ditulis untuk mencegah file corrupt.
- Queue reseller satu proses per user, timeout 60 detik, retry maksimal 3 kali.

## Instalasi

```bash
npm install
```

## Setup `.env`

Buat file `.env` di root project:

```env
API_KEY=isi_api_key_premku
PORT=3000
RESELLER_PRICE=50000
LOG_LEVEL=silent
```

Catatan:

- `API_KEY` dipakai untuk akses API provider.
- `PORT` dipakai web QR login dan health check.
- `RESELLER_PRICE` opsional, default `50000`.

## Menjalankan Bot

```bash
npm start
```

Buka halaman QR:

```text
http://localhost:3000
```

Scan QR dengan WhatsApp melalui menu Linked Devices.

## Perintah WhatsApp

```text
menu
stok
buy <id_produk>
status <invoice>
cancel <invoice>
reseller
joinreseller
deposit <jumlah>
```

## Flow Bisnis

### User Biasa

1. User ketik `stok`.
2. User ketik `buy <id>`.
3. Bot membuat QRIS sesuai harga normal.
4. Bot polling pembayaran maksimal 5 menit.
5. Jika pembayaran sukses, bot membuat order ke API.
6. Jika pembayaran gagal atau expired, order dibatalkan.

User biasa tidak memakai saldo.

### Reseller

1. User ketik `reseller`.
2. Jika belum reseller, bot menampilkan menu gabung.
3. User ketik `joinreseller`.
4. Bot membuat QRIS biaya reseller.
5. Jika pembayaran sukses, user menjadi reseller selama 30 hari dengan saldo awal `0`.
6. Reseller deposit saldo dengan `deposit <jumlah>`.
7. Reseller order dengan `buy <id>`.
8. Bot cek saldo, masuk queue, potong saldo, panggil API, lalu refund jika gagal.

## Struktur Database

File utama:

```text
database/db.json
```

Contoh schema:

```json
{
  "users": {
    "628xxx@s.whatsapp.net": {
      "role": "reseller",
      "saldo": 15000,
      "expiredAt": 1715000000000
    }
  },
  "transactions": {}
}
```

## Deploy Railway

1. Push project ke GitHub.
2. Buat project baru di Railway.
3. Hubungkan repository GitHub.
4. Tambahkan environment variables:
   - `API_KEY`
   - `PORT`
   - `RESELLER_PRICE`
   - `LOG_LEVEL`
5. Railway akan menjalankan:

```bash
npm start
```

6. Buka domain Railway untuk melihat QR login.

## Troubleshooting

- QR tidak muncul: cek `http://localhost:3000` atau domain Railway.
- Bot logout: hapus folder `session`, lalu scan ulang QR.
- Payment tidak masuk: cek invoice dengan `status <invoice>`.
- Saldo reseller tidak bertambah: pastikan payment sukses dan invoice belum expired.
- Order reseller gagal: saldo otomatis refund jika API provider gagal.

## Arsitektur Singkat

```text
index.js
  ├─ services/web.js       Web QR login + health check
  ├─ handler.js            Router command sequential
  └─ commands/
       ├─ auto.js          Menu
       ├─ stok.js          Daftar produk
       ├─ order.js         Buy normal/reseller
       ├─ deposit.js       Deposit saldo reseller
       ├─ reseller.js      Join/status reseller
       ├─ status.js        Status transaksi
       └─ cancel.js        Cancel QR pending

services/
  ├─ api.js                Wrapper API provider
  ├─ payment.js            QRIS polling + invoice validation
  ├─ queue.js              Queue reseller anti double order
  ├─ session.js            Recovery session WhatsApp
  └─ web.js                Web QR

utils/helper.js            Database, pricing, formatter, migration
```

## Kontak Support

Admin:

```text
wa.me/6285888009931
```
