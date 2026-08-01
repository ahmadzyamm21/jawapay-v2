function createDashboardController({ dashboardService }) {
    if (!dashboardService) throw new Error('Dashboard controller membutuhkan dashboardService.');

    return {
        adminSummary: async (req, res) => {
            try {
                const summary = await dashboardService.getAdminSummary();
                res.json(summary);
            } catch (err) {
                console.error('Fetch admin summary error:', err);
                res.status(500).json({ error: 'Gagal memuat ringkasan admin.' });
            }
        },

        earningsAnalytics: async (req, res) => {
            try {
                const userId = req.user.id;
                const analytics = await dashboardService.getEarningsAnalytics(userId);
                res.json(analytics);
            } catch (err) {
                console.error('Fetch earnings analytics error:', err);
                res.status(500).json({ error: 'Gagal memuat analitik keuntungan.' });
            }
        },

        balance: async (req, res) => {
            try {
                const balance = await dashboardService.getUserBalance(req.user.id);
                res.json({ balance });
            } catch (err) {
                console.error('Fetch balance error:', err);
                if (err.status === 404) {
                    return res.status(404).json({ error: err.message });
                }
                res.status(500).json({ error: 'Gagal memuat saldo.' });
            }
        },

        digiflazzDepositBalance: async (req, res) => {
            try {
                const depositData = await dashboardService.getDigiflazzDepositBalance();
                res.json(depositData);
            } catch (err) {
                console.error('Error checking Digiflazz deposit balance:', err);
                res.status(500).json({ error: 'Gagal mengecek saldo deposit Digiflazz.' });
            }
        }
    };
}

module.exports = createDashboardController;
