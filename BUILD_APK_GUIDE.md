# 📱 Cara Mudah Dapat APK Jawa Pay

## ✅ Cara Termudah: PWABuilder (TANPA Android Studio)

### Langkah 1: Deploy Website ke Vercel (Gratis)

1. **Push code ke GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Jawa Pay app"
   git branch -M main
   git remote add origin https://github.com/USERNAME/jawa-pay.git
   git push -u origin main
   ```

2. **Deploy di Vercel:**
   - Buka https://vercel.com
   - Login dengan GitHub
   - Klik "Add New Project"
   - Pilih repository "jawa-pay"
   - Deploy! (otomatis dapat URL live)

### Langkah 2: Generate APK di PWABuilder

1. Buka https://www.pwabuilder.com
2. Masukkan URL Vercel kamu (contoh: https://jawa-pay.vercel.app)
3. Klik "Start"
4. Klik "Package For Stores"
5. Pilih "Android" → "Generate"
6. Download APK → Install di HP ✅

**Total waktu: 10-15 menit**
**Tidak perlu install apapun!**

---

## 🔧 Alternatif: Install Android Studio

Jika mau build lokal dari VS Code, harus install Android Studio dulu:

1. Download: https://developer.android.com/studio
2. Install (pilih "Standard" setup)
3. Tunggu download SDK components selesai
4. Restart VS Code
5. Jalankan:
   ```bash
   cd android
   .\gradlew.bat assembleDebug
   ```
6. APK di: `android/app/build/outputs/apk/debug/app-debug.apk`

**Ukuran download: ~1GB**
**Waktu install: 30-60 menit**

---

## 🚀 Rekomendasi

Gunakan **PWABuilder** (cara pertama) - jauh lebih cepat dan praktis!