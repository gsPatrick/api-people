// src/models/chatMessage.model.js

import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const ChatMessage = sequelize.define('ChatMessage', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        conversationId: {
            type: DataTypes.UUID,
            allowNull: false,
            comment: "ID da conversa"
        },
        role: {
            type: DataTypes.ENUM('user', 'assistant', 'system', 'tool'),
            allowNull: false,
            comment: "Papel da mensagem no contexto do chat"
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: "Conteúdo textual da mensagem"
        },
        toolCalls: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: "Array de tool_calls feitas pelo assistant"
        },
        toolCallId: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: "ID do tool_call que esta mensagem responde (role=tool)"
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: {},
            comment: "Tokens usados, latência, modelo, etc"
        }
    }, {
        tableName: 'chat_messages',
        timestamps: true,
        indexes: [
            { fields: ['conversationId'] },
            { fields: ['role'] },
            { fields: ['createdAt'] }
        ]
    });

    ChatMessage.associate = (models) => {
        ChatMessage.belongsTo(models.ChatConversation, {
            foreignKey: 'conversationId',
            as: 'conversation'
        });
    };

    return ChatMessage;
};
