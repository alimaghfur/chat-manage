# WhatsApp Chat Manager

Aplikasi management chat WhatsApp lengkap dengan fitur multi-session, auto-reply, dan broadcast.

## Fitur

- **Multi-Session** - Tambahkan banyak nomor WhatsApp sekaligus
- **Chat Real-time** - Kirim & terima pesan secara real-time via WebSocket
- **Auto-Reply** - Balas pesan otomatis berdasarkan keyword (exact, contains, startsWith)
- **Broadcast** - Kirim pesan massal ke banyak kontak sekaligus
- **Manajemen Kontak** - Tambah, edit, label kontak
- **QR Code Login** - Scan QR code untuk menghubungkan WhatsApp

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Express.js + Socket.IO
- **Database**: SQLite + Prisma ORM
- **WhatsApp**: Baileys (unofficial WhatsApp Web API)

## Cara Menjalankan

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Setup Database

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

### 3. Jalankan Aplikasi

```bash
# Dari root folder, jalankan keduanya sekaligus:
npm run dev

# Atau jalankan terpisah:
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### 4. Akses Aplikasi

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/api/health

## Cara Penggunaan

1. **Buat Session** - Klik "Tambah Session" dan beri nama
2. **Connect WhatsApp** - Klik "Connect" lalu scan QR code dengan WhatsApp di HP
3. **Mulai Chat** - Pilih menu "Chat" di sidebar, tambah kontak atau tunggu pesan masuk
4. **Setup Auto-Reply** - Pilih menu "Auto Reply", tambahkan keyword dan balasan
5. **Broadcast** - Pilih menu "Broadcast", pilih kontak dan kirim pesan massal

## API Endpoints

### Sessions
- `GET /api/sessions` - List semua session
- `POST /api/sessions` - Buat session baru
- `POST /api/sessions/:id/connect` - Connect session (generate QR)
- `POST /api/sessions/:id/disconnect` - Disconnect session
- `DELETE /api/sessions/:id` - Hapus session

### Contacts
- `GET /api/contacts/:sessionId` - List kontak session
- `POST /api/contacts/:sessionId` - Tambah kontak manual

### Messages
- `GET /api/messages/:sessionId/:jid` - Get chat history
- `POST /api/messages/send` - Kirim pesan

### Auto-Reply
- `GET /api/auto-replies/:sessionId` - List auto-reply rules
- `POST /api/auto-replies` - Buat auto-reply rule
- `PUT /api/auto-replies/:id` - Update rule
- `DELETE /api/auto-replies/:id` - Hapus rule

### Broadcasts
- `GET /api/broadcasts/:sessionId` - List broadcasts
- `POST /api/broadcasts` - Buat & kirim broadcast

## WebSocket Events

- `qr-code` - QR code untuk scan
- `session-status` - Status koneksi session
- `new-message` - Pesan baru masuk/keluar
- `message-status` - Update status pesan (sent/delivered/read)
- `broadcast-progress` - Progress broadcast
- `broadcast-complete` - Broadcast selesai

## ⚠️ Disclaimer

Aplikasi ini menggunakan library **Baileys** (unofficial WhatsApp Web API). Penggunaan library ini bisa melanggar Terms of Service WhatsApp dan akun bisa terkena ban. Gunakan dengan bijak dan risiko ditanggung sendiri.

## License

MIT
