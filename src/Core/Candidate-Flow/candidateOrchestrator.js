// ARQUIVO COMPLETO: src/Core/Candidate-Flow/candidateOrchestrator.js

import { createTalent, deleteTalent, updateTalent } from '../../Inhire/Talents/talents.service.js';
import { addTalentToJob, updateApplication } from '../../Inhire/JobTalents/jobTalents.service.js';
import { getJobDetails } from '../../Inhire/Jobs/jobs.service.js';
import { getCustomFieldsForEntity } from '../../Inhire/CustomDataManager/customDataManager.service.js';
// Importa o novo mapeador de IA no lugar do antigo.
import { mapProfileToCustomFieldsWithAI } from './aiDataMapper.service.js';
import { getFromCache, setToCache, clearCacheByPrefix } from '../../utils/cache.service.js';
import { log, error } from '../../utils/logger.service.js';
import { saveCachedProfile } from '../../Platform/Cache/cache.service.js';

const TALENTS_CACHE_KEY = 'all_talents';

const extractUsernameFromUrl = (url) => {
  if (!url) return null;
  try {
    const urlObject = new URL(url);
    const pathParts = urlObject.pathname.split('/').filter(part => part !== '');
    if (pathParts[0] === 'in' && pathParts[1]) { return pathParts[1]; }
    return null;
  } catch (e) {
    const match = url.match(/linkedin\.com\/in\/([^/]+)/);
    return match ? match[1] : null;
  }
};

export const validateProfile = async (profileUrl) => {
  // log(`--- ORQUESTRADOR: Iniciando VALIDAÇÃO OTIMIZADA (MAPA) para: ${profileUrl} ---`);
  try {
    const usernameToSearch = extractUsernameFromUrl(profileUrl);
    if (!usernameToSearch) {
      throw new Error("Não foi possível extrair um nome de usuário válido da URL do LinkedIn.");
    }
    const talentLookupMap = getFromCache('talent_lookup_map');
    if (talentLookupMap) {
      const talentInMap = talentLookupMap.get(usernameToSearch.toLowerCase());
      if (talentInMap) {
        // log(`Validação Otimizada (MAP HIT): Talento "${talentInMap.name}" JÁ EXISTE.`);
        return { success: true, exists: true, talent: talentInMap, profileData: null };
      }
    } else {
      const allTalentsFromCache = getFromCache(TALENTS_CACHE_KEY) || [];
      const talentInCache = allTalentsFromCache.find(t => t.linkedinUsername?.toLowerCase().replace(/\/+$/, '') === usernameToSearch.toLowerCase());
      if (talentInCache) {
        // log(`Validação (FALLBACK HIT): Talento "${talentInCache.name}" JÁ EXISTE.`);
        return { success: true, exists: true, talent: talentInCache, profileData: null };
      }
    }
    // log(`Validação Otimizada (MISS): Talento não encontrado na base.`);
    return { success: true, exists: false, talent: null, profileData: null };
  } catch (err) {
    error("Erro em validateProfile:", err.message);
    return { success: false, error: err.message };
  }
};


import db from '../../models/index.js';
import SyncService from '../../services/sync.service.js';

const { LocalTalent } = db; // REMOVIDO: Destruturação no topo causa erro se models ainda não carregaram

