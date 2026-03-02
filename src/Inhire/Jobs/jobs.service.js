import apiClient from '../inhireCore.js';
import { log, error } from '../../utils/logger.service.js';

const API_BASE_URL = 'https://api.inhire.app';

/**
 * Busca TODAS as vagas da API, iterando sobre a paginação internamente de forma robusta.
 * @returns {Promise<Array<object>|null>} Uma lista completa de todas as vagas.
 */
export const getAllJobs = async () => {
  log(`--- SERVIÇO: Buscando TODAS as vagas com paginação interna ---`);
  let allJobs = [];
  let hasMorePages = true;
  let exclusiveStartKey = null;

  try {
    while (hasMorePages) {
      const payload = { limit: 100 };
      if (exclusiveStartKey) {
        // No ENVIO da requisição, a chave é 'exclusiveStartKey'
        payload.exclusiveStartKey = exclusiveStartKey;
      }
      
      const response = await apiClient.post(`${API_BASE_URL}/jobs/paginated/lean`, payload);
      const pageItems = response.data.results;
      
      if (pageItems?.length > 0) {
        allJobs.push(...pageItems);
      }

      // ==========================================================
      // CORREÇÃO DEFINITIVA: A API retorna a chave da próxima página
      // como 'startKey', e não 'exclusiveStartKey'.
      // ==========================================================
      const nextPageKey = response.data.startKey;

      if (nextPageKey && Object.keys(nextPageKey).length > 0) {
        exclusiveStartKey = nextPageKey; // Prepara a chave correta para a próxima iteração
        log(`Página de vagas recebida. Chave para a próxima página encontrada. Total atual: ${allJobs.length}`);
      } else {
        hasMorePages = false; // Se a chave 'startKey' não for retornada, o loop para.
      }
    }
    log(`Busca completa. Total final de ${allJobs.length} vagas carregadas da API.`);
    return allJobs;
  } catch (err) {
    error("Erro ao buscar todas as vagas:", err.response?.data || err.message);
    return null;
  }
};

/**
 * Busca as tags de uma vaga específica.
 * @param {string} jobId - O ID da vaga.
 * @returns {Promise<Array<object>|null>} Uma lista de tags.
 */
export const getJobTags = async (jobId) => {
    log(`--- SERVIÇO: Buscando tags para a vaga ${jobId} ---`);
    try {
        const response = await apiClient.get(`${API_BASE_URL}/jobs/${jobId}/tags`);
        return response.data || [];
    } catch (err) {
        error(`Erro ao buscar tags da vaga ${jobId}:`, err.response?.data || err.message);
        return null;
    }
};

/**
 * Obtém os detalhes de uma vaga específica.
 * @param {string} jobId - O ID da vaga.
 * @returns {Promise<object | null>} Os detalhes da vaga.
 */
export const getJobDetails = async (jobId) => {
    log(`Buscando detalhes da vaga ID: ${jobId}`);
    try {
        const response = await apiClient.get(`${API_BASE_URL}/jobs/${jobId}`);
        return response.data;
    } catch (err) {
        log(`Erro ao buscar detalhes da vaga ${jobId}:`, err.response?.data || err.message);
        return null;
    }
}