import { htmlToText } from 'html-to-text';
import { getInterviewKitsForJob, submitScorecardResponse, getScorecardSummaryForApplication, createJobScorecard, createInterviewKit, getInterviewKitById } from '../../Inhire/ScoreCards/scorecards.service.js';
import { getWeightsForKit, saveWeightsForKit } from './weights.service.js';
import { saveLocalScorecardResponse, getLocalScorecardResponse } from '../../Platform/Cache/cache.service.js'; // Importação do Cache Local
import { log, error } from '../../utils/logger.service.js';
import { saveDebugDataToFile } from '../../utils/debug.service.js';
import db from '../../models/index.js'; // Importa o banco para acessar LocalApplication

/**
 * Converte o aiReview (resultado do Match) para o formato de summary esperado pelo frontend.
 * Este formato é compatível com o ScorecardView.jsx.
 */
const mapAiReviewToSummary = (aiReview, scorecardId) => {
    if (!aiReview || !aiReview.categories) return null;

    // Converte 'categories' -> 'skillCategories' e 'criteria' -> 'skills'
    const skillCategories = aiReview.categories.map(cat => ({
        name: cat.name,
        skills: (cat.criteria || []).map(crit => ({
            name: crit.name,
            score: crit.score,
            description: crit.justification || ''
        }))
    }));

    return {
        userId: 'ai-match',
        userName: 'Match Automático (IA)',
        scorecardInterviewId: scorecardId,
        interviewName: 'Avaliação do Match',
        feedback: {
            comment: aiReview.overallFeedback || '',
            proceed: aiReview.finalDecision || 'NO_DECISION'
        },
        privateNotes: '',
        skillCategories
    };
};

const enrichKitDataWithIds = (kit) => {
    if (kit && Array.isArray(kit.skillCategories)) {
        kit.skillCategories.forEach((category, catIndex) => {
            if (!category.id) { category.id = `cat-${kit.id}-${catIndex}`; }
            if (Array.isArray(category.skills)) {
                category.skills.forEach((skill, skillIndex) => {
                    if (!skill.id) {
                        const nameHash = skill.name.replace(/\s+/g, '-').toLowerCase().slice(0, 20);
                        skill.id = `skill-${category.id}-${nameHash}-${skillIndex}`;
                    }
                });
            }
        });
    }
    return kit;
};

const cleanHtmlScript = (kit) => {
    if (kit && kit.script) {
        kit.script = htmlToText(kit.script, {
            wordwrap: 130,
            selectors: [
                { selector: 'p', options: { marginBottom: 1, trimEmptyLines: true } },
                { selector: 'h1', options: { uppercase: false, prefix: '## ', suffix: ' ##' } },
                { selector: 'h2', options: { uppercase: false, prefix: '### ', suffix: ' ###' } },
                { selector: 'strong', format: 'inline', options: { uppercase: false, prefix: '**', suffix: '**' } },
                { selector: 'b', format: 'inline', options: { uppercase: false, prefix: '**', suffix: '**' } },
                { selector: 'a', format: 'skip' }
            ]
        });
    }
    return kit;
}

const mapScorecardSummary = (apiSummary) => {
    if (!apiSummary || !Array.isArray(apiSummary) || apiSummary.length === 0) { return []; }
    const allEvaluations = [];
    apiSummary.forEach(evaluationGroup => {
        const scoresMap = new Map();
        if (Array.isArray(evaluationGroup.skillsScore)) {
            evaluationGroup.skillsScore.forEach(categoryScore => {
                if (Array.isArray(categoryScore.skills)) {
                    categoryScore.skills.forEach(skillScore => {
                        const compositeKey = `${categoryScore.name}::${skillScore.name}`;
                        scoresMap.set(compositeKey, skillScore.score);
                    });
                }
            });
        }
        (evaluationGroup.evaluationsFeedbacks || []).forEach(feedback => {
            const formattedEval = {
                userId: evaluationGroup.userId,
                userName: evaluationGroup.userName,
                scorecardInterviewId: feedback.scorecardInterviewId,
                interviewName: feedback.scorecardInterviewName,
                feedback: { comment: feedback.comment, proceed: feedback.proceed },
                privateNotes: feedback.annotations,
                skillCategories: []
            };
            if (Array.isArray(evaluationGroup.skillsScore)) {
                evaluationGroup.skillsScore.forEach(categoryScore => {
                    const newCategory = { name: categoryScore.name, skills: [] };
                    if (Array.isArray(categoryScore.skills)) {
                        categoryScore.skills.forEach(skillInfo => {
                            const compositeKey = `${categoryScore.name}::${skillInfo.name}`;
                            const score = scoresMap.get(compositeKey);
                            newCategory.skills.push({
                                name: skillInfo.name,
                                score: score,
                                description: skillInfo.description || ''
                            });
                        });
                    }
                    formattedEval.skillCategories.push(newCategory);
                });
            }
            allEvaluations.push(formattedEval);
        });
    });
    return allEvaluations;
};

