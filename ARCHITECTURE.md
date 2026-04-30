# Arsitektur Premiumin Plus

## Tujuan

Premiumin Plus adalah bot WhatsApp ringan untuk jual akun premium otomatis dengan QRIS, reseller, saldo, dan queue aman.

## Role

```text
user
  - beli selalu lewat QRIS
  - tidak memakai saldo

reseller
  - harus punya expiredAt aktif
  - memakai saldo
  - order lewat queue
```

## Flow User

```text
buy <id>
  -> ambil produk
  -> hitung harga normal
  -> tambah kode unik
  -> create QRIS
  -> simpan transaksi order_payment pending
  -> polling 5 detik maksimal 5 menit
  -> validasi paid, owner, fresh, belum diproses
  -> order API
  -> kirim username/password
```

## Flow Reseller

```text
reseller
  -> tampilkan status atau paket reseller

joinreseller 1bulan
  -> QRIS Rp 10.000
  -> aktif 30 hari

joinreseller 1tahun
  -> QRIS Rp 50.000
  -> aktif 365 hari

deposit <jumlah>
  -> hanya reseller aktif
  -> QRIS deposit saldo

buy <id>
  -> cek reseller aktif
  -> cek saldo
  -> masuk queue
  -> potong saldo
  -> order API
  -> refund jika gagal
  -> kirim username/password
```

## Komponen

```text
index.js          koneksi Baileys, web QR, reconnect
handler.js        rate limit dan command sequential
commands/         interaksi WhatsApp
services/api.js   wrapper provider
services/payment.js validasi invoice dan polling QRIS
services/queue.js queue reseller
services/session.js recovery session
services/web.js   halaman QR dan health check
utils/helper.js   database, pricing, migrasi, formatter
```

## Database

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

## Proteksi

- Invoice harus ada di database.
- Invoice harus milik user yang sama.
- Invoice pending tidak boleh diproses dua kali.
- Paid invoice harus lebih baru dari 10 menit.
- Pending invoice lewat `expireAt` otomatis dibatalkan.
- Saldo reseller dipotong sebelum API order.
- Saldo reseller direfund jika API gagal/error.
- Queue membatasi satu order aktif per reseller.
- Database ditulis lewat temporary file agar tidak corrupt.
