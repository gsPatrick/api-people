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

        // Invalidate cache
        setToCache(JOBS_CACHE_KEY, null);

        // Return formatted as expected by frontend (name property)
        return {
            success: true,
            job: {
                id: newJob.id,
                name: newJob.title,
                description: newJob.description,
                status: newJob.status,
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
// CORREÇÃO: Função modificada para remover a lógica de paginação
// e retornar sempre a lista completa de vagas filtradas.
// ==========================================================
export const fetchPaginatedJobs = async (page = 1, limit = 10, status = 'open') => {
    log(`--- ORQUESTRADOR: Servindo TODAS as vagas do cache (Status: ${status}) ---`);

    try {
        const allJobs = getFromCache(JOBS_CACHE_KEY);

        if (!allJobs) {
            log("AVISO: Cache de vagas ainda está vazio. Retornando lista vazia.");
            return {
                success: true,
                data: { jobs: [], currentPage: 1, totalPages: 1, totalJobs: 0 }
            };
        }

        const filteredJobs = allJobs.filter(job => job.status === status);

        const totalJobsInFilter = filteredJobs.length;

        // A resposta agora sempre contém todas as vagas filtradas.
        // As chaves de paginação são mantidas para não quebrar o frontend,
        // mas sempre indicarão uma única página.
        return {
            success: true,
            data: {
                jobs: filteredJobs,
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
        const application = await addTalentToJob(jobId, talentId);
        if (!application) throw new Error("Falha ao adicionar talento à vaga.");
        return { success: true, application };
    } catch (err) {
        error("Erro em handleJobSelection:", err.message);
        return { success: false, error: err.message };
    }
};

export const handleRemoveApplication = async (applicationId) => {
    log(`--- ORQUESTRADOR: Removendo candidatura ${applicationId} ---`);
    try {
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