const mapLocalPayloadToSummary = (localPayload, scorecardId) => {
    if (!localPayload) return [];

    // Converte o payload local para o formato de "Summary" esperado pelo frontend
    return [{
        userId: 'local-user', // Placeholder, já que o backend não sabe quem salvou nesse contexto
        userName: 'Você (Salvo Localmente)',
        scorecardInterviewId: scorecardId, // ID REAL vindo do banco, crucial para o match no frontend
        interviewName: 'Avaliação Recente',
        feedback: localPayload.feedback,
        privateNotes: localPayload.privateNotes,
        skillCategories: localPayload.skillCategories
    }];
};

export const fetchScorecardDataForApplication = async (applicationId, jobId) => {
    try {
        log(`[SCORECARD] Fetching data for applicationId: ${applicationId}, jobId: ${jobId}`);

        const allSummaries = [];

        // === PASSO 0: Busca scorecardId do primeiro kit disponível ou gera um virtual ===
        let defaultScorecardId = null;
        let virtualKit = null;

        try {
            const kitsRes = await fetchAvailableKitsForJob(jobId);
            if (kitsRes.success && kitsRes.kits && kitsRes.kits.length > 0) {
                defaultScorecardId = kitsRes.kits[0].id;
                log(`[SCORECARD] Kit principal encontrado ou sintetizado: ${defaultScorecardId}`);
                if (defaultScorecardId.startsWith('ai_kit_')) {
                    virtualKit = kitsRes.kits[0];
                }
            }
        } catch (e) {
            log(`[SCORECARD] Could not fetch kits for jobId ${jobId}: ${e.message}`);
        }

        // === PASSO 1: Buscar aiReview do LocalApplication (Match) ===
        try {
            const localApp = await db.LocalApplication.findOne({ where: { id: applicationId } });
            if (localApp && localApp.aiReview && localApp.aiReview.categories) {
                log(`[SCORECARD] ✅ FOUND aiReview from Match in LocalApplication ${applicationId}`);
                // Usamos o defaultScorecardId (pode ser o real ou o virtual 'ai_kit_...')
                const matchSummary = mapAiReviewToSummary(localApp.aiReview, defaultScorecardId);
                if (matchSummary) {
                    allSummaries.push(matchSummary);
                }
            }
        } catch (e) {
            log(`[SCORECARD] Could not fetch LocalApplication: ${e.message}`);
        }

        // === PASSO 2: Buscar do cache local (salvamentos manuais recentes) ===
        const localResponse = await getLocalScorecardResponse(applicationId);
        if (localResponse && localResponse.payload) {
            log(`[SCORECARD] ✅ FOUND local cache data for app ${applicationId}`);
            const formattedSummary = mapLocalPayloadToSummary(localResponse.payload, localResponse.scorecardId);
            allSummaries.push(...formattedSummary);
        }

        // === PASSO 3: Buscar da API InHire (dados externos) ===
        try {
            const summary = await getScorecardSummaryForApplication(applicationId);
            const hasActualEvaluations = summary && Array.isArray(summary) && summary.length > 0 &&
                summary.some(group => group.evaluationsFeedbacks && group.evaluationsFeedbacks.length > 0);

            if (hasActualEvaluations) {
                const formattedSummary = mapScorecardSummary(summary);
                allSummaries.push(...formattedSummary);
            }
        } catch (e) {
            log(`[SCORECARD] InHire API fallback failed: ${e.message}`);
        }

        log(`[SCORECARD] Total summaries found: ${allSummaries.length}`);
        return { success: true, data: { type: 'summary', content: allSummaries } };

    } catch (err) {
        error("Erro em fetchScorecardDataForApplication:", err.message);
        return { success: false, error: err.message };
    }
};


