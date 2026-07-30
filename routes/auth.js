const express = require('express');

function createAuthRoutes({
    User,
    jwt,
    JWT_SECRET,
    otpLimiter
}) {
    const router = express.Router();

    const createAuthController = require('../controllers/authController');

    const authController = createAuthController({
        User,
        jwt,
        JWT_SECRET
    });

    router.post(
        '/verify-otp',
        otpLimiter,
        authController.verifyOtp
    );

    return router;
}

module.exports = createAuthRoutes;