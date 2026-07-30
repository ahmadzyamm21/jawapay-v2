const db = require('./models');

async function checkDev() {
    try {
        console.log('\n=============================================');
        console.log('       STATUS DEV SYSTEM JAWA PAY           ');
        console.log('=============================================\n');

        // 1. Cek Deposit Pending
        const pendingDeposits = await db.Deposit.findAll({
            where: { status: 'Pending' },
            include: [{ model: db.User, as: 'user', attributes: ['username', 'balance'] }]
        });
        console.log(`📌 Total Tiket Deposit Pending: ${pendingDeposits.length}`);
        pendingDeposits.forEach(d => {
            console.log(`  👉 ID: ${d.id} | Agen: ${d.user ? d.user.username : '-'} | Bank: ${d.bankName} | Nominal: Rp ${d.totalAmount}`);
        });

        // 2. Cek Saldo Agen & Admin
        const users = await db.User.findAll({ attributes: ['username', 'role', 'balance'] });
        console.log('\n👤 Daftar User & Saldo Saat Ini:');
        users.forEach(u => {
            console.log(`  👉 ${u.username} [${u.role.toUpperCase()}]: Rp ${u.balance.toLocaleString('id-ID')}`);
        });

        console.log('\n=============================================\n');
    } catch (err) {
        console.error('Check dev error:', err);
    } finally {
        process.exit(0);
    }
}

checkDev();
