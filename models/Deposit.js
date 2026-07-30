const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Deposit = sequelize.define('Deposit', {
        id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
        },
        userId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        amount: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        uniqueCode: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        totalAmount: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        bankName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'Pending' // Pending, Sukses, Batal
        },
        qrUrl: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        tableName: 'deposits',
        timestamps: true
    });

    return Deposit;
};
