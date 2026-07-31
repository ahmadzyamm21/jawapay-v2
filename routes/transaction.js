const express = require('express');
const createTransactionController = require('../controllers/transactionController');
const createTransactionService = require('../services/transactionService');

function createTransactionRoutes({
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
}) {
    if (typeof authenticateToken !== 'function') {
        throw new Error('Transaction routes membutuhkan authenticateToken.');
    }

    if (typeof authenticateAdmin !== 'function') {
        throw new Error('Transaction routes membutuhkan authenticateAdmin.');
    }

    const router = express.Router();
    const transactionService = createTransactionService({
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
        axios
    });

    const controller = createTransactionController({ Transaction, User, handleFailedTransactionRefund, transactionService });

    router.get(
        '/admin/transactions',
        authenticateAdmin,
        controller.getAdminTransactions
    );

    router.post(
        '/admin/transactions/:id/status',
        authenticateAdmin,
        controller.updateAdminTransactionStatus
    );

    router.post(
        '/transactions/sync',
        authenticateToken,
        controller.syncPendingTransactions
    );

    // Main purchase endpoint: POST /api/transaction
    router.post(
        '/transaction',
        authenticateToken,
        controller.createPurchaseTransaction
    );

    return router;
}

module.exports = createTransactionRoutes;
