const applySecurityMiddleware = require('./middleware/security');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const dns = require('dns');
const jwt = require('jsonwebtoken');
const createAuthRoutes = require('./routes/auth');
const createDepositRoutes = require('./routes/deposit');
const createTransactionRoutes = require('./routes/transaction');
require('dotenv').config();

const app = express();

applySecurityMiddleware(app);
const PORT = process.env.PORT || 8000;
// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'secretkeypulsaku';
// Digiflazz Config
const DIGIFLAZZ_USERNAME = process.env.DIGIFLAZZ_USERNAME;
const DIGIFLAZZ_API_KEY = process.env.DIGIFLAZZ_API_KEY || '';
const DIGIFLAZZ_BASE_URL = 'https://api.digiflazz.com/v1';
// Midtrans Config
const midtransClient = require('midtrans-client');
const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});
const developmentOnly = (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({
            error: 'Endpoint tidak ditemukan.'
        });
    }

    next();
};
// Import Sequelize database models
const db = require('./models');
const { User, Transaction, Voucher, Setting, Deposit, sequelize } = db;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Helper to calculate MD5
function calculateMD5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

// Helper to calculate HMAC-SHA256 (for Tripay)
function calculateHMAC256(string, secret) {
    return crypto.createHmac('sha256', secret).update(string).digest('hex');
}

// Helper to hash password SHA256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Nodemailer setup for email OTP verification dispatch
const nodemailer = require('nodemailer');

async function sendOtpEmail(email, name, otpCode) {
    console.log(`[Email OTP] Dispatching 6-Digit OTP ${otpCode} to ${email}`);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[Email OTP Simulator] SMTP credentials missing in Render. OTP for ${email} is: ${otpCode}`);
        return false;
    }

    const mailOptions = {
        from: `"Jawa Pay Security" <${process.env.EMAIL_USER.trim()}>`,
        to: email,
        subject: `[${otpCode}] Kode OTP Verifikasi Akun Jawa Pay Anda`,
        html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a0814; color: #ffffff; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="font-size: 26px; font-weight: 800; color: #6366f1;">Jawa Pay</span>
                    <p style="font-size: 11px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">Keamanan Akun Agen</p>
                </div>
                <h2 style="font-size: 18px; font-weight: 700; color: #ffffff; text-align: center; margin-bottom: 8px;">Halo, ${name}!</h2>
                <p style="font-size: 13px; color: #cbd5e1; text-align: center; line-height: 1.5; margin-bottom: 20px;">
                    Gunakan kode OTP 6-digit berikut untuk mengaktifkan akun Agen Jawa Pay Anda. Kode ini berlaku selama <strong>10 menit</strong>:
                </p>
                <div style="background: rgba(99, 102, 241, 0.15); border: 2px dashed #6366f1; border-radius: 14px; padding: 16px; text-align: center; margin-bottom: 20px;">
                    <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #38bdf8;">${otpCode}</span>
                </div>
                <p style="font-size: 11px; color: #64748b; text-align: center; margin-bottom: 0;">
                    Demi keamanan akun Anda, jangan berikan kode OTP ini kepada siapa pun termasuk pihak Jawa Pay.
                </p>
            </div>
        `
    };

    const createTransporter = (port, secure) => nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: port,
        secure: secure,
        auth: {
            user: process.env.EMAIL_USER.trim(),
            pass: process.env.EMAIL_PASS.replace(/\s+/g, '').trim()
        },
        lookup: (hostname, options, callback) => {
            dns.lookup(hostname, { family: 4 }, (err, address, family) => {
                callback(err, address, family);
            });
        },
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 4000,
        greetingTimeout: 3000,
        socketTimeout: 5000
    });

    // Strategy 1: Try Port 587 STARTTLS with IPv4 lookup
    try {
        const transporter587 = createTransporter(587, false);
        const info = await transporter587.sendMail(mailOptions);
        console.log(`[Email OTP Success] OTP ${otpCode} BERHASIL terkirim via Port 587 IPv4 ke ${email} (MessageID: ${info.messageId})`);
        return true;
    } catch (err587) {
        console.warn(`[Email OTP Port 587 Warning] ${err587.message || err587}. Mencoba Port 465 SSL...`);
        // Strategy 2: Try Port 465 Direct SSL with IPv4 lookup
        try {
            const transporter465 = createTransporter(465, true);
            const info = await transporter465.sendMail(mailOptions);
            console.log(`[Email OTP Success] OTP ${otpCode} BERHASIL terkirim via Port 465 IPv4 ke ${email} (MessageID: ${info.messageId})`);
            return true;
        } catch (err465) {
            console.error(`[Email OTP Error] Gagal mengirim OTP ke Gmail ${email} di Port 587 & 465:`, err465.message || err465);
            return false;
        }
    }
}

// Helper to get referral markup for a request
async function getRequestUserReferralMarkup(req) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return 0;
        
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && decoded.id) {
            const user = await User.findByPk(decoded.id);
            return user ? (user.referralMarkup || 0) : 0;
        }
    } catch (err) {
        // Ignore error since products can be public
    }
    return 0;
}

// Helper to deeply clone catalog and apply referral markup
function applyReferralMarkup(catalog, markup) {
    if (!catalog || markup <= 0) return catalog;
    
    const clone = JSON.parse(JSON.stringify(catalog));
    const processArray = (arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach(item => {
            if (item && typeof item.priceAgent === 'number') {
                item.priceAgent += markup;
            }
        });
    };
    
    for (const catKey in clone) {
        const cat = clone[catKey];
        if (catKey === 'pln') {
            processArray(cat.global);
        } else {
            for (const brandKey in cat) {
                processArray(cat[brandKey]);
            }
        }
    }
    return clone;
}

// Process refund for failed transactions, including commission reversal
async function handleFailedTransactionRefund(trx, oldStatus, transactionObj = null) {
    if (oldStatus === 'Gagal') return; // Already refunded
    if (trx.paymentMethod !== 'Saldo Agen') return;

    const opt = transactionObj ? { transaction: transactionObj } : {};

    // 1. Refund the agent
    const user = await User.findByPk(trx.userId, opt);
    if (user) {
        const refundAmount = trx.priceAgent - (trx.discountApplied || 0);
        user.balance += refundAmount;
        await user.save(opt);
        console.log(`[Refund] Returned Rp ${refundAmount} to user ${user.username} (ID: ${user.id}) for failed transaction ${trx.id}`);
    }

    // 2. Refund / Deduct the commission from upline if applicable
    const commTrx = await Transaction.findOne({
        where: { id: `COMM-${trx.id}`, status: 'Sukses' },
        ...opt
    });
    if (commTrx) {
        const upline = await User.findByPk(commTrx.userId, opt);
        if (upline) {
            upline.balance -= commTrx.profit;
            await upline.save(opt);
            commTrx.status = 'Gagal';
            await commTrx.save(opt);
            console.log(`[Refund Commission] Deducted Rp ${commTrx.profit} commission from upline ${upline.username} (ID: ${upline.id}) for failed transaction ${trx.id}`);
        }
    }
}

// Check if credentials are mock/default
function isDigiflazzMock() {
    return !DIGIFLAZZ_USERNAME || 
           DIGIFLAZZ_USERNAME === 'pospay' || 
           DIGIFLAZZ_API_KEY.includes('dev-c3b88756');
}

function isMidtransMock() {
    return !process.env.MIDTRANS_SERVER_KEY || 
           process.env.MIDTRANS_SERVER_KEY.includes('SB-Mid-server');
}

// ---------------- MIDDLEWARE ----------------

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Akses ditolak. Token tidak ditemukan.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token kedaluwarsa atau tidak valid.' });
        }
        req.user = user;
        next();
    });
}

function authenticateAdmin(req, res, next) {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Akses ditolak. Anda bukan Administrator.' });
        }
        next();
    });
}
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.'
    }
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Terlalu banyak permintaan OTP. Coba lagi nanti.'
    }
});const authRoutes = createAuthRoutes({
    User,
    Transaction,
    jwt,
    JWT_SECRET,
    hashPassword,
    sendOtpEmail,
    axios,
    calculateMD5,
    DIGIFLAZZ_USERNAME,
    DIGIFLAZZ_API_KEY,
    DIGIFLAZZ_BASE_URL,
    authenticateToken,
    loginLimiter,
    otpLimiter
});

app.use('/api/auth', authRoutes);

const depositRoutes = createDepositRoutes({
    User,
    Deposit,
    snap,
    authenticateToken
});
app.use('/api/deposits', depositRoutes);

const transactionRoutes = createTransactionRoutes({
    Transaction,
    User,
    Voucher,
    sequelize,
    findProductBySku,
    isDigiflazzMock,
    DIGIFLAZZ_USERNAME,
    DIGIFLAZZ_API_KEY,
    DIGIFLAZZ_BASE_URL,
    calculateMD5,
    axios,
    authenticateToken,
    authenticateAdmin,
    handleFailedTransactionRefund
});
app.use('/api', transactionRoutes);

// ==========================================
//             ADMIN API ENDPOINTS
// ==========================================

// Get summary stats (total balance, total agents, Digiflazz balance)
app.get('/api/admin/summary', authenticateAdmin, async (req, res) => {
    try {
        const totalUsers = await User.count({ where: { role: 'agent' } });
        const totalBalance = await User.sum('balance', { where: { role: 'agent' } }) || 0;
        
        const successTrxs = await Transaction.count({ where: { status: 'Sukses' } });
        const pendingTrxs = await Transaction.count({ where: { status: 'Pending' } });
        const failedTrxs = await Transaction.count({ where: { status: 'Gagal' } });

        let digiflazzBalance = 0;
        try {
            const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + 'depo');
            const dfRes = await axios.post(`${DIGIFLAZZ_BASE_URL}/cek-saldo`, {
                cmd: 'deposit',
                username: DIGIFLAZZ_USERNAME,
                sign: sign
            });
            if (dfRes.data && dfRes.data.data) {
                digiflazzBalance = dfRes.data.data.deposit || 0;
            }
        } catch (dfErr) {
            console.error('[Admin Summary] Gagal cek saldo Digiflazz:', dfErr.message);
        }

        res.json({
            success: true,
            summary: {
                totalUsers,
                totalBalance,
                successTrxs,
                pendingTrxs,
                failedTrxs,
                digiflazzBalance
            }
        });
    } catch (err) {
        console.error('Admin summary error:', err);
        res.status(500).json({ error: 'Gagal memuat ringkasan admin.' });
    }
});

// Get all agents (users)
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'name', 'username', 'email', 'balance', 'markupFlat', 'role', 'isVerified', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, users });
    } catch (err) {
        console.error('Admin get users error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar agen.' });
    }
});

