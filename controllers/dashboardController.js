function createDashboardController({ dashboardService }) {
    if (!dashboardService) throw new Error('Dashboard controller membutuhkan dashboardService.');

    return {
        adminSummary: async (req, res) => {
            try {
                const summary = await dashboardService.getAdminSummary();
                return res.json(summary);
            } catch (err) {
                console.error('Fetch admin summary error:', err);
                return res.status(500).json({ success: false, message: 'Gagal memuat ringkasan admin.' });
            }
        },

        earningsAnalytics: async (req, res) => {
            try {
                const userId = req.user.id;
                const analytics = await dashboardService.getEarningsAnalytics(userId);
                return res.json(analytics);
            } catch (err) {
                console.error('Fetch earnings analytics error:', err);
                return res.status(500).json({ success: false, message: 'Gagal memuat analitik keuntungan.' });
            }
        },

        balance: async (req, res) => {
            try {
                const balance = await dashboardService.getUserBalance(req.user.id);
                return res.json({ success: true, balance });
            } catch (err) {
                console.error('Fetch balance error:', err);
                if (err.status === 404) {
                    return res.status(404).json({ success: false, message: err.message });
                }
                return res.status(500).json({ success: false, message: 'Gagal memuat saldo.' });
            }
        },

        digiflazzDepositBalance: async (req, res) => {
            try {
                const depositData = await dashboardService.getDigiflazzDepositBalance();
                return res.json({ success: true, ...depositData });
            } catch (err) {
                console.error('Error checking Digiflazz deposit balance:', err);
                return res.status(500).json({ success: false, message: 'Gagal mengecek saldo deposit Digiflazz.' });
            }
        }
    };
}

module.exports = createDashboardController;
