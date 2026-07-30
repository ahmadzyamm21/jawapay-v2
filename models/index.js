const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'sqlite';
let sequelize;

if (dialect === 'sqlite') {
    const storagePath = process.env.DB_STORAGE || './database/pulsaku.sqlite';
    // Ensure parent dir exists for sqlite
    const resolvedPath = path.resolve(storagePath);
    const fs = require('fs');
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: resolvedPath,
        logging: false // Disable logging for cleaner console
    });
} else {
    // For production PostgreSQL/MySQL
    sequelize = new Sequelize(process.env.DB_CONNECTION_STRING, {
        dialect: dialect,
        logging: false,
        dialectOptions: dialect === 'postgres' ? {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        } : {}
    });
}

const db = {};
db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Import models
db.User = require('./User')(sequelize);
db.Transaction = require('./Transaction')(sequelize);
db.Voucher = require('./Voucher')(sequelize);
db.Setting = require('./Setting')(sequelize);
db.Deposit = require('./Deposit')(sequelize);

// Define associations
db.User.hasMany(db.Transaction, { foreignKey: 'userId', as: 'transactions', onDelete: 'CASCADE' });
db.Transaction.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

db.User.hasMany(db.Deposit, { foreignKey: 'userId', as: 'deposits', onDelete: 'CASCADE' });
db.Deposit.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

db.User.hasMany(db.User, { foreignKey: 'uplineId', as: 'downlines', onDelete: 'SET NULL' });
db.User.belongsTo(db.User, { foreignKey: 'uplineId', as: 'upline' });

module.exports = db;
