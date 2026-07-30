function createAuthController({ User, jwt, JWT_SECRET }) {
    async function verifyOtp(req, res) {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            return res.status(400).json({
                error: 'Email dan Kode OTP wajib diisi.'
            });
        }

        try {
            const normalizedEmail = email.toLowerCase().trim();

            const user = await User.findOne({
                where: { email: normalizedEmail }
            });

            if (!user) {
                return res.status(404).json({
                    error: 'Akun dengan email tersebut tidak ditemukan.'
                });
            }

            if (user.isVerified) {
                const token = jwt.sign(
                    {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        role: user.role
                    },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                return res.json({
                    success: true,
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        markupFlat: user.markupFlat,
                        role: user.role
                    }
                });
            }

            const cleanOtp = String(otpCode).trim();

            if (!user.otpCode || user.otpCode !== cleanOtp) {
                return res.status(400).json({
                    error: 'Kode OTP 6-digit salah. Silakan periksa kembali email Anda.'
                });
            }

            if (!user.otpExpires || new Date() > new Date(user.otpExpires)) {
                return res.status(400).json({
                    error: 'Kode OTP 6-digit telah kedaluwarsa (lebih dari 10 menit). Silakan minta kode baru.'
                });
            }

            user.isVerified = true;
            user.otpCode = null;
            user.otpExpires = null;

            await user.save();

            console.log(
                `[Email OTP] Akun ${user.username} (${user.email}) berhasil diverifikasi via OTP!`
            );

            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            return res.json({
                success: true,
                message: 'Verifikasi Kode OTP Berhasil! Selamat datang di Jawa Pay.',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    markupFlat: user.markupFlat,
                    role: user.role
                }
            });
        } catch (err) {
            console.error('Verify OTP Error:', err);

            return res.status(500).json({
                error: 'Gagal memverifikasi Kode OTP.'
            });
        }
    }

    return {
        verifyOtp
    };
}

module.exports = createAuthController;