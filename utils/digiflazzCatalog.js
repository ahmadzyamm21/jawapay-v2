function applyReferralMarkup(catalog, markup) {
    if (!catalog || markup <= 0) return catalog;
    const clone = JSON.parse(JSON.stringify(catalog));

    const processArray = (arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach(item => {
            if (item && typeof item.priceAgent === 'number') {
                item.priceAgent += markup;
            }
        });
    };

    for (const catKey in clone) {
        const cat = clone[catKey];
        if (catKey === 'pln') {
            processArray(cat.global);
        } else {
            for (const brandKey in cat) {
                processArray(cat[brandKey]);
            }
        }
    }
    return clone;
}

function findProductBySku(sku, cachedProducts, fallbackProducts) {
    if (!sku) return null;
    const lookup = (source) => {
        for (const cat of Object.keys(source)) {
            const catObj = source[cat];
            if (Array.isArray(catObj)) {
                const found = catObj.find(p => p.buyer_sku_code === sku);
                if (found) return found;
            } else {
                for (const provider of Object.keys(catObj)) {
                    if (Array.isArray(catObj[provider])) {
                        const found = catObj[provider].find(p => p.buyer_sku_code === sku);
                        if (found) return found;
                    }
                }
            }
        }
        return null;
    };

    if (cachedProducts) {
        const found = lookup(cachedProducts);
        if (found) return found;
    }

    return lookup(fallbackProducts);
}

function parseDigiflazzProducts(raw) {
    const products = {
        pulsa: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        data: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        aktif: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        pln: { global: [] },
        emoney: { gopay: [], ovo: [], dana: [], shopeepay: [] },
        game: { mlbb: [], ff: [], pubg: [] },
        tv: { kvision: [], nexparabola: [] }
    };

    raw.forEach(item => {
        if (!item.buyer_product_status || !item.seller_product_status) return;
        const brand = item.brand.toLowerCase();
        const category = item.category.toLowerCase();
        const name = item.product_name.toLowerCase();
        const sku = item.buyer_sku_code.toLowerCase();

        const formatted = {
            buyer_sku_code: item.buyer_sku_code,
            name: item.product_name,
            priceAgent: item.price,
            priceSell: Math.ceil(item.price * 1.05 / 500) * 500,
            desc: item.desc || 'Prepaid Product'
        };

        const isTelkomsel = brand.includes('telkomsel') || brand.includes('simpati') || brand.includes('as') || brand.includes('by.u') || brand.includes('byu') ||
            name.includes('telkomsel') || name.includes('simpati') || name.includes('kartu as') || name.includes('by.u') || name.includes('byu') ||
            sku.includes('telkomsel') || sku.includes('tsel');

        const isIndosat = brand.includes('indosat') || brand.includes('im3') || brand.includes('mentari') ||
            name.includes('indosat') || name.includes('im3') || name.includes('mentari') ||
            sku.includes('indosat') || sku.includes('isat');

        const isXL = brand.includes('xl') || brand.includes('axis') ||
            name.includes('xl') || name.includes('axis') ||
            sku.includes('xl') || sku.includes('axis');

        const isTri = brand.includes('three') || brand.includes('tri') ||
            name.includes('three') || name.includes('tri') ||
            sku.includes('three') || sku.includes('tri');

        const isSmartfren = brand.includes('smartfren') ||
            name.includes('smartfren') ||
            sku.includes('smartfren') || sku.includes('sf');

        if (category.includes('aktif') || category.includes('masa')) {
            if (isTelkomsel) products.aktif.telkomsel.push(formatted);
            else if (isIndosat) products.aktif.indosat.push(formatted);
            else if (isXL) products.aktif.xl.push(formatted);
            else if (isTri) products.aktif.tri.push(formatted);
            else if (isSmartfren) products.aktif.smartfren.push(formatted);
        } else if (category.includes('pulsa')) {
            if (isTelkomsel) products.pulsa.telkomsel.push(formatted);
            else if (isIndosat) products.pulsa.indosat.push(formatted);
            else if (isXL) products.pulsa.xl.push(formatted);
            else if (isTri) products.pulsa.tri.push(formatted);
            else if (isSmartfren) products.pulsa.smartfren.push(formatted);
        } else if (category.includes('data') || category.includes('paket') || category.includes('internet') || category.includes('kuota')) {
            if (isTelkomsel) products.data.telkomsel.push(formatted);
            else if (isIndosat) products.data.indosat.push(formatted);
            else if (isXL) products.data.xl.push(formatted);
            else if (isTri) products.data.tri.push(formatted);
            else if (isSmartfren) products.data.smartfren.push(formatted);
        } else if (category.includes('pln') || brand.includes('pln')) {
            products.pln.global.push(formatted);
        } else if (category.includes('e-money') || category.includes('emoney') || category.includes('game')) {
            if (brand.includes('gopay')) products.emoney.gopay.push(formatted);
            else if (brand.includes('ovo')) products.emoney.ovo.push(formatted);
            else if (brand.includes('dana')) products.emoney.dana.push(formatted);
            else if (brand.includes('shopee')) products.emoney.shopeepay.push(formatted);
            else if (brand.includes('mobile legend') || brand.includes('mlbb')) products.game.mlbb.push(formatted);
            else if (brand.includes('free fire')) products.game.ff.push(formatted);
            else if (brand.includes('pubg')) products.game.pubg.push(formatted);
        } else if (category.includes('tv') || category.includes('parabola') || category.includes('aktif-tv')) {
            if (brand.includes('k-vision') || brand.includes('kvision')) products.tv.kvision.push(formatted);
            else if (brand.includes('nex') || brand.includes('parabola')) products.tv.nexparabola.push(formatted);
        }
    });

    const totalLoaded = Object.values(products.pulsa).flat().length + products.pln.global.length;
    return totalLoaded > 0 ? products : null;
}

module.exports = {
    applyReferralMarkup,
    findProductBySku,
    parseDigiflazzProducts
};
