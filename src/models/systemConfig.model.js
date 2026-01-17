import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const SystemConfig = sequelize.define('SystemConfig', {
        key: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        tableName: 'system_configs',
        timestamps: true
    });

    return SystemConfig;
};
