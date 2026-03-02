// ARQUIVO ATUALIZADO: src/services/vector.service.js (MIGRADO PARA POSTGRESQL + PGVECTOR)

import { sequelize } from '../models/index.js';
import { log, error as logError } from '../utils/logger.service.js';

const CRITERIA_TABLE_NAME = 'criteria_vectors';
const VECTOR_DIMENSION = 1536; // OpenAI text-embedding-3-small

/**
 * Inicializa a extensão pgvector e a tabela de vetores no PostgreSQL.
 */
export const initializeVectorDB = async () => {
    try {
        log('--- INICIALIZAÇÃO DO VECTOR DB (PostgreSQL + pgvector) ---');

        // 1. Habilita a extensão vector
        await sequelize.query('CREATE EXTENSION IF NOT EXISTS vector');
        log('✅ Extensão pgvector verificada/habilitada.');

        // 2. Cria a tabela se não existir
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS ${CRITERIA_TABLE_NAME} (
                id SERIAL PRIMARY KEY,
                uuid TEXT NOT NULL UNIQUE,
                embedding vector(${VECTOR_DIMENSION}),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        log(`✅ Tabela '${CRITERIA_TABLE_NAME}' pronta no PostgreSQL.`);

    } catch (err) {
        logError('Falha crítica ao inicializar pgvector no PostgreSQL:', err.message);
        process.exit(1);
    }
};

/**
 * Adiciona ou atualiza um vetor.
 */
export const addOrUpdateVector = async (uuid, vector) => {
    if (!uuid || !vector) {
        logError('Tentativa de adicionar vetor com UUID ou dados nulos.');
        return;
    }
    try {
        // Formata vetor para string Postgres '[0.1, 0.2, ...]'
        const vectorStr = `[${vector.join(',')}]`;

        await sequelize.query(`
            INSERT INTO ${CRITERIA_TABLE_NAME} (uuid, embedding)
            VALUES (:uuid, :vector)
            ON CONFLICT (uuid) 
            DO UPDATE SET embedding = :vector, created_at = NOW();
        `, {
            replacements: { uuid, vector: vectorStr }
        });

        log(`[PGVECTOR] Vetor ${uuid} salvo/atualizado.`);
    } catch (err) {
        logError(`Erro ao salvar vetor ${uuid}:`, err.message);
    }
};

/**
 * Remove um vetor.
 */
export const deleteVector = async (uuid) => {
    try {
        await sequelize.query(`DELETE FROM ${CRITERIA_TABLE_NAME} WHERE uuid = :uuid`, {
            replacements: { uuid }
        });
    } catch (err) {
        logError(`Erro ao deletar vetor ${uuid}:`, err.message);
    }
};

/**
 * Busca vetores similares (Distância de Cosseno <=> )
 */
export const searchSimilarVectors = async (queryVector, limit = 5) => {
    try {
        const vectorStr = `[${queryVector.join(',')}]`;

        // Operador <=> é distância de cosseno (quanto menor melhor)
        // Mas se quisermos similaridade, ordenamos ASC pela distância.
        const [results] = await sequelize.query(`
            SELECT uuid, (embedding <=> :queryVector) as distance
            FROM ${CRITERIA_TABLE_NAME}
            ORDER BY distance ASC
            LIMIT :limit
        `, {
            replacements: { queryVector: vectorStr, limit }
        });

        return results;
    } catch (err) {
        logError('Erro na busca vetorial:', err.message);
        return [];
    }
};

// --- MÉTODOS TEMPORÁRIOS PARA PERFIL (Full Context torna isso obsoleto, mas mantendo compatibilidade) ---

// Com a estratégia Full Context, não precisamos mais criar tabelas temporárias para cada perfil.
// Mas se o código legado chamar, vamos apenas logar ou fazer um no-op seguro para evitar quebras.
// Se realmente precisar, podemos criar tabelas temporárias no Postgres, mas é custoso. 
// Dado que mudamos a estratégia para "Full Context Prompt", isso aqui é desnecessário.
// Vou manter as assinaturas para não quebrar imports, mas elas não farão nada ou logarão aviso.

export const createProfileVectorTable = async (tableName, data) => {
    log(`[PGVECTOR] createProfileVectorTable chamado para ${tableName}. Ignorando pois estamos migrando para Full Context.`);
    return { name: tableName }; // Mock return
};

export const dropProfileVectorTable = async (tableName) => {
    // No-op
};