// ARQUIVO ATUALIZADO: src/Platform/Storage/localCache.service.js (MIGRADO PARA POSTGRESQL)

import { sequelize } from '../../models/index.js';
import { log, error } from '../../utils/logger.service.js';

// Nota: A tabela usada aqui ('cache_profiles') é a mesma do cache.service.js,
// consolidando o armazenamento.

/**
 * Inicializa a conexão (No-op no endpoint Postgres, pois já está conectado via models).
 */
export const initializeCache = () => {
    log('✅ Conectado ao cache centralizado (PostgreSQL) para raw profiles.');
};

/**
 * Salva ou atualiza os dados brutos de um perfil no cache.
 * @param {string} linkedinUsername - O username do LinkedIn.
 * @param {object} rawData - O objeto JSON completo do scraping.
 */
export const saveRawProfile = async (linkedinUsername, rawData) => {
    if (!linkedinUsername) return Promise.reject('Username inválido.');

    try {
        await sequelize.query(`
            INSERT INTO cache_profiles (linkedin_username, scraped_data, last_scraped_at, updated_at)
            VALUES (:username, :data, :ts, NOW())
            ON CONFLICT (linkedin_username) 
            DO UPDATE SET 
                scraped_data = :data, 
                last_scraped_at = :ts,
                updated_at = NOW();
        `, {
            replacements: {
                username: linkedinUsername,
                data: JSON.stringify(rawData),
                ts: Date.now()
            }
        });

        log(`💾 Perfil bruto de ${linkedinUsername} salvo/atualizado no cache Postgres.`);
        return Promise.resolve();
    } catch (err) {
        error(`Erro ao salvar perfil ${linkedinUsername} no Postgres:`, err.message);
        return Promise.reject(err);
    }
};

/**
 * Busca os dados brutos de um perfil do cache.
 * @param {string} linkedinUsername - O username do LinkedIn.
 * @returns {Promise<object|null>} O objeto do perfil parseado ou null.
 */
export const getRawProfile = async (linkedinUsername) => {
    if (!linkedinUsername) return Promise.reject('Username inválido.');

    try {
        const [results] = await sequelize.query(
            'SELECT scraped_data FROM cache_profiles WHERE linkedin_username = :username',
            { replacements: { username: linkedinUsername } }
        );

        if (results.length > 0) {
            log(`HIT: Perfil bruto de ${linkedinUsername} encontrado no cache Postgres.`);
            return JSON.parse(results[0].scraped_data);
        } else {
            log(`MISS: Perfil bruto de ${linkedinUsername} NÃO encontrado no cache Postgres.`);
            return null;
        }
    } catch (err) {
        error(`Erro ao buscar perfil ${linkedinUsername} do cache Postgres:`, err.message);
        return Promise.reject(err);
    }
};