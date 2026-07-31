const crypto = require('crypto');

function createWebhookService({
    sequelize,
    Transaction,
    User,
    Deposit,
    Voucher,
    handleFailedTransactionRefund,
    axios,
    calculateMD5,
    isDigiflazzMock,
    DIGIFLAZZ_USERNAME,
    DIGIFLAZZ_API_KEY,
    DIGIFLAZZ_BASE_URL,
    invoiceUserMap,
    findProductBySku
}) {
    if (!sequelize || !Transaction || !User || !Deposit || !axios) {
        throw new Error('Webhook service membutuhkan sequelize, Transaction, User, Deposit, dan axios.');
    }
    if (!calculateMD5 || typeof isDigiflazzMock !== 'function') {
        throw new Error('Webhook service membutuhkan calculateMD5 dan isDigiflazzMock.');
    }

    async function handleDigiflazzCallback(payload) {
        try {
            console.log('[Digiflazz Webhook Received]:', JSON.stringify(payload));

            let data = payload.data || payload;
            if (payload.post) {
                try {
                    const parsed = JSON.parse(payload.post);
                    data = parsed.data || parsed;
                } catch (e) {
                    data = payload.data || payload;
                }
            }

            const { trx_id, ref_id, status, sn } = data;
            const lookupKey = ref_id || trx_id;

            if (!lookupKey) {
                console.warn('[Digiflazz Webhook] Missing ref_id and trx_id in callback payload:', data);
                return { status: 400, body: { error: 'Missing ref_id or trx_id' } };
            }

            await sequelize.transaction(async (t) => {
                let trx = null;
                if (ref_id) {
                    trx = await Transaction.findByPk(ref_id, { transaction: t, lock: true });
                }
                if (!trx && trx_id) {
                    trx = await Transaction.findByPk(trx_id, { transaction: t, lock: true });
                }

                if (!trx) {
                    console.warn(`[Digiflazz Webhook] Transaction with ref_id "${ref_id}" / trx_id "${trx_id}" not found in database.`);
                    return;
                }

                const oldStatus = trx.status;
                const newStatus = (status === 'Success' || status === 'Sukses') ? 'Sukses' : ((status === 'Failed' || status === 'Gagal') ? 'Gagal' : oldStatus);

                if (oldStatus !== newStatus || (sn && !trx.sn)) {
                    trx.status = newStatus;
                    if (sn && sn !== '-') trx.sn = sn;
                    await trx.save({ transaction: t });

                    console.log(`[Digiflazz Webhook] Transaction ${trx.id} status updated from ${oldStatus} to ${newStatus}. SN: ${sn || 'N/A'}`);

                    if (newStatus === 'Gagal' && oldStatus !== 'Gagal') {
                        await handleFailedTransactionRefund(trx, oldStatus, t);
                    }
                }
            });

            return { status: 200, body: { success: true } };
        } catch (err) {
            console.error('[Digiflazz Webhook Error]:', err);
            return { status: 500, body: { error: 'Webhook processing error' } };
        }
    }

    async function handleTripayCallback(headers, payload) {
        try {
            const callbackSignature = headers['x-callback-signature'];
            const privateKey = process.env.TRIPAY_PRIVATE_KEY;

            const calculatedSignature = crypto.createHmac('sha256', privateKey)
                .update(JSON.stringify(payload))
                .digest('hex');

            if (callbackSignature !== calculatedSignature) {
                console.error('[Tripay Callback] Signature mismatch!');
                return { status: 400, body: { error: 'Invalid signature.' } };
            }

            const { merchant_ref, status } = payload;

            if (status === 'PAID') {
                const deposit = await Deposit.findOne({ where: { id: merchant_ref, status: 'Pending' } });
                if (deposit) {
                    const user = await User.findByPk(deposit.userId);
                    if (user) {
                        await sequelize.transaction(async (t) => {
                            deposit.status = 'Sukses';
                            await deposit.save({ transaction: t });

                            user.balance += deposit.totalAmount;
                            await user.save({ transaction: t });
                        });
                        console.log(`[Tripay Callback] Deposit ${merchant_ref} PAID. Saldo ${user.username} bertambah Rp ${deposit.totalAmount}`);
                    }
                }
            }

            return { status: 200, body: { success: true } };
        } catch (err) {
            console.error('Tripay Callback error:', err);
            return { status: 500, body: { error: 'Internal server error.' } };
        }
    }

    async function handleQrisifyCallback(query, reqBody) {
        try {
            const configuredSecret = process.env.QRISIFY_WEBHOOK_SECRET;
            const receivedSecret = String(query.token || '');

            if (
                !configuredSecret ||
                receivedSecret.length !== configuredSecret.length ||
                !crypto.timingSafeEqual(
                    Buffer.from(receivedSecret),
                    Buffer.from(configuredSecret)
                )
            ) {
                return { status: 401, body: { error: 'Callback tidak sah.' } };
            }

            const payload = reqBody || {};
            const data = payload.data || payload;

            const orderId = String(
                data.external_id ||
                payload.external_id ||
                ''
            ).trim();

            const status = String(
                data.status ||
                payload.status ||
                payload.transaction_status ||
                ''
            ).toLowerCase();

            const rawAmount =
                data.amount_total ??
                data.amount_requested ??
                payload.amount ??
                payload.gross_amount ??
                payload.total_amount;

            const amount = Number(
                String(rawAmount ?? '').replace(/[^\d]/g, '')
            );

            const successfulStatuses = [
                'success',
                'paid',
                'settlement',
                'completed',
                'sukses'
            ];

            if (!successfulStatuses.includes(status)) {
                return { status: 400, body: { error: 'Status pembayaran belum berhasil.' } };
            }

            if (!orderId || !Number.isSafeInteger(amount) || amount <= 0) {
                return { status: 400, body: { error: 'Data callback tidak valid.' } };
            }

            try {
                await sequelize.transaction(async (transaction) => {
                    const deposit = await Deposit.findOne({
                        where: {
                            id: orderId,
                            status: 'Pending',
                            bankName: 'QRIS'
                        },
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });

                    if (!deposit) {
                        throw new Error('Deposit tidak ditemukan atau sudah diproses.');
                    }

                    if (Number(deposit.totalAmount) !== amount) {
                        throw new Error('Nominal callback tidak sesuai dengan tiket deposit.');
                    }

                    const user = await User.findByPk(deposit.userId, {
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });

                    if (!user) {
                        throw new Error('Pengguna tidak ditemukan.');
                    }

                    deposit.status = 'Sukses';
                    deposit.sn =
                        'QRISIFY-' +
                        String(
                            data.transaction_id ||
                            payload.transaction_id ||
                            payload.trx_id ||
                            payload.reference ||
                            Date.now()
                        );

                    user.balance = Number(user.balance || 0) + Number(deposit.totalAmount);

                    await deposit.save({ transaction });
                    await user.save({ transaction });
                });

                return { status: 200, body: { success: true, message: 'Deposit berhasil diproses.' } };
            } catch (error) {
                console.error('[Qrisify Callback Error]', error.message);
                return { status: 400, body: { error: error.message } };
            }
        } catch (err) {
            console.error('[Qrisify Callback Error]', err);
            return { status: 500, body: { error: 'Internal server error.' } };
        }
    }

    async function handleNotificationCallback(body) {
        try {
            const { title, body: messageBody, secret } = body;
            const notificationSecret = process.env.NOTIFICATION_SECRET || 'jawapay_secret_token';
            if (secret !== notificationSecret) {
                return { status: 401, body: { error: 'Unauthorized callback.' } };
            }

            if (!messageBody) {
                return { status: 400, body: { error: 'Body is empty.' } };
            }

            console.log(`[Notification Callback] Title: "${title}", Body: "${messageBody}"`);

            const cleanedBody = messageBody.replace(/\s/g, '').toLowerCase();
            let amount = null;
            const rpMatch = cleanedBody.match(/rp([0-9.,]+)/);
            if (rpMatch) {
                const numStr = rpMatch[1].replace(/[.,]/g, '');
                amount = parseInt(numStr);
            } else {
                const fallbackMatch = cleanedBody.match(/([0-9.,]+)/);
                if (fallbackMatch) {
                    const numStr = fallbackMatch[1].replace(/[.,]/g, '');
                    amount = parseInt(numStr);
                }
            }

            if (!amount || isNaN(amount)) {
                console.log('[Notification Callback] Could not extract valid amount.');
                return { status: 200, body: { success: false, message: 'Could not extract amount.' } };
            }

            console.log(`[Notification Callback] Extracted Amount: Rp ${amount}`);

            let deposit = await Deposit.findOne({ where: { totalAmount: amount, status: 'Pending' } });
            if (!deposit) {
                deposit = await Deposit.findOne({ where: { status: 'Pending', bankName: 'QRIS' }, order: [['createdAt', 'DESC']] });
            }

            if (!deposit) {
                console.log(`[Notification Callback] No pending deposit found matching amount Rp ${amount}`);
                return { status: 200, body: { success: false, message: 'No matching pending deposit.' } };
            }

            const user = await User.findByPk(deposit.userId);
            if (!user) {
                console.log('[Notification Callback] Associated user not found.');
                return { status: 200, body: { success: false, message: 'User not found.' } };
            }

            await sequelize.transaction(async (t) => {
                const lockedDeposit = await Deposit.findOne({ where: { id: deposit.id, status: 'Pending' }, transaction: t, lock: true });
                if (lockedDeposit) {
                    lockedDeposit.status = 'Sukses';
                    lockedDeposit.sn = 'AUTO-NOTIF-' + Date.now();
                    await lockedDeposit.save({ transaction: t });

                    user.balance += lockedDeposit.totalAmount;
                    await user.save({ transaction: t });
                    console.log(`[Notification Callback] Auto-approved Deposit ${lockedDeposit.id} for ${user.username}. Balance added: Rp ${lockedDeposit.totalAmount}`);
                }
            });

            return { status: 200, body: { success: true, message: 'Deposit processed successfully.' } };
        } catch (err) {
            console.error('Error processing notification callback:', err);
            return { status: 500, body: { error: 'Internal server error.' } };
        }
    }

    async function handleMootaCallback(query, mutations) {
        try {
            const { secret } = query || {};
            const mootaSecret = process.env.MOOTA_SECRET || 'jawapay_moota_secret';
            if (secret !== mootaSecret) {
                return { status: 401, body: { error: 'Unauthorized callback.' } };
            }

            if (!mutations) {
                return { status: 400, body: { error: 'Body is empty.' } };
            }

            console.log(`[Moota Webhook] Received mutations data.`);
            const processMutation = async (item) => {
                if (item.type === 'CR' || item.type === 'credit') {
                    const amount = Math.round(parseFloat(item.amount));
                    console.log(`[Moota Webhook] Uang Masuk Terdeteksi: Rp ${amount}`);

                    try {
                        const deposit = await Deposit.findOne({ where: { totalAmount: amount, status: 'Pending' } });
                        if (deposit) {
                            const user = await User.findByPk(deposit.userId);
                            if (user) {
                                await sequelize.transaction(async (t) => {
                                    const lockedDeposit = await Deposit.findOne({ where: { id: deposit.id, status: 'Pending' }, transaction: t, lock: true });
                                    if (lockedDeposit) {
                                        lockedDeposit.status = 'Sukses';
                                        lockedDeposit.sn = 'MOOTA-' + (item.id || Date.now());
                                        await lockedDeposit.save({ transaction: t });

                                        user.balance += lockedDeposit.totalAmount;
                                        await user.save({ transaction: t });
                                        console.log(`[Moota Webhook] Auto-approved Deposit ${lockedDeposit.id} for ${user.username}. Balance added: Rp ${lockedDeposit.totalAmount}`);
                                    }
                                });
                            }
                        }
                    } catch (err) {
                        console.error('[Moota Webhook] Error processing item:', err);
                    }
                }
            };

            if (Array.isArray(mutations)) {
                for (const item of mutations) await processMutation(item);
            } else {
                await processMutation(mutations);
            }

            return { status: 200, body: { success: true } };
        } catch (err) {
            console.error('Moota Webhook error:', err);
            return { status: 500, body: { error: 'Internal server error.' } };
        }
    }

    async function handleMockCallback(body) {
        try {
            const { depositId } = body;
            if (!depositId) {
                return { status: 400, body: { error: 'Deposit ID required.' } };
            }

            const deposit = await Deposit.findOne({ where: { id: depositId, status: 'Pending' } });
            if (!deposit) {
                return { status: 404, body: { error: 'Tiket deposit tidak ditemukan atau sudah diproses.' } };
            }

            const user = await User.findByPk(deposit.userId);
            if (!user) {
                return { status: 404, body: { error: 'User tidak ditemukan.' } };
            }

            await sequelize.transaction(async (t) => {
                deposit.status = 'Sukses';
                await deposit.save({ transaction: t });

                user.balance += deposit.totalAmount;
                await user.save({ transaction: t });
            });

            console.log(`[Mock Callback] Deposit ${depositId} simulated PAID. Saldo ${user.username} bertambah Rp ${deposit.totalAmount}`);
            return { status: 200, body: { success: true, message: 'Simulasi pembayaran QRIS berhasil!' } };
        } catch (err) {
            console.error('Mock Callback error:', err);
            return { status: 500, body: { error: 'Gagal mensimulasikan callback.' } };
        }
    }

    async function handleSimulateCallback(body) {
        try {
            const { merchant_ref, buyer_sku_code, customer_no } = body;

            const mapData = invoiceUserMap.get(merchant_ref);
            if (!mapData) {
                return { status: 404, body: { error: 'User mapping untuk invoice ini tidak ditemukan.' } };
            }

            const userId = typeof mapData === 'object' ? mapData.userId : mapData;
            const voucherCode = typeof mapData === 'object' ? mapData.voucherCode : null;
            const discountApplied = typeof mapData === 'object' ? mapData.discountApplied : 0;

            console.log(`[Simulator Callback] Memproses sukses lokal untuk ${merchant_ref} (User: ${userId})`);

            const user = await User.findByPk(userId);
            if (!user) {
                return { status: 404, body: { error: 'User tidak terdaftar.' } };
            }

            let purchaseResult;
            if (isDigiflazzMock()) {
                purchaseResult = {
                    status: 'Sukses',
                    sn: 'SN-TRIPAY-' + Math.floor(Math.random() * 900000000 + 100000000),
                    trx_id: 'TRX' + Math.floor(Math.random() * 9000000 + 1000000)
                };
            } else {
                let actualSku = buyer_sku_code;
                if (DIGIFLAZZ_API_KEY && DIGIFLAZZ_API_KEY.startsWith('dev-')) {
                    actualSku = 'tele5';
                    console.log(`[Tripay→Digiflazz Sandbox] Mapping SKU "${buyer_sku_code}" to "${actualSku}"`);
                } else {
                    console.log(`[Tripay→Digiflazz Production] Sending SKU "${actualSku}" directly`);
                }

                const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + merchant_ref);
                const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/transaction`, {
                    username: DIGIFLAZZ_USERNAME,
                    buyer_sku_code: actualSku,
                    customer_no: customer_no,
                    ref_id: merchant_ref,
                    sign: sign
                });
                const data = response.data.data;
                purchaseResult = {
                    status: (data.status === 'Success' || data.status === 'Sukses') ? 'Sukses' : 'Pending',
                    sn: data.sn || '-',
                    trx_id: data.trx_id || 'TRX' + Date.now()
                };
            }

            const foundProd = findProductBySku(buyer_sku_code);
            const profit = (user.markupFlat !== null && user.markupFlat !== undefined) ? user.markupFlat : 1500;

            if (voucherCode) {
                try {
                    const voucher = await Voucher.findByPk(voucherCode);
                    if (voucher) {
                        voucher.usedCount += 1;
                        await voucher.save();
                    }
                } catch (vErr) {
                    console.error('Error incrementing voucher count in simulator callback:', vErr);
                }
            }

            await Transaction.create({
                id: purchaseResult.trx_id,
                userId: userId,
                category: foundProd ? foundProd.category : 'pulsa',
                productName: foundProd ? foundProd.name : buyer_sku_code,
                target: customer_no,
                priceAgent: foundProd ? foundProd.priceAgent : 10000,
                priceSell: (foundProd ? foundProd.priceAgent : 10000) + profit - discountApplied,
                profit: profit,
                paymentMethod: 'TRIPAY QRIS',
                status: purchaseResult.status,
                sn: purchaseResult.sn,
                voucherCode: voucherCode,
                discountApplied: discountApplied
            });

            return { status: 200, body: { success: true, data: { status: purchaseResult.status, sn: purchaseResult.sn, trx_id: purchaseResult.trx_id } } };
        } catch (err) {
            console.error('[Simulator Error]', err);
            return { status: 500, body: { error: 'Gagal memproses simulasi webhook.' } };
        }
    }

    async function handleMidtransCallback(payload) {
        try {
            const orderId = payload.order_id;
            const transactionStatus = payload.transaction_status;
            const fraudStatus = payload.fraud_status;

            console.log(`[Midtrans Webhook] Menerima notifikasi untuk Order ${orderId}: Status = ${transactionStatus}`);

            let isSuccess = false;
            if (transactionStatus === 'capture') {
                if (fraudStatus === 'accept') {
                    isSuccess = true;
                }
            } else if (transactionStatus === 'settlement') {
                isSuccess = true;
            }

            if (isSuccess) {
                if (orderId && (orderId.startsWith('DEPMID') || orderId.startsWith('DEP'))) {
                    try {
                        const deposit = await Deposit.findOne({ where: { id: orderId, status: 'Pending' } });
                        if (deposit) {
                            const user = await User.findByPk(deposit.userId);
                            if (user) {
                                await sequelize.transaction(async (t) => {
                                    deposit.status = 'Sukses';
                                    await deposit.save({ transaction: t });

                                    user.balance += deposit.totalAmount;
                                    await user.save({ transaction: t });
                                });
                                console.log(`[Midtrans Webhook Success] Deposit ${orderId} PAID. Saldo ${user.username} bertambah Rp ${deposit.totalAmount}`);
                            }
                        }
                    } catch (err) {
                        console.error('[Midtrans Webhook Deposit Error] Gagal memproses deposit:', err.message);
                    }
                } else {
                    const mapData = invoiceUserMap.get(orderId);
                    if (mapData) {
                        const userId = typeof mapData === 'object' ? mapData.userId : mapData;
                        const voucherCode = typeof mapData === 'object' ? mapData.voucherCode : null;

                        try {
                            const user = await User.findByPk(userId);
                            if (user) {
                                if (voucherCode) {
                                    try {
                                        const voucher = await Voucher.findByPk(voucherCode);
                                        if (voucher) {
                                            voucher.usedCount += 1;
                                            await voucher.save();
                                        }
                                    } catch (vErr) {
                                        console.error('Error incrementing voucher count in callback:', vErr);
                                    }
                                }
                                console.log(`[Midtrans Webhook Success] Transaksi ${orderId} lunas!`);
                            }
                        } catch (err) {
                            console.error('[Webhook Error] Gagal memproses data:', err.message);
                        }
                    }
                }
            }

            return { status: 200, body: { success: true } };
        } catch (err) {
            console.error('[Midtrans Webhook Error]:', err);
            return { status: 500, body: { error: 'Internal server error.' } };
        }
    }

    return {
        handleDigiflazzCallback,
        handleTripayCallback,
        handleQrisifyCallback,
        handleNotificationCallback,
        handleMootaCallback,
        handleMockCallback,
        handleSimulateCallback,
        handleMidtransCallback
    };
}

module.exports = createWebhookService;
