// COLE ESTE CÓDIGO ATUALIZADO NO ARQUIVO: src/Core/management-flow/managementOrchestrator.js

import { getAllTalentsPaginated, getTalentById } from '../../Inhire/Talents/talents.service.js';
import { getApplicationsForJob, updateApplication, getJobTalent } from '../../Inhire/JobTalents/jobTalents.service.js';
import { getJobDetails } from '../../Inhire/Jobs/jobs.service.js';
import { log, error } from '../../utils/logger.service.js';
import { saveDebugDataToFile } from '../../utils/debug.service.js';
import { getCustomFieldsForEntity } from '../../Inhire/CustomDataManager/customDataManager.service.js';
import { getFromCache, setToCache } from '../../utils/cache.service.js';
import db from '../../models/index.js'; // Importação do DB
// const { LocalTalent, LocalApplication } = db; // REMOVIDO: Causa erro 500 no startup

const TALENTS_CACHE_KEY = 'all_talents';

export const fetchCandidatesForJob = async (jobId) => {
    const CACHE_KEY = `candidates_for_job_${jobId}`;
    // log(`--- ORQUESTRADOR: Buscando candidaturas para a vaga ${jobId} ---`);

    try {
        // 1. Buscar Candidaturas LOCAIS primeiro
        // log(`[CANDIDATES] Buscando candidaturas locais para vaga ${jobId}...`);
        const localApps = await db.LocalApplication.findAll({
            where: { jobId },
            include: [{ model: db.LocalTalent, as: 'talent' }]
        });

        const formattedLocalCandidates = localApps.map(app => {
            const talent = app.talent?.toJSON() || {};
            const innerData = talent.data || {};

            return {
                id: talent.id,
                name: innerData.name || talent.name || 'Candidato Local',
                headline: innerData.headline || talent.headline || 'Sem título',
                photo: talent.photo || null,
                isLocal: true,
                application: {
                    id: app.id,
                    stageName: app.stage || 'Applied',
                    stageId: (app.stage || 'applied').toLowerCase(), // Garantir lowercase
                    status: app.status || 'ACTIVE',
                    createdAt: app.createdAt
                }
            };
        });

        // 2. Buscar da API InHire (se não for UUID ou se quisermos mesclar)
        let inhireCandidates = [];
        let stages = [
            { id: 'applied', name: 'Applied' },
            { id: 'screened', name: 'Screened' },
            { id: 'interview', name: 'Interview' },
            { id: 'offered', name: 'Offered' },
            { id: 'hired', name: 'Hired' },
            { id: 'rejected', name: 'Rejected' },
        ];

        // 2. Buscar da API InHire (Híbrido: Se for UUID, verifica se tem ID Externo mapeado)
        let externalJobId = null;

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);

        if (isUUID) {
            const localJob = await db.LocalJob.findByPk(jobId);
            if (localJob) {
                // log(`[DEBUG] LocalJob found: ${localJob.id}, ExternalId: ${localJob.externalId}`);
                if (localJob.externalId) {
                    externalJobId = localJob.externalId;
                } else {
                    // log(`[DEBUG] LocalJob has NO externalId. Skipping API fetch.`);
                }
            } else {
                // log(`[DEBUG] LocalJob NOT found for ID: ${jobId}. Assuming external InHire UUID.`);
                // FALLBACK: Se não está no banco local, assume que é um ID da InHire (legado ou não sincronizado)
                externalJobId = jobId;
            }
        } else {
            log(`[CANDIDATES] ID não é UUID (${jobId}). Assumindo ID externo direto.`);
            externalJobId = jobId;
        }

        if (externalJobId) {
            try {
                // log(`[DEBUG] Fetching from API for External ID: ${externalJobId}`);
                const apiResult = await getApplicationsForJob(externalJobId);
                // log(`[DEBUG] API Result Count: ${apiResult ? apiResult.length : 'null'}`);

                if (apiResult) {
                    inhireCandidates = apiResult
                        .filter(app => app?.talent?.id)
                        .map(app => ({
                            id: app.talent.id, // ID Externo
                            name: app.talent.name,
                            headline: app.talent.headline || 'Sem título',
                            photo: app.talent.photo || null,
                            isLocal: false, // Marca como vindo da API
                            application: {
                                id: app.id,
                                stageName: app.stage?.name || 'Status',
                                stageId: app.stage?.id,
                                status: app.status,
                                createdAt: app.createdAt
                            }
                        }));

                    // Enriquecer etapas se vierem da API
                    const apiStages = Array.from(new Map(apiResult.map(a => [a.stage?.id, a.stage?.name])).values())
                        .filter(s => s && s.id)
                        .map(s => ({ id: s.id, name: s.name }));

                    if (apiStages.length > 0) stages = apiStages;
                }
            } catch (apiErr) {
                error(`[CANDIDATES] Falha ao buscar candidatos da API InHire para ${externalJobId}:`, apiErr.message);
                // Não falha o request todo, apenas loga e retorna o local
            }
        }

        const allCandidates = [...formattedLocalCandidates, ...inhireCandidates];

        return {
            success: true,
            data: {
                candidates: allCandidates,
                stages: stages
            }
        };

    } catch (err) {
        error("Erro em fetchCandidatesForJob:", err.message);
        return { success: false, error: err.message };
    }
};

