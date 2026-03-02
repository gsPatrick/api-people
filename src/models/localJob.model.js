
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
            type: DataTypes.ENUM('OPEN', 'CLOSED', 'DRAFT', 'PAUSED', 'CANCELED'),
            defaultValue: 'DRAFT'
        },
        source: {
            type: DataTypes.ENUM('LOCAL', 'INHIRE'),
            defaultValue: 'LOCAL'
        },
        syncStatus: {
            type: DataTypes.ENUM('SYNCHRONIZED', 'PENDING', 'FAILED'),
            defaultValue: 'PENDING'
        },
        isSynced: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        data: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: "Snapshot completo dos dados do InHire ou metadados locais"
        },
        areaId: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: "ID do departamento/area no InHire"
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
        LocalJob.hasMany(models.Scorecard, {
            foreignKey: 'jobId',
            as: 'scorecards'
        });
    };

    return LocalJob;
};
