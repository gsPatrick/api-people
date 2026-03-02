// src/phantombuster/phantombuster.service.js

import axios from 'axios';
import 'dotenv/config';
// ADICIONE 'pathToFileURL' À IMPORTAÇÃO
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORREÇÃO: Converta o caminho para uma URL antes de importar
const loggerPath = path.join(__dirname, '../utils/logger.service.js');
const loggerUrl = pathToFileURL(loggerPath);
const { log, error } = await import(loggerUrl.href);


const API_BASE_URL = 'https://api.phantombuster.com/api/v2';
const API_KEY = process.env.PHANTOMBUSTER_API_KEY;
const LINKEDIN_AGENT_ID = process.env.PHANTOMBUSTER_LINKEDIN_AGENT_ID;

const CSV_PUBLIC_URL = process.env.PHANTOMBUSTER_CSV_URL || 'http://localhost:3000/data/linkedins.csv'; 

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'x-phantombuster-key': API_KEY,
    'Content-Type': 'application/json',
  },
});

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executa o agente de scraping do LinkedIn via lançamento MANUAL e aguarda sua finalização.
 * Esta função incorpora a lógica do `run-phantombuster-manual-launch.js`
 * e a lógica de espera.
 * @returns {Promise<string|null>} Retorna o containerId se a execução foi bem-sucedida, null caso contrário.
 */
export const runLinkedInScraperFromCSV = async () => {
  if (!API_KEY || !LINKEDIN_AGENT_ID) {
    error("Credenciais da Phantombuster (API Key ou Agent ID) não estão configuradas.");
    return null;
  }

  log(`--- PHANTOMBUSTER AGENT: Iniciando agente ${LINKEDIN_AGENT_ID} via lançamento MANUAL ---`);
  log(`Lembre-se: O agente no painel do Phantombuster deve estar configurado para ler de: ${CSV_PUBLIC_URL}`);

  try {
    const launchResponse = await client.post('/agents/launch', {
      id: LINKEDIN_AGENT_ID,
      manualLaunch: true
    });
    const containerId = launchResponse.data.containerId;
    if (!containerId) throw new Error("A resposta do 'launch' não retornou um containerId.");
    log(`Agente iniciado. Container ID: ${containerId}`);

    let isFinished = false;
    let attempts = 0;
    while (!isFinished && attempts < 20) {
      await wait(6000);
      attempts++;
      const containerResponse = await client.get('/containers/fetch', { params: { id: containerId } });
      const containerStatus = containerResponse.data.status;
      log(`Verificando status (Tentativa ${attempts}/20): ${containerStatus}`);
      if (containerStatus === 'finished' || containerStatus === 'finalized') {
        isFinished = true;
      } else if (containerStatus === 'failed') {
        throw new Error(`A execução do container ${containerId} falhou.`);
      }
    }
    if (!isFinished) throw new Error("Tempo limite de espera pela finalização do agente excedido.");
    
    log("--- PHANTOMBUSTER AGENT: Execução concluída com sucesso. ---");
    return containerId;

  } catch (err) {
    const errorMessage = err.response?.data?.error || err.message;
    error("Erro ao executar o agente da Phantombuster:", errorMessage);
    return null;
  }
};