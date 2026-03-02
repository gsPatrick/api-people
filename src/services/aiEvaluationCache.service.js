// ARQUIVO COMPLETO: src/services/aiEvaluationCache.service.js

import { log } from '../utils/logger.service.js';

/**
 * Serviço de cache em memória para armazenar temporariamente as avaliações geradas pela IA.
 * A chave é composta (ex: 'talentId_jobId') para identificar unicamente uma sessão de avaliação.
 * Este cache é volátil, o que significa que será limpo se a aplicação for reiniciada.
 */
const evaluationCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos de vida para cada avaliação em cache

/**
 * Guarda uma avaliação da IA no cache em memória.
 * Inclui um timestamp de expiração para limpeza automática.
 * @param {string} key - A chave única da sessão (ex: `${talentId}_${jobId}`).
 * @param {object} evaluationData - Os dados completos da avaliação da IA, incluindo as notas e as evidências (chunks).
 */
export const setEvaluationToCache = (key, evaluationData) => {
    if (!key || !evaluationData) {
        log('CACHE IA WARN: Tentativa de salvar avaliação em cache com chave ou dados nulos.');
        return;
    }
    const expiresAt = Date.now() + CACHE_TTL_MS;
    evaluationCache.set(key, { data: evaluationData, expiresAt });
    log(`CACHE IA SET: Avaliação para a chave "${key}" armazenada. Expira em 30 minutos.`);
};

/**
 * Obtém uma avaliação da IA do cache em memória.
 * Retorna null se a chave não for encontrada ou se o item tiver expirado.
 * Se um item expirado for encontrado, ele é removido do cache.
 * @param {string} key - A chave única da sessão.
 * @returns {object | null} Os dados da avaliação ou null.
 */
export const getEvaluationFromCache = (key) => {
    if (!key) return null;

    const cachedItem = evaluationCache.get(key);

    if (!cachedItem) {
        log(`CACHE IA MISS: Chave "${key}" não encontrada no cache.`);
        return null;
    }

    // Verifica se o item no cache expirou
    if (Date.now() > cachedItem.expiresAt) {
        log(`CACHE IA EXPIRED: Chave "${key}" expirou. Removendo do cache.`);
        evaluationCache.delete(key);
        return null;
    }
    
    log(`CACHE IA HIT: Retornando avaliação para a chave "${key}".`);
    return cachedItem.data;
};

/**
 * Remove explicitamente uma avaliação do cache, geralmente após ela ter sido usada para gerar o feedback.
 * @param {string} key - A chave da avaliação a ser removida.
 */
export const clearEvaluationFromCache = (key) => {
    if (!key) return;
    
    const wasDeleted = evaluationCache.delete(key);
    if (wasDeleted) {
        log(`CACHE IA CLEAR: Avaliação para a chave "${key}" removida do cache após uso.`);
    }
};

/**
 * Função de limpeza periódica para remover itens expirados e evitar vazamento de memória.
 * Pode ser chamada em um setInterval no server.js se o volume de avaliações for muito alto,
 * mas a verificação no 'get' já lida com a maioria dos casos.
 */
export const cleanExpiredEvaluations = () => {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, value] of evaluationCache.entries()) {
        if (now > value.expiresAt) {
            evaluationCache.delete(key);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        log(`CACHE IA CLEANUP: Limpeza periódica removeu ${cleanedCount} avaliações expiradas.`);
    }
};

// Exemplo de como usar a limpeza periódica (opcional):
// No seu server.js, você poderia adicionar:
// import { cleanExpiredEvaluations } from './src/services/aiEvaluationCache.service.js';
// setInterval(cleanExpiredEvaluations, 60 * 60 * 1000); // Limpa a cada hora