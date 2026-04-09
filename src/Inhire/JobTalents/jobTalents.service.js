// src/Inhire/JobTalents/jobTalents.service.js

import apiClient from '../inhireCore.js';
import { log, error } from '../../utils/logger.service.js';

const API_BASE_URL = 'https://api.inhire.app';

export const addTalentToJob = async (jobId, talentId, source = 'manual') => {
  log(`Adicionando talento ${talentId} à vaga ${jobId}`);
  try {
    const response = await apiClient.post(`${API_BASE_URL}/job-talents/${jobId}/talents`, {
      talentId: talentId,
      source: source,
    });
    log("Talento adicionado à vaga com sucesso:", response.data);
    return response.data;
  } catch (err) {
    error(`Erro ao adicionar talento à vaga ${jobId}:`, err.response?.data || err.message);
    return null;
  }
};


export const removeApplication = async (applicationId) => {
  log(`Removendo candidatura ${applicationId}`);
  try {
    await apiClient.delete(`${API_BASE_URL}/job-talents/talents/${applicationId}`);
    log("Candidatura removida com sucesso.");
    return true;
  } catch (err) {
    error("Erro ao remover candidatura:", err.response?.data?.message || err.message);
    return false;
  }
};

export const getApplicationsForJob = async (jobId) => {
  // log(`--- SERVIÇO: Buscando TODAS as candidaturas para a vaga ${jobId} ---`);
  let allApplications = [];
  let hasMorePages = true;
  let exclusiveStartKey = null;

  try {
    while (hasMorePages) {
      const body = {};
      if (exclusiveStartKey) body.exclusiveStartKey = exclusiveStartKey;

      const response = await apiClient.post(`${API_BASE_URL}/job-talents/${jobId}/talents/paginated/lean`, body);

      const pageItems = response.data.items || response.data.jobTalents || [];

      if (pageItems.length > 0) {
        allApplications.push(...pageItems);
      }

      const nextKey = response.data.exclusiveStartKey || response.data.exclusiveStartkey;

      if (nextKey) {
        exclusiveStartKey = nextKey;
      } else {
        hasMorePages = false;
      }
    }
    // log(`Busca completa. Total de ${allApplications.length} candidaturas carregadas para a vaga ${jobId}.`);
    return allApplications;
  } catch (err) {
    error(`Erro ao buscar candidaturas para a vaga ${jobId}:`, err.response?.data?.message || err.message);
    return null;
  }
};

// ==========================================================
// CORREÇÃO E SIMPLIFICAÇÃO APLICADAS
// ==========================================================


export const updateApplication = async (applicationId, updateData) => {
  log(`--- SERVIÇO: Atualizando candidatura ${applicationId} ---`);
  try {
    const response = await apiClient.patch(`${API_BASE_URL}/job-talents/talents/${applicationId}`, updateData);
    return response.data;
  } catch (err) {
    error(`Erro ao atualizar candidatura ${applicationId}:`, err.response?.data?.message || err.message);
    return null; // Retornar null em caso de falha.
  }
};

// ==========================================================
// NOVA FUNÇÃO ADICIONADA AQUI
// ==========================================================
/**
 * Busca os detalhes de UMA candidatura específica, dado o ID da vaga e do talento.
 * Endpoint: GET /job-talents/:jobId/talents/:talentId
 * @param {string} jobId - O ID da vaga.
 * @param {string} talentId - O ID do talento.
 * @returns {Promise<object|null>} Os detalhes da candidatura.
 */
export const getJobTalent = async (jobId, talentId) => {
  log(`Buscando detalhes da candidatura (JobTalent) para o talento ${talentId} na vaga ${jobId}`);
  try {
    const response = await apiClient.get(`${API_BASE_URL}/job-talents/${jobId}/talents/${talentId}`);
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      log(`Candidatura não encontrada para talento ${talentId} na vaga ${jobId}.`);
      return null;
    }
    error(`Erro ao buscar detalhes da candidatura para o talento ${talentId} na vaga ${jobId}:`, err.response?.data?.message || err.message);
    return null;
  }
};