// src/Inhire/Talents/talents.service.js

import apiClient from '../inhireCore.js';
const API_BASE_URL = 'https://api.inhire.app';
import { log, error } from '../../utils/logger.service.js';



// Mover findTalent para o topo para ser usada por createTalent
export const findTalent = async (filters) => {
  // log(`--- SERVIÇO: Buscando talento com filtros: ${JSON.stringify(filters)} ---`);
  try {
    let hasMorePages = true;
    let exclusiveStartKey = null;
    const limitPerPage = 50;

    while (hasMorePages) {
      const response = await getAllTalentsPaginated(limitPerPage, exclusiveStartKey);
      if (!response || !response.items) {
        // Se a paginação falhou, não podemos continuar
        break;
      }

      const foundInPage = response.items.find(t => {
        const normalizedFilterUsername = filters.linkedinUsername ? filters.linkedinUsername.toLowerCase().replace(/\/+$/, '') : null;
        const normalizedTalentUsername = t.linkedinUsername ? t.linkedinUsername.toLowerCase().replace(/\/+$/, '') : null;

        return normalizedFilterUsername && normalizedTalentUsername === normalizedFilterUsername;
      });

      if (foundInPage) {
        // log(`Talento encontrado via findTalent: ${foundInPage.name}`);
        return foundInPage;
      }

      if (response.exclusiveStartKey) {
        exclusiveStartKey = response.exclusiveStartKey;
      } else {
        hasMorePages = false;
      }
    }

    // log("Nenhum talento encontrado com os filtros fornecidos após varrer todas as páginas.");
    return null;
  } catch (err) {
    error(`Erro ao buscar talento com filtros ${JSON.stringify(filters)}:`, err.response?.data?.message || err.message);
    return null;
  }
};

export const createTalent = async (talentData) => {
  // log("Criando novo talento com os dados:", talentData);
  if (!talentData.linkedinUsername && !talentData.email) {
    error("O nome de usuário do LinkedIn (linkedinUsername) ou o email é obrigatório para criar um talento.");
    return null;
  }
  try {
    const response = await apiClient.post(`${API_BASE_URL}/talents`, talentData);
    // log("Talento criado com sucesso:", response.data);
    return response.data;
  } catch (err) {
    // 409 Conflict: Talento já existe
    if (err.response?.status === 409 || err.message?.includes('already exists')) {
      // log(`Talento ${talentData.linkedinUsername} já existe na InHire. Buscando ID...`);
      const existingTalent = await findTalent({ linkedinUsername: talentData.linkedinUsername });
      if (existingTalent) {
        // log(`Talento existente recuperado: ${existingTalent.id}`);
        return existingTalent;
      }
    }
    error("Erro ao criar talento:", err.response?.data?.message || err.message);
    return null;
  }
};

export const updateTalent = async (talentId, updateData) => {
  // log(`Atualizando talento ${talentId} com os dados:`, updateData);
  try {
    await apiClient.patch(`${API_BASE_URL}/talents/${talentId}`, updateData);
    // log("Talento atualizado com sucesso.");
    return true;
  } catch (err) {
    error("Erro ao atualizar talento:", err.response?.data?.message || err.message);
    return false;
  }
};

export const deleteTalent = async (talentId) => {
  // log(`Removendo talento ${talentId}`);
  try {
    await apiClient.delete(`${API_BASE_URL}/talents/${talentId}`);
    // log("Talento removido com sucesso.");
    return true;
  } catch (err) {
    error("Erro ao remover talento:", err.response?.data?.message || err.message);
    return false;
  }
}

export const getAllTalentsPaginated = async (limit = 20, exclusiveStartKey = null) => {
  // log(`Buscando uma página de talentos (limite de ${limit}).`);
  try {
    const requestBody = {
      orderBy: {
        field: "createdAt",
        direction: "desc"
      }
    };
    if (exclusiveStartKey) {
      requestBody.exclusiveStartKey = exclusiveStartKey;
    }
    const response = await apiClient.post(`${API_BASE_URL}/talents/paginated`, requestBody);
    return response.data;
  } catch (err) {
    error("Erro ao buscar página de talentos:", err.response?.data?.message || err.message);
    return null;
  }
};

export const getTalentById = async (talentId) => {
  // log(`--- SERVIÇO: Buscando detalhes do talento ID: ${talentId} ---`);
  try {
    const response = await apiClient.get(`${API_BASE_URL}/talents/${talentId}`);
    return response.data;
  } catch (err) {
    error(`Erro ao buscar talento ${talentId} na InHire:`, err.response?.data?.message || err.message);
    return null;
  }
};

// REMOVIDO: A função getApplicationsForTalent é removida deste serviço.
// A lógica de obtenção de candidaturas voltará a ser tratada
// dentro do orchestrator fetchTalentDetails, usando talentData.jobs (propriedade do talento).
// findTalent moved to top