export const handleScorecardSubmission = async (applicationId, scorecardId, evaluationDataFromFrontend) => {
    log(`--- ORQUESTRADOR: Submetendo avaliação para a candidatura ${applicationId} ---`);
    try {
        if (!applicationId || !scorecardId || !evaluationDataFromFrontend) {
            throw new Error("applicationId, scorecardId e evaluationData são obrigatórios.");
        }
        let kitStructure = null;

        if (scorecardId && scorecardId.startsWith('ai_kit_')) {
            // Sintetiza a estrutura a partir do match para validar o payload
            const jobId = scorecardId.replace('ai_kit_', '');
            const fallbackApplication = await db.LocalApplication.findOne({
                where: { jobId, aiReview: { [db.Sequelize.Op.ne]: null } },
                order: [['updatedAt', 'DESC']]
            });
            if (fallbackApplication) {
                kitStructure = synthesizeKitFromMatch(jobId, fallbackApplication.aiReview);
            }
        } else {
            kitStructure = await getInterviewKitById(scorecardId);
        }

        if (!kitStructure) {
            throw new Error("Não foi possível encontrar a estrutura do kit para formatar o payload.");
        }

        // Garante que a estrutura tenha os IDs (caso a API crua não traga)
        enrichKitDataWithIds(kitStructure);

        // ==========================================================
        // CORREÇÃO DE ROBUSTEZ APLICADA AQUI
        // ==========================================================
        const payloadForInHire = {
            feedback: {
                comment: evaluationDataFromFrontend.feedback || '',
                // Garante que a decisão seja um valor válido, com um fallback seguro.
                proceed: ['YES', 'NO', 'NO_DECISION'].includes(evaluationDataFromFrontend.decision)
                    ? evaluationDataFromFrontend.decision
                    : 'NO_DECISION'
            },
            privateNotes: evaluationDataFromFrontend.notes || '',
            skillCategories: (kitStructure.skillCategories || []).map(category => ({
                name: category.name,
                // Garante que 'skills' seja um array antes de mapear
                skills: (category.skills || []).map(skill => {
                    // Garante que 'ratings' exista e que 'skill.id' seja válido
                    const ratingData = evaluationDataFromFrontend.ratings && skill.id
                        ? evaluationDataFromFrontend.ratings[skill.id]
                        : null; // Se não houver dados, ratingData é nulo

                    return {
                        name: skill.name,
                        // Acessa 'score' e 'description' de forma segura, com fallbacks
                        score: ratingData?.score || 0,
                        description: ratingData?.description || ''
                    };
                })
            }))
        };

        saveDebugDataToFile(`submission_payload_${applicationId}_${Date.now()}.txt`, { fromFrontend: evaluationDataFromFrontend, sentToInHire: payloadForInHire });

        // 1. Salva localmente para garantir persistência imediata
        await saveLocalScorecardResponse(applicationId, scorecardId, payloadForInHire);

        // 2. Envia para a InHire (apenas se não for virtual)
        if (scorecardId && !scorecardId.startsWith('ai_kit_')) {
            const submissionResult = await submitScorecardResponse(applicationId, scorecardId, payloadForInHire);
            if (!submissionResult) {
                throw new Error("Falha ao submeter avaliação. A API da InHire não retornou sucesso.");
            }
            return { success: true, submission: submissionResult };
        } else {
            log(`[SCORECARD] ✅ Submissão de kit VIRTUAL salva apenas localmente.`);
            return { success: true, submission: { message: "Salvo localmente com sucesso." } };
        }
    } catch (err) {
        error("Erro em handleScorecardSubmission:", err.message);
        // Inclui o stack trace no erro para melhor depuração no backend
        error("Stack Trace:", err.stack);
        return { success: false, error: err.message };
    }
};

export const handleCreateScorecardAndKit = async (data) => {
    const { jobId, jobStageId, name, script, skillCategories } = data;
    log(`--- ORQUESTRADOR: Criando Scorecard e Kit para vaga ${jobId} ---`);
    try {
        if (!jobId || !jobStageId || !name || !skillCategories) {
            throw new Error("Dados insuficientes para criar Scorecard e Kit.");
        }
        await createJobScorecard(jobId, skillCategories);
        log(`Scorecard base para a vaga ${jobId} garantido.`);
        const newKit = await createInterviewKit({ jobId, jobStageId, name, script, skillCategories });
        if (!newKit) throw new Error("Falha ao criar o novo Kit de Entrevista.");

        const enrichedKit = enrichKitDataWithIds(newKit);
        const cleanedKit = cleanHtmlScript(enrichedKit);

        log(`Kit de Entrevista "${name}" criado com sucesso.`);
        return { success: true, kit: cleanedKit };
    } catch (err) {
        error("Erro em handleCreateScorecardAndKit:", err.message);
        return { success: false, error: err.message };
    }
};

