const express = require('express');
const createDashboardController = require('../controllers/dashboardController');

function createDashboardRoutes({ dashboardService, authenticateToken, authenticateAdmin }) {
    if (!dashboardService) throw new Error('Dashboard routes membutuhkan dashboardService.');
    if (!authenticateToken) throw new Error('Dashboard routes membutuhkan authenticateToken.');
    if (!authenticateAdmin) throw new Error('Dashboard routes membutuhkan authenticateAdmin.');

    const router = express.Router();
    const controller = createDashboardController({ dashboardService });

    router.get('/admin/summary', authenticateAdmin, controller.adminSummary);
    router.get('/analytics/earnings', authenticateToken, controller.earningsAnalytics);
    router.post('/balance', authenticateToken, controller.balance);
    router.get('/digiflazz/deposit-balance', authenticateAdmin, controller.digiflazzDepositBalance);

    return router;
}

module.exports = createDashboardRoutes;
