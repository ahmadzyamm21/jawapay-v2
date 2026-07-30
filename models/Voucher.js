const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Voucher = sequelize.define('Voucher', {
        code: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
        },
        discount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1000
        },
        type: {
            type: DataTypes.STRING, // 'flat' or 'percent'
            allowNull: false,
            defaultValue: 'flat'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        maxUse: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 100
        },
        usedCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        tableName: 'vouchers',
        timestamps: true
    });

    return Voucher;
};
