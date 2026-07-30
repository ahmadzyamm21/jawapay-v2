const express = require('express');
const createAuthController = require('../controllers/authController');

function createAuthRoutes({
    User,
    Transaction,
    jwt,
    JWT_SECRET,
    hashPassword,
    sendOtpEmail,
    axios,
    calculateMD5,
    DIGIFLAZZ_USERNAME,
    DIGIFLAZZ_API_KEY,
    DIGIFLAZZ_BASE_URL,
    authenticateToken,
    loginLimiter,
    otpLimiter
}) {
    const router = express.Router();

    const authController = createAuthController({
        User,
        Transaction,
        jwt,
        JWT_SECRET,
        hashPassword,
        sendOtpEmail,
        axios,
        calculateMD5,
        DIGIFLAZZ_USERNAME,
        DIGIFLAZZ_API_KEY,
        DIGIFLAZZ_BASE_URL
    });

    router.post('/register', authController.register);
    router.post('/verify-otp', otpLimiter, authController.verifyOtp);
    router.post('/resend-otp', otpLimiter, authController.resendOtp);
    router.post('/login', loginLimiter, authController.login);
    router.get('/profile', authenticateToken, authController.getProfile);
    router.post('/change-password', authenticateToken, authController.changePassword);
    router.post('/profile/update-markup', authenticateToken, authController.updateMarkup);

    return router;
}

module.exports = createAuthRoutes;