// Adjust agent balance
app.put('/api/admin/users/:id/balance', authenticateAdmin, async (req, res) => {
    const { amount, action } = req.body; // action: 'add' or 'subtract'
    const targetUserId = req.params.id;

    if (amount === undefined || isNaN(amount) || parseInt(amount) < 0) {
        return res.status(400).json({ error: 'Nominal penyesuaian tidak valid.' });
    }

    try {
        const user = await User.findByPk(targetUserId);
        if (!user) return res.status(404).json({ error: 'Agen tidak ditemukan.' });

        const adjustment = parseInt(amount);
        if (action === 'add') {
            user.balance += adjustment;
        } else if (action === 'subtract') {
            if (user.balance < adjustment) {
                return res.status(400).json({ error: 'Saldo agen tidak mencukupi untuk dikurangi.' });
            }
            user.balance -= adjustment;
        } else if (action === 'set') {
            user.balance = adjustment;
        } else {
            return res.status(400).json({ error: 'Aksi penyesuaian tidak valid.' });
        }

        await user.save();
        console.log(`[Admin Balance] Admin (${req.user.username}) mengubah saldo ${user.username} (action: ${action}, amount: ${adjustment}) menjadi ${user.balance}`);

        res.json({ success: true, balance: user.balance, message: 'Saldo agen berhasil disesuaikan.' });
    } catch (err) {
        console.error('Admin balance adjust error:', err);
        res.status(500).json({ error: 'Gagal menyesuaikan saldo agen.' });
    }
});

// Edit agent flat markup
app.put('/api/admin/users/:id/markup', authenticateAdmin, async (req, res) => {
    const { markupFlat } = req.body;
    const targetUserId = req.params.id;

    if (markupFlat === undefined || isNaN(markupFlat) || parseInt(markupFlat) < 0) {
        return res.status(400).json({ error: 'Markup flat tidak valid.' });
    }

    try {
        const user = await User.findByPk(targetUserId);
        if (!user) return res.status(404).json({ error: 'Agen tidak ditemukan.' });

        user.markupFlat = parseInt(markupFlat);
        await user.save();

        res.json({ success: true, markupFlat: user.markupFlat, message: 'Markup agen berhasil diperbarui.' });
    } catch (err) {
        console.error('Admin markup update error:', err);
        res.status(500).json({ error: 'Gagal memperbarui markup agen.' });
    }
});

// Delete user (Protected Admin)
app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
    const targetUserId = req.params.id;

    if (targetUserId === req.user.id) {
        return res.status(400).json({ error: 'Anda tidak bisa menghapus akun admin Anda sendiri.' });
    }

    try {
        const user = await User.findByPk(targetUserId);
        if (!user) return res.status(404).json({ error: 'Agen tidak ditemukan.' });

        await user.destroy();
        console.log(`[Admin Delete User] Admin (${req.user.username}) menghapus akun ${user.username} (${user.name})`);

        res.json({ success: true, message: 'Akun agen berhasil dihapus permanen.' });
    } catch (err) {
        console.error('Admin delete user error:', err);
        res.status(500).json({ error: 'Gagal menghapus akun agen.' });
    }
});

// Transaction admin endpoints dipindahkan ke routes/transaction.js

// Get all vouchers
app.get('/api/admin/vouchers', authenticateAdmin, async (req, res) => {
    try {
        const vouchers = await Voucher.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, vouchers });
    } catch (err) {
        console.error('Admin get vouchers error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar voucher.' });
    }
});

// Create new voucher
app.post('/api/admin/vouchers', authenticateAdmin, async (req, res) => {
    const { code, discount, type, isActive, maxUse } = req.body;

    if (!code || !discount || !type) {
        return res.status(400).json({ error: 'Informasi voucher tidak lengkap.' });
    }

    try {
        const exists = await Voucher.findByPk(code.toUpperCase().trim());
        if (exists) {
            return res.status(400).json({ error: 'Kode voucher sudah digunakan.' });
        }

        const voucher = await Voucher.create({
            code: code.toUpperCase().trim(),
            discount: parseInt(discount),
            type: type,
            isActive: isActive !== undefined ? isActive : true,
            maxUse: maxUse ? parseInt(maxUse) : 100,
            usedCount: 0
        });

        res.json({ success: true, voucher, message: 'Voucher baru berhasil dibuat.' });
    } catch (err) {
        console.error('Admin create voucher error:', err);
        res.status(500).json({ error: 'Gagal membuat voucher baru.' });
    }
});

// Edit voucher
app.put('/api/admin/vouchers/:code', authenticateAdmin, async (req, res) => {
    const { discount, type, isActive, maxUse } = req.body;
    const code = req.params.code.toUpperCase().trim();

    try {
        const voucher = await Voucher.findByPk(code);
        if (!voucher) return res.status(404).json({ error: 'Voucher tidak ditemukan.' });

        if (discount !== undefined) voucher.discount = parseInt(discount);
        if (type !== undefined) voucher.type = type;
        if (isActive !== undefined) voucher.isActive = isActive;
        if (maxUse !== undefined) voucher.maxUse = parseInt(maxUse);

        await voucher.save();
        res.json({ success: true, voucher, message: 'Detail voucher berhasil diperbarui.' });
    } catch (err) {
        console.error('Admin update voucher error:', err);
        res.status(500).json({ error: 'Gagal memperbarui voucher.' });
    }
});

// Delete voucher
app.delete('/api/admin/vouchers/:code', authenticateAdmin, async (req, res) => {
    const code = req.params.code.toUpperCase().trim();

    try {
        const voucher = await Voucher.findByPk(code);
        if (!voucher) return res.status(404).json({ error: 'Voucher tidak ditemukan.' });

        await voucher.destroy();
        res.json({ success: true, message: 'Voucher berhasil dihapus.' });
    } catch (err) {
        console.error('Admin delete voucher error:', err);
        res.status(500).json({ error: 'Gagal menghapus voucher.' });
    }
});

// Get system announcement (Public)
app.get('/api/config/announcement', async (req, res) => {
    try {
        const { Setting } = db;
        const announcement = await Setting.findByPk('announcement');
        res.json({
            success: true,
            announcement: announcement ? announcement.value : '📢 Info Layanan: Sistem pembayaran QRIS & Virtual Account Mandiri/BCA lancar jaya.',
            contactWhatsapp: process.env.CONTACT_WHATSAPP || '6282334708033'
        });
    } catch (err) {
        console.error('Get announcement error:', err);
        res.status(500).json({ error: 'Gagal mengambil pengumuman.' });
    }
});

// Update system announcement (Admin only)
app.put('/api/admin/announcement', authenticateAdmin, async (req, res) => {
    const { announcement } = req.body;
    if (announcement === undefined) {
        return res.status(400).json({ error: 'Teks pengumuman tidak boleh kosong.' });
    }

    try {
        const { Setting } = db;
        let setting = await Setting.findByPk('announcement');
        if (!setting) {
            setting = await Setting.create({ key: 'announcement', value: announcement });
        } else {
            setting.value = announcement;
            await setting.save();
        }
        res.json({ success: true, announcement: setting.value, message: 'Teks pengumuman berhasil diperbarui.' });
    } catch (err) {
        console.error('Update announcement error:', err);
        res.status(500).json({ error: 'Gagal memperbarui pengumuman.' });
    }
});

// ==========================================
//           DEPOSIT API ROUTES
// ==========================================

// Tripay Configuration
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const TRIPAY_API_URL = process.env.TRIPAY_API_URL || 'https://tripay.co.id/api-sandbox/transaction/create';

const isTripayMock = () => !TRIPAY_API_KEY || !TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE;

// EMVCo QRIS CCITT-FALSE CRC16 Helper
function calculateQrisCrc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        let x = ((crc >> 8) ^ str.charCodeAt(i)) & 0xFF;
        x ^= x >> 4;
        crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Convert Static QRIS data to Dynamic QRIS containing the amount
function makeDynamicQris(staticQris, amount) {
    let base = staticQris.slice(0, -8);
    const amountStr = amount.toString();
    const lenStr = amountStr.length.toString().padStart(2, '0');
    const amountTag = `54${lenStr}${amountStr}`;
    
    const tag53Idx = base.indexOf('5303360');
    if (tag53Idx !== -1) {
        const insertPos = tag53Idx + '5303360'.length;
        base = base.slice(0, insertPos) + amountTag + base.slice(insertPos);
    } else {
        base = base + amountTag;
    }
    
    base = base + "6304";
    const checksum = calculateQrisCrc16(base);
    return base + checksum;
}

