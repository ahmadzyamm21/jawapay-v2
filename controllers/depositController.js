function createDepositController({ User, Deposit, snap }) {
    function getBankAccounts() {
        return {
            ...(process.env.BANK_BCA_NUMBER
                ? { BCA: { number: process.env.BANK_BCA_NUMBER, owner: process.env.BANK_BCA_OWNER || 'Admin' } }
                : {}),
            ...(process.env.BANK_MANDIRI_NUMBER
                ? { MANDIRI: { number: process.env.BANK_MANDIRI_NUMBER, owner: process.env.BANK_MANDIRI_OWNER || 'Admin' } }
                : {}),
            ...(process.env.BANK_BRI_NUMBER
                ? { BRI: { number: process.env.BANK_BRI_NUMBER, owner: process.env.BANK_BRI_OWNER || 'Admin' } }
                : {})
        };
    }

    async function requestManualDeposit(req, res) {
        const { amount, bankName } = req.body;
        const userId = req.user.id;

        if (!amount || isNaN(amount) || parseInt(amount, 10) < 2000) {
            return res.status(400).json({ error: 'Minimal deposit adalah Rp 2.000.' });
        }

        if (!bankName || !['BCA', 'MANDIRI', 'BRI'].includes(bankName.toUpperCase().trim())) {
            return res.status(400).json({ error: 'Metode bank transfer tidak didukung.' });
        }

        try {
            const existingPending = await Deposit.findOne({
                where: { userId, status: 'Pending' }
            });

            if (existingPending) {
                return res.status(400).json({
                    error: 'Anda memiliki tiket deposit pending yang belum diselesaikan.',
                    deposit: existingPending
                });
            }

            let uniqueCode;
            let totalAmount;
            let isUnique = false;
            let retries = 0;
            const parsedAmount = parseInt(amount, 10);

            while (!isUnique && retries < 15) {
                uniqueCode = Math.floor(100 + Math.random() * 900);
                totalAmount = parsedAmount + uniqueCode;

                const duplicate = await Deposit.findOne({
                    where: { totalAmount, status: 'Pending' }
                });

                if (!duplicate) isUnique = true;
                retries += 1;
            }

            if (!isUnique) {
                return res.status(503).json({
                    error: 'Belum berhasil membuat kode unik deposit. Silakan coba lagi.'
                });
            }

            const depositId = `DEP${Date.now()}`;
            const deposit = await Deposit.create({
                id: depositId,
                userId,
                amount: parsedAmount,
                uniqueCode,
                totalAmount,
                bankName: bankName.toUpperCase().trim(),
                status: 'Pending'
            });

            console.log(`[Deposit Request] Agen ${req.user.username} mengajukan deposit ${totalAmount} (ID: ${depositId})`);

            return res.json({
                success: true,
                deposit,
                bankAccounts: getBankAccounts()
            });
        } catch (err) {
            console.error('Request deposit error:', err);
            return res.status(500).json({ error: 'Gagal membuat tiket deposit.' });
        }
    }

    async function requestMidtransDeposit(req, res) {
        const { amount } = req.body;
        const userId = req.user.id;

        if (!amount || isNaN(amount) || parseInt(amount, 10) < 2000) {
            return res.status(400).json({ error: 'Minimal pengisian deposit adalah Rp 2.000.' });
        }

        try {
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({ error: 'User tidak ditemukan.' });
            }

            const existingPending = await Deposit.findOne({
                where: { userId, bankName: 'MIDTRANS', status: 'Pending' }
            });

            if (existingPending) {
                existingPending.status = 'Dibatalkan';
                await existingPending.save();
            }

            const depositId = `DEPMID${Date.now()}`;
            const totalAmount = parseInt(amount, 10);
            const parameter = {
                transaction_details: {
                    order_id: depositId,
                    gross_amount: totalAmount
                },
                credit_card: { secure: true },
                customer_details: {
                    first_name: user.name,
                    email: user.email || `${user.username}@jawapay.my.id`,
                    phone: user.phone || '081234567890'
                },
                item_details: [{
                    id: 'DEPOSIT',
                    price: totalAmount,
                    quantity: 1,
                    name: 'Top Up Saldo Jawa Pay'
                }]
            };

            const transaction = await snap.createTransaction(parameter);
            const deposit = await Deposit.create({
                id: depositId,
                userId,
                bankName: 'MIDTRANS',
                amount: totalAmount,
                uniqueCode: 0,
                totalAmount,
                status: 'Pending',
                qrUrl: transaction.redirect_url
            });

            console.log(`[Midtrans Deposit Request] Agen ${user.username} mengajukan deposit Midtrans ${totalAmount} (ID: ${depositId})`);

            return res.json({
                success: true,
                deposit,
                token: transaction.token,
                redirect_url: transaction.redirect_url
            });
        } catch (err) {
            console.error('Error Midtrans Deposit Snap create:', err);
            return res.status(500).json({
                error: 'Gagal memproses tiket deposit Midtrans.',
                message: err.message
            });
        }
    }

    async function getMyRequests(req, res) {
        try {
            const deposits = await Deposit.findAll({
                where: { userId: req.user.id },
                order: [['createdAt', 'DESC']]
            });

            return res.json({
                success: true,
                deposits,
                bankAccounts: getBankAccounts()
            });
        } catch (err) {
            console.error('Get my deposits error:', err);
            return res.status(500).json({ error: 'Gagal memuat tiket deposit Anda.' });
        }
    }

    async function cancelRequest(req, res) {
        const depositId = req.params.id;

        try {
            const deposit = await Deposit.findOne({
                where: { id: depositId, userId: req.user.id }
            });

            if (!deposit) {
                return res.status(404).json({ error: 'Tiket deposit tidak ditemukan.' });
            }

            if (deposit.status !== 'Pending') {
                return res.status(400).json({ error: 'Tiket deposit tidak berstatus pending.' });
            }

            deposit.status = 'Batal';
            await deposit.save();

            console.log(`[Deposit Cancel] Agen ${req.user.username} membatalkan tiket deposit ${depositId}`);
            return res.json({ success: true, message: 'Tiket deposit berhasil dibatalkan.' });
        } catch (err) {
            console.error('Cancel deposit error:', err);
            return res.status(500).json({ error: 'Gagal membatalkan tiket deposit.' });
        }
    }

    return {
        requestManualDeposit,
        requestMidtransDeposit,
        getMyRequests,
        cancelRequest
    };
}

module.exports = createDepositController;
