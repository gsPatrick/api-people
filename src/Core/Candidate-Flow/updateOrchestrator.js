
// ATUALIZE O ARQUIVO: src/Core/Candidate-Flow/updateOrchestrator.js

import { updateTalent } from '../../Inhire/Talents/talents.service.js';
import { updateApplication } from '../../Inhire/JobTalents/jobTalents.service.js';
import { getCustomFieldsForEntity } from '../../Inhire/CustomDataManager/customDataManager.service.js';
// <-- MUDANÇA 1: Trocar a importação do mapeador estático pelo de IA
import { mapProfileToCustomFieldsWithAI } from './aiDataMapper.service.js'; 
import { getFromCache, setToCache } from '../../utils/cache.service.js';
import { log, error } from '../../utils/logger.service.js';
import { saveCachedProfile } from '../../Platform/Cache/cache.service.js';

const TALENTS_CACHE_KEY = 'all_talents';

/**
 * Orquestra a atualização completa de um talento e sua candidatura a partir de novos dados do LinkedIn.
 * AGORA USANDO MAPEAMENTO COM IA.
 */
export const handleFullProfileUpdate = async (talentId, applicationId, scrapedData) => {
    log(`--- UPDATE ORCHESTRATOR (IA): Iniciando atualização para Talento ID: ${talentId} ---`);
    try {
        // <-- MUDANÇA 2: Usar o mapeador de IA
        log("Passo 1/3: Mapeando novos dados do perfil com IA de alta performance...");
        const jobTalentFieldsDefinitions = await getCustomFieldsForEntity('JOB_TALENTS');
        const { talentPayload, customFieldsPayload } = await mapProfileToCustomFieldsWithAI(scrapedData, jobTalentFieldsDefinitions);
        
        log('==================== PAYLOADS DE ATUALIZAÇÃO PARA A API (IA) ====================');
        log('Payload do Talento:', JSON.stringify(talentPayload, null, 2));
        log('Payload de Campos Personalizados:', JSON.stringify(customFieldsPayload, null, 2));
        log('================================================================================');

        // Passo 2: Executar as atualizações
        log("Passo 2/3: Executando atualizações na API InHire...");
        if (Object.keys(talentPayload).length > 0) {
            await updateTalent(talentId, talentPayload);
            log(`Talento ${talentId} atualizado com ${Object.keys(talentPayload).length} campos.`);
        }
        if (customFieldsPayload.length > 0 && applicationId) {
            await updateApplication(applicationId, { customFields: customFieldsPayload });
            log(`Candidatura ${applicationId} atualizada com ${customFieldsPayload.length} campos personalizados.`);
        }

        // Passo 3: Atualizar caches
        log("Passo 3/3: Atualizando caches...");
        if (scrapedData.linkedinUsername) {
            await saveCachedProfile(scrapedData.linkedinUsername, scrapedData);
        }

        const cachedTalents = getFromCache(TALENTS_CACHE_KEY);
        if (cachedTalents) {
            const index = cachedTalents.findIndex(t => t.id === talentId);
            if (index !== -1) {
                cachedTalents[index] = { ...cachedTalents[index], ...talentPayload };
                setToCache(TALENTS_CACHE_KEY, cachedTalents);
                log(`CACHE UPDATE: Talento ID '${talentId}' atualizado no cache em memória.`);
            }
        }

        log(`Atualização completa (IA) para o talento ${talentId} concluída com sucesso.`);
        return { success: true, message: 'Talento e candidatura atualizados com sucesso via IA.' };

    } catch (err) {
        error("Erro em handleFullProfileUpdate (IA):", err.message);
        return { success: false, error: err.message };
    }
};