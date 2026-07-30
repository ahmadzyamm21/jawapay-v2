const express = require('express');
const createDepositController = require('../controllers/depositController');

function createDepositRoutes({ User, Deposit, snap, authenticateToken }) {
    const router = express.Router();
    const controller = createDepositController({ User, Deposit, snap });

    router.post('/request', authenticateToken, controller.requestManualDeposit);
    router.post('/request-midtrans', authenticateToken, controller.requestMidtransDeposit);
    router.get('/my-requests', authenticateToken, controller.getMyRequests);
    router.post('/:id/cancel', authenticateToken, controller.cancelRequest);

    return router;
}

module.exports = createDepositRoutes;
