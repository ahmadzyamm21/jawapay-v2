function createAuthController({
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
    DIGIFLAZZ_BASE_URL
}) {
    function createToken(user) {
        return jwt.sign(
            {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
    }

    function publicUser(user) {
        return {
            id: user.id,
            name: user.name,
            username: user.username,
            markupFlat: user.markupFlat,
            role: user.role
        };
    }

    async function register(req, res) {
        const { name, username, password, email } = req.body;

        if (!name || !username || !password || !email) {
            return res.status(400).json({ error: 'Data registrasi tidak lengkap.' });
        }

        try {
            const normalizedUsername = username.toLowerCase().trim();
            const normalizedEmail = email.toLowerCase().trim();

            const usernameExists = await User.findOne({ where: { username: normalizedUsername } });
            if (usernameExists) {
                return res.status(400).json({ error: 'Username sudah digunakan oleh agen lain.' });
            }

            const emailExists = await User.findOne({ where: { email: normalizedEmail } });
            if (emailExists) {
                return res.status(400).json({ error: 'Email sudah digunakan oleh agen lain.' });
            }

            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

            const newUser = await User.create({
                id: 'USR' + Math.floor(Math.random() * 9000 + 1000),
                name,
                username: normalizedUsername,
                password: hashPassword(password),
                email: normalizedEmail,
                balance: 0,
                isVerified: false,
                otpCode,
                otpExpires
            });

            console.log(`[Database SQL] User baru terdaftar (menunggu OTP): ${normalizedUsername} (${newUser.id}) | OTP: ${otpCode}`);

            sendOtpEmail(normalizedEmail, name, otpCode).catch(mailErr => {
                console.error('[Email OTP Error] Gagal mengirim OTP email:', mailErr.message || mailErr);
            });

            const showDebugOtp = !process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.DEBUG_OTP === 'true';

            return res.json({
                success: true,
                requireOtp: true,
                email: normalizedEmail,
                ...(showDebugOtp ? { debugOtp: otpCode } : {}),
                message: 'Registrasi berhasil! Kode OTP 6-digit telah dikirim ke email Anda.'
            });
        } catch (err) {
            console.error('Register database error:', err);
            return res.status(500).json({ error: 'Gagal melakukan registrasi ke database.' });
        }
    }

    async function verifyOtp(req, res) {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            return res.status(400).json({ error: 'Email dan Kode OTP wajib diisi.' });
        }

        try {
            const normalizedEmail = email.toLowerCase().trim();
            const user = await User.findOne({ where: { email: normalizedEmail } });

            if (!user) {
                return res.status(404).json({ error: 'Akun dengan email tersebut tidak ditemukan.' });
            }

            if (user.isVerified) {
                return res.json({ success: true, token: createToken(user), user: publicUser(user) });
            }

            const cleanOtp = String(otpCode).trim();
            if (!user.otpCode || user.otpCode !== cleanOtp) {
                return res.status(400).json({ error: 'Kode OTP 6-digit salah. Silakan periksa kembali email Anda.' });
            }

            if (!user.otpExpires || new Date() > new Date(user.otpExpires)) {
                return res.status(400).json({ error: 'Kode OTP 6-digit telah kedaluwarsa (lebih dari 10 menit). Silakan minta kode baru.' });
            }

            user.isVerified = true;
            user.otpCode = null;
            user.otpExpires = null;
            await user.save();

            console.log(`[Email OTP] Akun ${user.username} (${user.email}) berhasil diverifikasi via OTP!`);

            return res.json({
                success: true,
                message: 'Verifikasi Kode OTP Berhasil! Selamat datang di Jawa Pay.',
                token: createToken(user),
                user: publicUser(user)
            });
        } catch (err) {
            console.error('Verify OTP Error:', err);
            return res.status(500).json({ error: 'Gagal memverifikasi Kode OTP.' });
        }
    }

    async function resendOtp(req, res) {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Alamat email wajib diisi.' });
        }

        try {
            const normalizedEmail = email.toLowerCase().trim();
            const user = await User.findOne({ where: { email: normalizedEmail } });
            if (!user) {
                return res.status(404).json({ error: 'Akun dengan email tersebut tidak ditemukan.' });
            }

            const newOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
            user.otpCode = newOtpCode;
            user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
            await user.save();

            console.log(`[Email OTP] Resending OTP ${newOtpCode} to ${normalizedEmail}`);
            sendOtpEmail(user.email, user.name, newOtpCode).catch(mailErr => {
                console.error('[Email OTP Error] Resend failed:', mailErr.message || mailErr);
            });

            const showDebugOtp = !process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.DEBUG_OTP === 'true';
            return res.json({
                success: true,
                ...(showDebugOtp ? { debugOtp: newOtpCode } : {}),
                message: 'Kode OTP 6-digit baru telah dikirimkan ke email Anda.'
            });
        } catch (err) {
            console.error('Resend OTP Error:', err);
            return res.status(500).json({ error: 'Gagal mengirim ulang Kode OTP.' });
        }
    }

    async function login(req, res) {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password wajib diisi.' });
        }

        try {
            const normalizedUsername = username.toLowerCase().trim();
            const user = await User.findOne({ where: { username: normalizedUsername } });
            if (!user || user.password !== hashPassword(password)) {
                return res.status(400).json({ error: 'Username atau password Anda salah.' });
            }

            if (!user.isVerified) {
                return res.status(400).json({
                    error: 'Akun Anda belum diverifikasi.',
                    requireOtp: true,
                    email: user.email
                });
            }

            return res.json({ success: true, token: createToken(user), user: publicUser(user) });
        } catch (err) {
            console.error('Login database error:', err);
            return res.status(500).json({ error: 'Gagal memverifikasi login.' });
        }
    }

    async function getProfile(req, res) {
        try {
            const user = await User.findByPk(req.user.id, {
                include: [{ model: Transaction, as: 'transactions' }],
                order: [[{ model: Transaction, as: 'transactions' }, 'createdAt', 'DESC']]
            });

            if (!user) {
                return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
            }

            let displayBalance = user.balance;
            if (user.role === 'admin' && DIGIFLAZZ_USERNAME && DIGIFLAZZ_API_KEY) {
                try {
                    const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + 'depo');
                    const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/cek-saldo`, {
                        cmd: 'deposit',
                        username: DIGIFLAZZ_USERNAME,
                        sign
                    }, { timeout: 3500 });

                    if (response.data?.data && typeof response.data.data.deposit === 'number') {
                        displayBalance = response.data.data.deposit;
                        if (user.balance !== displayBalance) {
                            user.balance = displayBalance;
                            await user.save();
                        }
                    }
                } catch (err) {
                    console.error('[Admin Profile Balance Sync] Failed to fetch Digiflazz balance:', err.message);
                }
            }

            return res.json({
                id: user.id,
                name: user.name,
                username: user.username,
                balance: displayBalance,
                markupFlat: user.markupFlat,
                role: user.role,
                transactions: user.transactions
            });
        } catch (err) {
            console.error('Get profile database error:', err);
            return res.status(500).json({ error: 'Gagal memuat profil pengguna.' });
        }
    }

    async function changePassword(req, res) {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: 'Password lama dan password baru wajib diisi.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password baru minimal harus 6 karakter.' });
        }

        try {
            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
            }

            if (user.password !== hashPassword(oldPassword)) {
                return res.status(400).json({ error: 'Password lama yang Anda masukkan salah.' });
            }

            user.password = hashPassword(newPassword);
            await user.save();

            console.log(`[Password Change] Agen ${user.username} berhasil mengubah password keamanan.`);
            return res.json({ success: true, message: 'Password keamanan berhasil diperbarui.' });
        } catch (err) {
            console.error('Change password error:', err);
            return res.status(500).json({ error: 'Gagal mengubah password.' });
        }
    }

    async function updateMarkup(req, res) {
        const { markupFlat } = req.body;
        if (markupFlat === undefined || isNaN(markupFlat) || parseInt(markupFlat, 10) < 0) {
            return res.status(400).json({ error: 'Nilai markup tidak valid.' });
        }

        try {
            const user = await User.findByPk(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'User tidak ditemukan.' });
            }

            user.markupFlat = parseInt(markupFlat, 10);
            await user.save();
            console.log(`[Database SQL] Markup User ${user.username} diperbarui menjadi: Rp ${user.markupFlat}`);
            return res.json({ success: true, markupFlat: user.markupFlat });
        } catch (err) {
            console.error('Update profile markup error:', err);
            return res.status(500).json({ error: 'Gagal memperbarui markup.' });
        }
    }

    return {
        register,
        verifyOtp,
        resendOtp,
        login,
        getProfile,
        changePassword,
        updateMarkup
    };
}

module.exports = createAuthController;
