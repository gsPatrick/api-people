// scripts/test-profile-extraction.js

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Importando os serviços necessários
import { appendProfileToCSV } from './src/utils/csvHandler.service.js';
import { runLinkedInScraperFromCSV } from './src/phantombuster/phantombuster.service.js';
import { findLeadByProfileUrl } from './src/phantombuster/leads.service.js';
import { saveDebugDataToFile } from './src/utils/debug.service.js';
import { log, error, configureLogger } from './src/utils/logger.service.js';

// --- CONFIGURAÇÃO DO TESTE ---

// URL ESTÁTICA: Coloque aqui a URL de um perfil público do LinkedIn para testar.
// Exemplo: 'https://www.linkedin.com/in/williamhgates/'
const TEST_PROFILE_URL = 'https://www.linkedin.com/in/satyanadella/';

// Nome do arquivo onde a saída bruta do scraping será salva.
const OUTPUT_FILENAME = 'scraped_data_output.txt';

// --- FIM DA CONFIGURAÇÃO ---

/**
 * Função principal que orquestra o teste.
 */
const runTest = async () => {
  log('--- INICIANDO SCRIPT DE TESTE DE EXTRAÇÃO DE PERFIL ---');
  
  try {
    // 1. Adicionar a URL de teste ao arquivo CSV
    log(`Passo 1/4: Adicionando URL de teste ao CSV: ${TEST_PROFILE_URL}`);
    await appendProfileToCSV(TEST_PROFILE_URL);
    log('URL adicionada ao CSV com sucesso.');

    // 2. Executar o agente do Phantombuster
    log('Passo 2/4: Iniciando o agente Phantombuster para ler o CSV e extrair os dados...');
    const containerId = await runLinkedInScraperFromCSV();
    if (!containerId) {
      throw new Error('A execução do agente da Phantombuster falhou. Verifique os logs e as credenciais.');
    }
    log(`Agente Phantombuster executado com sucesso. Container ID: ${containerId}`);

    // 3. Buscar os dados do lead extraído
    log('Passo 3/4: Buscando os dados extraídos (lead) na Phantombuster...');
    const leadData = await findLeadByProfileUrl(TEST_PROFILE_URL);
    if (!leadData) {
      throw new Error(`Não foi possível encontrar o lead para a URL ${TEST_PROFILE_URL} após a execução do agente.`);
    }
    log('Dados do lead encontrados com sucesso!');

    // 4. Salvar a saída bruta em um arquivo de texto para análise
    log(`Passo 4/4: Salvando os dados brutos do lead no arquivo: debug_logs/${OUTPUT_FILENAME}`);
    saveDebugDataToFile(OUTPUT_FILENAME, leadData);
    log(`Os dados completos foram salvos. Por favor, inspecione o arquivo "debug_logs/${OUTPUT_FILENAME}".`);

    log('--- SCRIPT DE TESTE CONCLUÍDO COM SUCESSO ---');

  } catch (err) {
    error('Ocorreu um erro crítico durante a execução do script de teste:', err.message);
    process.exit(1); // Termina o processo com um código de erro
  }
};

// Configura o logger e inicia o script
configureLogger({ toFile: true }); // Habilita o log em arquivo (test-run.log)
runTest();