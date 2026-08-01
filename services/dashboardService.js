const db = require('../models');
const { User, Transaction } = db;

function createDashboardService({ axios: axiosClient, calculateMD5, DIGIFLAZZ_BASE_URL, DIGIFLAZZ_USERNAME, DIGIFLAZZ_API_KEY }) {
    if (!axiosClient) throw new Error('Dashboard service membutuhkan axios.');
    if (!calculateMD5) throw new Error('Dashboard service membutuhkan calculateMD5.');
    if (!DIGIFLAZZ_BASE_URL) throw new Error('Dashboard service membutuhkan DIGIFLAZZ_BASE_URL.');

    const getProfitSum = async (where) => {
        return await Transaction.sum('profit', { where }) || 0;
    };

    const getTransactionCount = async (where) => {
        return await Transaction.count({ where });
    };

    const fetchDigiflazzDeposit = async () => {
        if (!DIGIFLAZZ_USERNAME || !DIGIFLAZZ_API_KEY) {
            return 0;
        }

        const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + 'depo');
        const response = await axiosClient.post(`${DIGIFLAZZ_BASE_URL}/cek-saldo`, {
            cmd: 'deposit',
            username: DIGIFLAZZ_USERNAME,
            sign
        });

        return (response.data && response.data.data && response.data.data.deposit) ? response.data.data.deposit : 0;
    };

    const ensureUserId = (userId) => {
        if (!userId) {
            const error = new Error('User ID diperlukan untuk mengambil data.');
            error.status = 400;
            throw error;
        }
    };

    return {
        getAdminSummary: async () => {
            const totalUsers = await User.count({ where: { role: 'agent' } });
            const totalBalance = await User.sum('balance', { where: { role: 'agent' } }) || 0;
            const successTrxs = await getTransactionCount({ status: 'Sukses' });
            const pendingTrxs = await getTransactionCount({ status: 'Pending' });
            const failedTrxs = await getTransactionCount({ status: 'Gagal' });

            const digiflazzBalance = await fetchDigiflazzDeposit().catch((dfErr) => {
                console.error('[Admin Summary] Gagal cek saldo Digiflazz:', dfErr.message || dfErr);
                return 0;
            });

            return {
                success: true,
                summary: {
                    totalUsers,
                    totalBalance,
                    successTrxs,
                    pendingTrxs,
                    failedTrxs,
                    digiflazzBalance
                }
            };
        },

        getEarningsAnalytics: async (userId) => {
            ensureUserId(userId);

            const { Op } = db.Sequelize;
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

            const todayProfit = await getProfitSum({
                userId,
                status: 'Sukses',
                createdAt: { [Op.gte]: startOfToday }
            });

            const monthProfit = await getProfitSum({
                userId,
                status: 'Sukses',
                createdAt: { [Op.gte]: startOfMonth }
            });

            const commissionProfit = await getProfitSum({
                userId,
                status: 'Sukses',
                category: 'komisi'
            });

            const salesProfit = await getProfitSum({
                userId,
                status: 'Sukses',
                category: { [Op.ne]: 'komisi' }
            });

            const last7DaysTrxs = await Transaction.findAll({
                where: {
                    userId,
                    status: 'Sukses',
                    createdAt: { [Op.gte]: sevenDaysAgo }
                },
                attributes: ['profit', 'createdAt']
            });

            const dailyProfitMap = {};
            for (let i = 0; i < 7; i++) {
                const date = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
                const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                dailyProfitMap[dateStr] = 0;
            }

            last7DaysTrxs.forEach((trx) => {
                const dateStr = new Date(trx.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                if (dailyProfitMap[dateStr] !== undefined) {
                    dailyProfitMap[dateStr] += trx.profit;
                }
            });

            const labels = Object.keys(dailyProfitMap).reverse();
            const data = Object.values(dailyProfitMap).reverse();

            return {
                success: true,
                summary: {
                    today: todayProfit,
                    month: monthProfit,
                    commission: commissionProfit,
                    sales: salesProfit,
                    total: commissionProfit + salesProfit
                },
                chart: {
                    labels,
                    data
                }
            };
        },

        getUserBalance: async (userId) => {
            ensureUserId(userId);
            const user = await User.findByPk(userId);
            if (!user) {
                const error = new Error('User tidak ditemukan.');
                error.status = 404;
                throw error;
            }
            return user.balance;
        },

        getDigiflazzDepositBalance: async () => {
            if (!DIGIFLAZZ_USERNAME || !DIGIFLAZZ_API_KEY) {
                return { deposit: 0, mode: 'Mock Mode' };
            }

            const deposit = await fetchDigiflazzDeposit();
            return { deposit, username: DIGIFLAZZ_USERNAME };
        }
    };
}

module.exports = createDashboardService;