export const handleUpdateApplicationStatus = async (applicationId, newStageId) => {
    log(`--- ORQUESTRADOR: Atualizando etapa da candidatura ${applicationId} para o ID: ${newStageId} ---`);
    try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId);

        if (isUUID) {
            log(`[UPDATE_STAGE] Candidatura LOCAL detectada.`);
            const app = await db.LocalApplication.findByPk(applicationId);
            if (!app) throw new Error("Candidatura local não encontrada.");

            await app.update({ stage: newStageId });
            return { success: true, application: app };
        }

        const payload = { stageId: newStageId };
        const updatedApplication = await updateApplication(applicationId, payload);
        if (!updatedApplication) throw new Error("Falha ao atualizar a candidatura na InHire.");

        return { success: true, application: updatedApplication };
    } catch (err) {
        error("Erro em handleUpdateApplicationStatus:", err.message);
        return { success: false, error: err.message };
    }
};

export const fetchTalentDetails = async (talentId) => {
    log(`--- ORQUESTRADOR: Buscando detalhes do perfil do talento ${talentId} ---`);
    try {
        // 1. Tentar buscar Localmente Primeiro (Importante para Perfis que ainda não sincronizaram)
        log(`[FETCH_DETAILS] Buscando talento ${talentId} no Banco Local...`);
        const localTalent = await db.LocalTalent.findByPk(talentId);

        if (localTalent) {
            log(`[FETCH_DETAILS] ✅ Talento encontrado localmente.`);
            const talentData = localTalent.get({ plain: true });

            // Busca candidaturas locais relacionadas
            const localApps = await db.LocalApplication.findAll({
                where: { talentId },
                include: [{ model: db.LocalJob, as: 'job' }]
            });

            const enrichedApplications = await Promise.all(localApps.map(async (app) => {
                let jobName = app.job ? (app.job.title || app.job.name) : null;
                
                // Fallback 1: Se não tem job local mas tem ID externo, tenta buscar no cache/API
                if (!jobName && (app.job?.externalId || (app.jobId && !app.jobId.includes('-')))) {
                    const extId = app.job?.externalId || app.jobId;
                    const jobDetails = await getJobDetails(extId);
                    if (jobDetails) jobName = jobDetails.name || jobDetails.title;
                }

                // Fallback 2: Se tudo falhar, usa o jobName que foi salvo no snapshot da avaliação
                if (!jobName && app.evaluationResult?.jobName) {
                    jobName = app.evaluationResult.jobName;
                }

                return {
                    id: app.id,
                    jobId: app.jobId,
                    jobName: jobName || 'Vaga Desconhecida',
                    status: app.stage || app.status || 'Applied',
                    evaluationResult: app.evaluationResult // Histórico da avaliação
                };
            }));

            talentData.appliedJobs = enrichedApplications;

            // Compatibilidade: Garante que os campos de dados aninhados estejam acessíveis no topo se o front esperar
            if (talentData.data && typeof talentData.data === 'object') {
                const innerData = talentData.data;
                // Mescla innerData no topo para facilitar renderização (name, headline, etc)
                return {
                    success: true,
                    talent: { ...talentData, ...innerData, appliedJobs: enrichedApplications }
                };
            }

            return { success: true, talent: talentData };
        }

        // 2. Fallback para InHire API (Se não for local ou se for legado)
        log(`[FETCH_DETAILS] ⚠️ Talento não encontrado localmente. Buscando na InHire API...`);
        const talentData = await getTalentById(talentId);
        if (!talentData) {
            throw new Error(`Talento com ID ${talentId} não encontrado em nenhuma fonte.`);
        }

        const applications = talentData.jobs || [];

        const enrichedApplications = await Promise.all(
            applications.map(async (app) => {
                const jobDetails = await getJobDetails(app.id);
                return {
                    id: app.id,
                    jobId: app.id,
                    jobName: jobDetails ? (jobDetails.name || jobDetails.title) : 'Vaga InHire',
                    status: app.stage?.name || 'Novo'
                };
            })
        );

        talentData.appliedJobs = enrichedApplications;
        delete talentData.jobs;

        return { success: true, talent: talentData };
    } catch (err) {
        error("Erro em fetchTalentDetails:", err.message);
        return { success: false, error: err.message };
    }
};

