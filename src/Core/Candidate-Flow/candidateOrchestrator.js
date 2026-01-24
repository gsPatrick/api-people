// ARQUIVO COMPLETO: src/Core/Candidate-Flow/candidateOrchestrator.js

import { createTalent, deleteTalent, updateTalent } from '../../Inhire/Talents/talents.service.js';
import { addTalentToJob, updateApplication } from '../../Inhire/JobTalents/jobTalents.service.js';
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
  log(`--- ORQUESTRADOR: Iniciando VALIDAÇÃO OTIMIZADA (MAPA) para: ${profileUrl} ---`);
  try {
    const usernameToSearch = extractUsernameFromUrl(profileUrl);
    if (!usernameToSearch) {
      throw new Error("Não foi possível extrair um nome de usuário válido da URL do LinkedIn.");
    }
    const talentLookupMap = getFromCache('talent_lookup_map');
    if (talentLookupMap) {
      const talentInMap = talentLookupMap.get(usernameToSearch.toLowerCase());
      if (talentInMap) {
        log(`Validação Otimizada (MAP HIT): Talento "${talentInMap.name}" JÁ EXISTE.`);
        return { success: true, exists: true, talent: talentInMap, profileData: null };
      }
    } else {
      const allTalentsFromCache = getFromCache(TALENTS_CACHE_KEY) || [];
      const talentInCache = allTalentsFromCache.find(t => t.linkedinUsername?.toLowerCase().replace(/\/+$/, '') === usernameToSearch.toLowerCase());
      if (talentInCache) {
        log(`Validação (FALLBACK HIT): Talento "${talentInCache.name}" JÁ EXISTE.`);
        return { success: true, exists: true, talent: talentInCache, profileData: null };
      }
    }
    log(`Validação Otimizada (MISS): Talento não encontrado na base.`);
    return { success: true, exists: false, talent: null, profileData: null };
  } catch (err) {
    error("Erro em validateProfile:", err.message);
    return { success: false, error: err.message };
  }
};


import db from '../../models/index.js';
import SyncService from '../../services/sync.service.js';

const { LocalTalent } = db; // REMOVIDO: Destruturação no topo causa erro se models ainda não carregaram

export const handleConfirmCreation = async (talentData, jobId) => {
  log(`--- ORQUESTRADOR (LOCAL-FIRST): Criando talento '${talentData.name}' na vaga '${jobId}' ---`);
  try {
    if (!jobId) throw new Error("O ID da Vaga (jobId) é obrigatório.");

    // === PASSO 1: Persistência Local Imediata (INSTANT UX) ===
    // Criamos o registro localmente com status PENDING para sincronização
    const localTalent = await db.LocalTalent.create({
      name: talentData.name || 'Nome Desconhecido',
      headline: talentData.headline,
      linkedinUsername: talentData.linkedinUsername,
      email: talentData.email,
      phone: talentData.phone,
      location: talentData.location,
      data: talentData, // Salva todo o payload cru como backup/referência
      syncStatus: 'PENDING',
      status: talentData.status || 'NEW'
    });

    // === PASSO 2: Disparar Sincronização em Background (FIRE AND FORGET) ===
    // O usuário não espera isso. O SyncService cuida de mandar para Inhire/Gupy.
    SyncService.triggerBackgroundSync(localTalent.id, jobId);

    // === PASSO 3: Mapeamento com IA (Background Local) ===
    // Continuamos o enriquecimento de dados localmente para ter filtros funcionando.
    // Isso roda em background sem travar o retorno inicial, MAS como queremos
    // preencher os dados, vamos rodar a promise sem await bloqueante ou com um catch silencioso
    // para garantir que o retorno para o front seja rápido.

    // NOTA: Para UX "instantânea" (< 200ms), deveríamos retornar AGORA.
    // Mas o mapeamento leva uns 3-4s. Se o frontend precisar dos campos preenchidos
    // na hora, teríamos que esperar. Como a prioridade descrita é "Listagem Rápida",
    // vamos retornar o básico e deixar a IA preencher depois.

    // Dispara enriquecimento assíncrono
    mapAndEnrichLocalTalent(localTalent, talentData).catch(err => {
      error(`Erro no enriquecimento background de ${localTalent.id}:`, err);
    });

    log("🚀 Talento criado localmente. Retornando ID para a UI imediatamente.");
    // Retornamos a estrutura que o frontend espera (agora com ID local)
    return { success: true, talent: localTalent };

  } catch (err) {
    error("Erro em handleConfirmCreation:", err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Função auxiliar para enriquecer o talento local com IA sem travar a resposta principal.
 */
const mapAndEnrichLocalTalent = async (localTalent, talentData) => {
  log("Iniciando mapeamento de campos personalizados com IA (Background Local)...");
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

  log("Talento local enriquecido com dados da IA.");
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
    const success = await deleteTalent(talentId);
    if (!success) throw new Error("Falha ao excluir talento.");

    const cachedTalents = getFromCache(TALENTS_CACHE_KEY);
    if (cachedTalents) {
      const updatedCache = cachedTalents.filter(t => t.id !== talentId);
      setToCache(TALENTS_CACHE_KEY, updatedCache);
      log(`CACHE UPDATE: Talento ID '${talentId}' removido do cache.`);
    }
    return { success: true, message: "Talento excluído com sucesso." };
  } catch (err) {
    error("Erro em handleDeleteTalent:", err.message);
    return { success: false, error: err.message };
  }
};