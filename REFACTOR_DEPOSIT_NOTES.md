# Deposit Refactor — Sprint 2A

Endpoint yang dipindahkan dari `server.js`:

- `POST /api/deposits/request`
- `POST /api/deposits/request-midtrans`
- `GET /api/deposits/my-requests`
- `POST /api/deposits/:id/cancel`

File baru:

- `controllers/depositController.js`
- `routes/deposit.js`

Endpoint QRIS dan callback pembayaran belum dipindahkan pada tahap ini agar perubahan tetap kecil dan mudah diuji.

Validasi yang sudah dilakukan:

- `node --check server.js`
- `node --check routes/deposit.js`
- `node --check controllers/depositController.js`

Startup penuh tidak dijalankan di lingkungan penyusun karena dependency `helmet` tidak tersedia di node_modules lokal. Di komputer pengembang jalankan `npm install` lalu `npm start`.
