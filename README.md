# KITA TABUNG - Telegram Bot

Versi bot Telegram dari website HTML KITA TABUNG. Bot ini berjalan lewat chat Telegram, jadi user tidak perlu install aplikasi.

## Fitur

- Catat pengeluaran
- Catat pemasukan
- Transfer antar rekening/dompet
- Utang/Piutang sederhana
- Dompet & rekening
- Budget/amplop bulanan
- Riwayat transaksi
- Ringkasan saldo
- AI Budget Planner rule-based
- Reset data

## Cara pakai lokal

1. Install Node.js minimal versi 18.
2. Buat bot dari Telegram BotFather.
3. Ambil token bot.
4. Copy `.env.example` menjadi `.env`.
5. Isi token:

```env
BOT_TOKEN=token_dari_botfather
```

6. Jalankan:

```bash
npm install
npm start
```

## Catatan penting

- Data tersimpan di file `data.json`.
- Cocok untuk demo, MVP, dan penggunaan pribadi.
- Untuk produksi serius, sebaiknya pindah database ke PostgreSQL/MySQL/Supabase.
- Jika hosting tidak mendukung proses Node.js yang hidup terus, gunakan VPS/Render/Railway/Fly.io.

## Command Telegram

- `/start` membuka bot
- `/menu` membuka menu utama
- `/ringkasan` melihat saldo
- `/riwayat` melihat transaksi terakhir
- `/budget` tambah budget
- `/dompet` tambah dompet