export const handleConfirmCreation = async (talentData, jobId, externalMatchData = null) => {
  try {
    // [REMOVED] if (!jobId) throw new Error("O ID da Vaga (jobId) é obrigatório.");
    // Agora o jobId é opcional para permitir salvamento no "Banco de Talentos" (Rejeitados)

    // Se o matchData não veio por argumento, busca dentro do payload (para rotas unificadas)
    const matchData = externalMatchData || talentData.matchData;

    // === PASSO 0: Garantir que a Vaga (LocalJob) exista localmente ===
    // Se for uma vaga externa (InHire) que nunca foi sincronizada, precisamos criar o stub local
    // para satisfazer a foreign key da LocalApplication.
    const existingJob = await db.LocalJob.findByPk(jobId);
    if (!existingJob) {
      // log(`⚠️ LocalJob ${jobId} não encontrada. Tentando buscar detalhes externos para criar stub...`);
      try {
        const jobDetails = await getJobDetails(jobId);
        if (jobDetails) {
          await db.LocalJob.create({
            id: jobId, // Forçamos o ID para bater com o UUID externo
            title: jobDetails.name,
            description: jobDetails.description || '',
            externalId: jobId,
            status: 'OPEN', // Assumimos aberta se veio da API
            isSynced: true
          });
          // log(`✅ Stub LocalJob criado para vaga externa: ${jobDetails.name} (${jobId})`);
        } else {
          // Se não achou na API, talvez seja erro de ID ou permissão.
          // Mas não podemos bloquear se o usuário forçou.
          // log(`❌ Vaga não encontrada na API InHire. Prosseguindo, mas pode dar erro de FK se o ID for inválido.`);
        }
      } catch (jobErr) {
        error(`Erro ao buscar/criar stub de vaga externa: ${jobErr.message}`);
        // Continuamos, pois o erro original de FK vai acontecer e ser tratado no catch global se falhar
      }
    }

    // === PASSO 1: Persistência Local (FIND OR CREATE / UPSERT) ===
    // Verifica primeiro se já existe para evitar erro de UNIQUE constraint
    let localTalent = await db.LocalTalent.findOne({
      where: { linkedinUsername: talentData.linkedinUsername }
    });

    if (localTalent) {
      // log(`⚡ Talento '${talentData.linkedinUsername}' já existe. Atualizando dados...`);
      await localTalent.update({
        name: talentData.name || talentData.nome || localTalent.name, // Prioriza novo, fallback antigo
        headline: talentData.headline || talentData.titulo || localTalent.headline,
        email: talentData.email || localTalent.email,
        phone: talentData.phone || localTalent.phone,
        location: talentData.location || localTalent.location,
        data: { ...localTalent.data, ...talentData }, // Merge de dados
        status: talentData.status || localTalent.status, // Atualiza status se enviado (ex: REJECTED)
        matchScore: matchData?.result?.overallScore || localTalent.matchScore
      });
    } else {
      // log(`🌱 Criando NOVO talento local: ${talentData.linkedinUsername}`);
      localTalent = await db.LocalTalent.create({
        name: talentData.name || talentData.nome || 'Nome Desconhecido',
        headline: talentData.headline || talentData.titulo,
        linkedinUsername: talentData.linkedinUsername,
        email: talentData.email,
        phone: talentData.phone,
        location: talentData.location,
        data: talentData,
        syncStatus: 'PENDING',
        status: talentData.status || 'NEW',
        matchScore: matchData?.result?.overallScore || null
      });
    }

    // === PASSO 1.5: Criar LocalApplication (Apenas se houver JobId) ===
    if (jobId) {
      const [application, created] = await db.LocalApplication.findOrCreate({
        where: { jobId, talentId: localTalent.id },
        defaults: {
          stage: talentData.status === 'REJECTED' ? 'REJECTED' : 'Applied',
          matchScore: matchData?.result?.overallScore || 0,
          evaluationResult: matchData?.result ? {
             ...matchData.result,
             jobName: matchData.jobName || "Vaga Selecionada",
             evaluatedAt: new Date().toISOString()
          } : null
        }
      });

      if (created) {
        // log(`✅ Nova LocalApplication criada para a vaga ${jobId}`);
      } else {
        // log(`ℹ️ LocalApplication já existia para vaga ${jobId}. Atualizando match se necessário.`);
        const updateData = {};
        if (matchData && matchData.result) {
          updateData.matchScore = matchData.result.overallScore;
          updateData.evaluationResult = {
            ...matchData.result,
            jobName: matchData.jobName || "Vaga Selecionada",
            evaluatedAt: new Date().toISOString()
          };
        }
        if (talentData.status === 'REJECTED') {
          updateData.stage = 'REJECTED';
        }
        
        if (Object.keys(updateData).length > 0) {
          await application.update(updateData);
        }
      }
    } else {
      // log(`ℹ️ Ignorando criação de aplicação: Nenhum jobId fornecido.`);
    }

    // === PASSO 2: Disparar Sincronização em Background (FIRE AND FORGET) ===
    SyncService.triggerBackgroundSync(localTalent.id, jobId);

    // === PASSO 3: Mapeamento com IA (Background Local) ===
    mapAndEnrichLocalTalent(localTalent, talentData).catch(err => {
      error(`Erro no enriquecimento background de ${localTalent.id}:`, err);
    });

    // log("🚀 Processo de persistência concluído. Retornando talento.");
    return { success: true, talent: localTalent };

  } catch (err) {
    error("Erro em handleConfirmCreation:", err.message);
    if (err.errors) {
      err.errors.forEach(e => {
        error(`Detalhamento do erro: Campo=${e.path}, Valor=${e.value}, Tipo=${e.type}, Mensagem=${e.message}`);
      });
      const detail = err.errors.map(e => `${e.path}: ${e.message}`).join(', ');
      return { success: false, error: `Erro de Validação: ${detail}` };
    }
    return { success: false, error: err.message };
  }
};


