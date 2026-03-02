// ARQUIVO COMPLETO: src/models/category.model.js

import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class Category extends Model {
    static associate(models) {
      this.belongsTo(models.Scorecard, {
        foreignKey: 'scorecardId',
        as: 'scorecard',
      });

      this.hasMany(models.Criterion, {
        as: 'criteria',
        foreignKey: 'categoryId',
        onDelete: 'CASCADE',
        hooks: true,
      });
    }
  }

  Category.init({
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
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    }
  }, {
    sequelize,
    modelName: 'Category',
    tableName: 'categories',
    timestamps: false,
  });

  return Category;
};