// Request dynamic QRIS Deposit Ticket (Protected Agent)
app.post('/api/deposits/request-qris', authenticateToken, async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || isNaN(amount) || amount < 2000) {
        return res.status(400).json({ error: 'Minimal pengajuan deposit adalah Rp 2.000.' });
    }

    try {
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

        // Check if there's already a pending deposit
        const existingPending = await Deposit.findOne({
            where: { userId, status: 'Pending', bankName: 'QRIS' }
        });
        if (existingPending) {
            return res.status(400).json({
                error: 'Anda memiliki tiket deposit QRIS pending yang belum diselesaikan.',
                deposit: existingPending
            });
        }

        const depositId = 'DEPQRIS' + Date.now();
        const totalAmount = parseInt(amount);

        // Official Qrisify Direct Integration per llms.txt
        if (process.env.QRISIFY_API_KEY && process.env.QRISIFY_API_KEY.trim()) {
            try {
                if (!process.env.QRISIFY_WEBHOOK_SECRET) {
    throw new Error('QRISIFY_WEBHOOK_SECRET belum dikonfigurasi.');
}

const callbackToken = encodeURIComponent(
    process.env.QRISIFY_WEBHOOK_SECRET
);

const webhookUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/api/payment/callback/qrisify?token=${callbackToken}`
    : `https://jawapay.my.id/api/payment/callback/qrisify?token=${callbackToken}`;
                
                const qrisifyRes = await axios.post('https://qrisify.adihub.my.id/api/v1/transactions', {
                    external_id: depositId,
                    amount: parseInt(amount),
                    webhook_url: webhookUrl
                }, {
                    headers: {
                        'x-api-key': process.env.QRISIFY_API_KEY.trim(),
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                });

                console.log('[Qrisify Official API Response]:', JSON.stringify(qrisifyRes.data));

                if (qrisifyRes.data && qrisifyRes.data.success && qrisifyRes.data.data) {
                    const qData = qrisifyRes.data.data;
                    const finalAmount = qData.amount_total || (parseInt(amount) + (qData.unique_code || 0));
                    const uniqueCode = qData.unique_code || 0;
                    
                    let qrUrl = null;
                    if (qData.qris_string) {
                        qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qData.qris_string)}`;
                    } else if (qData.qr_image_url) {
                        qrUrl = qData.qr_image_url.startsWith('http') ? qData.qr_image_url : `https://qrisify.adihub.my.id${qData.qr_image_url}`;
                    }

                    if (qrUrl) {
                        const deposit = await Deposit.create({
                            id: depositId,
                            userId: userId,
                            bankName: 'QRIS',
                            amount: parseInt(amount),
                            uniqueCode: uniqueCode,
                            totalAmount: finalAmount,
                            status: 'Pending',
                            qrUrl: qrUrl
                        });

                        console.log(`[QRIS Official Qrisify OK] Deposit ${depositId} (Rp ${finalAmount}) created for ${user.username}`);
                        return res.json({
                            success: true,
                            deposit,
                            isMock: false
                        });
                    }
                }
            } catch (qErr) {
                console.log('[Qrisify Official API Error]:', qErr.response ? JSON.stringify(qErr.response.data) : qErr.message);
            }
        }

        // Reliable Local Fallback: Dynamic EMVCo QRIS Generation (Exact Unique Code Matching)
        let uniqueCode = Math.floor(10 + Math.random() * 90);
        let finalAmount = parseInt(amount) + uniqueCode;
        
        let retries = 0;
        while (retries < 15) {
            const duplicate = await Deposit.findOne({
                where: { totalAmount: finalAmount, status: 'Pending' }
            });
            if (!duplicate) break;
            uniqueCode = Math.floor(10 + Math.random() * 90);
            finalAmount = parseInt(amount) + uniqueCode;
            retries++;
        }

        const staticQrisData = process.env.STATIC_QRIS_DATA || '00020101021126610014COM.GO-JEK.WWW01189360091436185850360210G6185850360303UMI51440014ID.CO.QRIS.WWW0215ID10265560348450303UMI5204481453033605802ID5924Jawapay, Pulsa & Tagihan6005BOGOR61051616262070703A0163040B25';
        const dynamicQrisStr = makeDynamicQris(staticQrisData, finalAmount);
        const dynamicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(dynamicQrisStr)}`;

        const deposit = await Deposit.create({
            id: depositId,
            userId: userId,
            bankName: 'QRIS',
            amount: parseInt(amount),
            uniqueCode: uniqueCode,
            totalAmount: finalAmount,
            status: 'Pending',
            qrUrl: dynamicQrUrl
        });

        console.log(`[QRIS Fallback OK] Tiket QRIS Rp ${finalAmount} berhasil dibuat untuk agen ${user.username} (ID: ${depositId})`);
        return res.json({
            success: true,
            deposit,
            isMock: false
        });

        if (isTripayMock()) {
            // Static QRIS Mode (Using unique code)
            let uniqueCode = Math.floor(10 + Math.random() * 90); // 2 digit unique code (10 - 99)
            let finalAmount = parseInt(amount) + uniqueCode;
            
            // Ensure uniqueness
            let retries = 0;
            while (retries < 15) {
                const duplicate = await Deposit.findOne({
                    where: { totalAmount: finalAmount, status: 'Pending' }
                });
                if (!duplicate) break;
                uniqueCode = Math.floor(10 + Math.random() * 90);
                finalAmount = parseInt(amount) + uniqueCode;
                retries++;
            }

            const staticQrisData = process.env.STATIC_QRIS_DATA || '00020101021126610014COM.GO-JEK.WWW01189360091436185850360210G6185850360303UMI51440014ID.CO.QRIS.WWW0215ID10265560348450303UMI5204481453033605802ID5924Jawapay, Pulsa & Tagihan6005BOGOR61051616262070703A0163040B25';
            
            // Generate dynamic QRIS string with the exact amount
            const dynamicQrisStr = makeDynamicQris(staticQrisData, finalAmount);
            const dynamicQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(dynamicQrisStr)}`;

            const deposit = await Deposit.create({
                id: depositId,
                userId: userId,
                bankName: 'QRIS',
                amount: parseInt(amount),
                uniqueCode: uniqueCode,
                totalAmount: finalAmount,
                status: 'Pending',
                qrUrl: dynamicQrUrl
            });

            console.log(`[QRIS Request - Static Dynamic] Agen ${user.username} mengajukan deposit QRIS ${finalAmount} (ID: ${depositId})`);
            return res.json({
                success: true,
                deposit,
                isMock: false // Return false so client treats it as static QRIS instructions
            });
        }

        // Live Tripay QRIS Request
        const signature = crypto.createHmac('sha256', TRIPAY_PRIVATE_KEY)
            .update(TRIPAY_MERCHANT_CODE + depositId + totalAmount)
            .digest('hex');

        const tripayPayload = {
            method: 'QRIS',
            merchant_ref: depositId,
            amount: totalAmount,
            customer_name: user.name,
            customer_email: user.email || `${user.username}@jawapay.my.id`,
            signature: signature,
            order_items: [
                {
                    name: 'Top Up Saldo Jawa Pay',
                    price: totalAmount,
                    quantity: 1
                }
            ],
            expired_time: Math.floor(Date.now() / 1000) + 1800 // 30 minutes
        };

        const tripayHeaders = {
            'Authorization': `Bearer ${TRIPAY_API_KEY}`
        };

        const tripayRes = await axios.post(TRIPAY_API_URL, tripayPayload, { headers: tripayHeaders });
        
        if (tripayRes.data && tripayRes.data.success) {
            const qrUrl = tripayRes.data.data.qr_url;
            const deposit = await Deposit.create({
                id: depositId,
                userId: userId,
                bankName: 'QRIS',
                amount: totalAmount,
                uniqueCode: 0,
                totalAmount: totalAmount,
                status: 'Pending',
                qrUrl: qrUrl
            });

            console.log(`[QRIS Request - Live] Agen ${user.username} mengajukan deposit QRIS ${totalAmount} (ID: ${depositId})`);
            return res.json({
                success: true,
                deposit,
                isMock: false
            });
        } else {
            console.error('Tripay transaction creation failed:', tripayRes.data);
            return res.status(500).json({ error: 'Gagal membuat transaksi QRIS di Tripay.' });
        }
    } catch (err) {
        console.error('Request QRIS deposit error:', err.message);
        res.status(500).json({ error: 'Gagal memproses tiket deposit QRIS.' });
    }
});

