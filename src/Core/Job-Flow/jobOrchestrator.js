// COLE ESTE CÓDIGO ATUALIZADO NO ARQUIVO: src/Core/Job-Flow/jobOrchestrator.js

import { getAllJobs, getJobTags, createJob as createInHireJob, updateJob as updateInHireJob } from '../../Inhire/Jobs/jobs.service.js';
import { addTalentToJob, removeApplication } from '../../Inhire/JobTalents/jobTalents.service.js';
import { log, error } from '../../utils/logger.service.js';
import { getFromCache, setToCache } from '../../utils/cache.service.js';
import { saveDebugDataToFile } from '../../utils/debug.service.js';
import db from '../../models/index.js'; // Import DB

const JOBS_CACHE_KEY = 'all_jobs_with_details';

export const handleCreateJob = async (jobData) => {
    log(`--- ORQUESTRADOR: Criando nova vaga LOCAL: ${jobData.name} ---`);
    try {
        if (!jobData.name) throw new Error("O nome da vaga é obrigatório.");

        const newJob = await db.LocalJob.create({
            title: jobData.name,
            description: jobData.description || '',
            status: 'OPEN',
            source: 'LOCAL',
            syncStatus: 'PENDING',
            areaId: jobData.areaId,
            data: jobData
        });

        // Se solicitado sincronização imediata
        if (jobData.syncNow) {
            log(`[CREATE_JOB] Sincronização imediata solicitada para ${newJob.id}.`);
            try {
                await handleSyncJobToInHire(newJob.id);
            } catch (err) {
                error(`[CREATE_JOB] Falha na sincronização imediata de ${newJob.id}:`, err.message);
                // Não falha a criação da vaga se o sync falhar
            }
        }

        return {
            success: true,
            job: {
                id: newJob.id,
                name: newJob.title,
                description: newJob.description,
                status: newJob.status.toLowerCase(),
                source: 'LOCAL',
                syncStatus: jobData.syncNow ? 'SYNCHRONIZED' : 'PENDING'
            }
        };
    } catch (err) {
        error("Erro em handleCreateJob:", err.message);
        return { success: false, error: err.message };
    }
};

export const handleUpdateJob = async (jobId, jobData) => {
    log(`--- ORQUESTRADOR: Atualizando vaga ${jobId} ---`);
    try {
        const localJob = await db.LocalJob.findByPk(jobId);
        
        if (localJob) {
            // Se for local, atualiza no banco
            const updates = {};
            if (jobData.name) updates.title = jobData.name;
            if (jobData.description !== undefined) updates.description = jobData.description;
            if (jobData.status) updates.status = jobData.status.toUpperCase();
            
            if (jobData.areaId) updates.areaId = jobData.areaId;
            
            updates.data = { ...(localJob.data || {}), ...jobData };
            
            await localJob.update(updates);
            
            // Se já estiver sincronizada, tenta atualizar no InHire também
            if (localJob.source === 'LOCAL' && localJob.syncStatus === 'SYNCHRONIZED' && localJob.externalId) {
                await updateInHireJob(localJob.externalId, {
                    title: jobData.name || localJob.title,
                    description: jobData.description || localJob.description,
                    scorecardId: jobData.scorecardId || localJob.data?.scorecardId,
                    interviewKitId: jobData.interviewKitId || localJob.data?.interviewKitId
                });
            }
            
            return { success: true, job: localJob };
        } else {
            // Se não for local, assume que é do InHire (Cache/Proxy)
            const result = await updateInHireJob(jobId, {
                title: jobData.name,
                description: jobData.description
            });
            return { success: !!result, job: result };
        }
    } catch (err) {
        error("Erro em handleUpdateJob:", err.message);
        return { success: false, error: err.message };
    }
};

export const handleDeleteJob = async (jobId) => {
    log(`--- ORQUESTRADOR: Excluindo vaga ${jobId} ---`);
    try {
        const localJob = await db.LocalJob.findByPk(jobId);
        
        if (localJob) {
            // Exclui localmente (incluindo candidaturas locais associadas se necessário)
            // O Sequelize por padrão não deletas as associações se não configurado CASCADE.
            // Aqui vamos deletar apenas a vaga por simplicidade, ou as candidaturas também.
            await localJob.destroy();
            return { success: true, message: "Vaga local excluída com sucesso." };
        } else {
            // Por enquanto não temos exclusão remota via API documentada/implementada
            return { success: false, error: "Exclusão remota não disponível. Apenas vagas locais podem ser excluídas." };
        }
    } catch (err) {
        error("Erro em handleDeleteJob:", err.message);
        return { success: false, error: err.message };
    }
};

