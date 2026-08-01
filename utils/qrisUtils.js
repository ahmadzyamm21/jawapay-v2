function calculateQrisCrc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        let x = ((crc >> 8) ^ str.charCodeAt(i)) & 0xFF;
        x ^= x >> 4;
        crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ 0) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function makeDynamicQris(staticQris, amount) {
    let base = staticQris.slice(0, -8);
    const amountStr = amount.toString();
    const lenStr = amountStr.length.toString().padStart(2, '0');
    const amountTag = `54${lenStr}${amountStr}`;
    const tag53Idx = base.indexOf('5303360');
    if (tag53Idx !== -1) {
        const insertPos = tag53Idx + '5303360'.length;
        base = base.slice(0, insertPos) + amountTag + base.slice(insertPos);
    } else {
        base = base + amountTag;
    }
    base = base + '6304';
    const checksum = calculateQrisCrc16(base);
    return base + checksum;
}

module.exports = {
    calculateQrisCrc16,
    makeDynamicQris
};