/**
 * Função auxiliar para enriquecer o talento local com IA sem travar a resposta principal.
 */
const mapAndEnrichLocalTalent = async (localTalent, talentData) => {
  // log("Iniciando mapeamento de campos personalizados com IA (Background Local)...");
  const jobTalentFieldsDefinitions = await getCustomFieldsForEntity('JOB_TALENTS');

  const { talentPayload, customFieldsPayload } = await mapProfileToCustomFieldsWithAI(talentData, jobTalentFieldsDefinitions);

  // Atualizamos o registro local com os dados limpos extraídos pela IA
  await localTalent.update({
    name: talentPayload.name || localTalent.name,
    headline: talentPayload.headline || localTalent.headline,
    location: talentPayload.location || localTalent.location,
    // Se tivéssemos colunas para custom fields locais, salvaríamos aqui.
    // Por enquanto, salvamos no blob 'data' enriquecido ou apenas logamos.
    // O SyncService, se rodar DEPOIS disso, poderia pegar os dados enriquecidos.
    // TODO: Persistir customFieldsPayload em LocalApplication se necessário.
  });

  // log("Talento local enriquecido com dados da IA.");
};

export const handleEditTalent = async (talentId, updateData) => {
  log(`--- ORQUESTRADOR: Editando talento ${talentId} ---`);
  try {
    if (!talentId || !updateData) throw new Error("ID do talento e dados de atualização são obrigatórios.");
    const success = await updateTalent(talentId, updateData);
    if (!success) throw new Error("Falha ao atualizar talento na InHire.");

    const cachedTalents = getFromCache(TALENTS_CACHE_KEY);
    if (cachedTalents) {
      const index = cachedTalents.findIndex(t => t.id === talentId);
      if (index !== -1) {
        cachedTalents[index] = { ...cachedTalents[index], ...updateData };
        setToCache(TALENTS_CACHE_KEY, cachedTalents);
        log(`CACHE UPDATE: Talento ID '${talentId}' atualizado no cache.`);
      }
    }
    return { success: true, message: "Talento atualizado com sucesso." };
  } catch (err) {
    error("Erro em handleEditTalent:", err.message);
    return { success: false, error: err.message };
  }
};

export const handleDeleteTalent = async (talentId) => {
  log(`--- ORQUESTRADOR: Deletando talento ${talentId} ---`);
  try {
    // 1. Busca o talento localmente para obter o ID externo (InHire)
    const localTalent = await db.LocalTalent.findByPk(talentId);

    if (localTalent && localTalent.externalId) {
      log(`Removendo talento da InHire (External ID: ${localTalent.externalId})...`);
      const success = await deleteTalent(localTalent.externalId);
      if (!success) {
        log("AVISO: Falha ao excluir talento na InHire (pode não existir mais lá). Prosseguindo com deleção local.");
      }
    } else {
      log("Talento não possui externalId ou não foi encontrado localmente. Tentando deleção direta se o ID for compatível (fallback).");
      // Se não tem externalId mas o ID parece ser o da InHire (não UUID), tenta apagar.
      if (talentId && talentId.length < 30) {
        await deleteTalent(talentId);
      }
    }

    // 2. Remoção Local
    if (localTalent) {
      log(`Removendo registros locais para o talento ${talentId}...`);
      // O CASCADE configurado no modelo cuidará da LocalApplication se as FKs estiverem corretas, 
      // mas garantimos aqui por segurança se necessário.
      await db.LocalApplication.destroy({ where: { talentId } });
      await localTalent.destroy();
    }

    // 3. Limpeza de Cache
    const cachedTalents = getFromCache(TALENTS_CACHE_KEY);
    if (cachedTalents) {
      const updatedCache = cachedTalents.filter(t => t.id !== talentId);
      setToCache(TALENTS_CACHE_KEY, updatedCache);
      log(`CACHE UPDATE: Talento ID '${talentId}' removido do cache.`);
    }

    return { success: true, message: "Talento excluído com sucesso (InHire + Local)." };
  } catch (err) {
    error("Erro em handleDeleteTalent:", err.message);
    return { success: false, error: err.message };
  }
};