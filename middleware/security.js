const helmet = require('helmet');

function applySecurityMiddleware(app) {
    app.disable('x-powered-by');

    app.use(
        helmet({
            contentSecurityPolicy: false
        })
    );
}

module.exports = applySecurityMiddleware;