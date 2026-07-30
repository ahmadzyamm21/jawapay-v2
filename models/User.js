const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'temp@jawapay.com'
        },
        isVerified: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        verificationToken: {
            type: DataTypes.STRING,
            allowNull: true
        },
        otpCode: {
            type: DataTypes.STRING,
            allowNull: true
        },
        otpExpires: {
            type: DataTypes.DATE,
            allowNull: true
        },
        balance: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 500000
        },
        markupFlat: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1500
        },
        role: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'agent'
        },
        uplineId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        referralMarkup: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        tableName: 'users',
        timestamps: true
    });

    return User;
};