export const handleSyncJobToInHire = async (jobId) => {
    log(`--- ORQUESTRADOR: Sincronizando vaga ${jobId} com InHire ---`);
    try {
        const localJob = await db.LocalJob.findByPk(jobId);
        if (!localJob) throw new Error("Vaga local não encontrada.");
        
        if (localJob.syncStatus === 'SYNCHRONIZED' && localJob.externalId) {
            return { success: true, message: "Já sincronizada.", externalId: localJob.externalId };
        }

        // Criar no InHire
        const inhireJob = await createInHireJob({
            title: localJob.title,
            description: localJob.description || 'Vaga criada via PeopleAi',
            departmentId: localJob.areaId,
            scorecardId: localJob.data?.scorecardId,
            interviewKitId: localJob.data?.interviewKitId
        });

        if (inhireJob && inhireJob.id) {
            await localJob.update({
                externalId: inhireJob.id,
                syncStatus: 'SYNCHRONIZED',
                data: { ...(localJob.data || {}), inhireSnapshot: inhireJob }
            });
            return { success: true, externalId: inhireJob.id };
        } else {
            await localJob.update({ syncStatus: 'FAILED' });
            throw new Error("Falha ao criar vaga na API do InHire.");
        }
    } catch (err) {
        error("Erro em handleSyncJobToInHire:", err.message);
        return { success: false, error: err.message };
    }
};