export const fetchCandidateDetailsForJobContext = async (jobId, talentId) => {
    log(`--- ORQUESTRADOR: Buscando detalhes contextuais para T:${talentId} em V:${jobId} ---`);
    try {
        // 1. Tentar contexto LOCAL primeiro
        const isLocalApp = await db.LocalApplication.findOne({
            where: { jobId, talentId },
            include: [
                { model: db.LocalTalent, as: 'talent' },
                { model: db.LocalJob, as: 'job' }
            ]
        });

        if (isLocalApp) {
            log(`[DETAILS] Contexto LOCAL encontrado.`);
            const talent = isLocalApp.talent?.toJSON() || {};
            const innerData = talent.data || {};

            return {
                success: true,
                candidateData: {
                    id: talent.id,
                    name: innerData.name || talent.name,
                    headline: innerData.headline || talent.headline,
                    email: innerData.email || talent.email,
                    linkedinUsername: innerData.linkedinUsername || talent.linkedinUsername,
                    location: innerData.location || talent.location,
                    photo: talent.photo || null,
                    application: {
                        id: isLocalApp.id,
                        stageName: isLocalApp.stage || 'Applied',
                        stageId: (isLocalApp.stage || 'applied').toLowerCase(),
                        status: isLocalApp.status || 'ACTIVE',
                        createdAt: isLocalApp.createdAt,
                        customFields: [] // Local jobs might not have CF definitions yet
                    }
                }
            };
        }

        // 2. Tentar InHire
        const [talentProfile, applicationDetails, customFieldDefinitions] = await Promise.all([
            getTalentById(talentId),
            getJobTalent(jobId, talentId),
            getCustomFieldsForEntity('JOB_TALENTS')
        ]);

        if (!talentProfile || !applicationDetails) throw new Error(`Candidatura InHire não encontrada.`);

        const savedValuesMap = new Map((applicationDetails.customFields || []).map(field => [field.id, field.value]));
        const enrichedCustomFields = (customFieldDefinitions || []).map(def => ({
            ...def,
            answerOptions: def.options || [],
            value: savedValuesMap.get(def.id) || null
        }));

        return {
            success: true,
            candidateData: {
                id: talentProfile.id,
                name: talentProfile.name,
                headline: talentProfile.headline,
                email: talentProfile.email,
                phone: talentProfile.phone,
                location: talentProfile.location,
                linkedinUsername: talentProfile.linkedinUsername,
                photo: talentProfile.photo || null,
                application: {
                    id: applicationDetails.id,
                    stageName: applicationDetails.stage?.name || 'Etapa não definida',
                    stageId: applicationDetails.stage?.id || null,
                    status: applicationDetails.status,
                    createdAt: applicationDetails.createdAt,
                    customFields: enrichedCustomFields
                }
            }
        };

    } catch (err) {
        error("Erro em fetchCandidateDetailsForJobContext:", err.message);
        return { success: false, error: err.message };
    }
};

