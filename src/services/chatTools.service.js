// src/services/chatTools.service.js
// Registry de ferramentas que a Ana Issidoro pode usar para consultar o banco.
// Cada tool tem: definition (schema OpenAI) + handler (executa query segura).

import { Op } from 'sequelize';

let db = null;

const getDB = async () => {
    if (!db) {
        const module = await import('../models/index.js');
        db = module.default;
    }
    return db;
};

// =============================================
// DEFINIÇÕES DAS TOOLS (Schema OpenAI)
// =============================================

const toolDefinitions = [
    // --- VAGAS ---
    {
        type: "function",
        function: {
            name: "list_jobs",
            description: "Lista todas as vagas da empresa. Pode filtrar por status (OPEN, CLOSED, DRAFT, PAUSED, CANCELED) e buscar por título.",
            parameters: {
                type: "object",
                properties: {
                    status: { type: "string", description: "Filtrar por status da vaga. Ex: OPEN, CLOSED, DRAFT" },
                    search: { type: "string", description: "Buscar por título da vaga" },
                    limit: { type: "integer", description: "Limite de resultados. Padrão: 20" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_job_details",
            description: "Retorna detalhes completos de uma vaga específica pelo ID ou título. Inclui descrição, status, área e scorecards vinculados.",
            parameters: {
                type: "object",
                properties: {
                    jobId: { type: "string", description: "ID (UUID) da vaga" },
                    title: { type: "string", description: "Título da vaga (busca parcial)" }
                }
            }
        }
    },

    // --- CANDIDATOS ---
    {
        type: "function",
        function: {
            name: "list_talents",
            description: "Lista candidatos/talentos cadastrados. Pode filtrar por nome, score mínimo, status (NEW, ACTIVE, REJECTED, HIRED) e localização.",
            parameters: {
                type: "object",
                properties: {
                    search: { type: "string", description: "Buscar por nome ou headline do candidato" },
                    status: { type: "string", description: "Filtrar por status: NEW, ACTIVE, REJECTED, HIRED" },
                    minScore: { type: "number", description: "Score mínimo de match (0-100)" },
                    limit: { type: "integer", description: "Limite de resultados. Padrão: 20" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_talent_details",
            description: "Retorna dados completos de um candidato específico: nome, headline, linkedin, localização, experiências, formação, skills e histórico de candidaturas.",
            parameters: {
                type: "object",
                properties: {
                    talentId: { type: "string", description: "ID (UUID) do candidato" },
                    name: { type: "string", description: "Nome do candidato (busca parcial)" },
                    linkedinUsername: { type: "string", description: "Username do LinkedIn do candidato" }
                }
            }
        }
    },

    // --- CANDIDATURAS ---
    {
        type: "function",
        function: {
            name: "list_applications",
            description: "Lista candidaturas (applications). Cada candidatura é a relação de um candidato com uma vaga. Inclui stage (fase do processo), matchScore e avaliação da IA.",
            parameters: {
                type: "object",
                properties: {
                    jobId: { type: "string", description: "Filtrar por ID da vaga" },
                    talentId: { type: "string", description: "Filtrar por ID do candidato" },
                    stage: { type: "string", description: "Filtrar por fase. Ex: Applied, Interview, Offer" },
                    limit: { type: "integer", description: "Limite de resultados. Padrão: 20" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_application_details",
            description: "Retorna detalhes de uma candidatura específica: candidato, vaga, stage, matchScore, avaliação completa da IA com justificativas.",
            parameters: {
                type: "object",
                properties: {
                    applicationId: { type: "string", description: "ID (UUID) da candidatura" }
                },
                required: ["applicationId"]
            }
        }
    },

    // --- SCORECARDS ---
    {
        type: "function",
        function: {
            name: "list_scorecards",
            description: "Lista todos os scorecards de avaliação disponíveis. Cada scorecard contém categorias e critérios para avaliar candidatos.",
            parameters: {
                type: "object",
                properties: {
                    jobId: { type: "string", description: "Filtrar scorecards de uma vaga específica" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_scorecard_details",
            description: "Retorna um scorecard completo com todas as categorias e critérios de avaliação, incluindo pesos e tags.",
            parameters: {
                type: "object",
                properties: {
                    scorecardId: { type: "string", description: "ID (UUID) do scorecard" }
                },
                required: ["scorecardId"]
            }
        }
    },

    // --- ESTATÍSTICAS E CONTAGENS ---
    {
        type: "function",
        function: {
            name: "count_records",
            description: "Conta registros no banco de dados por tipo. Útil para perguntas como 'quantas vagas temos?' ou 'quantos candidatos ativos?'.",
            parameters: {
                type: "object",
                properties: {
                    entity: {
                        type: "string",
                        enum: ["jobs", "talents", "applications", "scorecards"],
                        description: "Tipo de entidade para contar"
                    },
                    filters: {
                        type: "object",
                        description: "Filtros opcionais. Ex: {status: 'OPEN'} para contar apenas vagas abertas",
                        properties: {
                            status: { type: "string" },
                            stage: { type: "string" }
                        }
                    }
                },
                required: ["entity"]
            }
        }
    },

    // --- BUSCA GENÉRICA ---
    {
        type: "function",
        function: {
            name: "search_database",
            description: "Busca textual genérica em todo o banco. Procura por nome, título ou conteúdo em vagas, candidatos e candidaturas simultaneamente.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Texto para buscar" }
                },
                required: ["query"]
            }
        }
    },

    // --- CANDIDATOS POR VAGA ---
    {
        type: "function",
        function: {
            name: "list_candidates_for_job",
            description: "Lista todos os candidatos que se candidataram a uma vaga específica, com seus scores e stages.",
            parameters: {
                type: "object",
                properties: {
                    jobId: { type: "string", description: "ID da vaga" }
                },
                required: ["jobId"]
            }
        }
    },

    // --- MEMÓRIAS DA IA ---
    {
        type: "function",
        function: {
            name: "list_ai_memories",
            description: "Lista os termos e definições do glossário da empresa (memórias da IA). Útil para entender jargões e termos internos.",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    }
];

// =============================================
// HANDLERS DAS TOOLS (Execução segura)
// =============================================

const toolHandlers = {
    // --- VAGAS ---
    list_jobs: async (args) => {
        const database = await getDB();
        const where = {};
        if (args.status) where.status = args.status.toUpperCase();
        if (args.search) where.title = { [Op.iLike]: `%${args.search}%` };
        
        const jobs = await database.LocalJob.findAll({
            where,
            limit: args.limit || 20,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'title', 'status', 'source', 'areaId', 'createdAt']
        });
        return { count: jobs.length, jobs: jobs.map(j => j.get({ plain: true })) };
    },

    get_job_details: async (args) => {
        const database = await getDB();
        let job = null;
        
        if (args.jobId) {
            job = await database.LocalJob.findByPk(args.jobId, {
                include: [{ model: database.Scorecard, as: 'scorecards', attributes: ['id', 'name'] }]
            });
        } else if (args.title) {
            job = await database.LocalJob.findOne({
                where: { title: { [Op.iLike]: `%${args.title}%` } },
                include: [{ model: database.Scorecard, as: 'scorecards', attributes: ['id', 'name'] }]
            });
        }
        
        if (!job) return { error: "Vaga não encontrada" };
        
        const appCount = await database.LocalApplication.count({ where: { jobId: job.id } });
        const plain = job.get({ plain: true });
        plain.totalApplications = appCount;
        return plain;
    },

    // --- CANDIDATOS ---
    list_talents: async (args) => {
        const database = await getDB();
        const where = {};
        if (args.search) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${args.search}%` } },
                { headline: { [Op.iLike]: `%${args.search}%` } }
            ];
        }
        if (args.status) where.status = args.status.toUpperCase();
        if (args.minScore) where.matchScore = { [Op.gte]: args.minScore };
        
        const talents = await database.LocalTalent.findAll({
            where,
            limit: args.limit || 20,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'name', 'headline', 'linkedinUsername', 'location', 'status', 'matchScore', 'createdAt']
        });
        return { count: talents.length, talents: talents.map(t => t.get({ plain: true })) };
    },

    get_talent_details: async (args) => {
        const database = await getDB();
        let talent = null;
        
        if (args.talentId) {
            talent = await database.LocalTalent.findByPk(args.talentId, {
                include: [{ model: database.LocalApplication, as: 'applications', include: [{ model: database.LocalJob, as: 'job', attributes: ['id', 'title', 'status'] }] }]
            });
        } else if (args.name) {
            talent = await database.LocalTalent.findOne({
                where: { name: { [Op.iLike]: `%${args.name}%` } },
                include: [{ model: database.LocalApplication, as: 'applications', include: [{ model: database.LocalJob, as: 'job', attributes: ['id', 'title', 'status'] }] }]
            });
        } else if (args.linkedinUsername) {
            talent = await database.LocalTalent.findOne({
                where: { linkedinUsername: args.linkedinUsername },
                include: [{ model: database.LocalApplication, as: 'applications', include: [{ model: database.LocalJob, as: 'job', attributes: ['id', 'title', 'status'] }] }]
            });
        }
        
        if (!talent) return { error: "Candidato não encontrado" };
        
        const plain = talent.get({ plain: true });
        // Enviar dados do perfil mas limitar o tamanho para economizar tokens
        if (plain.data) {
            const { perfil, resumo, experiencias, formacao, skills } = plain.data;
            plain.profileSummary = { perfil, resumo, experiencias: experiencias?.slice(0, 5), formacao, skills };
            delete plain.data; // Remove o payload completo para economia de tokens
        }
        return plain;
    },

    // --- CANDIDATURAS ---
    list_applications: async (args) => {
        const database = await getDB();
        const where = {};
        if (args.jobId) where.jobId = args.jobId;
        if (args.talentId) where.talentId = args.talentId;
        if (args.stage) where.stage = args.stage;
        
        const applications = await database.LocalApplication.findAll({
            where,
            limit: args.limit || 20,
            order: [['createdAt', 'DESC']],
            include: [
                { model: database.LocalTalent, as: 'talent', attributes: ['id', 'name', 'headline'] },
                { model: database.LocalJob, as: 'job', attributes: ['id', 'title', 'status'] }
            ],
            attributes: ['id', 'stage', 'matchScore', 'createdAt']
        });
        return { count: applications.length, applications: applications.map(a => a.get({ plain: true })) };
    },

    get_application_details: async (args) => {
        const database = await getDB();
        const application = await database.LocalApplication.findByPk(args.applicationId, {
            include: [
                { model: database.LocalTalent, as: 'talent', attributes: ['id', 'name', 'headline', 'linkedinUsername', 'location'] },
                { model: database.LocalJob, as: 'job', attributes: ['id', 'title', 'status', 'description'] }
            ]
        });
        
        if (!application) return { error: "Candidatura não encontrada" };
        
        const plain = application.get({ plain: true });
        // Resumir aiReview para economizar tokens
        if (plain.aiReview && plain.aiReview.categories) {
            plain.aiReviewSummary = plain.aiReview.categories.map(c => ({
                name: c.name,
                score: c.score || c.averageScore,
                criteria: c.criteria?.map(cr => ({ name: cr.name, score: cr.score, justification: cr.justification }))
            }));
            delete plain.aiReview;
        }
        return plain;
    },

    // --- SCORECARDS ---
    list_scorecards: async (args) => {
        const database = await getDB();
        const where = {};
        if (args.jobId) where.jobId = args.jobId;
        
        const scorecards = await database.Scorecard.findAll({
            where,
            attributes: ['id', 'name', 'jobId', 'source', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        return { count: scorecards.length, scorecards: scorecards.map(s => s.get({ plain: true })) };
    },

    get_scorecard_details: async (args) => {
        const database = await getDB();
        const scorecard = await database.Scorecard.findByPk(args.scorecardId, {
            include: [{
                model: database.Category, as: 'categories',
                include: [{ model: database.Criterion, as: 'criteria' }]
            }]
        });
        
        if (!scorecard) return { error: "Scorecard não encontrado" };
        return scorecard.get({ plain: true });
    },

    // --- ESTATÍSTICAS ---
    count_records: async (args) => {
        const database = await getDB();
        const entityMap = {
            jobs: database.LocalJob,
            talents: database.LocalTalent,
            applications: database.LocalApplication,
            scorecards: database.Scorecard
        };
        
        const Model = entityMap[args.entity];
        if (!Model) return { error: "Entidade inválida" };
        
        const where = {};
        if (args.filters) {
            if (args.filters.status) where.status = args.filters.status.toUpperCase();
            if (args.filters.stage) where.stage = args.filters.stage;
        }
        
        const total = await Model.count({ where });
        
        // Estatísticas extras para cada entidade
        const stats = { entity: args.entity, total };
        
        if (args.entity === 'jobs') {
            stats.byStatus = {
                OPEN: await Model.count({ where: { status: 'OPEN' } }),
                CLOSED: await Model.count({ where: { status: 'CLOSED' } }),
                DRAFT: await Model.count({ where: { status: 'DRAFT' } }),
                PAUSED: await Model.count({ where: { status: 'PAUSED' } })
            };
        }
        
        if (args.entity === 'talents') {
            stats.byStatus = {
                NEW: await Model.count({ where: { status: 'NEW' } }),
                ACTIVE: await Model.count({ where: { status: 'ACTIVE' } }),
                REJECTED: await Model.count({ where: { status: 'REJECTED' } }),
                HIRED: await Model.count({ where: { status: 'HIRED' } })
            };
        }
        
        return stats;
    },

    // --- BUSCA GENÉRICA ---
    search_database: async (args) => {
        const database = await getDB();
        const query = args.query;
        
        const [jobs, talents] = await Promise.all([
            database.LocalJob.findAll({
                where: { [Op.or]: [
                    { title: { [Op.iLike]: `%${query}%` } },
                    { description: { [Op.iLike]: `%${query}%` } }
                ]},
                limit: 5,
                attributes: ['id', 'title', 'status', 'createdAt']
            }),
            database.LocalTalent.findAll({
                where: { [Op.or]: [
                    { name: { [Op.iLike]: `%${query}%` } },
                    { headline: { [Op.iLike]: `%${query}%` } }
                ]},
                limit: 5,
                attributes: ['id', 'name', 'headline', 'status', 'matchScore']
            })
        ]);
        
        return {
            jobs: { count: jobs.length, results: jobs.map(j => j.get({ plain: true })) },
            talents: { count: talents.length, results: talents.map(t => t.get({ plain: true })) }
        };
    },

    // --- CANDIDATOS POR VAGA ---
    list_candidates_for_job: async (args) => {
        const database = await getDB();
        const applications = await database.LocalApplication.findAll({
            where: { jobId: args.jobId },
            include: [
                { model: database.LocalTalent, as: 'talent', attributes: ['id', 'name', 'headline', 'location', 'status', 'matchScore'] }
            ],
            attributes: ['id', 'stage', 'matchScore', 'createdAt'],
            order: [['matchScore', 'DESC NULLS LAST']]
        });
        
        return {
            count: applications.length,
            candidates: applications.map(a => {
                const plain = a.get({ plain: true });
                return {
                    applicationId: plain.id,
                    stage: plain.stage,
                    matchScore: plain.matchScore,
                    talent: plain.talent,
                    appliedAt: plain.createdAt
                };
            })
        };
    },

    // --- MEMÓRIAS DA IA ---
    list_ai_memories: async () => {
        const database = await getDB();
        if (!database.AIMemory) return { memories: [], message: "Modelo AIMemory não disponível" };
        const memories = await database.AIMemory.findAll();
        return { count: memories.length, memories: memories.map(m => m.get({ plain: true })) };
    }
};

// =============================================
// EXPORTS
// =============================================

export const getToolDefinitions = () => toolDefinitions;

export const executeTool = async (toolName, args) => {
    const handler = toolHandlers[toolName];
    if (!handler) {
        return { error: `Ferramenta "${toolName}" não encontrada` };
    }
    
    try {
        const result = await handler(args);
        return result;
    } catch (err) {
        return { error: `Erro ao executar ${toolName}: ${err.message}` };
    }
};
