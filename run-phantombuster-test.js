import 'dotenv/config';
import { extractProfileData } from './src/Linkedin/profile.service.js';
import { configureLogger, log, error as logError, closeLogger } from './src/utils/logger.service.js';


// ===================================================================
// ARQUIVO DE TESTE PARA A INTEGRAÇÃO COM A PHANTOMBUSTER
// ===================================================================


async function runPhantombusterTest() {
  // Configura o logger para gerar o arquivo 'test-run.log'
  configureLogger({ toFile: true });

  log("🚀 INICIANDO TESTE DE EXTRAÇÃO DE PERFIL COM PHANTOMBUSTER 🚀");
  log("------------------------------------------------------------------\n");

  try {
    // Chama a função principal que agora está em modo de diagnóstico.
    const profileData = await extractProfileData();

    if (profileData) {
      log("\n✅ SUCESSO! A extração da Phantombuster foi concluída (do ponto de vista do fluxo).");
      log("\n--- DADOS DO PERFIL EXTRAÍDO E FORMATADO (RESULTADO DA TENTATIVA 1) ---");
      log(JSON.stringify(profileData, null, 2));
      log("\n--------------------------------------------------------------\n");
    } else {
      throw new Error("A função extractProfileData não retornou dados. Verifique os logs de diagnóstico acima.");
    }

    log("🎉 TESTE DE DIAGNÓSTICO DA PHANTOMBUSTER CONCLUÍDO! 🎉");
    log("Verifique o arquivo 'test-run.log' para ver as 3 respostas brutas da API.");

  } catch (err) {
    logError("O SCRIPT DE TESTE DA PHANTOMBUSTER ENCONTROU UM ERRO.", err.message);
  } finally {
    log("--- Finalizando a execução do script. ---");
    closeLogger();
  }
}

// Inicia a execução do teste
runPhantombusterTest();