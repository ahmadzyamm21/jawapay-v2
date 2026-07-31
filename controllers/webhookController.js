function createWebhookController({ webhookService }) {
    if (!webhookService) throw new Error('Webhook controller membutuhkan webhookService.');

    async function digiflazzCallback(req, res) {
        try {
            const result = await webhookService.handleDigiflazzCallback(req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Digiflazz handler error:', err);
            return res.status(500).json({ error: 'Webhook processing error' });
        }
    }

    async function tripayCallback(req, res) {
        try {
            const result = await webhookService.handleTripayCallback(req.headers, req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Tripay handler error:', err);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }

    async function qrisifyCallback(req, res) {
        try {
            const result = await webhookService.handleQrisifyCallback(req.query, req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Qrisify handler error:', err);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }

    async function notificationReaderCallback(req, res) {
        try {
            const result = await webhookService.handleNotificationCallback(req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Notification Reader handler error:', err);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }

    async function mootaCallback(req, res) {
        try {
            const result = await webhookService.handleMootaCallback(req.query, req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Moota handler error:', err);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }

    async function mockCallback(req, res) {
        try {
            const result = await webhookService.handleMockCallback(req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Mock handler error:', err);
            return res.status(500).json({ error: 'Gagal memproses simulasi callback.' });
        }
    }

    async function simulateCallback(req, res) {
        try {
            const result = await webhookService.handleSimulateCallback(req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Simulator handler error:', err);
            return res.status(500).json({ error: 'Gagal memproses simulasi webhook.' });
        }
    }

    async function midtransCallback(req, res) {
        try {
            const result = await webhookService.handleMidtransCallback(req.body);
            return res.status(result.status || 200).json(result.body);
        } catch (err) {
            console.error('[Webhook Controller] Midtrans handler error:', err);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    }

    return {
        digiflazzCallback,
        tripayCallback,
        qrisifyCallback,
        notificationReaderCallback,
        mootaCallback,
        mockCallback,
        simulateCallback,
        midtransCallback
    };
}

module.exports = createWebhookController;
