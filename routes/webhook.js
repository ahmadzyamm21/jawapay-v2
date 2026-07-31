const express = require('express');
const createWebhookController = require('../controllers/webhookController');

function createWebhookRoutes({
    webhookService,
    developmentOnly
}) {
    if (!webhookService) throw new Error('Webhook routes membutuhkan webhookService.');

    const router = express.Router();
    const controller = createWebhookController({ webhookService });

    router.post('/digiflazz/callback', controller.digiflazzCallback);
    router.post('/payment/callback', controller.tripayCallback);
    router.post('/payment/callback/qrisify', controller.qrisifyCallback);
    router.post('/payment/callback/notification-reader', controller.notificationReaderCallback);
    router.post('/payment/callback/moota', controller.mootaCallback);
    router.post('/payment/midtrans-callback', controller.midtransCallback);

    if (developmentOnly) {
        router.post('/payment/mock-callback', developmentOnly, controller.mockCallback);
        router.post('/payment/simulate-callback', developmentOnly, controller.simulateCallback);
    }

    return router;
}

module.exports = createWebhookRoutes;
