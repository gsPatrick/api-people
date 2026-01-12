// ARQUIVO ATUALIZADO: src/Core/Evaluation-Flow/weights.service.js (MIGRADO PARA POSTGRESQL)

import { sequelize } from '../../models/index.js';
import { log, error } from '../../utils/logger.service.js';

// Nota: A tabela 'interview_kit_weights' é criada no startup pelo cache.service.js
// ou pode ser criada aqui se necessário, mas vamos assumir que o sistema está consistente.

/**
 * Busca os pesos de todos os critérios para um kit de entrevista específico.
 * @param {string} kitId - O ID do kit de entrevista.
 * @returns {Promise<object>} Um objeto no formato { skill_id: weight, ... }.
 */
export const getWeightsForKit = async (kitId) => {
    try {
        const [rows] = await sequelize.query(
            'SELECT skill_id, weight FROM interview_kit_weights WHERE kit_id = :kitId',
            { replacements: { kitId } }
        );

        // Transforma o array de resultados em um objeto mais fácil de usar no frontend
        const weightsMap = rows.reduce((acc, row) => {
            acc[row.skill_id] = row.weight;
            return acc;
        }, {});

        return weightsMap;
    } catch (err) {
        error(`Erro ao buscar pesos para o kit ${kitId} no Postgres:`, err.message);
        return {}; // Retorna um objeto vazio em caso de erro
    }
};

/**
 * Salva ou atualiza os pesos para múltiplos critérios de um kit de entrevista.
 * @param {string} kitId - O ID do kit de entrevista.
 * @param {object} weightsData - Objeto com os pesos, ex: { 'skill_id_1': 2, 'skill_id_2': 3 }.
 * @returns {Promise<boolean>} True se for bem-sucedido, false caso contrário.
 */
export const saveWeightsForKit = async (kitId, weightsData) => {
    try {
        const transaction = await sequelize.transaction();

        try {
            for (const [skillId, weight] of Object.entries(weightsData)) {
                await sequelize.query(`
                    INSERT INTO interview_kit_weights (kit_id, skill_id, weight)
                    VALUES (:kitId, :skillId, :weight)
                    ON CONFLICT (kit_id, skill_id) 
                    DO UPDATE SET weight = :weight
                `, {
                    replacements: { kitId, skillId, weight },
                    transaction
                });
            }

            await transaction.commit();
            log(`Pesos para o kit ${kitId} salvos/atualizados com sucesso no Postgres.`);
            return true;
        } catch (txErr) {
            await transaction.rollback();
            throw txErr;
        }
    } catch (err) {
        error(`Erro ao salvar pesos para o kit ${kitId} no Postgres:`, err.message);
        return false;
    }
};