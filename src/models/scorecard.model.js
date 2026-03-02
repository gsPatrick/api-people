// ARQUIVO COMPLETO: src/models/scorecard.model.js

import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class Scorecard extends Model {
    static associate(models) {
      this.hasMany(models.Category, {
        as: 'categories',
        foreignKey: 'scorecardId',
        onDelete: 'CASCADE',
        hooks: true,
      });
    }
  }

  Scorecard.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Vínculo com a vaga local"
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: true },
    },
    atsIntegration: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'internal',
    },
    syncStatus: {
      type: DataTypes.ENUM('SYNCHRONIZED', 'PENDING', 'FAILED'),
      defaultValue: 'PENDING'
    },
    source: {
      type: DataTypes.ENUM('LOCAL', 'INHIRE'),
      defaultValue: 'LOCAL'
    },
    isSynced: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    externalId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    }
  }, {
    sequelize,
    modelName: 'Scorecard',
    tableName: 'scorecards',
    timestamps: true,
  });

  Scorecard.associate = (models) => {
    Scorecard.hasMany(models.Category, {
      as: 'categories',
      foreignKey: 'scorecardId',
      onDelete: 'CASCADE',
      hooks: true,
    });
    Scorecard.belongsTo(models.LocalJob, {
      as: 'job',
      foreignKey: 'jobId'
    });
  };

  return Scorecard;
};