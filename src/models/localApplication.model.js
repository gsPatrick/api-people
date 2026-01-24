
import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const LocalApplication = sequelize.define('LocalApplication', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        stage: {
            type: DataTypes.STRING,
            defaultValue: 'Applied',
            allowNull: false
        },
        matchScore: {
            type: DataTypes.FLOAT,
            allowNull: true,
            comment: "Nota de match para esta vaga específica"
        },
        aiReview: {
            type: DataTypes.JSONB,
            allowNull: true,
            comment: "Armazena o resultado da avaliação da IA, feedback, justificativas"
        }
    }, {
        tableName: 'local_applications',
        timestamps: true
    });

    LocalApplication.associate = (models) => {
        LocalApplication.belongsTo(models.LocalTalent, {
            foreignKey: 'talentId',
            as: 'talent'
        });
        LocalApplication.belongsTo(models.LocalJob, {
            foreignKey: 'jobId',
            as: 'job'
        });
    };

    return LocalApplication;
};
