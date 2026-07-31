function createTransactionService({ Transaction, User }) {
    if (!Transaction || !User) {
        throw new Error('Transaction service membutuhkan model Transaction dan User.');
    }

    async function findAllAdminTransactions() {
        return Transaction.findAll({
            include: [{
                model: User,
                as: 'user',
                attributes: ['username', 'name']
            }],
            order: [['createdAt', 'DESC']]
        });
    }

    async function findByPk(id) {
        return Transaction.findByPk(id);
    }

    async function findPendingByUser(userId) {
        return Transaction.findAll({ where: { userId, status: 'Pending' } });
    }

    async function save(transactionInstance) {
        return transactionInstance.save();
    }

    return {
        findAllAdminTransactions,
        findByPk,
        findPendingByUser,
        save
    };
}

module.exports = createTransactionService;
