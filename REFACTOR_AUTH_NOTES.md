# Refactor Auth — Sprint 1

Endpoint Auth yang sekarang dikelola melalui `routes/auth.js` dan `controllers/authController.js`:

- `POST /api/auth/register`
- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/profile/update-markup`

Perubahan penting:

- Route Auth lama dihapus dari `server.js`.
- Duplikasi `app.use('/api/auth', authRoutes)` dihapus.
- `loginLimiter`, `otpLimiter`, dan `authenticateToken` tetap digunakan.
- Dependency `helmet` dan `express-rate-limit` ditambahkan ke `package.json`.

Setelah mengganti proyek, jalankan:

```bash
npm install
npm start
```
