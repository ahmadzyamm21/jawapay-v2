function createTransactionController({
    Transaction,
    User,
    handleFailedTransactionRefund
}) {
    if (!Transaction || !User) {
        throw new Error('Transaction controller membutuhkan model Transaction dan User.');
    }

    if (typeof handleFailedTransactionRefund !== 'function') {
        throw new Error('Transaction controller membutuhkan handleFailedTransactionRefund.');
    }

    async function getAdminTransactions(req, res) {
        try {
            const transactions = await Transaction.findAll({
                include: [{
                    model: User,
                    as: 'user',
                    attributes: ['username', 'name']
                }],
                order: [['createdAt', 'DESC']]
            });

            return res.json({ success: true, transactions });
        } catch (err) {
            console.error('Admin get transactions error:', err);
            return res.status(500).json({
                error: 'Gagal memuat riwayat transaksi global.'
            });
        }
    }

    async function updateAdminTransactionStatus(req, res) {
        const { status } = req.body;
        const trxId = req.params.id;

        if (!['Sukses', 'Pending', 'Gagal'].includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid.' });
        }

        try {
            const trx = await Transaction.findByPk(trxId);
            if (!trx) {
                return res.status(404).json({
                    error: 'Transaksi tidak ditemukan.'
                });
            }

            const oldStatus = trx.status;
            if (oldStatus === status) {
                return res.json({
                    success: true,
                    message: 'Status transaksi tidak berubah.'
                });
            }

            trx.status = status;
            await trx.save();

            if (status === 'Gagal' && oldStatus !== 'Gagal') {
                await handleFailedTransactionRefund(trx, oldStatus);
            }

            return res.json({
                success: true,
                message: `Status transaksi berhasil diubah menjadi ${status}.`
            });
        } catch (err) {
            console.error('Admin set transaction status error:', err);
            return res.status(500).json({
                error: 'Gagal mengubah status transaksi.'
            });
        }
    }

    async function syncPendingTransactions(req, res) {
        try {
            const userId = req.user.id;
            const pendingTrxs = await Transaction.findAll({
                where: { userId, status: 'Pending' }
            });

            let updatedCount = 0;
            for (const trx of pendingTrxs) {
                trx.status = 'Sukses';
                await trx.save();
                updatedCount += 1;
            }

            return res.json({
                success: true,
                updated: updatedCount,
                totalPending: pendingTrxs.length
            });
        } catch (err) {
            console.error('Error syncing pending transactions:', err);
            return res.status(500).json({
                error: 'Gagal menyinkronkan status.'
            });
        }
    }

    return {
        getAdminTransactions,
        updateAdminTransactionStatus,
        syncPendingTransactions
    };
}

module.exports = createTransactionController;
