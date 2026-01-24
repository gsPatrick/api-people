
import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const LocalJob = sequelize.define('LocalJob', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        externalId: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: "ID da vaga no sistema externo (InHire)"
        },
        status: {
            type: DataTypes.ENUM('OPEN', 'CLOSED', 'DRAFT'),
            defaultValue: 'DRAFT'
        },
        isSynced: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'local_jobs',
        timestamps: true,
        indexes: [
            {
                fields: ['externalId']
            }
        ]
    });

    LocalJob.associate = (models) => {
        LocalJob.hasMany(models.LocalApplication, {
            foreignKey: 'jobId',
            as: 'applications'
        });
    };

    return LocalJob;
};
