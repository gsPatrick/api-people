// src/models/chatSetting.model.js
// Configurações de chat por usuário (ex: sugestões de mensagens)

import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const ChatSetting = sequelize.define('ChatSetting', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: 'ID do usuário proprietário destas configs'
        },
        suggestions: {
            type: DataTypes.JSONB,
            defaultValue: [
                "📊 Quantas vagas temos abertas?",
                "👥 Liste os últimos candidatos",
                "🔍 Buscar candidatos com score alto",
                "📋 Quais scorecards temos?"
            ],
            allowNull: false
        },
        metadata: {
            type: DataTypes.JSONB,
            defaultValue: {},
            allowNull: true
        }
    }, {
        tableName: 'chat_settings',
        timestamps: true
    });

    ChatSetting.associate = (models) => {
        if (models.User) {
            ChatSetting.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
        }
    };

    return ChatSetting;
};
