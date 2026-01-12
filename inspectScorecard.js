// inspectScorecard.js

import 'dotenv/config'; // Para carregar variáveis de ambiente do arquivo .env
import axios from 'axios'; // Dependência para os serviços de auth

// --- SERVIÇOS NECESSÁRIOS DO SEU PROJETO ---
// (Assumindo que este script está na raiz do projeto e os fontes em /src)
import { configureLogger, log, error } from './src/utils/logger.service.js';
import { initializeAuthStorage } from './src/Inhire/Auth/authStorage.service.js';
import { memoryStorageAdapter } from './src/utils/memoryStorage.adapter.js';
import { performLogin } from './src/Core/Auth/authOrchestrator.js';
import { getScorecardSummaryForApplication } from './src/Inhire/Scorecards/scorecards.service.js';


// ===================================================================
// CONFIGURAÇÃO: Insira aqui o ID da candidatura que você quer testar
// ===================================================================
// Pode ser passado via linha de comando: node inspectScorecard.js <UUID>
const JOB_TALENT_ID_PARA_TESTAR = process.argv[2] || 'COLE_O_ID_DA_CANDIDATURA_AQUI';
// ===================================================================


/**
 * Função principal que orquestra o teste.
 */
async function runInspection() {
  log(`--- INICIANDO SCRIPT DE INSPEÇÃO DE SCORECARD ---`);

  if (!JOB_TALENT_ID_PARA_TESTAR || JOB_TALENT_ID_PARA_TESTAR === 'COLE_O_ID_DA_CANDIDATURA_AQUI') {
    error("ERRO CRÍTICO: Por favor, forneça o ID da candidatura como argumento.");
    console.log("Exemplo de uso: node inspectScorecard.js <UUID>");
    return;
  }

  // 1. Autenticar na API InHire
  log("Passo 1: Autenticando na InHire...");
  const loginResult = await performLogin();
  if (!loginResult.success) {
    error("Falha ao autenticar. Verifique suas credenciais no arquivo .env.", loginResult.error);
    return;
  }
  log("Autenticação bem-sucedida.");

  // 2. Chamar o serviço para buscar o resumo do scorecard
  log(`Passo 2: Buscando resumo do scorecard para a candidatura ID: ${JOB_TALENT_ID_PARA_TESTAR}`);
  const scorecardData = await getScorecardSummaryForApplication(JOB_TALENT_ID_PARA_TESTAR);

  // 3. Analisar e exibir a resposta
  log("Passo 3: Analisando a resposta da API...");
  if (scorecardData === null) {
    log("A API retornou 'null'. Isso pode significar que não há scorecard para esta candidatura ou ocorreu um erro 404 (não encontrado), o que é um comportamento esperado em alguns casos.");
  } else if (typeof scorecardData === 'string') {
    log("⚠️ ATENÇÃO: A API retornou uma STRING!");
    console.log("==================== CONTEÚDO DA STRING BRUTA ====================");
    console.log(scorecardData);
    console.log("==================================================================");
    log("Isto confirma a suspeita de que a resposta pode ser HTML ou outro texto não-JSON.");
  } else if (typeof scorecardData === 'object') {
    log("✅ SUCESSO: A API retornou um objeto JSON, como esperado.");
    console.log("==================== RESPOSTA EM JSON (FORMATADO) ====================");
    console.log(JSON.stringify(scorecardData, null, 2));
    console.log("======================================================================");
  } else {
    log(`Tipo de dado inesperado recebido: ${typeof scorecardData}`);
    console.log("==================== DADOS BRUTOS RECEBIDOS ====================");
    console.log(scorecardData);
    console.log("================================================================");
  }

  log("--- SCRIPT DE INSPEÇÃO CONCLUÍDO ---");
}

// --- Bootstrap e Execução ---
(async () => {
  // Configura um logger simples para o console
  configureLogger({ toFile: false });

  // Inicializa o serviço de armazenamento de tokens em memória
  initializeAuthStorage(memoryStorageAdapter);

  // Executa a função principal
  await runInspection();
})();