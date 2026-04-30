# Arsitektur Premiumin Plus

## Tujuan

Premiumin Plus adalah bot WhatsApp untuk menjual produk digital dengan dua tipe user:

- User biasa: selalu bayar per order dengan QRIS.
- Reseller: memakai membership aktif dan saldo internal.

## Komponen

```text
index.js
  -> membuat koneksi Baileys
  -> menjalankan web QR
  -> meneruskan pesan ke handler

handler.js
  -> normalisasi pesan
  -> rate limit global
  -> menjalankan command secara sequential

commands/
  -> hanya mengatur interaksi WhatsApp
  -> business logic berat tetap memakai services/helper

services/
  -> api.js: komunikasi provider
  -> payment.js: polling QRIS dan validasi invoice
  -> queue.js: queue reseller anti double order
  -> session.js: recovery session WhatsApp
  -> web.js: QR login dan health check

utils/helper.js
  -> schema database
  -> migrasi format lama
  -> atomic JSON write
  -> pricing
  -> formatter pesan
```

## Database

Database disimpan di `database/db.json` dan divalidasi setiap load/save.

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

Format lama seperti `resellers` dan saldo angka langsung di `users[userId]` akan dimigrasi otomatis.

## Flow User Biasa

```text
buy <id>
  -> ambil produk
  -> hitung harga normal
  -> create QRIS
  -> simpan transaksi order_payment pending
  -> polling 5 detik, timeout 5 menit
  -> validasi invoice paid, owner, belum reused, recent < 10 menit
  -> order ke API
  -> simpan completed atau order_failed
```

User biasa tidak pernah memakai saldo.

## Flow Reseller

```text
reseller
  -> cek status
  -> jika belum aktif, tampilkan ajakan gabung

joinreseller
  -> create QRIS biaya reseller
  -> jika paid, set users[userId] role reseller, expiredAt 30 hari, saldo 0

deposit <jumlah>
  -> hanya reseller aktif
  -> create QRIS
  -> jika paid, tambah saldo

buy <id>
  -> hanya reseller aktif memakai saldo
  -> cek saldo
  -> masuk queue 1 proses per user
  -> potong saldo sebelum API call
  -> refund otomatis jika API gagal
```

## Proteksi Anti Exploit

- Invoice harus ada di database.
- Invoice harus milik user yang sama.
- Invoice harus status `pending` saat polling dimulai.
- Invoice harus status `paid` sebelum diproses.
- Invoice yang sudah memiliki `processedAt` ditolak agar tidak reusable.
- Payment paid harus recent, maksimal 10 menit.
- Transaksi pending yang melewati `expireAt` otomatis menjadi `cancelled`.
- Order reseller memotong saldo sebelum API call.
- Saldo reseller direfund saat API order gagal/error.
- Queue reseller membatasi satu proses per user.
- Database ditulis atomic melalui temporary file.

## Deployment

Runtime production hanya membutuhkan:

```bash
npm install
npm start
```

Health check:

```text
/health
```

QR login:

```text
/
```
