// src/models/knowledgeModel.model.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const KnowledgeModel = sequelize.define('KnowledgeModel', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    }, {
        tableName: 'knowledge_models',
        timestamps: true
    });

    KnowledgeModel.associate = (models) => {
        KnowledgeModel.hasMany(models.KnowledgeEntry, {
            foreignKey: 'modelId',
            as: 'entries',
            onDelete: 'CASCADE'
        });
    };

    return KnowledgeModel;
};
