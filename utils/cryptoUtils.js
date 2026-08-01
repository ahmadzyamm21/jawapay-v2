const crypto = require('crypto');

function calculateMD5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

function calculateHMAC256(string, secret) {
    return crypto.createHmac('sha256', secret).update(string).digest('hex');
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

module.exports = {
    calculateMD5,
    calculateHMAC256,
    hashPassword
};
