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

  return Scorecard;
};