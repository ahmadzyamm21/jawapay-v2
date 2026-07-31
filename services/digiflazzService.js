function createDigiflazzService({
    axios,
    calculateMD5,
    DIGIFLAZZ_USERNAME,
    DIGIFLAZZ_API_KEY,
    DIGIFLAZZ_BASE_URL,
    isDigiflazzMock
}) {
    if (!axios || !calculateMD5) {
        throw new Error('Digiflazz service membutuhkan axios dan calculateMD5.');
    }

    async function purchase({ buyer_sku_code, productName, productCost, ref_id, customer_no }) {
        if (isDigiflazzMock && isDigiflazzMock()) {
            return {
                status: 'Sukses',
                sn: 'SN-DB-' + Math.floor(Math.random() * 900000000 + 100000000),
                trx_id: 'TRX' + Math.floor(Math.random() * 9000000 + 1000000),
                message: null
            };
        }

        let actualSku = buyer_sku_code;

        if (DIGIFLAZZ_API_KEY && DIGIFLAZZ_API_KEY.startsWith('dev-')) {
            const skuLower = buyer_sku_code.toLowerCase();
            const nameLower = productName.toLowerCase();

            if (skuLower.includes('telkomsel') || nameLower.includes('telkomsel') || nameLower.includes('simpati')) {
                actualSku = productCost <= 8000 ? 'tele5' : 'tele10';
            } else if (skuLower.includes('xl') || skuLower.includes('xr') || skuLower.includes('axis') || nameLower.includes('xl') || nameLower.includes('axis')) {
                actualSku = productCost <= 8000 ? 'xld5' : 'xld10';
            } else if (skuLower.includes('indosat') || skuLower.includes('im3') || nameLower.includes('indosat') || nameLower.includes('im3')) {
                actualSku = productCost <= 8000 ? 'tele5' : 'tele10';
            } else {
                actualSku = 'tele5';
            }
            console.log(`[Digiflazz Sandbox Mapping] Mapping SKU "${buyer_sku_code}" to Sandbox SKU "${actualSku}"`);
        } else {
            console.log(`[Digiflazz Production] Sending SKU "${actualSku}" directly to Digiflazz Production API`);
        }

        const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + ref_id);
        const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/transaction`, {
            username: DIGIFLAZZ_USERNAME,
            buyer_sku_code: actualSku,
            customer_no: customer_no,
            ref_id: ref_id,
            sign: sign
        });

        const data = response.data && response.data.data ? response.data.data : null;
        if (data) {
            return {
                status: (data.status === 'Success' || data.status === 'Sukses') ? 'Sukses' : (data.status === 'Pending' ? 'Pending' : 'Gagal'),
                sn: data.sn || '-',
                trx_id: data.trx_id || 'TRX' + Date.now(),
                message: data.message || 'Transaksi ditolak oleh operator.'
            };
        }

        throw new Error('GATEWAY_ERROR');
    }

    return { purchase };
}

module.exports = createDigiflazzService;