export const fetchJobDetails = async (jobId) => {
    try {
        // Tenta local primeiro
        const localJob = await db.LocalJob.findByPk(jobId);
        if (localJob) {
            return {
                success: true,
                job: {
                    id: localJob.id,
                    name: localJob.title,
                    description: localJob.description,
                    status: localJob.status.toLowerCase(),
                    source: localJob.source,
                    syncStatus: localJob.syncStatus,
                    externalId: localJob.externalId,
                    data: localJob.data
                }
            };
        }
        
        // Se não, busca do InHire (Cache)
        const inhireJobsCached = getFromCache(JOBS_CACHE_KEY) || [];
        const inhireJob = inhireJobsCached.find(j => j.id === jobId);
        
        if (inhireJob) {
            return { success: true, job: { ...inhireJob, name: inhireJob.title, source: 'INHIRE' } };
        }
        
        return { success: false, error: "Vaga não encontrada." };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

// ==========================================================
// CORREÇÃO: Função modificada para mesclar vagas LOCAIS (DB)
// com vagas do InHire (Cache).
// ==========================================================
export const fetchPaginatedJobs = async (page = 1, limit = 10, status = 'open') => {
    log(`--- ORQUESTRADOR: Buscando vagas (Status: ${status}) ---`);

    try {
        // 1. Buscar Vagas Locais do Banco de Dados
        const statusMap = {
            'open': 'OPEN',
            'paused': 'PAUSED',
            'closed': 'CLOSED',
            'canceled': 'CANCELED',
            'draft': 'DRAFT'
        };

        const dbStatus = statusMap[status.toLowerCase()] || 'OPEN';

        const localJobsFromDb = await db.LocalJob.findAll({
            where: {
                status: dbStatus
            },
            order: [['createdAt', 'DESC']]
        });

        const formattedLocalJobs = localJobsFromDb.map(job => ({
            id: job.id,
            name: job.title,
            description: job.description,
            status: (job.status || 'OPEN').toLowerCase(),
            externalId: job.externalId,
            source: job.source,
            syncStatus: job.syncStatus,
            activeTalents: 0,
            area: job.areaId ? { id: job.areaId, name: job.data?.areaName || 'Local' } : { name: 'Local' }
        }));

        // 2. Buscar Vagas do InHire no Cache
        const inhireJobsCached = getFromCache(JOBS_CACHE_KEY) || [];
        const filteredInhireJobs = inhireJobsCached.filter(job =>
            (job.status || '').toLowerCase() === status.toLowerCase()
        );

        // 3. Mesclar as listas (Locais primeiro)
        const allMergedJobs = [...formattedLocalJobs, ...filteredInhireJobs.map(j => ({ ...j, name: j.title, source: 'INHIRE', syncStatus: 'SYNCHRONIZED' }))];

        const totalJobsInFilter = allMergedJobs.length;

        return {
            success: true,
            data: {
                jobs: allMergedJobs,
                currentPage: 1,
                totalPages: 1,
                totalJobs: totalJobsInFilter
            }
        };

    } catch (err) {
        error("Erro em fetchPaginatedJobs:", err.message);
        return { success: false, error: err.message };
    }
};

export const fetchAvailableAreas = async () => {
    log("--- ORQUESTRADOR: Extraindo áreas disponíveis do cache/API ---");
    try {
        let jobsToExtractFrom = getFromCache(JOBS_CACHE_KEY) || [];
        
        // Se o cache estiver vazio, busca da API InHire de forma rápida (sem enriquecer as vagas)
        if (jobsToExtractFrom.length === 0) {
            log("[AREAS] Cache de vagas vazio. Buscando da API InHire para extrair as áreas de forma otimizada...");
            const rawJobs = await getAllJobs();
            if (rawJobs && rawJobs.length > 0) {
                jobsToExtractFrom = rawJobs;
                // Opcional: não sobrescrevemos o JOBS_CACHE_KEY com rawJobs pois o restante do app
                // espera vagas enriquecidas (com tags). Mas usamos rawJobs apenas para extrair as áreas.
            }
        }

        // Extrai áreas únicas
        const areasMap = new Map();
        jobsToExtractFrom.forEach(job => {
            if (job.area && job.area.id) {
                areasMap.set(job.area.id, job.area);
            }
        });

        const areas = Array.from(areasMap.values());
        log(`[AREAS] ${areas.length} áreas identificadas.`);
        
        return { success: true, areas };
    } catch (err) {
        error("Erro em fetchAvailableAreas:", err.message);
        return { success: false, error: err.message };
    }
};

// Esta função continua sendo usada pelo processo de sync em segundo plano
export const fetchAllJobsWithDetails = async () => {
    log("--- ORQUESTRADOR (SYNC): Buscando e enriquecendo todas as vagas ---");
    try {
        const allJobs = await getAllJobs();
        if (!allJobs) {
            throw new Error("Não foi possível buscar la lista de vagas.");
        }

        saveDebugDataToFile(`all_jobs_raw_${Date.now()}.txt`, allJobs);

        const enrichedJobs = await Promise.all(
            allJobs.map(async (job) => {
                const tags = await getJobTags(job.id);
                return {
                    ...job,
                    tags: tags || []
                };
            })
        );

        return { success: true, jobs: enrichedJobs };
    } catch (err) {
        error("Erro em fetchAllJobsWithDetails:", err.message);
        return { success: false, error: err.message };
    }
};

// O resto das funções permanece igual
export const handleJobSelection = async (jobId, talentId) => {
    log(`--- ORQUESTRADOR: Aplicando talento ${talentId} à vaga ${jobId} ---`);
    try {
        if (!jobId || !talentId) throw new Error("jobId e talentId são obrigatórios.");

        // 1. Verificar se Job ou Talent são LOCAIS
        const [isLocalJob, isLocalTalent] = await Promise.all([
            db.LocalJob.findByPk(jobId),
            db.LocalTalent.findByPk(talentId)
        ]);

        if (isLocalJob || isLocalTalent) {
            log(`[APPLY] Detectado contexto LOCAL (Job: ${!!isLocalJob}, Talent: ${!!isLocalTalent}). Criando LocalApplication.`);

            // Reconsider logic: Se for um talento local e estiver REJECTED, volta para ACTIVE
            if (isLocalTalent && isLocalTalent.status === 'REJECTED') {
                log(`[RECONSIDER] Atualizando status do talento ${talentId} de REJECTED para ACTIVE.`);
                // IMPORTANTE: Atualiza tanto o campo status quanto o campo dentro do JSON 'data'
                const updatedData = { ...(isLocalTalent.data || {}), status: 'ACTIVE' };
                await isLocalTalent.update({ status: 'ACTIVE', data: updatedData });
            }

            // Verifica se já existe para evitar duplicatas
            const existingApp = await db.LocalApplication.findOne({
                where: { jobId, talentId }
            });

            if (existingApp) {
                return { success: true, application: existingApp };
            }

            const newApp = await db.LocalApplication.create({
                jobId,
                talentId,
                stage: 'applied', // Garantir lowercase aqui na criação
                status: 'ACTIVE'
            });

            return {
                success: true,
                application: {
                    id: newApp.id,
                    jobId: newApp.jobId,
                    talentId: newApp.talentId,
                    status: newApp.status,
                    isLocal: true
                }
            };
        }

        // 2. Fallback para InHire (Apenas se ambos forem externos)
        const application = await addTalentToJob(jobId, talentId);
        if (!application) throw new Error("Falha ao adicionar talento à vaga na InHire API.");
        return { success: true, application };
    } catch (err) {
        error("Erro em handleJobSelection:", err.message);
        return { success: false, error: err.message };
    }
};

export const handleRemoveApplication = async (applicationId) => {
    log(`--- ORQUESTRADOR: Removendo candidatura ${applicationId} ---`);
    try {
        // Verifica se é um UUID (Candidatura Local)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId);

        if (isUUID) {
            log(`[REMOVE] Detectada candidatura LOCAL. Removendo do BD...`);
            const deleted = await db.LocalApplication.destroy({
                where: { id: applicationId }
            });
            if (!deleted) throw new Error("Candidatura local não encontrada.");
            return { success: true };
        }

        // Caso contrário, tenta InHire
        const success = await removeApplication(applicationId);
        if (!success) {
            throw new Error("A API da InHire falhou ao remover a candidatura.");
        }
        return { success: true };
    } catch (err) {
        error("Erro em handleRemoveApplication:", err.message);
        return { success: false, error: err.message };
    }
};