// ARQUIVO ATUALIZADO: src/Platform/Cache/cache.service.js (MIGRADO PARA POSTGRESQL)

import { sequelize } from '../../models/index.js';
import { log, error } from '../../utils/logger.service.js';

// Inicializa as tabelas de CACHE no PostgreSQL se não existirem
const initializeCacheTables = async () => {
    try {
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS cache_profiles (
                linkedin_username TEXT PRIMARY KEY,
                scraped_data TEXT NOT NULL,
                last_scraped_at BIGINT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Nota: A tabela 'users' geralmente deve ser um Model do Sequelize separado.
        // Se este arquivo estava gerenciando 'users', vamos criar a tabela aqui para garantir compatibilidade,
        // mas idealmente deveria ser refatorado para um model src/models/user.model.js
        await sequelize.query(`
             CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS interview_kit_weights (
                kit_id TEXT NOT NULL,
                skill_id TEXT NOT NULL,
                weight INTEGER NOT NULL DEFAULT 2,
                PRIMARY KEY (kit_id, skill_id)
            );
        `);

        log('✅ Tabelas de cache (PostgreSQL) verificadas/criadas com sucesso.');
    } catch (err) {
        error('Erro ao inicializar tabelas de cache no Postgres:', err.message);
    }
};

// Chama a inicialização (pode ser movido para startServer se preferir controle explícito)
initializeCacheTables();

/**
 * Busca um perfil no cache do PostgreSQL.
 */
export const getCachedProfile = async (linkedinUsername) => {
    try {
        const [results] = await sequelize.query(
            'SELECT scraped_data, last_scraped_at FROM cache_profiles WHERE linkedin_username = :username',
            { replacements: { username: linkedinUsername } }
        );

        if (results.length > 0) {
            const row = results[0];
            return {
                profile: JSON.parse(row.scraped_data),
                lastScrapedAt: parseInt(row.last_scraped_at)
            };
        }
        return null;
    } catch (err) {
        error("Erro ao buscar perfil no cache Postgres:", err.message);
        return null; // Falha graceful
    }
};

/**
 * Salva ou atualiza um perfil no cache do PostgreSQL.
 */
export const saveCachedProfile = async (linkedinUsername, profileData) => {
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
                data: JSON.stringify(profileData),
                ts: Date.now()
            }
        });

        log(`Perfil de "${linkedinUsername}" salvo/atualizado no cache Postgres.`);
        return true;
    } catch (err) {
        error("Erro ao salvar perfil no cache Postgres:", err.message);
        return false;
    }
};

/**
 * Verifica o status do cache para um perfil.
 */
export const getCacheStatus = async (linkedinUsername) => {
    try {
        const [results] = await sequelize.query(
            'SELECT last_scraped_at FROM cache_profiles WHERE linkedin_username = :username',
            { replacements: { username: linkedinUsername } }
        );

        if (results.length > 0) {
            return { hasCache: true, lastScrapedAt: parseInt(results[0].last_scraped_at) };
        }
        return { hasCache: false, lastScrapedAt: null };
    } catch (err) {
        error("Erro ao verificar status do cache Postgres:", err.message);
        return { hasCache: false, lastScrapedAt: null };
    }
};

// Exporta um objeto mock db para compatibilidade se algum outro arquivo importar 'default db'
// mas idealmente os consumidores devem usar as funções exportadas.
export default {
    prepare: () => { throw new Error("Método prepare() do SQLite não suportado no Postgres adapter."); },
    exec: () => { /* no-op ou log warning */ }
};