// Tripay Webhook Callback (Live)
app.post('/api/payment/callback', async (req, res) => {
    try {
        const callbackSignature = req.headers['x-callback-signature'];
        const privateKey = TRIPAY_PRIVATE_KEY;

        // Verify Tripay signature
        const calculatedSignature = crypto.createHmac('sha256', privateKey)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (callbackSignature !== calculatedSignature) {
            console.error('[Tripay Callback] Signature mismatch!');
            return res.status(400).json({ error: 'Invalid signature.' });
        }

        const { merchant_ref, status } = req.body;

        if (status === 'PAID') {
            const deposit = await Deposit.findOne({ where: { id: merchant_ref, status: 'Pending' } });
            if (deposit) {
                const user = await User.findByPk(deposit.userId);
                if (user) {
                    await sequelize.transaction(async (t) => {
                        deposit.status = 'Sukses';
                        await deposit.save({ transaction: t });

                        user.balance += deposit.totalAmount;
                        await user.save({ transaction: t });
                    });
                    console.log(`[Tripay Callback] Deposit ${merchant_ref} PAID. Saldo ${user.username} bertambah Rp ${deposit.totalAmount}`);
                }
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Tripay Callback error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Custom Notification Reader Webhook (For Auto QRIS via Android Notification App)
app.post('/api/payment/callback/notification-reader', async (req, res) => {
    const { title, body, secret } = req.body;
    
    // Security check
    const notificationSecret = process.env.NOTIFICATION_SECRET || 'jawapay_secret_token';
    if (secret !== notificationSecret) {
        return res.status(401).json({ error: 'Unauthorized callback.' });
    }

    if (!body) {
        return res.status(400).json({ error: 'Body is empty.' });
    }

    console.log(`[Notification Callback] Title: "${title}", Body: "${body}"`);

    try {
        const cleanedBody = body.replace(/\s/g, '').toLowerCase();
        
        // Match numbers in format RpXX.XXX or RpXXXXX
        let amount = null;
        const rpMatch = cleanedBody.match(/rp([0-9.,]+)/);
        if (rpMatch) {
            const numStr = rpMatch[1].replace(/[.,]/g, '');
            amount = parseInt(numStr);
        } else {
            // Fallback: look for any number sequence
            const fallbackMatch = cleanedBody.match(/([0-9.,]+)/);
            if (fallbackMatch) {
                const numStr = fallbackMatch[1].replace(/[.,]/g, '');
                amount = parseInt(numStr);
            }
        }

        if (!amount || isNaN(amount)) {
            console.log('[Notification Callback] Could not extract valid amount.');
            return res.json({ success: false, message: 'Could not extract amount.' });
        }

        console.log(`[Notification Callback] Extracted Amount: Rp ${amount}`);

        let deposit = await Deposit.findOne({
            where: {
                totalAmount: amount,
                status: 'Pending'
            }
        });

        if (!deposit) {
            deposit = await Deposit.findOne({
                where: { status: 'Pending', bankName: 'QRIS' },
                order: [['createdAt', 'DESC']]
            });
        }

        if (!deposit) {
            console.log(`[Notification Callback] No pending deposit found matching amount Rp ${amount}`);
            return res.json({ success: false, message: 'No matching pending deposit.' });
        }

        const user = await User.findByPk(deposit.userId);
        if (!user) {
            console.log('[Notification Callback] Associated user not found.');
            return res.json({ success: false, message: 'User not found.' });
        }

        // Process deposit success
        await sequelize.transaction(async (t) => {
            const lockedDeposit = await Deposit.findOne({
                where: { id: deposit.id, status: 'Pending' },
                transaction: t,
                lock: true
            });

            if (lockedDeposit) {
                lockedDeposit.status = 'Sukses';
                lockedDeposit.sn = 'AUTO-NOTIF-' + Date.now();
                await lockedDeposit.save({ transaction: t });

                user.balance += lockedDeposit.totalAmount;
                await user.save({ transaction: t });
                console.log(`[Notification Callback] Auto-approved Deposit ${lockedDeposit.id} for ${user.username}. Balance added: Rp ${lockedDeposit.totalAmount}`);
            }
        });

        return res.json({ success: true, message: 'Deposit processed successfully.' });
    } catch (err) {
        console.error('Error processing notification callback:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// Moota Webhook Callback (Auto Bank Transfer & Static QRIS)
app.post('/api/payment/callback/moota', async (req, res) => {
    const { secret } = req.query;
    
    // Security check
    const mootaSecret = process.env.MOOTA_SECRET || 'jawapay_moota_secret';
    if (secret !== mootaSecret) {
        return res.status(401).json({ error: 'Unauthorized callback.' });
    }

    const mutations = req.body;
    if (!mutations) {
        return res.status(400).json({ error: 'Body is empty.' });
    }

    console.log(`[Moota Webhook] Received mutations data.`);

    // Helper function to process single mutation
    const processMutation = async (item) => {
        // CR = Credit (uang masuk)
        if (item.type === 'CR' || item.type === 'credit') {
            const amount = Math.round(parseFloat(item.amount));
            console.log(`[Moota Webhook] Uang Masuk Terdeteksi: Rp ${amount}`);

            try {
                // Find matching pending deposit
                const deposit = await Deposit.findOne({
                    where: {
                        totalAmount: amount,
                        status: 'Pending'
                    }
                });

                if (deposit) {
                    const user = await User.findByPk(deposit.userId);
                    if (user) {
                        await sequelize.transaction(async (t) => {
                            // Lock deposit
                            const lockedDeposit = await Deposit.findOne({
                                where: { id: deposit.id, status: 'Pending' },
                                transaction: t,
                                lock: true
                            });

                            if (lockedDeposit) {
                                lockedDeposit.status = 'Sukses';
                                lockedDeposit.sn = 'MOOTA-' + (item.id || Date.now());
                                await lockedDeposit.save({ transaction: t });

                                user.balance += lockedDeposit.totalAmount;
                                await user.save({ transaction: t });
                                console.log(`[Moota Webhook] Auto-approved Deposit ${lockedDeposit.id} for ${user.username}. Balance added: Rp ${lockedDeposit.totalAmount}`);
                            }
                        });
                    }
                }
            } catch (err) {
                console.error('[Moota Webhook] Error processing item:', err);
            }
        }
    };

    try {
        if (Array.isArray(mutations)) {
            for (const item of mutations) {
                await processMutation(item);
            }
        } else {
            await processMutation(mutations);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Moota Webhook error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Qrisify Webhook Callback (Smart Amount & OrderId Auto-Approve, GET + POST)
// Qrisify Webhook Callback
const handleQrisifyCallback = async (req, res) => {
    const configuredSecret = process.env.QRISIFY_WEBHOOK_SECRET;
    const receivedSecret = String(req.query.token || '');

    if (
        !configuredSecret ||
        receivedSecret.length !== configuredSecret.length ||
        !crypto.timingSafeEqual(
            Buffer.from(receivedSecret),
            Buffer.from(configuredSecret)
        )
    ) {
        return res.status(401).json({
            error: 'Callback tidak sah.'
        });
    }

    const payload = req.body || {};
    const data = payload.data || payload;

    const orderId = String(
        data.external_id ||
        payload.external_id ||
        ''
    ).trim();

    const status = String(
        data.status ||
        payload.status ||
        payload.transaction_status ||
        ''
    ).toLowerCase();

    const rawAmount =
        data.amount_total ??
        data.amount_requested ??
        payload.amount ??
        payload.gross_amount ??
        payload.total_amount;

    const amount = Number(
        String(rawAmount ?? '').replace(/[^\d]/g, '')
    );

    const successfulStatuses = [
        'success',
        'paid',
        'settlement',
        'completed',
        'sukses'
    ];

    if (!successfulStatuses.includes(status)) {
        return res.status(400).json({
            error: 'Status pembayaran belum berhasil.'
        });
    }

    if (!orderId || !Number.isSafeInteger(amount) || amount <= 0) {
        return res.status(400).json({
            error: 'Data callback tidak valid.'
        });
    }

    try {
        await sequelize.transaction(async (transaction) => {
            const deposit = await Deposit.findOne({
                where: {
                    id: orderId,
                    status: 'Pending',
                    bankName: 'QRIS'
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!deposit) {
                throw new Error(
                    'Deposit tidak ditemukan atau sudah diproses.'
                );
            }

            if (Number(deposit.totalAmount) !== amount) {
                throw new Error(
                    'Nominal callback tidak sesuai dengan tiket deposit.'
                );
            }

            const user = await User.findByPk(deposit.userId, {
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            if (!user) {
                throw new Error('Pengguna tidak ditemukan.');
            }

            deposit.status = 'Sukses';
            deposit.sn =
                'QRISIFY-' +
                String(
                    data.transaction_id ||
                    payload.transaction_id ||
                    payload.trx_id ||
                    payload.reference ||
                    Date.now()
                );

            user.balance =
                Number(user.balance || 0) +
                Number(deposit.totalAmount);

            await deposit.save({ transaction });
            await user.save({ transaction });
        });

        return res.json({
            success: true,
            message: 'Deposit berhasil diproses.'
        });
    } catch (error) {
        console.error(
            '[Qrisify Callback Error]',
            error.message
        );

        return res.status(400).json({
            error: error.message
        });
    }
};

app.post(
    '/api/payment/callback/qrisify',
    handleQrisifyCallback
);
// Mock Webhook Callback (For local sandbox/mock testing)
app.post('/api/payment/mock-callback', developmentOnly, async (req, res) => {
    const { depositId } = req.body;
    if (!depositId) return res.status(400).json({ error: 'Deposit ID required.' });

    try {
        const deposit = await Deposit.findOne({ where: { id: depositId, status: 'Pending' } });
        if (!deposit) return res.status(404).json({ error: 'Tiket deposit tidak ditemukan atau sudah diproses.' });

        const user = await User.findByPk(deposit.userId);
        if (user) {
            await sequelize.transaction(async (t) => {
                deposit.status = 'Sukses';
                await deposit.save({ transaction: t });

                user.balance += deposit.totalAmount;
                await user.save({ transaction: t });
            });
            console.log(`[Mock Callback] Deposit ${depositId} simulated PAID. Saldo ${user.username} bertambah Rp ${deposit.totalAmount}`);
            return res.json({ success: true, message: 'Simulasi pembayaran QRIS berhasil!' });
        }
        res.status(404).json({ error: 'User tidak ditemukan.' });
    } catch (err) {
        console.error('Mock Callback error:', err);
        res.status(500).json({ error: 'Gagal mensimulasikan callback.' });
    }
});

// Get all deposits globally (Protected Admin)
app.get('/api/admin/deposits', authenticateAdmin, async (req, res) => {
    try {
        const deposits = await Deposit.findAll({
            include: [{
                model: User,
                as: 'user',
                attributes: ['username', 'name']
            }],
            order: [['createdAt', 'DESC']]
        });
        res.json({ success: true, deposits });
    } catch (err) {
        console.error('Admin get deposits error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar pengajuan deposit global.' });
    }
});

// Approve deposit request and credit target agent balance (Protected Admin)
app.post('/api/admin/deposits/:id/approve', authenticateAdmin, async (req, res) => {
    const depositId = req.params.id;

    try {
        const deposit = await Deposit.findByPk(depositId);
        if (!deposit) return res.status(404).json({ error: 'Tiket deposit tidak ditemukan.' });

        if (deposit.status !== 'Pending') {
            return res.status(400).json({ error: 'Tiket deposit sudah diproses sebelumnya.' });
        }

        const user = await User.findByPk(deposit.userId);
        if (!user) return res.status(404).json({ error: 'Agen pemilik tiket tidak ditemukan.' });

        // Update status and credit balance
        deposit.status = 'Sukses';
        await deposit.save();

        user.balance += deposit.totalAmount;
        await user.save();

        console.log(`[Deposit Approve] Admin (${req.user.username}) menyetujui deposit ${depositId}. Saldo ${user.username} bertambah Rp ${deposit.totalAmount}`);

        res.json({ success: true, message: `Deposit berhasil disetujui. Saldo Rp ${deposit.totalAmount} ditambahkan ke agen ${user.name}.` });
    } catch (err) {
        console.error('Approve deposit error:', err);
        res.status(500).json({ error: 'Gagal menyetujui pengajuan deposit.' });
    }
});

// Reject deposit request by Admin (Protected Admin)
app.post('/api/admin/deposits/:id/reject', authenticateAdmin, async (req, res) => {
    const depositId = req.params.id;

    try {
        const deposit = await Deposit.findByPk(depositId);
        if (!deposit) return res.status(404).json({ error: 'Tiket deposit tidak ditemukan.' });

        if (deposit.status !== 'Pending') {
            return res.status(400).json({ error: 'Tiket deposit sudah diproses sebelumnya.' });
        }

        deposit.status = 'Batal';
        await deposit.save();

        console.log(`[Deposit Reject] Admin (${req.user.username}) menolak pengajuan deposit ${depositId}`);
        res.json({ success: true, message: 'Pengajuan deposit berhasil ditolak.' });
    } catch (err) {
        console.error('Reject deposit error:', err);
        res.status(500).json({ error: 'Gagal menolak pengajuan deposit.' });
    }
});

// Get Payment Gateway Client Config (Public)
app.get('/api/config/payment', (req, res) => {
    res.json({
        clientKey: process.env.MIDTRANS_CLIENT_KEY,
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true'
    });
});

// Validate Voucher Code (Protected)
app.post('/api/vouchers/validate', authenticateToken, async (req, res) => {
    const { code, priceAgent } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Kode voucher tidak boleh kosong.' });
    }
    try {
        const voucher = await Voucher.findByPk(code.toUpperCase().trim());
        if (!voucher) {
            return res.status(404).json({ error: 'Kode voucher tidak valid.' });
        }
        if (!voucher.isActive) {
            return res.status(400).json({ error: 'Voucher sudah tidak aktif.' });
        }
        if (voucher.usedCount >= voucher.maxUse) {
            return res.status(400).json({ error: 'Kupon voucher telah habis digunakan.' });
        }
        
        let discountApplied = voucher.discount;
        if (voucher.type === 'percent') {
            discountApplied = Math.round(parseInt(priceAgent) * (voucher.discount / 100));
        }
        
        if (discountApplied > parseInt(priceAgent)) {
            discountApplied = parseInt(priceAgent);
        }

        res.json({
            success: true,
            code: voucher.code,
            discount: discountApplied
        });
    } catch (err) {
        console.error('Validate voucher error:', err);
        res.status(500).json({ error: 'Gagal memvalidasi voucher.' });
    }
});

// Get downlines list for current agent
app.get('/api/downlines/list', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { Op } = db.Sequelize;
        
        const downlines = await User.findAll({
            where: { uplineId: userId },
            attributes: ['id', 'name', 'username', 'email', 'balance', 'referralMarkup', 'createdAt']
        });
        
        const result = [];
        for (const dl of downlines) {
            const trxCount = await Transaction.count({
                where: { userId: dl.id, status: 'Sukses' }
            });
            
            const commSum = await Transaction.sum('profit', {
                where: { id: { [Op.like]: `COMM-%` }, userId: userId, productName: `Komisi Downline: ${dl.username}`, status: 'Sukses' }
            }) || 0;
            
            result.push({
                id: dl.id,
                name: dl.name,
                username: dl.username,
                email: dl.email,
                balance: dl.balance,
                referralMarkup: dl.referralMarkup,
                createdAt: dl.createdAt,
                transactionCount: trxCount,
                totalCommission: commSum
            });
        }
        
        res.json({ success: true, downlines: result });
    } catch (err) {
        console.error('Fetch downlines error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar downline.' });
    }
});

// Register new downline
app.post('/api/downlines/register', authenticateToken, async (req, res) => {
    const { name, username, email, password, referralMarkup } = req.body;
    const uplineId = req.user.id;

    if (!name || !username || !email || !password) {
        return res.status(400).json({ error: 'Data tidak lengkap.' });
    }

    const markup = parseInt(referralMarkup) || 0;
    if (markup < 0) {
        return res.status(400).json({ error: 'Markup tidak boleh negatif.' });
    }

    try {
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username sudah digunakan.' });
        }

        const nextId = 'USR' + Math.floor(Math.random() * 900000 + 100000);
        
        const newDownline = await User.create({
            id: nextId,
            name,
            username,
            password: hashPassword(password),
            email,
            isVerified: true,
            balance: 0,
            markupFlat: 1500,
            role: 'agent',
            uplineId: uplineId,
            referralMarkup: markup
        });

        console.log(`[Downline System] Agent ${req.user.username} registered downline ${username} with markup Rp ${markup}`);

        res.json({
            success: true,
            message: 'Downline berhasil didaftarkan.',
            downline: {
                id: newDownline.id,
                name: newDownline.name,
                username: newDownline.username,
                email: newDownline.email,
                referralMarkup: newDownline.referralMarkup
            }
        });
    } catch (err) {
        console.error('Register downline error:', err);
        res.status(500).json({ error: 'Gagal mendaftarkan downline.' });
    }
});

// Get earnings analytics summary and chart data
app.get('/api/analytics/earnings', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { Op } = db.Sequelize;
        
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
        
        // 1. Today's Profit
        const todayProfit = await Transaction.sum('profit', {
            where: {
                userId,
                status: 'Sukses',
                createdAt: { [Op.gte]: startOfToday }
            }
        }) || 0;

        // 2. This Month's Profit
        const monthProfit = await Transaction.sum('profit', {
            where: {
                userId,
                status: 'Sukses',
                createdAt: { [Op.gte]: startOfMonth }
            }
        }) || 0;

        // 3. Commission Profit from Downlines
        const commissionProfit = await Transaction.sum('profit', {
            where: {
                userId,
                status: 'Sukses',
                category: 'komisi'
            }
        }) || 0;

        // 4. Direct Sales Profit (where category is not 'komisi')
        const salesProfit = await Transaction.sum('profit', {
            where: {
                userId,
                status: 'Sukses',
                category: { [Op.ne]: 'komisi' }
            }
        }) || 0;

        // 5. Daily Profit for Last 7 Days (for Chart)
        const last7DaysTrxs = await Transaction.findAll({
            where: {
                userId,
                status: 'Sukses',
                createdAt: { [Op.gte]: sevenDaysAgo }
            },
            attributes: ['profit', 'createdAt']
        });

        // Initialize last 7 days map
        const dailyProfitMap = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            dailyProfitMap[dateStr] = 0;
        }

        // Aggregate daily profits
        last7DaysTrxs.forEach(trx => {
            const dateStr = new Date(trx.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            if (dailyProfitMap[dateStr] !== undefined) {
                dailyProfitMap[dateStr] += trx.profit;
            }
        });

        const labels = Object.keys(dailyProfitMap).reverse();
        const data = Object.values(dailyProfitMap).reverse();

        res.json({
            success: true,
            summary: {
                today: todayProfit,
                month: monthProfit,
                commission: commissionProfit,
                sales: salesProfit,
                total: commissionProfit + salesProfit
            },
            chart: {
                labels,
                data
            }
        });
    } catch (err) {
        console.error('Fetch earnings analytics error:', err);
        res.status(500).json({ error: 'Gagal memuat analitik keuntungan.' });
    }
});

// Get Product List (Prepaid Price List from Digiflazz) with Referral Markup applied dynamically
app.get('/api/products', async (req, res) => {
    try {
        const userMarkup = await getRequestUserReferralMarkup(req);

        if (isDigiflazzMock()) {
            console.log('[Digiflazz Mock] Menggunakan daftar produk fallback lokal.');
            return res.json(applyReferralMarkup(FALLBACK_PRODUCTS, userMarkup));
        }

        const isCacheValid = cachedProducts && (Date.now() - lastCacheTime < CACHE_DURATION);
        if (isCacheValid) {
            return res.json(applyReferralMarkup(cachedProducts, userMarkup));
        }

        const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + 'pricelist');
        const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/price-list`, {
            cmd: 'prepaid',
            username: DIGIFLAZZ_USERNAME,
            sign: sign
        });

        if (response.data && Array.isArray(response.data.data)) {
            const parsed = parseDigiflazzProducts(response.data.data);
            cachedProducts = parsed;
            lastCacheTime = Date.now();
            console.log('[Digiflazz API] Katalog produk berhasil dimuat dan disimpan di cache.');
            return res.json(applyReferralMarkup(parsed, userMarkup));
        } else {
            const msg = response.data && response.data.data ? response.data.data.message : 'Respon kosong';
            console.warn(`[Digiflazz API] Gagal memuat daftar harga (${msg}). Menggunakan cache/fallback.`);
            return res.json(applyReferralMarkup(cachedProducts || FALLBACK_PRODUCTS, userMarkup));
        }
    } catch (error) {
        console.error('Error fetching Digiflazz products:', error.message);
        const userMarkup = await getRequestUserReferralMarkup(req);
        res.json(applyReferralMarkup(cachedProducts || FALLBACK_PRODUCTS, userMarkup));
    }
});

app.get('/api/diagnostics/ip', (req, res) => {
    const https = require('https');
    https.get('https://api.ipify.org?format=json', (ipRes) => {
        let data = '';
        ipRes.on('data', chunk => data += chunk);
        ipRes.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                res.json({ ip: parsed.ip });
            } catch (e) {
                res.status(500).send('Error parsing IP response');
            }
        });
    }).on('error', (err) => {
        res.status(500).json({ error: err.message });
    });
});

// Diagnostics: Show cached product catalog SKUs
app.get('/api/diagnostics/catalog', (req, res) => {
    const source = cachedProducts || FALLBACK_PRODUCTS;
    const summary = {};
    for (const cat of Object.keys(source)) {
        summary[cat] = {};
        const catObj = source[cat];
        if (Array.isArray(catObj)) {
            summary[cat] = catObj.map(p => ({ sku: p.buyer_sku_code, name: p.name, price: p.priceAgent }));
        } else {
            for (const provider of Object.keys(catObj)) {
                if (Array.isArray(catObj[provider])) {
                    summary[cat][provider] = catObj[provider].map(p => ({ sku: p.buyer_sku_code, name: p.name, price: p.priceAgent }));
                }
            }
        }
    }
    res.json({
        source: cachedProducts ? 'Digiflazz API Cache' : 'Local Fallback',
        cacheAge: cachedProducts ? Math.round((Date.now() - lastCacheTime) / 1000) + 's ago' : 'N/A',
        isMockMode: isDigiflazzMock(),
        hasUsername: !!DIGIFLAZZ_USERNAME,
        usernameValue: DIGIFLAZZ_USERNAME ? DIGIFLAZZ_USERNAME.substring(0, 3) + '***' : '(empty)',
        hasApiKey: !!DIGIFLAZZ_API_KEY,
        apiKeyPrefix: DIGIFLAZZ_API_KEY ? DIGIFLAZZ_API_KEY.substring(0, 6) + '***' : '(empty)',
        catalog: summary
    });
});

// Get Balance (Protected)
app.post('/api/balance', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
        res.json({ balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat saldo.' });
    }
});

// Check Real H2H Digiflazz Supplier Deposit Balance (Protected Admin Only)
app.get('/api/digiflazz/deposit-balance', authenticateAdmin, async (req, res) => {
    try {
        if (!DIGIFLAZZ_USERNAME || !DIGIFLAZZ_API_KEY) {
            return res.json({ deposit: 0, mode: 'Mock Mode' });
        }
        const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + 'depo');
        const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/cek-saldo`, {
            cmd: 'deposit',
            username: DIGIFLAZZ_USERNAME,
            sign: sign
        });
        const deposit = (response.data && response.data.data) ? response.data.data.deposit : 0;
        res.json({ deposit: deposit, username: DIGIFLAZZ_USERNAME });
    } catch (err) {
        console.error('Error checking Digiflazz deposit balance:', err.message);
        res.status(500).json({ error: 'Gagal mengecek saldo deposit Digiflazz.' });
    }
});

// Process Direct Agent Wallet Transaction (Protected with SQL Managed Transaction)
app.post('/api/transaction', authenticateToken, async (req, res) => {
    const { buyer_sku_code, customer_no, ref_id, voucherCode } = req.body;
    const userId = req.user.id;

    if (!buyer_sku_code || !customer_no || !ref_id) {
        return res.status(400).json({ error: 'Parameter tidak lengkap.' });
    }

    const foundProd = findProductBySku(buyer_sku_code);
    const productCost = foundProd ? foundProd.priceAgent : 10000;
    const productName = foundProd ? foundProd.name : 'Pulsa / Data';
    
    console.log(`[Transaction] SKU: "${buyer_sku_code}" | Product: "${productName}" | Cost: ${productCost} | Found in cache: ${foundProd ? 'YES' : 'NO (using fallback cost)'}`);

    try {
        // Managed database transaction
        const result = await sequelize.transaction(async (t) => {
            const user = await User.findByPk(userId, { transaction: t, lock: true });
            if (!user) throw new Error('USER_NOT_FOUND');

            const referralMarkup = user.referralMarkup || 0;
            const actualProductCost = productCost + referralMarkup;

            // Validate Voucher if supplied
            let discountApplied = 0;
            let appliedVoucher = null;
            if (voucherCode) {
                appliedVoucher = await Voucher.findByPk(voucherCode.toUpperCase().trim(), { transaction: t, lock: true });
                if (appliedVoucher && appliedVoucher.isActive && appliedVoucher.usedCount < appliedVoucher.maxUse) {
                    discountApplied = appliedVoucher.discount;
                    if (appliedVoucher.type === 'percent') {
                        discountApplied = Math.round(actualProductCost * (appliedVoucher.discount / 100));
                    }
                    if (discountApplied > actualProductCost) {
                        discountApplied = actualProductCost;
                    }
                }
            }

            const finalCost = actualProductCost - discountApplied;
            if (user.balance < finalCost) throw new Error('INSUFFICIENT_BALANCE');

            // API Purchase Simulation / Call
            let purchaseResult;
            if (isDigiflazzMock()) {
                // MOCK mode: No Digiflazz credentials configured
                purchaseResult = {
                    status: 'Sukses',
                    sn: 'SN-DB-' + Math.floor(Math.random() * 900000000 + 100000000),
                    trx_id: 'TRX' + Math.floor(Math.random() * 9000000 + 1000000)
                };
            } else {
                // LIVE MODE: Send transaction to Digiflazz API
                let actualSku = buyer_sku_code;
                
                if (DIGIFLAZZ_API_KEY && DIGIFLAZZ_API_KEY.startsWith('dev-')) {
                    // Sandbox mode: Map SKUs to valid sandbox test SKUs
                    const skuLower = buyer_sku_code.toLowerCase();
                    const nameLower = productName.toLowerCase();
                    
                    if (skuLower.includes('telkomsel') || nameLower.includes('telkomsel') || nameLower.includes('simpati')) {
                        actualSku = productCost <= 8000 ? 'tele5' : 'tele10';
                    } else if (skuLower.includes('xl') || skuLower.includes('xr') || skuLower.includes('axis') || nameLower.includes('xl') || nameLower.includes('axis')) {
                        actualSku = productCost <= 8000 ? 'xld5' : 'xld10';
                    } else if (skuLower.includes('indosat') || skuLower.includes('im3') || nameLower.includes('indosat') || nameLower.includes('im3')) {
                        actualSku = productCost <= 8000 ? 'tele5' : 'tele10';
                    } else {
                        actualSku = 'tele5';
                    }
                    console.log(`[Digiflazz Sandbox Mapping] Mapping SKU "${buyer_sku_code}" to Sandbox SKU "${actualSku}"`);
                } else {
                    // Production mode: Use the SKU directly from the catalog as-is!
                    console.log(`[Digiflazz Production] Sending SKU "${actualSku}" directly to Digiflazz Production API`);
                }
                
                const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + ref_id);
                const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/transaction`, {
                    username: DIGIFLAZZ_USERNAME,
                    buyer_sku_code: actualSku,
                    customer_no: customer_no,
                    ref_id: ref_id,
                    sign: sign
                });
                const data = response.data.data;
                if (data) {
                    purchaseResult = {
                        status: (data.status === 'Success' || data.status === 'Sukses') ? 'Sukses' : (data.status === 'Pending' ? 'Pending' : 'Gagal'),
                        sn: data.sn || '-',
                        trx_id: data.trx_id || 'TRX' + Date.now(),
                        message: data.message || 'Transaksi ditolak oleh operator.'
                    };
                } else {
                    throw new Error('GATEWAY_ERROR');
                }
            }

            if (purchaseResult.status !== 'Sukses' && purchaseResult.status !== 'Pending') {
                throw new Error(purchaseResult.message || 'GATEWAY_DECLINED');
            }

            // Deduct balance and save
            user.balance -= finalCost;
            await user.save({ transaction: t });

            const profit = (user.markupFlat !== null && user.markupFlat !== undefined) ? user.markupFlat : 1500;
            
            // Create Transaction record in DB
            const newTrx = await Transaction.create({
                id: ref_id,
                userId: userId,
                category: foundProd ? foundProd.category : 'pulsa',
                productName: productName,
                target: customer_no,
                priceAgent: actualProductCost,
                priceSell: actualProductCost + profit - discountApplied, // Adjusted by discount
                profit: profit,
                paymentMethod: 'Saldo Agen',
                status: purchaseResult.status,
                sn: purchaseResult.sn,
                voucherCode: appliedVoucher ? appliedVoucher.code : null,
                discountApplied: discountApplied
            }, { transaction: t });

            // If user has an upline, award commission and log upline transaction
            const commission = user.referralMarkup || 0;
            if (user.uplineId && commission > 0) {
                const upline = await User.findByPk(user.uplineId, { transaction: t, lock: true });
                if (upline) {
                    upline.balance += commission;
                    await upline.save({ transaction: t });

                    // Create commission transaction for upline
                    await Transaction.create({
                        id: `COMM-${ref_id}`,
                        userId: upline.id,
                        category: 'komisi',
                        productName: `Komisi Downline: ${user.username}`,
                        target: `Downline: ${user.username}`,
                        priceAgent: 0,
                        priceSell: commission,
                        profit: commission,
                        paymentMethod: 'Komisi',
                        status: purchaseResult.status,
                        sn: `COMM-${ref_id}`
                    }, { transaction: t });

                    console.log(`[Commission System] Awarded Rp ${commission} commission to upline ${upline.username} for transaction ${ref_id} by downline ${user.username}`);
                }
            }

            if (appliedVoucher) {
                appliedVoucher.usedCount += 1;
                await appliedVoucher.save({ transaction: t });
            }

            return { user, newTrx };
        });

        res.json({
            data: {
                ref_id: ref_id,
                trx_id: result.newTrx.id,
                buyer_sku_code: buyer_sku_code,
                customer_no: customer_no,
                price: productCost,
                status: result.newTrx.status,
                sn: result.newTrx.sn
            }
        });
    } catch (error) {
        let errMsg = error.message;
        if (error.response && error.response.data) {
            const respData = error.response.data;
            if (respData.data && respData.data.message) {
                errMsg = respData.data.message;
            } else if (respData.message) {
                errMsg = respData.message;
            }
        }

        if (error.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User tidak ditemukan.' });
        if (error.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'Saldo Agen tidak mencukupi.' });
        res.status(400).json({ error: 'Transaksi ditolak.', details: errMsg });
    }
});

// Sinkronisasi transaksi dipindahkan ke routes/transaction.js


// ---------------- DIGIFLAZZ WEBHOOK CALLBACK ----------------

app.post('/api/digiflazz/callback', async (req, res) => {
    try {
        const payload = req.body;
        console.log('[Digiflazz Webhook Received]:', JSON.stringify(payload));

        let data = payload.data || payload;
        if (payload.post) {
            try {
                const parsed = JSON.parse(payload.post);
                data = parsed.data || parsed;
            } catch (e) {
                data = payload.data || payload;
            }
        }

        const { trx_id, ref_id, status, sn, rc, message } = data;
        const lookupKey = ref_id || trx_id;

        if (!lookupKey) {
            console.warn('[Digiflazz Webhook] Missing ref_id and trx_id in callback payload:', data);
            return res.status(400).json({ error: 'Missing ref_id or trx_id' });
        }

        // Handle database updates
        await sequelize.transaction(async (t) => {
            // Search by ref_id first, then by trx_id
            let trx = null;
            if (ref_id) {
                trx = await Transaction.findByPk(ref_id, { transaction: t, lock: true });
            }
            if (!trx && trx_id) {
                trx = await Transaction.findByPk(trx_id, { transaction: t, lock: true });
            }

            if (!trx) {
                console.warn(`[Digiflazz Webhook] Transaction with ref_id "${ref_id}" / trx_id "${trx_id}" not found in database.`);
                return;
            }

            const oldStatus = trx.status;
            const newStatus = (status === 'Success' || status === 'Sukses') ? 'Sukses' : ((status === 'Failed' || status === 'Gagal') ? 'Gagal' : oldStatus);

            if (oldStatus !== newStatus || (sn && !trx.sn)) {
                trx.status = newStatus;
                if (sn && sn !== '-') trx.sn = sn;
                await trx.save({ transaction: t });

                console.log(`[Digiflazz Webhook] Transaction ${trx.id} status updated from ${oldStatus} to ${newStatus}. SN: ${sn || 'N/A'}`);

                // If status changed to Gagal, refund user's balance and commission
                if (newStatus === 'Gagal' && oldStatus !== 'Gagal') {
                    await handleFailedTransactionRefund(trx, oldStatus, t);
                }
            }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[Digiflazz Webhook Error]:', err);
        res.status(500).json({ error: 'Webhook processing error' });
    }
});


// ---------------- TRIPAY ENDPOINTS ----------------

// Get Payment Channels (Deprecated - Midtrans uses unified Snap popup, return dummy)
app.get('/api/payment-channels', async (req, res) => {
    res.json([
        { code: 'midtrans', name: 'Midtrans Snap', icon_url: '' }
    ]);
});

// Request Midtrans Snap Transaction Token (Protected)
app.post('/api/payment/request', authenticateToken, async (req, res) => {
    const { amount, customer_phone, buyer_sku_code, voucherCode } = req.body;
    const userId = req.user.id;

    if (!amount || !customer_phone || !buyer_sku_code) {
        return res.status(400).json({ error: 'Parameter tidak lengkap.' });
    }

    // Validate Voucher if supplied
    let discountApplied = 0;
    let appliedVoucherCode = null;
    if (voucherCode) {
        try {
            const voucher = await Voucher.findByPk(voucherCode.toUpperCase().trim());
            if (voucher && voucher.isActive && voucher.usedCount < voucher.maxUse) {
                discountApplied = voucher.discount;
                if (voucher.type === 'percent') {
                    discountApplied = Math.round(parseInt(amount) * (voucher.discount / 100));
                }
                if (discountApplied > parseInt(amount)) {
                    discountApplied = parseInt(amount);
                }
                appliedVoucherCode = voucher.code;
            }
        } catch (err) {
            console.error('Error validating voucher for Midtrans:', err);
        }
    }

    const merchantRef = 'INV-' + Date.now();
    invoiceUserMap.set(merchantRef, { userId, voucherCode: appliedVoucherCode, discountApplied });

    // Total gross amount including flat Rp 2.000 fee and deducting discount
    const totalAmount = Math.max(0, parseInt(amount) - discountApplied) + 2000;

    try {
        const parameter = {
            transaction_details: {
                order_id: merchantRef,
                gross_amount: totalAmount
            },
            credit_card: {
                secure: true
            },
            customer_details: {
                first_name: req.user.name,
                email: req.user.username + '@jawapay.com',
                phone: customer_phone
            },
            item_details: [{
                id: buyer_sku_code,
                price: totalAmount,
                quantity: 1,
                name: 'Pulsa / Paket Data ' + buyer_sku_code
            }]
        };

        const transaction = await snap.createTransaction(parameter);
        
        console.log(`[Midtrans Snap] Token transaksi dibuat untuk Order ${merchantRef}: ${transaction.token}`);
        res.json({
            token: transaction.token,
            redirect_url: transaction.redirect_url,
            merchant_ref: merchantRef
        });
    } catch (error) {
        console.error('Error Midtrans Snap create:', error);
        res.status(500).json({ error: 'Gagal memproses pembayaran Midtrans.', message: error.message });
    }
});

// Webhook Callback (Fulfills transaction for mapped user or deposit)
app.post('/api/payment/midtrans-callback', async (req, res) => {
    const payload = req.body;

    const orderId = payload.order_id;
    const transactionStatus = payload.transaction_status;
    const fraudStatus = payload.fraud_status;

    console.log(`[Midtrans Webhook] Menerima notifikasi untuk Order ${orderId}: Status = ${transactionStatus}`);

    let isSuccess = false;
    if (transactionStatus === 'capture') {
        if (fraudStatus === 'accept') {
            isSuccess = true;
        }
    } else if (transactionStatus === 'settlement') {
        isSuccess = true;
    }

    if (isSuccess) {
        // CASE 1: Deposit / Top-up
        if (orderId && (orderId.startsWith('DEPMID') || orderId.startsWith('DEP'))) {
            try {
                const deposit = await Deposit.findOne({ where: { id: orderId, status: 'Pending' } });
                if (deposit) {
                    const user = await User.findByPk(deposit.userId);
                    if (user) {
                        await sequelize.transaction(async (t) => {
                            deposit.status = 'Sukses';
                            await deposit.save({ transaction: t });

                            user.balance += deposit.totalAmount;
                            await user.save({ transaction: t });
                        });
                        console.log(`[Midtrans Webhook Success] Deposit ${orderId} PAID. Saldo ${user.username} bertambah Rp ${deposit.totalAmount}`);
                    }
                }
            } catch (err) {
                console.error('[Midtrans Webhook Deposit Error] Gagal memproses deposit:', err.message);
            }
        } 
        // CASE 2: Product Purchase (Direct Invoice)
        else {
            const mapData = invoiceUserMap.get(orderId);
            if (mapData) {
                const userId = typeof mapData === 'object' ? mapData.userId : mapData;
                const voucherCode = typeof mapData === 'object' ? mapData.voucherCode : null;

                try {
                    const user = await User.findByPk(userId);
                    if (user) {
                        if (voucherCode) {
                            try {
                                const voucher = await Voucher.findByPk(voucherCode);
                                if (voucher) {
                                    voucher.usedCount += 1;
                                    await voucher.save();
                                }
                            } catch (vErr) {
                                console.error('Error incrementing voucher count in callback:', vErr);
                            }
                        }
                        console.log(`[Midtrans Webhook Success] Transaksi ${orderId} lunas!`);
                    }
                } catch (err) {
                    console.error('[Webhook Error] Gagal memproses data:', err.message);
                }
            }
        }
    }

    res.json({ success: true });
});

// Simulator Webhook Callback (For local dev testing)
app.post('/api/payment/simulate-callback', developmentOnly, async (req, res) => {
    const { merchant_ref, buyer_sku_code, customer_no } = req.body;

    const mapData = invoiceUserMap.get(merchant_ref);
    if (!mapData) {
        return res.status(404).json({ error: 'User mapping untuk invoice ini tidak ditemukan.' });
    }

    const userId = typeof mapData === 'object' ? mapData.userId : mapData;
    const voucherCode = typeof mapData === 'object' ? mapData.voucherCode : null;
    const discountApplied = typeof mapData === 'object' ? mapData.discountApplied : 0;

    console.log(`[Simulator Callback] Memproses sukses lokal untuk ${merchant_ref} (User: ${userId})`);

    try {
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: 'User tidak terdaftar.' });

        // Digiflazz call
        let purchaseResult;
        if (isDigiflazzMock()) {
            purchaseResult = {
                status: 'Sukses',
                sn: 'SN-TRIPAY-' + Math.floor(Math.random() * 900000000 + 100000000),
                trx_id: 'TRX' + Math.floor(Math.random() * 9000000 + 1000000)
            };
        } else {
            let actualSku = buyer_sku_code;
            
            if (DIGIFLAZZ_API_KEY && DIGIFLAZZ_API_KEY.startsWith('dev-')) {
                // Sandbox mode mapping
                actualSku = 'tele5';
                console.log(`[Tripay→Digiflazz Sandbox] Mapping SKU "${buyer_sku_code}" to "${actualSku}"`);
            } else {
                // Production: send as-is
                console.log(`[Tripay→Digiflazz Production] Sending SKU "${actualSku}" directly`);
            }
            
            const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + merchant_ref);
            const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/transaction`, {
                username: DIGIFLAZZ_USERNAME,
                buyer_sku_code: actualSku,
                customer_no: customer_no,
                ref_id: merchant_ref,
                sign: sign
            });
            const data = response.data.data;
            purchaseResult = {
                status: (data.status === 'Success' || data.status === 'Sukses') ? 'Sukses' : 'Pending',
                sn: data.sn || '-',
                trx_id: data.trx_id || 'TRX' + Date.now()
            };
        }

        const foundProd = findProductBySku(buyer_sku_code);
        const profit = (user.markupFlat !== null && user.markupFlat !== undefined) ? user.markupFlat : 1500;

        // Increment voucher count if voucher applied
        if (voucherCode) {
            try {
                const voucher = await Voucher.findByPk(voucherCode);
                if (voucher) {
                    voucher.usedCount += 1;
                    await voucher.save();
                }
            } catch (vErr) {
                console.error('Error incrementing voucher count in simulator callback:', vErr);
            }
        }

        // Insert to SQL DB
        await Transaction.create({
            id: purchaseResult.trx_id,
            userId: userId,
            category: foundProd ? foundProd.category : 'pulsa',
            productName: foundProd ? foundProd.name : buyer_sku_code,
            target: customer_no,
            priceAgent: foundProd ? foundProd.priceAgent : 10000,
            priceSell: (foundProd ? foundProd.priceAgent : 10000) + profit - discountApplied, // Adjusted by discount
            profit: profit,
            paymentMethod: 'TRIPAY QRIS',
            status: purchaseResult.status,
            sn: purchaseResult.sn,
            voucherCode: voucherCode,
            discountApplied: discountApplied
        });

        res.json({
            success: true,
            data: {
                status: purchaseResult.status,
                sn: purchaseResult.sn,
                trx_id: purchaseResult.trx_id
            }
        });
    } catch (err) {
        console.error('[Simulator Error]', err);
        res.status(500).json({ error: 'Gagal memproses simulasi webhook.' });
    }
});

// ---------------- HELPER SEARCH FUNCTIONS ----------------

function findProductBySku(sku) {
    // 1. Check in cachedProducts first if it exists
    if (cachedProducts) {
        for (const cat of Object.keys(cachedProducts)) {
            const catObj = cachedProducts[cat];
            if (Array.isArray(catObj)) {
                const found = catObj.find(p => p.buyer_sku_code === sku);
                if (found) return found;
            } else {
                for (const provider of Object.keys(catObj)) {
                    if (Array.isArray(catObj[provider])) {
                        const found = catObj[provider].find(p => p.buyer_sku_code === sku);
                        if (found) return found;
                    }
                }
            }
        }
    }

    // 2. Check in FALLBACK_PRODUCTS
    for (const cat of Object.keys(FALLBACK_PRODUCTS)) {
        const catObj = FALLBACK_PRODUCTS[cat];
        if (Array.isArray(catObj)) {
            const found = catObj.find(p => p.buyer_sku_code === sku);
            if (found) return found;
        } else {
            for (const provider of Object.keys(catObj)) {
                const found = catObj[provider].find(p => p.buyer_sku_code === sku);
                if (found) return found;
            }
        }
    }
    return null;
}

function parseDigiflazzProducts(raw) {
    const products = {
        pulsa: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        data: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        aktif: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        pln: { global: [] },
        emoney: { gopay: [], ovo: [], dana: [], shopeepay: [] },
        game: { mlbb: [], ff: [], pubg: [] },
        tv: { kvision: [], nexparabola: [] }
    };

    raw.forEach(item => {
        if (!item.buyer_product_status || !item.seller_product_status) return;
        const brand = item.brand.toLowerCase();
        const category = item.category.toLowerCase();
        const name = item.product_name.toLowerCase();
        const sku = item.buyer_sku_code.toLowerCase();

        const formatted = {
            buyer_sku_code: item.buyer_sku_code,
            name: item.product_name,
            priceAgent: item.price,
            priceSell: Math.ceil(item.price * 1.05 / 500) * 500,
            desc: item.desc || 'Prepaid Product'
        };

        // Comprehensive operator detection
        const isTelkomsel = brand.includes('telkomsel') || brand.includes('simpati') || brand.includes('as') || brand.includes('by.u') || brand.includes('byu') ||
                            name.includes('telkomsel') || name.includes('simpati') || name.includes('kartu as') || name.includes('by.u') || name.includes('byu') ||
                            sku.includes('telkomsel') || sku.includes('tsel');
                            
        const isIndosat = brand.includes('indosat') || brand.includes('im3') || brand.includes('mentari') ||
                          name.includes('indosat') || name.includes('im3') || name.includes('mentari') ||
                          sku.includes('indosat') || sku.includes('isat');

        const isXL = brand.includes('xl') || brand.includes('axis') ||
                     name.includes('xl') || name.includes('axis') ||
                     sku.includes('xl') || sku.includes('axis');

        const isTri = brand.includes('three') || brand.includes('tri') ||
                      name.includes('three') || name.includes('tri') ||
                      sku.includes('three') || sku.includes('tri');

        const isSmartfren = brand.includes('smartfren') ||
                            name.includes('smartfren') ||
                            sku.includes('smartfren') || sku.includes('sf');

        if (category.includes('aktif') || category.includes('masa')) {
            if (isTelkomsel) products.aktif.telkomsel.push(formatted);
            else if (isIndosat) products.aktif.indosat.push(formatted);
            else if (isXL) products.aktif.xl.push(formatted);
            else if (isTri) products.aktif.tri.push(formatted);
            else if (isSmartfren) products.aktif.smartfren.push(formatted);
        } else if (category.includes('pulsa')) {
            if (isTelkomsel) products.pulsa.telkomsel.push(formatted);
            else if (isIndosat) products.pulsa.indosat.push(formatted);
            else if (isXL) products.pulsa.xl.push(formatted);
            else if (isTri) products.pulsa.tri.push(formatted);
            else if (isSmartfren) products.pulsa.smartfren.push(formatted);
        } else if (category.includes('data') || category.includes('paket') || category.includes('internet') || category.includes('kuota')) {
            if (isTelkomsel) products.data.telkomsel.push(formatted);
            else if (isIndosat) products.data.indosat.push(formatted);
            else if (isXL) products.data.xl.push(formatted);
            else if (isTri) products.data.tri.push(formatted);
            else if (isSmartfren) products.data.smartfren.push(formatted);
        } else if (category.includes('pln') || brand.includes('pln')) {
            products.pln.global.push(formatted);
        } else if (category.includes('e-money') || category.includes('emoney') || category.includes('game')) {
            if (brand.includes('gopay')) products.emoney.gopay.push(formatted);
            else if (brand.includes('ovo')) products.emoney.ovo.push(formatted);
            else if (brand.includes('dana')) products.emoney.dana.push(formatted);
            else if (brand.includes('shopee')) products.emoney.shopeepay.push(formatted);
            else if (brand.includes('mobile legend') || brand.includes('mlbb')) products.game.mlbb.push(formatted);
            else if (brand.includes('free fire')) products.game.ff.push(formatted);
            else if (brand.includes('pubg')) products.game.pubg.push(formatted);
        } else if (category.includes('tv') || category.includes('parabola') || category.includes('aktif-tv')) {
            if (brand.includes('k-vision') || brand.includes('kvision')) products.tv.kvision.push(formatted);
            else if (brand.includes('nex') || brand.includes('parabola')) products.tv.nexparabola.push(formatted);
        }
    });

    const totalLoaded = Object.values(products.pulsa).flat().length + products.pln.global.length;
    return totalLoaded > 0 ? products : FALLBACK_PRODUCTS;
}

// Dedicated compliance pages for payment gateway activation (iPaymu / Tripay)
app.get('/faq', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FAQ - Jawa Pay</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 680px; margin: 40px auto; padding: 0 20px; background: #060412; color: #cbd5e1; }
                h1 { color: #f59e0b; border-bottom: 2px solid rgba(255,255,255,0.08); padding-bottom: 12px; margin-bottom: 30px; font-size: 28px; }
                .qa-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 18px; border-radius: 14px; margin-bottom: 16px; }
                .question { font-weight: 700; color: #ffffff; font-size: 16px; margin-bottom: 6px; }
                .answer { font-size: 14px; color: #a0aec0; }
                .back-btn { display: inline-block; margin-top: 24px; color: #38bdf8; text-decoration: none; font-weight: 600; font-size: 14px; }
                .back-btn:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>Tanya Jawab (FAQ) - Jawa Pay</h1>
            <div class="qa-item">
                <div class="question">Q: Apa itu Jawa Pay?</div>
                <div class="answer">A: Jawa Pay adalah platform penyedia layanan isi ulang pulsa, kuota internet, token PLN, dan PPOB terlengkap secara otomatis dengan sistem H2H supplier terpercaya.</div>
            </div>
            <div class="qa-item">
                <div class="question">Q: Bagaimana cara menjadi agen Jawa Pay?</div>
                <div class="answer">A: Anda cukup mengeklik tombol "Daftar Jadi Agen" di halaman depan, mengisi data diri, dan memverifikasi kode OTP yang dikirim ke email Anda.</div>
            </div>
            <div class="qa-item">
                <div class="question">Q: Bagaimana metode pengisian saldo?</div>
                <div class="answer">A: Pengisian saldo deposit dapat dilakukan secara otomatis melalui scan QRIS 24 jam nonstop atau transfer bank manual (BCA, Mandiri, BRI) yang diverifikasi oleh admin.</div>
            </div>
            <div class="qa-item">
                <div class="question">Q: Berapa lama saldo masuk setelah pembayaran?</div>
                <div class="answer">A: Untuk pembayaran QRIS saldo masuk otomatis dalam 1-5 menit. Untuk transfer bank manual saldo diproses setelah admin memverifikasi mutasi bank Anda.</div>
            </div>
            <a href="/" class="back-btn">&larr; Kembali ke Beranda</a>
        </body>
        </html>
    `);
});

app.get('/refund-policy', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kebijakan Refund - Jawa Pay</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 680px; margin: 40px auto; padding: 0 20px; background: #060412; color: #cbd5e1; }
                h1 { color: #f59e0b; border-bottom: 2px solid rgba(255,255,255,0.08); padding-bottom: 12px; margin-bottom: 30px; font-size: 28px; }
                h2 { color: #ffffff; font-size: 18px; margin-top: 24px; margin-bottom: 10px; }
                p { font-size: 14px; color: #a0aec0; text-align: justify; margin-bottom: 16px; }
                .back-btn { display: inline-block; margin-top: 24px; color: #38bdf8; text-decoration: none; font-weight: 600; font-size: 14px; }
                .back-btn:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>Kebijakan Pengembalian Dana (Refund Policy)</h1>
            
            <h2>1. Transaksi Gagal</h2>
            <p>Apabila transaksi pembelian produk digital Anda (pulsa, kuota, token) dinyatakan gagal oleh sistem kami atau server supplier, saldo akun Jawa Pay Anda akan secara otomatis dikembalikan penuh (100% refund ke saldo akun) dalam hitungan detik secara otomatis.</p>
            
            <h2>2. Penarikan Saldo (Withdrawal)</h2>
            <p>Saldo yang telah didepositkan ke akun Jawa Pay tidak dapat diuangkan kembali atau ditarik ke rekening bank pribadi Anda, kecuali jika platform kami menghentikan layanannya secara permanen.</p>
            
            <h2>3. Kesalahan Input Nomor Tujuan</h2>
            <p>Kami tidak bertanggung jawab atas kegagalan transaksi atau salah sasaran pengisian yang disebabkan oleh kesalahan input nomor tujuan oleh agen. Transaksi yang sukses ke nomor yang salah tidak dapat di-refund.</p>
            
            <a href="/" class="back-btn">&larr; Kembali ke Beranda</a>
        </body>
        </html>
    `);
});

app.get('/terms', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Syarat & Ketentuan - Jawa Pay</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 680px; margin: 40px auto; padding: 0 20px; background: #060412; color: #cbd5e1; }
                h1 { color: #f59e0b; border-bottom: 2px solid rgba(255,255,255,0.08); padding-bottom: 12px; margin-bottom: 30px; font-size: 28px; }
                h2 { color: #ffffff; font-size: 18px; margin-top: 24px; margin-bottom: 10px; }
                p { font-size: 14px; color: #a0aec0; text-align: justify; margin-bottom: 16px; }
                .back-btn { display: inline-block; margin-top: 24px; color: #38bdf8; text-decoration: none; font-weight: 600; font-size: 14px; }
                .back-btn:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>Syarat & Ketentuan Penggunaan</h1>
            
            <h2>1. Pendahuluan</h2>
            <p>Selamat datang di Jawa Pay. Dengan menggunakan situs dan layanan kami, Anda menyetujui ketentuan penggunaan ini secara penuh. Jika Anda keberatan dengan ketentuan di halaman ini, harap tidak menggunakan platform kami.</p>
            
            <h2>2. Layanan Kami</h2>
            <p>Jawa Pay menyediakan platform keagenan digital untuk pengisian pulsa, paket data internet, token listrik PLN, dan produk digital prabayar lainnya. Kami berhak mengubah harga produk sewaktu-waktu sesuai dengan penyesuaian pasar atau server mitra.</p>
            
            <h2>3. Akun dan Keamanan</h2>
            <p>Anda bertanggung jawab penuh untuk menjaga kerahasiaan kata sandi akun Jawa Pay Anda. Segala penyalahgunaan akun atau transaksi yang diakibatkan kelalaian pengguna adalah tanggung jawab pribadi masing-masing.</p>
            
            <h2>4. Transaksi dan Pembayaran</h2>
            <p>Pembayaran top-up saldo agen dilakukan menggunakan QRIS atau transfer bank resmi melalui sistem payment gateway terintegrasi. Semua transaksi yang sudah sukses diproses tidak dapat dibatalkan atau direfund, kecuali terbukti ada kesalahan sistem.</p>
            
            <a href="/" class="back-btn">&larr; Kembali ke Beranda</a>
        </body>
        </html>
    `);
});

app.get('/contact', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Hubungi Kami - Jawa Pay</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 680px; margin: 40px auto; padding: 0 20px; background: #060412; color: #cbd5e1; }
                h1 { color: #f59e0b; border-bottom: 2px solid rgba(255,255,255,0.08); padding-bottom: 12px; margin-bottom: 30px; font-size: 28px; }
                p { font-size: 15px; color: #a0aec0; margin-bottom: 20px; }
                .contact-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 24px; border-radius: 16px; display: flex; flex-direction: column; gap: 14px; }
                .info-item { display: flex; flex-direction: column; gap: 4px; }
                .label { font-weight: 700; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
                .val { font-size: 16px; color: #e2e8f0; }
                .val a { color: #38bdf8; text-decoration: none; }
                .val a:hover { text-decoration: underline; }
                .back-btn { display: inline-block; margin-top: 24px; color: #38bdf8; text-decoration: none; font-weight: 600; font-size: 14px; }
                .back-btn:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>Hubungi Kami</h1>
            <p>Jika Anda memiliki kendala transaksi, pendaftaran, atau memerlukan bantuan bisnis, silakan hubungi tim kami:</p>
            <div class="contact-card">
                <div class="info-item">
                    <span class="label">Alamat Kantor Usaha:</span>
                    <span class="val">Jalan Kb Anggrek Atas No. 15, RT 01 / RW 02, Tanah Sareal, Bogor, Jawa Barat 16161</span>
                </div>
                <div class="info-item">
                    <span class="label">Email Dukungan:</span>
                    <span class="val"><a href="mailto:admin@jawapay.my.id">admin@jawapay.my.id</a></span>
                </div>
                <div class="info-item">
                    <span class="label">WhatsApp Customer Service:</span>
                    <span class="val"><a href="https://wa.me/6282334708033" target="_blank">+62 823-3470-8033</a></span>
                </div>
            </div>
            <a href="/" class="back-btn">&larr; Kembali ke Beranda</a>
        </body>
        </html>
    `);
});

// Run manual migrations for SQLite to prevent table reconstruction errors
async function runSQLiteMigrations() {
    const addColumnIfMissing = async (table, column, definition) => {
        try {
            await db.sequelize.query(`SELECT ${column} FROM ${table} LIMIT 1;`);
        } catch (err) {
            console.log(`[Migration] Kolom "${column}" tidak ditemukan di tabel "${table}". Menambahkan...`);
            await db.sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
            console.log(`[Migration] Kolom "${column}" berhasil ditambahkan.`);
        }
    };
    try {
        await addColumnIfMissing('users', 'email', "VARCHAR(255) DEFAULT 'temp@jawapay.com'");
        await addColumnIfMissing('users', 'isVerified', "BOOLEAN DEFAULT 0");
        await addColumnIfMissing('users', 'verificationToken', "VARCHAR(255) DEFAULT NULL");
        await addColumnIfMissing('users', 'otpCode', "VARCHAR(10) DEFAULT NULL");
        await addColumnIfMissing('users', 'otpExpires', "DATETIME DEFAULT NULL");
        await addColumnIfMissing('users', 'role', "VARCHAR(20) DEFAULT 'agent'");
        await addColumnIfMissing('users', 'uplineId', "VARCHAR(255) DEFAULT NULL");
        await addColumnIfMissing('users', 'referralMarkup', "INTEGER DEFAULT 0");
        await addColumnIfMissing('deposits', 'qrUrl', "TEXT DEFAULT NULL");
    } catch (migErr) {
        console.warn('[Migration Warning] Gagal mengecek/menambahkan kolom:', migErr.message);
    }
}

// Sync Database and Start Server
const dbDialect = process.env.DB_DIALECT || 'sqlite';
const initDb = dbDialect === 'sqlite' ? runSQLiteMigrations() : Promise.resolve();

initDb.then(() => {
    return db.sequelize.sync();
}).then(async () => {
    console.log('[Sequelize] Database SQL Terhubung & Sinkron.');

    // Seed default vouchers if empty
    const voucherCount = await Voucher.count();
    if (voucherCount === 0) {
        await Voucher.bulkCreate([
            { code: 'JAWAPAYNEW', discount: 1000, type: 'flat', isActive: true, maxUse: 100, usedCount: 0 },
            { code: 'PLNHEMAT', discount: 1500, type: 'flat', isActive: true, maxUse: 50, usedCount: 0 },
            { code: 'DISKON500', discount: 500, type: 'flat', isActive: true, maxUse: 200, usedCount: 0 }
        ]);
        console.log('[Sequelize Seed] Voucher bawaan JAWAPAYNEW, PLNHEMAT, DISKON500 sukses dibuat.');
    }

    // Seed default settings if empty
    const { Setting } = db;
    const announcementSetting = await Setting.findByPk('announcement');
    if (!announcementSetting) {
        await Setting.create({
            key: 'announcement',
            value: '📢 Info Layanan: Sistem pembayaran QRIS & Virtual Account Mandiri/BCA lancar jaya | ⚡ TOKEN PLN promo potongan harga otomatis malam ini | 📱 Layanan Paket Data XL gangguan pemeliharaan sementara.'
        });
        console.log('[Sequelize Seed] Teks Pengumuman bawaan sukses dibuat.');
    }

    const dbDialect = process.env.DB_DIALECT || 'sqlite';
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 Jawa Pay Backend running on: http://localhost:${PORT}`);
        console.log(`📂 Menyajikan berkas frontend dari folder /public`);
        console.log(`🔑 Kredensial Digiflazz: ${isDigiflazzMock() ? 'Sandbox' : 'Live'}`);
        console.log(`🔒 Autentikasi JWT: AKTIF (Database SQL ${dbDialect === 'sqlite' ? 'SQLite' : 'PostgreSQL'})`);
        console.log(`📧 Pengiriman Email (SMTP): ${process.env.EMAIL_USER && process.env.EMAIL_PASS ? 'AKTIF (' + process.env.EMAIL_USER + ')' : 'BELUM AKTIF (EMAIL_USER & EMAIL_PASS belum dipasang di Render)'}`);
        console.log(`====================================================`);
    });
}).catch(err => {
    console.error('[Sequelize Error] Gagal melakukan sinkronisasi database:', err.message);
});
