import axios from 'axios';
import 'dotenv/config';
import { log, error } from '../utils/logger.service.js';

const API_BASE_URL = 'https://api.phantombuster.com/api/v2';
const API_KEY = process.env.PHANTOMBUSTER_API_KEY;

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'x-phantombuster-key':'BFAfx8ngxCH6dufBPcjuxaZrMnrpCvEKHH5LgaiMVgc',
    'Content-Type': 'application/json',
  },
});


/**
 * Busca a lista de leads mais recentes da Phantombuster e depois filtra
 * em memória para encontrar um lead específico pelo SLUG do perfil.
 * @param {string} profileUrl - A URL completa do perfil do LinkedIn.
 * @returns {Promise<object|null>} O objeto do lead se encontrado.
 */
export const findLeadByProfileUrl = async (profileUrl) => {
  log(`--- BUSCA DE LEAD (ESTRATÉGIA FINAL E FUNCIONAL) ---`);
  log(`Procurando por: ${profileUrl}`);

  try {
    const requestBody = {
      filter: { and: [] },
      paginationOptions: { paginationSize: 100 }, // Pegamos um lote grande
      withCompanies: true
    };
    
    log("Buscando a lista de leads mais recentes...");
    const response = await client.post('/org-storage/leads/search', requestBody);

    // ---- CORREÇÃO 1: Acessar a resposta como um array ----
    const allLeads = response.data;
    if (!allLeads || !Array.isArray(allLeads)) {
        throw new Error("A resposta da API não foi um array de leads como esperado.");
    }
    
    log(`Recebidos ${allLeads.length} leads. Agora filtrando em memória pelo SLUG...`);

    // ---- CORREÇÃO 2: Buscar pelo SLUG ----
    const slugToFind = profileUrl.split('/in/')[1]?.replace('/', '');
    if (!slugToFind) {
      throw new Error("Não foi possível extrair o slug da URL do perfil.");
    }

    const foundLead = allLeads.find(lead => lead.linkedinProfileSlug === slugToFind);

    if (foundLead) {
      log("SUCESSO! Lead encontrado pelo slug na lista da Phantombuster.");
      return foundLead;
    } else {
      log("AVISO: Nenhum lead correspondente encontrado na lista dos mais recentes.");
      return null;
    }

  } catch (err) {
    error("Erro crítico ao buscar e filtrar leads na Phantombuster:", err.response?.data || err.message);
    return null;
  }
};