export const fetchAllTalentsForSync = async () => {
    // log("--- ORQUESTRADOR (SYNC): Buscando TODOS os talentos com paginação interna ---");
    try {
        let allTalents = [];
        let hasMorePages = true;
        let exclusiveStartKey = null;

        while (hasMorePages) {
            const response = await getAllTalentsPaginated(100, exclusiveStartKey);
            if (!response || !response.items) {
                throw new Error("A API falhou ao buscar uma página de talentos.");
            }

            allTalents.push(...response.items);

            if (response.exclusiveStartKey) {
                exclusiveStartKey = response.exclusiveStartKey;
            } else {
                hasMorePages = false;
            }
        }
        // log(`--- ORQUESTRADOR (SYNC): Busca completa. Total de ${allTalents.length} talentos carregados.`);
        return { success: true, talents: allTalents };
    } catch (err) {
        error("Erro em fetchAllTalentsForSync:", err.message);
        return { success: false, error: err.message };
    }
};

// ==========================================================
// CORREÇÃO: Lógica de paginação robusta
// ==========================================================
// ==========================================================
// CORREÇÃO: Lógica de paginação robusta
// ==========================================================
import { Op } from 'sequelize';

export const fetchAllTalents = async (pageParam, limitParam, filters = {}) => {
    // 1. Garantir que page e limit sejam números válidos
    const page = parseInt(pageParam, 10) || 1;
    const limit = parseInt(limitParam, 10) || 10;
    const offset = (page - 1) * limit;

    log(`--- ORQUESTRADOR: Buscando talentos locais (DB) (Página: ${page}, Limite: ${limit}, Filtros: ${JSON.stringify(filters)}) ---`);
    try {
        const whereClause = {};

        // Filtro de Texto (Nome, Headline, Email)
        if (filters.searchTerm) {
            const term = `%${filters.searchTerm}%`;
            whereClause[Op.or] = [
                { name: { [Op.iLike]: term } },
                { headline: { [Op.iLike]: term } },
                { email: { [Op.iLike]: term } }
            ];
        }

        // Filtro de jobId (Filtrar talentos que se candidataram a uma vaga específica)
        if (filters.jobId) {
            // Usamos um subquery ou include para filtrar talentos associados a essa vaga
            whereClause['$applications.jobId$'] = filters.jobId;
        }

        // Filtro de Data (Período)
        if (filters.startDate || filters.endDate) {
            whereClause.createdAt = {};
            if (filters.startDate) whereClause.createdAt[Op.gte] = new Date(filters.startDate);
            if (filters.endDate) whereClause.createdAt[Op.lte] = new Date(filters.endDate);
        }

        // Filtro de Score Mínimo
        if (filters.minScore) {
            whereClause.matchScore = { [Op.gte]: parseFloat(filters.minScore) };
        }

        // Filtro de Status da Candidatura
        if (filters.status) {
            whereClause['$applications.stage$'] = { [Op.iLike]: filters.status };
        }

        const { count, rows } = await db.LocalTalent.findAndCountAll({
            where: whereClause,
            limit: limit,
            offset: offset,
            order: [
                ['matchScore', 'DESC'],
                ['createdAt', 'DESC']
            ],
            include: [{
                model: db.LocalApplication,
                as: 'applications',
                required: filters.jobId || filters.status ? true : false,
                include: [{ model: db.LocalJob, as: 'job' }]
            }],
            distinct: true // Evita duplicatas ao fazer join com candidaturas
        });

        const totalPages = Math.ceil(count / limit);

        // Enriquecer talentos com informações de vaga e etapa para a listagem
        const enrichedTalents = await Promise.all(rows.map(async (talent) => {
            const raw = talent.get({ plain: true });
            const primaryApp = raw.applications && raw.applications.length > 0 ? raw.applications[0] : null;
            
            let jobName = null;
            if (primaryApp) {
                jobName = primaryApp.job ? (primaryApp.job.title || primaryApp.job.name) : null;
                
                // Fallback 1: ID externo
                if (!jobName && (primaryApp.job?.externalId || (primaryApp.jobId && !primaryApp.jobId.includes('-')))) {
                    const extId = primaryApp.job?.externalId || primaryApp.jobId;
                    try {
                        const jobDetails = await getJobDetails(extId);
                        if (jobDetails) jobName = jobDetails.name || jobDetails.title;
                    } catch (e) { /* ignore */ }
                }

                // Fallback 2: evaluationResult
                if (!jobName && primaryApp.evaluationResult?.jobName) {
                    jobName = primaryApp.evaluationResult.jobName;
                }
            }

            return {
                ...raw,
                primaryJobName: jobName || (primaryApp ? 'Vaga s/ nome' : 'Sem vaga'),
                lastStatus: primaryApp ? (primaryApp.stage || primaryApp.status || 'Applied') : 'New',
                matchScore: raw.matchScore || (primaryApp ? primaryApp.matchScore : 0)
            };
        }));

        return {
            success: true,
            data: {
                talents: enrichedTalents, // Array enriquecido
                currentPage: page,
                totalPages: totalPages > 0 ? totalPages : 1,
                totalTalents: count
            }
        };
    } catch (err) {
        error("Erro em fetchAllTalents (Local DB):", err.message);
        return { success: false, error: err.message };
    }
};

