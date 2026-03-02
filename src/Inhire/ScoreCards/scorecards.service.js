// src/Inhire/Scorecards/scorecards.service.js

import apiClient from '../inhireCore.js';
import { log, error } from '../../utils/logger.service.js';

const API_BASE_URL = 'https://api.inhire.app';

/**
 * Busca o resumo das entrevistas de um candidato em uma vaga.
 * Endpoint: GET /forms/scorecards/jobTalent/:jobTalentId
 */
export const getScorecardSummaryForApplication = async (jobTalentId) => {
  log(`--- SERVIÇO: Buscando resumo de scorecard para a candidatura ${jobTalentId} ---`);
  try {
    const response = await apiClient.get(`${API_BASE_URL}/forms/scorecards/jobTalent/${jobTalentId}`);
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
        log(`Nenhum resumo de scorecard encontrado para a candidatura ${jobTalentId}.`);
        return null; // Retorna null para 404, que não é um erro de sistema
    }
    // Para todos os outros erros (incluindo o de autorização), loga e retorna null
    error(`Erro ao buscar resumo de scorecard para ${jobTalentId}:`, err.response?.data || err.message);
    return null;
  }
};

/**
 * Busca todos os Kits de Entrevista associados a uma vaga.
 * Endpoint: GET /forms/scorecards/interviews/job/:jobId
 */
export const getInterviewKitsForJob = async (jobId) => {
  log(`--- SERVIÇO: Buscando kits de entrevista para a vaga ${jobId} ---`);
  try {
    const response = await apiClient.get(`${API_BASE_URL}/forms/scorecards/interviews/job/${jobId}`);
    return response.data || [];
  } catch (err) {
    error(`Erro ao buscar kits de entrevista para a vaga ${jobId}:`, err.response?.data || err.message);
    return null;
  }
};

/**
 * Submete as respostas de um scorecard.
 * Endpoint: POST /forms/scorecards/jobTalent/:jobTalentId/:scorecardInterviewId
 */
export const submitScorecardResponse = async (jobTalentId, scorecardInterviewId, responseData) => {
    log(`--- SERVIÇO: Submetendo scorecard para a candidatura ${jobTalentId} ---`);
    try {
        const response = await apiClient.post(
            `${API_BASE_URL}/forms/scorecards/jobTalent/${jobTalentId}/${scorecardInterviewId}`,
            responseData
        );
        return response.data;
    } catch (err) {
        error(`Erro ao submeter scorecard:`, err.response?.data || err.message);
        return null;
    }
};

/**
 * Cria um Scorecard base para uma Vaga.
 * Endpoint: POST /forms/scorecards/jobs
 */
export const createJobScorecard = async (jobId, skillCategories) => {
    log(`--- SERVIÇO: Criando scorecard para a vaga ${jobId} ---`);
    try {
        const payload = { jobId, skillCategories };
        const response = await apiClient.post(`${API_BASE_URL}/forms/scorecards/jobs`, payload);
        return response.data;
    } catch (err) {
        error(`Erro ao criar scorecard para a vaga ${jobId}:`, err.response?.data || err.message);
        return null;
    }
};

/**
 * Cria um Kit de Entrevista.
 * Endpoint: POST /forms/scorecards/interviews
 */
export const createInterviewKit = async (kitData) => {
    log(`--- SERVIÇO: Criando kit de entrevista para a vaga ${kitData.jobId} ---`);
    try {
        const response = await apiClient.post(`${API_BASE_URL}/forms/scorecards/interviews`, kitData);
        return response.data;
    } catch (err) {
        error(`Erro ao criar kit de entrevista:`, err.response?.data || err.message);
        return null;
    }
};

/**
 * Busca os detalhes de um Kit de Entrevista específico pelo seu ID.
 * Endpoint: GET /forms/scorecards/interviews/:id
 */
export const getInterviewKitById = async (kitId) => {
  log(`--- SERVIÇO: Buscando detalhes do kit de entrevista ${kitId} ---`);
  try {
    const response = await apiClient.get(`${API_BASE_URL}/forms/scorecards/interviews/${kitId}`);
    return response.data;
  } catch (err) {
    error(`Erro ao buscar kit de entrevista ${kitId}:`, err.response?.data || err.message);
    return null;
  }
};