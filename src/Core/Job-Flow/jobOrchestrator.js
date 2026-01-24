// COLE ESTE CÓDIGO ATUALIZADO NO ARQUIVO: src/Core/Job-Flow/jobOrchestrator.js

import { getAllJobs, getJobTags } from '../../Inhire/Jobs/jobs.service.js';
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
            title: jobData.name, // Mapping 'name' (frontend) to 'title' (db)
            description: jobData.description || '',
            status: 'OPEN',
            isSynced: false
        });

        // Return formatted as expected by frontend (name property)
        return {
            success: true,
            job: {
                id: newJob.id,
                name: newJob.title,
                description: newJob.description,
                status: newJob.status.toLowerCase(),
                externalId: null,
                isSynced: false
            }
        };
    } catch (err) {
        error("Erro em handleCreateJob:", err.message);
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
        // Mapeamento robusto de front-end para DB
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
            isSynced: job.isSynced,
            activeTalents: 0,
            area: { name: 'Local' }
        }));

        // 2. Buscar Vagas do InHire no Cache
        const inhireJobsCached = getFromCache(JOBS_CACHE_KEY) || [];
        const filteredInhireJobs = inhireJobsCached.filter(job =>
            (job.status || '').toLowerCase() === status.toLowerCase()
        );

        // 3. Mesclar as listas (Locais primeiro)
        const allMergedJobs = [...formattedLocalJobs, ...filteredInhireJobs];

        const totalJobsInFilter = allMergedJobs.length;

        // A resposta agora contém as vagas de ambas as fontes.
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