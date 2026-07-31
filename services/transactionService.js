function createTransactionService({
    Transaction,
    User,
    Voucher,
    sequelize,
    findProductBySku,
    digiflazzService
}) {
    if (!Transaction || !User) {
        throw new Error('Transaction service membutuhkan model Transaction dan User.');
    }

    if (!digiflazzService || typeof digiflazzService.purchase !== 'function') {
        throw new Error('Transaction service membutuhkan digiflazzService dengan method purchase.');
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

    async function createPurchaseTransaction({ userId, buyer_sku_code, customer_no, ref_id, voucherCode }) {
        const foundProd = findProductBySku(buyer_sku_code);
        const productCost = foundProd ? foundProd.priceAgent : 10000;
        const productName = foundProd ? foundProd.name : 'Pulsa / Data';

        console.log(`[Transaction] SKU: "${buyer_sku_code}" | Product: "${productName}" | Cost: ${productCost} | Found in cache: ${foundProd ? 'YES' : 'NO (using fallback cost)'}`);

        const result = await sequelize.transaction(async (t) => {
            const user = await User.findByPk(userId, { transaction: t, lock: true });
            if (!user) throw new Error('USER_NOT_FOUND');

            const referralMarkup = user.referralMarkup || 0;
            const actualProductCost = productCost + referralMarkup;

            // Validate Voucher if supplied
            let discountApplied = 0;
            let appliedVoucher = null;
            if (voucherCode) {
                appliedVoucher = await Voucher.findByPk(voucherCode.toUpperCase().trim(), { transaction: t, lock: true });
                if (appliedVoucher && appliedVoucher.isActive && appliedVoucher.usedCount < appliedVoucher.maxUse) {
                    discountApplied = appliedVoucher.discount;
                    if (appliedVoucher.type === 'percent') {
                        discountApplied = Math.round(actualProductCost * (appliedVoucher.discount / 100));
                    }
                    if (discountApplied > actualProductCost) {
                        discountApplied = actualProductCost;
                    }
                }
            }

            const finalCost = actualProductCost - discountApplied;
            if (user.balance < finalCost) throw new Error('INSUFFICIENT_BALANCE');

            // API Purchase via Digiflazz service
            const purchaseResult = await digiflazzService.purchase({ buyer_sku_code, productName, productCost, ref_id, customer_no });

            if (purchaseResult.status !== 'Sukses' && purchaseResult.status !== 'Pending') {
                throw new Error(purchaseResult.message || 'GATEWAY_DECLINED');
            }

            // Deduct balance and save
            user.balance -= finalCost;
            await user.save({ transaction: t });

            const profit = (user.markupFlat !== null && user.markupFlat !== undefined) ? user.markupFlat : 1500;

            // Create Transaction record in DB
            const newTrx = await Transaction.create({
                id: ref_id,
                userId: userId,
                category: foundProd ? foundProd.category : 'pulsa',
                productName: productName,
                target: customer_no,
                priceAgent: actualProductCost,
                priceSell: actualProductCost + profit - discountApplied,
                profit: profit,
                paymentMethod: 'Saldo Agen',
                status: purchaseResult.status,
                sn: purchaseResult.sn,
                voucherCode: appliedVoucher ? appliedVoucher.code : null,
                discountApplied: discountApplied
            }, { transaction: t });

            // Commission to upline
            const commission = user.referralMarkup || 0;
            if (user.uplineId && commission > 0) {
                const upline = await User.findByPk(user.uplineId, { transaction: t, lock: true });
                if (upline) {
                    upline.balance += commission;
                    await upline.save({ transaction: t });

                    await Transaction.create({
                        id: `COMM-${ref_id}`,
                        userId: upline.id,
                        category: 'komisi',
                        productName: `Komisi Downline: ${user.username}`,
                        target: `Downline: ${user.username}`,
                        priceAgent: 0,
                        priceSell: commission,
                        profit: commission,
                        paymentMethod: 'Komisi',
                        status: purchaseResult.status,
                        sn: `COMM-${ref_id}`
                    }, { transaction: t });

                    console.log(`[Commission System] Awarded Rp ${commission} commission to upline ${upline.username} for transaction ${ref_id} by downline ${user.username}`);
                }
            }

            if (appliedVoucher) {
                appliedVoucher.usedCount += 1;
                await appliedVoucher.save({ transaction: t });
            }

            return { user, newTrx, productCost };
        });

        return result;
    }

    return {
        findAllAdminTransactions,
        findByPk,
        findPendingByUser,
        save,
        createPurchaseTransaction
    };
}

module.exports = createTransactionService;
