// src/models/aimemory.model.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const AIMemory = sequelize.define('AIMemory', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        term: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true
            }
        },
        definition: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                notEmpty: true
            }
        }
    }, {
        tableName: 'ai_memories',
        timestamps: true
    });

    return AIMemory;
};
