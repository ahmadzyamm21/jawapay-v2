const createTransactionService = require('../services/transactionService');

function createTransactionController({
    Transaction,
    User,
    handleFailedTransactionRefund,
    transactionService: injectedTransactionService
}) {
    if (!Transaction || !User) {
        throw new Error('Transaction controller membutuhkan model Transaction dan User.');
    }

    if (typeof handleFailedTransactionRefund !== 'function') {
        throw new Error('Transaction controller membutuhkan handleFailedTransactionRefund.');
    }

    const transactionService = injectedTransactionService || createTransactionService({ Transaction, User });

    async function createPurchaseTransaction(req, res) {
        const { buyer_sku_code, customer_no, ref_id, voucherCode } = req.body;
        const userId = req.user && req.user.id;

        if (!buyer_sku_code || !customer_no || !ref_id) {
            return res.status(400).json({ error: 'Parameter tidak lengkap.' });
        }

        try {
            const result = await transactionService.createPurchaseTransaction({
                userId,
                buyer_sku_code,
                customer_no,
                ref_id,
                voucherCode
            });

            return res.json({
                data: {
                    ref_id: ref_id,
                    trx_id: result.newTrx.id,
                    buyer_sku_code: buyer_sku_code,
                    customer_no: customer_no,
                    price: result.productCost,
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
    }

    async function getAdminTransactions(req, res) {
        try {
            const transactions = await transactionService.findAllAdminTransactions();

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
            const trx = await transactionService.findByPk(trxId);
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
            await transactionService.save(trx);

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
            const pendingTrxs = await transactionService.findPendingByUser(userId);

            let updatedCount = 0;
            for (const trx of pendingTrxs) {
                trx.status = 'Sukses';
                await transactionService.save(trx);
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
        ,
        createPurchaseTransaction
    };
}

module.exports = createTransactionController;
