// src/models/chatConversation.model.js

import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const ChatConversation = sequelize.define('ChatConversation', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            comment: "ID do usuário dono da conversa"
        },
        title: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: 'Nova conversa',
            comment: "Título gerado pela IA a partir da primeira mensagem"
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: {},
            comment: "Metadados extras (ex: contexto, preferências)"
        }
    }, {
        tableName: 'chat_conversations',
        timestamps: true,
        indexes: [
            { fields: ['userId'] },
            { fields: ['createdAt'] }
        ]
    });

    ChatConversation.associate = (models) => {
        ChatConversation.hasMany(models.ChatMessage, {
            foreignKey: 'conversationId',
            as: 'messages',
            onDelete: 'CASCADE',
            hooks: true
        });
        ChatConversation.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user'
        });
    };

    return ChatConversation;
};
