const express = require('express');
const createTransactionController = require('../controllers/transactionController');

function createTransactionRoutes({
    Transaction,
    User,
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
    const controller = createTransactionController({
        Transaction,
        User,
        handleFailedTransactionRefund
    });

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

    return router;
}

module.exports = createTransactionRoutes;
