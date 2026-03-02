// ===================================================================
// ARQUIVO DE TESTE DE FLUXO COMPLETO (CREATE-READ-APPLY-EVALUATE)
// ===================================================================

import 'dotenv/config';
import { memoryStorageAdapter } from './src/Platform/Storage/memoryStorage.adapter.js';

// Importando os inicializadores
import { initializeSessionService } from './src/Core/session.service.js';
import { initializeAuthStorage } from './src/Inhire/Auth/authStorage.service.js';

// Importando os orquestradores
import { performLogin } from './src/Core/Auth-Flow/authOrchestrator.js';
import { handleProfileLoad } from './src/Core/Candidate-Flow/candidateOrchestrator.js';
import { fetchOpenJobs, handleJobSelection } from './src/Core/Job-Flow/jobOrchestrator.js';
import { fetchScorecardStructure, handleScorecardSubmission } from './src/Core/Evaluation-Flow/evaluationOrchestrator.js';

// Importando o nosso logger
import { configureLogger, log, error as logError, closeLogger } from './src/utils/logger.service.js';

/**
 * Função principal que executa a simulação do fluxo de trabalho completo.
 */
async function runTestFlow() {
  // Configura o logger para escrever em arquivo
  configureLogger({ toFile: true });

  log("🚀 INICIANDO TESTE DE FLUXO COMPLETO EM AMBIENTE LOCAL 🚀");
  log("-----------------------------------------------------------\n");

  try {
    // ETAPA 0: Inicialização e Login
    log("--- ETAPA 0: Inicialização e Login ---");
    initializeSessionService(memoryStorageAdapter);
    initializeAuthStorage(memoryStorageAdapter);
    log("✅ Serviços de armazenamento inicializados com o adaptador de memória.");

    const loginResult = await performLogin();
    if (!loginResult.success) {
      throw new Error(`FALHA CRÍTICA NO LOGIN: ${loginResult.error}`);
    }
    log("✅ Login na API InHire realizado com sucesso!\n");
    
    // ETAPA 1: Usuário abre um perfil no LinkedIn (simulado)
    log("--- ETAPA 1: Processando perfil do LinkedIn ---");
    const profileResult = await handleProfileLoad();
    if (!profileResult.success) {
      throw new Error(`FALHA NA ETAPA 1: ${profileResult.error}`);
    }
    log(`✅ Talento processado: ${profileResult.talent.name} (ID: ${profileResult.talent.id})\n`);
    
    // ETAPA 2: A UI precisa exibir as vagas disponíveis
    log("--- ETAPA 2: Buscando vagas abertas ---");
    const jobsResult = await fetchOpenJobs();
    if (!jobsResult.success || jobsResult.jobs.length === 0) {
      throw new Error(`FALHA NA ETAPA 2: ${jobsResult.error || "Nenhuma vaga aberta encontrada."}`);
    }
    log(`✅ ${jobsResult.jobs.length} vagas abertas encontradas.\n`);

    // ETAPA 3: Usuário seleciona a primeira vaga da lista (simulado)
    const selectedJob = jobsResult.jobs[0];
    log("--- ETAPA 3: Usuário seleciona uma vaga ---");
    log(`Simulando seleção da vaga: "${selectedJob.name}" (ID: ${selectedJob.id})`);
    const selectionResult = await handleJobSelection(selectedJob.id);
    if (!selectionResult.success) {
      throw new Error(`FALHA NA ETAPA 3: ${selectionResult.error}`);
    }
    log(`✅ Candidatura criada com sucesso! (ID: ${selectionResult.application.id})\n`);

    // ETAPA 4: A UI busca a estrutura do scorecard para exibi-la
    log("--- ETAPA 4: Buscando estrutura do scorecard ---");
    const scorecardResult = await fetchScorecardStructure();
    if (!scorecardResult.success) {
      throw new Error(`FALHA NA ETAPA 4: ${scorecardResult.error}`);
    }
    if (!scorecardResult.scorecard) {
        log("ℹ️ Nenhuma estrutura de scorecard encontrada para esta vaga. Fluxo encerrado.");
        return; // Encerra o fluxo de forma limpa, não é um erro fatal.
    }
    log(`✅ Estrutura do scorecard "${scorecardResult.scorecard.name}" carregada.\n`);

    // ETAPA 5: Usuário preenche e envia o scorecard (simulado)
    log("--- ETAPA 5: Usuário preenche e envia o scorecard ---");
    const mockEvaluationData = {
      feedback: {
        comment: "Avaliação feita via script de teste de fluxo completo. O candidato parece promissor.",
        proceed: "YES"
      },
      privateNotes: "Teste automatizado (fluxo completo) executado com sucesso.",
      skillCategories: scorecardResult.scorecard.skillCategories.map(category => ({
        id: category.id,
        skills: category.skills.map(skill => ({
          id: skill.id,
          score: Math.floor(Math.random() * 5) + 1
        }))
      }))
    };
    const submissionResult = await handleScorecardSubmission(mockEvaluationData);
    if (!submissionResult.success) {
      throw new Error(`FALHA NA ETAPA 5: ${submissionResult.error}`);
    }
    log("✅ Avaliação enviada com sucesso!\n");

    log("-----------------------------------------------------------");
    log("🎉 TESTE DE FLUXO COMPLETO CONCLUÍDO COM SUCESSO! 🎉");

  } catch (err) {
    logError("O SCRIPT DE TESTE ENCONTROU UM ERRO FATAL E FOI INTERROMPIDO.", err.message);
  } finally {
    // Garante que o arquivo de log seja fechado, não importa o que aconteça.
    log("--- Finalizando a execução do script. Fechando o logger. ---");
    closeLogger();
  }
}

// Executa a função de teste
runTestFlow();