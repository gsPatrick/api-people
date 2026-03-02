import _ from 'lodash';
import { getFromCache, setToCache } from './cache.service.js';
import { log, error as logError } from './logger.service.js';

/**
 * Cria um mapa de consulta otimizado para a busca de talentos por username.
 * @param {Array} talentList - A lista de talentos.
 * @returns {Map<string, object>} Um mapa onde a chave é o username do LinkedIn e o valor é o objeto do talento.
 */
const createTalentLookupMap = (talentList) => {
    const lookupMap = new Map();
    if (!Array.isArray(talentList)) return lookupMap;

    for (const talent of talentList) {
        if (talent.linkedinUsername) {
            const normalizedUsername = talent.linkedinUsername.toLowerCase().replace(/\/+$/, '');
            lookupMap.set(normalizedUsername, talent);
        }
    }
    return lookupMap;
};


/**
 * Realiza uma sincronização diferencial inteligente para uma entidade no cache.
 * Compara a lista nova com a antiga e aplica apenas as diferenças.
 * @param {string} cacheKey A chave do cache a ser sincronizada.
 * @param {Function} fetchFunction A função assíncrona que busca a lista completa de dados frescos.
 */
export const syncEntityCache = async (cacheKey, fetchFunction) => {
  // log(`--- SYNC SERVICE (${cacheKey}): Iniciando sincronização diferencial ---`); // Silenciado para depuração
  try {
    const fetchResult = await fetchFunction();
    if (!fetchResult.success) {
      logError(`SYNC SERVICE (${cacheKey}): Falha ao buscar novos dados. Mantendo cache antigo.`, fetchResult.error);
      return;
    }

    const newList = fetchResult.jobs || fetchResult.talents || []; // Adaptável para diferentes entidades
    const oldList = getFromCache(cacheKey) || [];

    // Se o cache está vazio, simplesmente preenchemos.
    if (oldList.length === 0) {
      setToCache(cacheKey, newList);
      // log(`SYNC SERVICE (${cacheKey}): Cache inicializado com ${newList.length} itens.`); // Silenciado para depuração
      
      // Cria o mapa de consulta para talentos na primeira carga.
      if (cacheKey === 'all_talents') {
        const talentMap = createTalentLookupMap(newList);
        setToCache('talent_lookup_map', talentMap);
        // log(`SYNC SERVICE: Mapa de consulta de talentos (talent_lookup_map) criado com ${talentMap.size} entradas.`); // Silenciado para depuração
      }
      return;
    }

    // Mapeia as listas por ID para comparação eficiente (O(n) em vez de O(n^2))
    const oldMap = _.keyBy(oldList, 'id');
    const newMap = _.keyBy(newList, 'id');

    let added = 0;
    let updated = 0;
    const final_list = [...oldList]; // Começa com uma cópia da lista antiga

    // Verifica por itens adicionados ou atualizados
    for (const newItem of newList) {
      const oldItem = oldMap[newItem.id];
      if (!oldItem) {
        // Item novo, adiciona ao início da lista final
        final_list.unshift(newItem);
        added++;
      } else if (newItem.updatedAt > oldItem.updatedAt) {
        // Item existente foi atualizado, substitui na lista final
        const index = final_list.findIndex(item => item.id === newItem.id);
        if (index !== -1) {
          final_list[index] = newItem;
        }
        updated++;
      }
    }
    
    // Verifica por itens removidos
    const removedItems = oldList.filter(oldItem => !newMap[oldItem.id]);
    let removed = 0;
    if (removedItems.length > 0) {
        const removedIds = new Set(removedItems.map(item => item.id));
        _.remove(final_list, item => removedIds.has(item.id));
        removed = removedItems.length;
    }

    if (added > 0 || updated > 0 || removed > 0) {
      setToCache(cacheKey, final_list);
      // log(`SYNC SERVICE (${cacheKey}): Sincronização concluída. Adicionados: ${added}, Atualizados: ${updated}, Removidos: ${removed}. Total: ${final_list.length} itens.`); // Silenciado para depuração

      // Recria o mapa de consulta se houver qualquer alteração nos talentos.
      if (cacheKey === 'all_talents') {
        const talentMap = createTalentLookupMap(final_list);
        setToCache('talent_lookup_map', talentMap);
        // log(`SYNC SERVICE: Mapa de consulta de talentos (talent_lookup_map) ATUALIZADO com ${talentMap.size} entradas.`); // Silenciado para depuração
      }

    } else {
      // log(`SYNC SERVICE (${cacheKey}): Nenhuma mudança detectada. Cache está atualizado.`); // Silenciado para depuração
    }

  } catch (err) {
    logError(`SYNC SERVICE (${cacheKey}): Erro crítico durante a sincronização.`, err.message);
  }
};