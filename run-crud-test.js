import 'dotenv/config';
// Corrija os imports aqui, se necessário
import { memoryStorageAdapter } from './src/Platform/Storage/memoryStorage.adapter.js'; 
import { initializeSessionService } from './src/Core/session.service.js';
import { initializeAuthStorage } from './src/Inhire/Auth/authStorage.service.js';
import { performLogin } from './src/Core/Auth-Flow/authOrchestrator.js';
import { handleProfileLoad, handleDeleteTalent } from './src/Core/Candidate-Flow/candidateOrchestrator.js';
import { configureLogger, log, error as logError, closeLogger } from './src/utils/logger.service.js';

// ---- URL DE TESTE REAL ----
const PROFILE_URL_TO_TEST = "https://www.linkedin.com/in/patrick-siqueira-2833a4264/";

async function runRealPhantomTest() {
  configureLogger({ toFile: true });

  log("🚀 INICIANDO TESTE DE INTEGRAÇÃO REAL COM PHANTOMBUSTER 🚀");
  log("------------------------------------------------------------------\n");
  
  try {
    // ETAPA 0: Login
    log("--- ETAPA 0: Inicialização e Login ---");
    initializeSessionService(memoryStorageAdapter);
    initializeAuthStorage(memoryStorageAdapter);
    const loginResult = await performLogin();
    if (!loginResult.success) throw new Error(`FALHA CRÍTICA NO LOGIN: ${loginResult.error}`);
    log("✅ Login realizado com sucesso!\n");

    // ETAPA 1: Processar o perfil via PhantomBuster e criar na InHire
    log(`--- ETAPA 1: Processando a URL: ${PROFILE_URL_TO_TEST} ---`);
    // Usamos o modo padrão (automático), que vai criar o talento se não o encontrar.
    const profileResult = await handleProfileLoad(PROFILE_URL_TO_TEST);
    
    if (!profileResult.success || !profileResult.talent) {
      throw new Error(`FALHA AO PROCESSAR PERFIL: ${profileResult.error}`);
    }

    const talentId = profileResult.talent.id;
    const talentName = profileResult.talent.name;
    log(`✅ Talento "${talentName}" processado com sucesso (ID: ${talentId})\n`);

    // ETAPA 2: Excluir o talento para limpar o ambiente
    log(`--- ETAPA 2: Excluindo o talento de teste (ID: ${talentId}) ---`);
    const deleteResult = await handleDeleteTalent(talentId);
    if (!deleteResult.success) throw new Error(`FALHA AO EXCLUIR TALENTO: ${deleteResult.error}`);
    log(`✅ Talento excluído com sucesso! O sistema está limpo.\n`);
    
    log("------------------------------------------------------------------");
    log("🎉 TESTE DE INTEGRAÇÃO COM PHANTOMBUSTER CONCLUÍDO COM SUCESSO! 🎉");

  } catch (err) {
    logError("O SCRIPT DE TESTE ENCONTROU UM ERRO FATAL E FOI INTERROMPIDO.", err.message);
  } finally {
    log("--- Finalizando a execução do script. Fechando o logger. ---");
    closeLogger();
  }
}

runRealPhantomTest();