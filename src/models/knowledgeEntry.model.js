// src/models/knowledgeEntry.model.js
import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const KnowledgeEntry = sequelize.define('KnowledgeEntry', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        modelId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'knowledge_models',
                key: 'id'
            }
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        keywords: {
            type: DataTypes.JSONB, // Armazena array de strings
            defaultValue: []
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {}
        }
    }, {
        tableName: 'knowledge_entries',
        timestamps: true
    });

    KnowledgeEntry.associate = (models) => {
        KnowledgeEntry.belongsTo(models.KnowledgeModel, {
            foreignKey: 'modelId',
            as: 'model'
        });
    };

    return KnowledgeEntry;
};
