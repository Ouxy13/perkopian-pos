# Perkopian — Coffee Shop POS

Aplikasi POS web lokal untuk coffee shop dengan dua peran: **Kasir** dan **Admin**.

## Tech stack

- HTML5, CSS3, dan JavaScript modern tanpa build tool.
- Arsitektur modular: `src/data.js`, `src/service.js`, `src/store.js`, dan `src/app.js`.
- Penyimpanan browser melalui `localStorage`.
- Siap diganti ke API/SQLite/Supabase karena lapisan persistence dipisahkan di `POS_SERVICE`.

## Menjalankan

Tidak perlu install Node.js atau package.

1. Buka folder `C:\Users\HP\Desktop\coffee-pos`.
2. Klik dua kali `index.html`, atau jalankan:
   ```powershell
   cd "C:\Users\HP\Desktop\coffee-pos"
   Start-Process .\index.html
   ```
3. Pada penggunaan pertama, buat password untuk akun admin di halaman pengaturan awal.
4. Masuk dengan username admin dan password yang baru dibuat. Admin dapat mengatur password kasir melalui **Pengguna → Password**.

Tidak ada tombol login cepat atau password bawaan. Akun kasir yang belum memiliki password harus diatur oleh admin sebelum dapat masuk.

## Fitur

- POS touch-friendly, kategori, pencarian, varian suhu/ukuran/gula/es, catatan, keranjang, Dine-In/Takeaway/Delivery.
- Diskon, pajak, service charge, tunai/QRIS/debit, kembalian, struk digital, dan print.
- Riwayat shift, detail struk, dan void/refund dengan alasan.
- Password admin harus dibuat saat penggunaan pertama. Password pengguna disimpan sebagai hash PBKDF2, bukan teks biasa.
- Edit/hapus transaksi di laporan penjualan dengan alasan koreksi, hitung ulang total, dan konfirmasi hapus permanen.
- Dashboard KPI, grafik demo mingguan, ringkasan pembayaran, laporan CSV, serta snapshot laporan tersimpan.
- CRUD produk dan status tersedia/habis, inventori dan stok minimum, pengguna, serta pengaturan toko.

Data disimpan secara lokal di browser. Gunakan profil browser yang sama untuk mempertahankan transaksi dan perubahan data.