export const fetchAvailableKitsForJob = async (jobId) => {
    log(`--- ORQUESTRADOR: Buscando APENAS KITS para a vaga ${jobId} ---`);
    try {
        let kits = await getInterviewKitsForJob(jobId);

        // [NOVO] Se não houver kits e houver um Match da IA recente, sintetiza um kit virtual
        if (!kits || kits.length === 0) {
            log(`Nenhum kit encontrado para ${jobId}. Verificando se há Match IA disponível...`);
            const fallbackApplication = await db.LocalApplication.findOne({
                where: { jobId, aiReview: { [db.Sequelize.Op.ne]: null } },
                include: [{ model: db.LocalJob, as: 'job' }],
                order: [['updatedAt', 'DESC']]
            });

            if (fallbackApplication && fallbackApplication.aiReview) {
                const virtualKit = synthesizeKitFromMatch(jobId, fallbackApplication.aiReview);
                kits = [virtualKit];
            }
        }

        if (kits && Array.isArray(kits)) {
            kits = kits.map(kit => {
                const enrichedKit = enrichKitDataWithIds(kit);
                return cleanHtmlScript(enrichedKit);
            });
        }
        return { success: true, kits: kits || [] };
    } catch (err) {
        error("Erro em fetchAvailableKitsForJob:", err.message);
        return { success: false, error: err.message };
    }
};

// Auxiliar para gerar estrutura de kit a partir do Match
const synthesizeKitFromMatch = (jobId, aiReview) => {
    return {
        id: `ai_kit_${jobId}`,
        name: "Ficha de Abordagem (Match IA)",
        isAiGenerated: true,
        skillCategories: (aiReview.categories || []).map((cat, catIdx) => ({
            id: `cat-ai-${catIdx}`,
            name: cat.name,
            skills: (cat.criteria || []).map((crit, critIdx) => ({
                id: `skill-ai-${catIdx}-${critIdx}`,
                name: crit.name
            }))
        }))
    };
};


export const fetchInterviewKitDetails = async (kitId) => {
    log(`--- ORQUESTRADOR: Buscando detalhes para o kit de entrevista ${kitId} ---`);
    try {
        let kit = null;

        if (kitId && kitId.startsWith('ai_kit_')) {
            const jobId = kitId.replace('ai_kit_', '');
            const fallbackApplication = await db.LocalApplication.findOne({
                where: { jobId, aiReview: { [db.Sequelize.Op.ne]: null } },
                order: [['updatedAt', 'DESC']]
            });
            if (fallbackApplication) {
                kit = synthesizeKitFromMatch(jobId, fallbackApplication.aiReview);
            }
        } else {
            kit = await getInterviewKitById(kitId);
        }

        if (!kit) {
            throw new Error(`Kit de entrevista com ID ${kitId} não encontrado.`);
        }

        const enrichedKit = enrichKitDataWithIds(kit);
        const cleanedKit = cleanHtmlScript(enrichedKit);

        const weights = await getWeightsForKit(kitId);
        const finalKit = { ...cleanedKit, weights };

        return { success: true, kit: finalKit };

    } catch (err) {
        error(`Erro em fetchInterviewKitDetails para o kit ${kitId}:`, err.message);
        return { success: false, error: err.message };
    }
};

export const handleSaveKitWeights = async (kitId, weightsData) => {
    log(`--- ORQUESTRADOR: Salvando pesos para o kit ${kitId} ---`);
    try {
        if (!kitId || !weightsData) {
            throw new Error("kitId e weightsData são obrigatórios.");
        }
        const success = await saveWeightsForKit(kitId, weightsData);
        if (!success) {
            throw new Error("O serviço de pesos falhou ao salvar os dados.");
        }
        return { success: true };
    } catch (err) {
        error(`Erro em handleSaveKitWeights para o kit ${kitId}:`, err.message);
        return { success: false, error: err.message };
    }
};