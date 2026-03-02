import { log } from './logger.service.js';

/**
 * Serviço de cache em memória simples e otimizado.
 */
const cache = new Map();

/**
 * Obtém um valor do cache.
 * @param {string} key - A chave do cache.
 * @returns {any | null} O dado em cache ou null se não encontrado.
 */
export const getFromCache = (key) => {
  const cachedItem = cache.get(key);

  if (!cachedItem) {
    // log(`CACHE MISS: Chave "${key}" não encontrada.`); // Silenciado para depuração
    return null;
  }

  // log(`CACHE HIT: Retornando dados para a chave "${key}".`); // Silenciado para depuração
  // Retorna diretamente os dados, sem o timestamp
  return cachedItem.data;
};

/**
 * Adiciona um valor ao cache.
 * @param {string} key - A chave do cache.
 * @param {any} data - O dado a ser armazenado.
 */
export const setToCache = (key, data) => {
  const item = {
    data: data,
    timestamp: Date.now(), // Mantemos o timestamp para referência e debug
  };
  cache.set(key, item);
  // log(`CACHE SET: Dados armazenados para a chave "${key}".`); // Silenciado para depuração
};

/**
 * Limpa chaves do cache que começam com um prefixo específico.
 * @param {string} prefix - O prefixo para limpar (ex: 'talents_page_').
 */
export const clearCacheByPrefix = (prefix) => {
    log(`CACHE CLEAR: Limpando chaves que começam com "${prefix}"...`);
    let count = 0;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
            count++;
        }
    }
    log(`CACHE CLEAR: ${count} chave(s) removida(s).`);
};


// ==========================================================
// NOVAS FUNÇÕES ADICIONADAS
// ==========================================================

/**
 * Remove uma chave específica do cache.
 * Essencial para invalidar um item específico (ex: um scorecard que foi atualizado).
 * @param {string} key - A chave a ser removida.
 */
export const clearCache = (key) => {
  if (cache.has(key)) {
    cache.delete(key);
    log(`CACHE CLEAR: Chave "${key}" removida.`);
  }
};

/**
 * Limpa o cache inteiro.
 * Útil para cenários de re-sincronização total ou testes.
 */
export const flushAllCache = () => {
    cache.clear();
    log(`CACHE FLUSH: Todo o cache em memória foi limpo.`);
};