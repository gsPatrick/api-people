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
    weightType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'normal',
      comment: 'Tipo de peso interno: normal, priority (2x), essential (imprescindível)'
    },
    tag: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Tag descritiva para critérios imprescindíveis (exibida na borda vermelha)'
    },
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
      afterSave: (criterion, options) => {
        // Dispara o processamento de forma assíncrona (non-blocking) para não amarrar a transação do banco de dados
        // que pode estourar um timeout (ex: atualizar 20 critérios = 20 chamadas longas na OpenAI).
        setTimeout(async () => {
          try {
            const textToEmbed = criterion.description || criterion.name;
            if (textToEmbed && textToEmbed.trim() !== '') {
              const embedding = await createEmbedding(textToEmbed);
              if (embedding) {
                // Removemos o envio da transaction atual pois ela provavelmente já concluiu
                await criterion.update({ embedding }, { hooks: false });
                await addOrUpdateVector(criterion.id, embedding);
              }
            }
          } catch (err) {
            logError(`HOOK (afterSave): Falha ao sincronizar o critério ${criterion.id}.`, err);
          }
        }, 0);
      },
      afterDestroy: (criterion, options) => {
        setTimeout(async () => {
          try {
            await deleteVector(criterion.id);
          } catch (err) {
            logError(`HOOK (afterDestroy): Falha ao remover o critério ${criterion.id} do LanceDB.`, err);
          }
        }, 0);
      }
    }
  });

  return Criterion;
};