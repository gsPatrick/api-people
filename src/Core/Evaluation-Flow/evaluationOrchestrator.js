// ARQUIVO COMPLETO E CORRIGIDO: src/Core/Evaluation-Flow/evaluationOrchestrator.js

import { htmlToText } from 'html-to-text';
import { getInterviewKitsForJob, submitScorecardResponse, getScorecardSummaryForApplication, createJobScorecard, createInterviewKit, getInterviewKitById } from '../../Inhire/ScoreCards/scorecards.service.js';
import { getWeightsForKit, saveWeightsForKit } from './weights.service.js';
import { saveLocalScorecardResponse, getLocalScorecardResponse } from '../../Platform/Cache/cache.service.js'; // Importação do Cache Local
import { log, error } from '../../utils/logger.service.js';
import { saveDebugDataToFile } from '../../utils/debug.service.js';

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

const mapLocalPayloadToSummary = (localPayload) => {
    if (!localPayload) return [];

    // Converte o payload local para o formato de "Summary" esperado pelo frontend
    return [{
        userId: 'local-user', // Placeholder, já que o backend não sabe quem salvou nesse contexto
        userName: 'Você (Salvo Localmente)',
        scorecardInterviewId: 'local-save',
        interviewName: 'Avaliação Recente',
        feedback: localPayload.feedback,
        privateNotes: localPayload.privateNotes,
        skillCategories: localPayload.skillCategories
    }];
};

export const fetchScorecardDataForApplication = async (applicationId, jobId) => {
    try {
        log(`[SCORECARD] Fetching data for applicationId: ${applicationId}`);

        // 1. Tenta buscar do cache local PRIMEIRO (Prioridade para dados recentes)
        const localData = await getLocalScorecardResponse(applicationId);
        if (localData) {
            log(`[SCORECARD] ✅ FOUND local data for app ${applicationId}. Serving immediately.`);
            const formattedSummary = mapLocalPayloadToSummary(localData);
            log(`[SCORECARD] Formatted summary items: ${formattedSummary.length}`);
            return { success: true, data: { type: 'summary', content: formattedSummary } };
        } else {
            log(`[SCORECARD] ⚠️ No local data found for app ${applicationId}. Falling back to InHire API.`);
        }

        // 2. Se não tiver local, busca da API InHire
        const summary = await getScorecardSummaryForApplication(applicationId);
        const hasActualEvaluations = summary && Array.isArray(summary) && summary.length > 0 &&
            summary.some(group => group.evaluationsFeedbacks && group.evaluationsFeedbacks.length > 0);

        if (hasActualEvaluations) {
            const formattedSummary = mapScorecardSummary(summary);
            return { success: true, data: { type: 'summary', content: formattedSummary } };
        } else {
            return { success: true, data: { type: 'summary', content: [] } };
        }
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
        const kitStructure = await getInterviewKitById(scorecardId);
        if (!kitStructure) {
            throw new Error("Não foi possível encontrar a estrutura do kit para formatar o payload.");
        }

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

        // 2. Envia para a InHire
        const submissionResult = await submitScorecardResponse(applicationId, scorecardId, payloadForInHire);
        if (!submissionResult) {
            throw new Error("Falha ao submeter avaliação. A API da InHire não retornou sucesso.");
        }
        return { success: true, submission: submissionResult };
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


export const fetchInterviewKitDetails = async (kitId) => {
    log(`--- ORQUESTRADOR: Buscando detalhes para o kit de entrevista ${kitId} ---`);
    try {
        let kit = await getInterviewKitById(kitId);
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