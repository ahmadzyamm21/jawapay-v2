const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Transaction = sequelize.define('Transaction', {
        id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
        },
        userId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        category: {
            type: DataTypes.STRING,
            allowNull: true
        },
        productName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        target: {
            type: DataTypes.STRING,
            allowNull: false
        },
        priceAgent: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        priceSell: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        profit: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        paymentMethod: {
            type: DataTypes.STRING,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false
        },
        sn: {
            type: DataTypes.STRING,
            allowNull: true
        },
        voucherCode: {
            type: DataTypes.STRING,
            allowNull: true
        },
        discountApplied: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0
        }
    }, {
        tableName: 'transactions',
        timestamps: true
    });

    return Transaction;
};
