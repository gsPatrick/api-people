// ARQUIVO COMPLETO E ATUALIZADO: src/models/criterion.model.js

import { Model, DataTypes } from 'sequelize';
import { addOrUpdateVector, deleteVector } from '../services/vector.service.js';
import { createEmbedding } from '../services/embedding.service.js';
import { log, error as logError } from '../utils/logger.service.js';

export default (sequelize) => {
  class Criterion extends Model {}

  Criterion.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2, validate: { min: 1, max: 3 } },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    // <-- MUDANÇA: O CAMPO EMBEDDING VOLTOU, AGORA PARA POSTGRESQL
    embedding: {
      type: DataTypes.JSONB, // Usamos JSONB para armazenar o array do vetor
      allowNull: true,
    }
  }, {
    sequelize,
    modelName: 'Criterion',
    tableName: 'criteria',
    timestamps: false,
    hooks: {
      afterSave: async (criterion, options) => {
        // As importações dinâmicas não são mais necessárias aqui, pois o problema do ciclo foi resolvido.
        try {
          const textToEmbed = criterion.description || criterion.name;
          if (textToEmbed && textToEmbed.trim() !== '') {
            const embedding = await createEmbedding(textToEmbed);
            if (embedding) {
              // 1. Salva o embedding no próprio critério no PostgreSQL
              // O { hooks: false } evita um loop infinito do 'afterSave'.
              await criterion.update({ embedding }, { hooks: false, transaction: options.transaction });
              
              // 2. Sincroniza o vetor com o LanceDB
              await addOrUpdateVector(criterion.id, embedding);
            }
          }
        } catch (err) {
          logError(`HOOK (afterSave): Falha ao sincronizar o critério ${criterion.id}.`, err);
        }
      },
      afterDestroy: async (criterion, options) => {
        try {
          await deleteVector(criterion.id);
        } catch (err) {
          logError(`HOOK (afterDestroy): Falha ao remover o critério ${criterion.id} do LanceDB.`, err);
        }
      }
    }
  });

  return Criterion;
};