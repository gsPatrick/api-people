
import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const LocalTalent = sequelize.define('LocalTalent', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        headline: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        linkedinUsername: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        phone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        location: {
            type: DataTypes.STRING,
            allowNull: true
        },
        externalId: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: "ID do talento no sistema externo (InHire)"
        },
        syncStatus: {
            type: DataTypes.ENUM('PENDING', 'SYNCED', 'ERROR'),
            defaultValue: 'PENDING',
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('NEW', 'REJECTED', 'ACTIVE', 'HIRED'),
            defaultValue: 'NEW',
            allowNull: false
        },
        data: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: "Payload completo extraído do perfil (Scraper/PDF)"
        },
        matchScore: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: "Pontuação geral de match mais recente"
        }
    }, {
        tableName: 'local_talents',
        timestamps: true,
        indexes: [
            {
                fields: ['externalId']
            },
            {
                fields: ['linkedinUsername']
            },
            {
                fields: ['syncStatus']
            }
        ]
    });

    LocalTalent.associate = (models) => {
        LocalTalent.hasMany(models.LocalApplication, {
            foreignKey: 'talentId',
            as: 'applications'
        });
    };

    return LocalTalent;
};
