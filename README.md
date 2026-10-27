# naysh.gifts

Storefront untuk doorgift dan kad custom. Pelanggan menghantar permintaan; pemilik sahkan stok, harga dan detail dahulu sebelum pembayaran.

## Firebase setup

1. Cipta projek Firebase bernama `naysh-gifts` dan tambah Web App.
2. Hidupkan **Firestore** dan **Email/Password Authentication**.
3. Salin konfigurasi Web App ke `firebase-runtime-config.js` (fail ini sengaja tidak disimpan ke Git).
4. Cipta pengguna owner dalam Authentication. Dalam Firestore, tambah dokumen `admins/<Firebase UID>` dengan contoh `{ "role": "owner" }`.
5. Deploy `firestore.rules` dari repositori ini.

## Data yang digunakan

- `orders` — semua permintaan pelanggan, detail custom dan status tempahan.
- `products` — produk yang boleh ditambah owner, harga, kos dan stok.
- `admins` — UID owner yang dibenarkan melihat dashboard.

Dashboard mengira jualan dan untung daripada tempahan yang `paymentStatus` ialah `Paid` atau status `Completed`. Bila anda mahu kutip bayaran sebenar, tambahkan `total`, `costTotal`, `profit` dan `paymentStatus` apabila sebut harga disahkan.

## GitHub

Projek sedia untuk repository GitHub bernama `naysh-gifts`. Jalankan commit selepas menyemak perubahan, kemudian tukar remote kepada repository baharu anda sebelum push.