export const fetchCustomFields = async (entity) => {
    log(`--- ORQUESTRADOR: Buscando campos personalizados para a entidade ${entity} ---`);
    try {
        const fields = await getCustomFieldsForEntity(entity);
        if (fields === null) throw new Error("A API falhou ao buscar os campos personalizados.");
        return { success: true, fields: fields };
    } catch (err) {
        error("Erro em fetchCustomFields:", err.message);
        return { success: false, error: err.message };
    }
};

export const handleUpdateCustomFieldsForApplication = async (applicationId, customFieldsData) => {
    log(`--- ORQUESTRADOR: Atualizando campos personalizados para a candidatura ${applicationId} ---`);
    try {
        if (!applicationId || !Array.isArray(customFieldsData)) {
            throw new Error("ID da candidatura e customFieldsData (array) são obrigatórios.");
        }

        const payload = { customFields: customFieldsData };
        log("Payload de atualização de campos personalizados:", JSON.stringify(payload, null, 2));

        const updatedApplication = await updateApplication(applicationId, payload);

        if (!updatedApplication) {
            throw new Error("Falha ao atualizar os campos personalizados da candidatura.");
        }

        return { success: true, application: updatedApplication };

    } catch (err) {
        error("Erro em handleUpdateCustomFieldsForApplication:", err.message);
        return { success: false, error: err.message };
    }
};

/**
 * Adiciona um talento existente a uma nova vaga local.
 */
export const handleAddTalentToJob = async (talentId, jobId) => {
    log(`--- ORQUESTRADOR: Adicionando talento ${talentId} à vaga ${jobId} ---`);
    try {
        if (!talentId || !jobId) {
            throw new Error("talentId e jobId são obrigatórios.");
        }

        const [application, created] = await db.LocalApplication.findOrCreate({
            where: { talentId, jobId },
            defaults: { 
                stage: 'Applied',
                status: 'ACTIVE'
            }
        });

        if (!created) {
            return { success: false, message: "Este talento já está inscrito nesta vaga.", application };
        }

        log(`[ADD_TO_JOB] Sucesso: Talento vinculado à vaga.`);
        return { success: true, application };

    } catch (err) {
        error("Erro em handleAddTalentToJob:", err.message);
        return { success: false, error: err.message };
    }
};