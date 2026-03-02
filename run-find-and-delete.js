import 'dotenv/config';
import { memoryStorageAdapter } from './src/Platform/Storage/memoryStorage.adapter.js';
import { initializeSessionService } from './src/Core/session.service.js';
import { initializeAuthStorage } from './src/Inhire/Auth/authStorage.service.js';
import { performLogin } from './src/Core/Auth-Flow/authOrchestrator.js';
import { handleProfileLoad, handleEditTalent, handleDeleteTalent } from './src/Core/Candidate-Flow/candidateOrchestrator.js';
import { findTalent, createTalent } from './src/Inhire/Talents/talents.service.js';
import { configureLogger, log, error as logError, closeLogger } from './src/utils/logger.service.js';


// ---- MUDANÇA IMPORTANTE: Usamos um mock diferente ----
// Este importará os dados do talento que deve existir permanentemente.
// Para isso, vamos precisar de um orquestrador que use este mock específico.
// Ou, mais simples, vamos sobrepor a função de extração aqui mesmo no teste.

import * as profileService from './src/Linkedin/profile.service.js';

// Mock dos dados do perfil permanente que esperamos encontrar.
const permanentProfileData = {
  name: "[TESTE] Candidato Mock via Script 2",
  profileUrl: "https://www.linkedin.com/in/permanent-crud-test/",
};


// Criamos nossa própria função de extração para este teste.
const permanentProfileExtractor = async () => {
  log(`Usando extrator de perfil permanente para: ${permanentProfileData.name}`);
  return permanentProfileData;
};


async function runFindUpdateDeleteTest() {
  configureLogger({ toFile: true });

  log("🚀 INICIANDO TESTE DE FLUXO RUD (READ, UPDATE, DELETE) EM TALENTO EXISTENTE 🚀");
  log("--------------------------------------------------------------------------------\n");
  
  try {
    // ---- CORREÇÃO APLICADA AQUI ----
    // GARANTIMOS QUE AMBAS AS INICIALIZAÇÕES ACONTEÇAM ANTES DE QUALQUER COISA.
    log("--- ETAPA 0: Inicialização e Login ---");
    initializeSessionService(memoryStorageAdapter);
    initializeAuthStorage(memoryStorageAdapter);
    log("✅ Serviços de armazenamento inicializados.");

    const loginResult = await performLogin();
    if (!loginResult.success) throw new Error(`FALHA CRÍTICA NO LOGIN: ${loginResult.error}`);
    log("✅ Login realizado com sucesso!\n");

    // ETAPA 1: Encontrar o talento de teste (APENAS LEITURA)
    log(`--- ETAPA 1: Buscando o talento de teste permanente: "${permanentProfileData.name}" ---`);
    const profileResult = await handleProfileLoad({ 
      findOnly: true,
      extractProfileData: permanentProfileExtractor 
    }); 
    
    if (!profileResult.success || !profileResult.talent) {
      throw new Error(`FALHA AO ENCONTRAR TALENTO: O talento de teste '${permanentProfileData.name}' não foi encontrado. Crie-o manualmente na InHire.`);
    }

    const talentId = profileResult.talent.id;
    const talentName = profileResult.talent.name;
    log(`✅ Talento de teste permanente encontrado: "${talentName}" (ID: ${talentId})\n`);

    // ETAPA 2: Atualizar os dados do talento (UPDATE)
    log(`--- ETAPA 2: Atualizando o status do talento para "BLOCKED" ---`);
    const updateResult = await handleEditTalent(talentId, { status: "BLOCKED" });
    if (!updateResult.success) throw new Error(`FALHA AO ATUALIZAR TALENTO: ${updateResult.error}`);
    log(`✅ Talento atualizado com sucesso!\n`);

    // ETAPA 3: Excluir o talento de teste (DELETE)
    log(`--- ETAPA 3: Excluindo o talento de teste (ID: ${talentId}) ---`);
    const deleteResult = await handleDeleteTalent(talentId);
    if (!deleteResult.success) throw new Error(`FALHA AO EXCLUIR TALENTO: ${deleteResult.error}`);
    log(`✅ Talento excluído com sucesso! O sistema está limpo.\n`);
    
    log("--------------------------------------------------------------------------------");
    log("🎉 TESTE DE FLUXO (READ, UPDATE, DELETE) CONCLUÍDO COM SUCESSO! 🎉");

  } catch (err) {
    logError("O SCRIPT DE TESTE ENCONTROU UM ERRO FATAL E FOI INTERROMPIDO.", err.message);
  } finally {
    log("--- Finalizando a execução do script. Fechando o logger. ---");
    closeLogger();
  }
}

runFindUpdateDeleteTest();