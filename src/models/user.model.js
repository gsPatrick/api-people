// ARQUIVO COMPLETO: src/models/user.model.js

import { Model, DataTypes } from 'sequelize';

export default (sequelize) => {
  class User extends Model {
    static associate(models) {
      // Defina associações aqui se houver, por exemplo:
      // this.hasMany(models.SomeOtherModel, { foreignKey: 'userId', as: 'relatedItems' });
    }
  }

  User.init({
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
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'user', // Pode ser 'user' ou 'admin'
    },
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true, // Adiciona campos createdAt e updatedAt
  });

  return User;
};