import { analyzeAllCriteriaInBatch } from './ai.service.js';
import { log, error as logError } from '../utils/logger.service.js';
import { findById as findLocalScorecardById } from './scorecard.service.js';
import { fetchInterviewKitDetails } from '../Core/Evaluation-Flow/evaluationOrchestrator.js';
import db from '../models/index.js'; // Adicionado para enriquecimento

// Função para converter o perfil estruturado em um texto rico e legível para a IA
const formatProfileToText = (profileData) => {
  const nome = profileData.perfil?.nome || profileData.name || 'N/A';
  const titulo = profileData.perfil?.titulo || profileData.headline || 'N/A';
  const local = profileData.perfil?.localizacao || profileData.location || 'N/A';

  let text = `NOME: ${nome}\n`;
  text += `TÍTULO: ${titulo}\n`;
  text += `LOCALIZAÇÃO: ${local}\n\n`;

  const resumo = profileData.resumo || profileData.about || '';
  if (resumo) {
    text += `RESUMO/SOBRE:\n${resumo}\n\n`;
  }

  const exps = profileData.structureExperience || profileData.experience || profileData.experiencias || [];
  if (exps.length > 0) {
    text += `EXPERIÊNCIA PROFISSIONAL:\n`;
    exps.forEach(exp => {
      const role = exp.role || exp.title || exp.cargo || 'N/A';
      const company = exp.company || exp.companyName || exp.empresa || 'N/A';
      text += `- ${role} na ${company} (${exp.start || exp.inicio || ''} - ${exp.end || exp.fim || 'Momento'})\n`;
      if (exp.description || exp.descricao) text += `  Detalhes: ${exp.description || exp.descricao}\n`;
    });
    text += `\n`;
  }

  const edus = profileData.structureEducation || profileData.education || profileData.formacao || [];
  if (edus.length > 0) {
    text += `FORMAÇÃO ACADÊMICA:\n`;
    edus.forEach(edu => {
      const degree = edu.degree || edu.curso || 'N/A';
      const school = edu.school || edu.instituicao || 'N/A';
      text += `- ${degree} na ${school} (${edu.start || edu.inicio || ''} - ${edu.end || edu.fim || ''})\n`;
    });
    text += `\n`;
  }

  const skills = profileData.skills || [];
  if (skills.length > 0) {
    text += `COMPETÊNCIAS:\n${skills.join(', ')}\n\n`;
  }

  const certs = profileData.certifications || profileData.certificacoes || [];
  if (certs.length > 0) {
    text += `CERTIFICAÇÕES:\n${certs.join(', ')}\n`;
  }

  return text;
};

const sortChildrenInMemory = (data) => {
  if (data.categories) {
    data.categories.sort((a, b) => a.order - b.order);
    data.categories.forEach(category => {
      if (category.criteria) {
        category.criteria.sort((a, b) => a.order - b.order);
      } else {
        category.criteria = [];
      }
    });
  }
};

const normalizeName = (name) => {
    if (!name) return '';
    return name.trim().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

// Normalização para unificar InHire Kit, Kit Virtual e Scorecard Local
const normalizeScorecard = (source, getEnrichment = null) => {
  if (!source) return null;

  // Se for estrutura de Kit vinda do orquestrador (skillCategories)
  if (source.skillCategories) {
    return {
      id: source.id,
      name: source.name,
      categories: source.skillCategories.map(cat => ({
        name: cat.name,
        criteria: (cat.skills || []).map(skill => {
          const enrich = getEnrichment ? getEnrichment(skill.name) : {};
          return {
            id: skill.id,
            name: skill.name,
            weight: source.weights?.[skill.id] || 2,
            weightType: enrich.weightType || 'normal',
            tag: enrich.tag || null
          };
        })
      }))
    };
  }

  // Se já for a estrutura de Scorecard (categories)
  if (source.categories) {
    return {
      id: source.id,
      name: source.name,
      categories: source.categories.map(cat => ({
        name: cat.name,
        criteria: (cat.criteria || []).map(crit => ({
          id: crit.id,
          name: crit.name,
          weight: crit.weight || 2,
          weightType: crit.weightType || 'normal',
          tag: crit.tag
        }))
      }))
    };
  }

  return null;
};

export const analyze = async (scorecardId, profileData, jobId = null) => {
  const startTime = Date.now();
    // log(`Iniciando análise FULL CONTEXT para o scorecard/kit: ${scorecardId} (Job: ${jobId})`);
    log(`DEBUG: Analisando ${profileData.perfil?.nome || profileData.name} contra ${scorecardId}`);

    try {
    // 1. Busca scorecard ou kit unificado via orquestrador
    let source = null;
    const kitResult = await fetchInterviewKitDetails(scorecardId);
    if (kitResult.success && kitResult.kit) {
      source = kitResult.kit;
    } else {
      source = await findLocalScorecardById(scorecardId);
    }

    if (!source) {
      const err = new Error('Scorecard ou Kit de Entrevista não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    // 1.5. Busca Enriquecimento Local (Campos personalizados que a InHire não tem)
    const enrichmentMap = {};
    try {
        const localSC = await db.Scorecard.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { jobId: jobId || null }, // Prioridade total se vier o jobId
                    { id: typeof scorecardId === 'string' && scorecardId.length > 20 ? scorecardId : null }, // Apenas se for UUID
                    { externalId: String(scorecardId) }
                ].filter(Boolean)
            },
            include: [{
                model: db.Category,
                as: 'categories',
                include: [{ model: db.Criterion, as: 'criteria' }]
            }]
        });

        if (localSC) {
            (localSC.categories || []).forEach(cat => {
                (cat.criteria || []).forEach(crit => {
                    const norm = normalizeName(crit.name);
                    enrichmentMap[norm] = {
                        weightType: crit.weightType,
                        tag: crit.tag
                    };
                });
            });
        }
    } catch (e) {
        // log(`Aviso: Falha ao buscar enriquecimento local: ${e.message}`);
    }

    // Função interna para buscar no map de forma robusta
    const getEnrichedData = (name) => {
        const norm = normalizeName(name);
        return enrichmentMap[norm] || {};
    };

    const scorecard = normalizeScorecard(source, getEnrichedData);
    if (!scorecard) {
      throw new Error('Falha ao processar a estrutura do scorecard/kit.');
    }

    // 2. Prepara o texto completo do perfil
    const fullProfileText = formatProfileToText(profileData);
    if (!fullProfileText || fullProfileText.length < 50) {
      throw new Error('O perfil não contém texto suficiente para análise.');
    }

    // 3. Coleta todos os critérios com metadados
    const allCriteriaWithMeta = [];
    scorecard.categories.forEach(category => {
      (category.criteria || []).forEach(criterion => {
        allCriteriaWithMeta.push({
          categoryName: category.name,
          criterion,
          weight: criterion.weight
        });
      });
    });

    // log(`Preparando análise para ${allCriteriaWithMeta.length} critérios...`);

    // 4. Prepara a estrutura para a IA (passando o texto completo como único "chunk")
    // O ai.service espera um array de chunks. Vamos passar um array com 1 elemento: o perfil todo.
    const criteriaWithChunks = allCriteriaWithMeta.map(({ criterion, categoryName, weight }) => ({
      categoryName,
      criterion,
      weight,
      weightType: criterion.weightType || 'normal',
      tag: criterion.tag,
      chunks: [fullProfileText] // FULL CONTEXT MAGIC!
    }));

    // 5. ANÁLISE EM BATCH (1 chamada à API ou chamadas paralelas rápidas)
    // O ai.service deve ser capaz de lidar com isso.

    // Preparar contexto global (metadados simples)
    const globalContext = {
      name: profileData.name,
      headline: profileData.headline,
      summary: profileData.about
    };

    const evaluations = await analyzeAllCriteriaInBatch(criteriaWithChunks, globalContext);
    log(`DEBUG: Recebidas ${evaluations.length} avaliações da IA.`);

    // 6. Mapeia resultados de volta e 7. Agrupa por categoria
    const categoryMap = new Map();

    scorecard.categories.forEach(category => {
      categoryMap.set(category.name, {
        name: category.name,
        criteria: [],
        weightedScore: 0,
        totalWeight: 0
      });
    });

    if (evaluations.length !== criteriaWithChunks.length) {
      logError(`Erro de mapeamento: esperado ${criteriaWithChunks.length} resultados, mas recebeu ${evaluations.length}.`);
    }

    let essentialFailed = false;
    let essentialCriterion = null;
    let essentialTag = null;
    let essentialJustification = null;

    criteriaWithChunks.forEach(({ categoryName, criterion, weight, weightType, tag }, index) => {
      let evaluation = evaluations[index];

      if (!evaluation || typeof evaluation.score === 'undefined') {
        evaluation = {
          name: criterion.name,
          score: 0,
          justification: "Falha na análise da IA"
        };
      } else {
        evaluation.name = criterion.name;
        evaluation.justification = evaluation.justification.replace(/\[Frag \d+\]:?/g, '').trim();
      }

      // Adiciona metadados de peso para o frontend
      evaluation.weightType = weightType;
      evaluation.tag = tag;

      // Lógica de Peso e Imprescindível
      let baseWeight = weight || 2; // Default para médio (2)
      let effectiveWeight = baseWeight;
      if (weightType === 'priority') effectiveWeight = baseWeight * 2;
      
      // Ajuste de Threshold para Imprescindível: falha se nota for menor que 60 (escala 0-100)
      if (weightType === 'essential' && evaluation.score < 60 && !essentialFailed) {
          essentialFailed = true;
          essentialCriterion = criterion.name;
          essentialTag = tag;
          essentialJustification = evaluation.justification;
      }

      const category = categoryMap.get(categoryName);
      if (category) {
        category.criteria.push(evaluation);
        category.weightedScore += evaluation.score * effectiveWeight;
        category.totalWeight += effectiveWeight; // Agora apenas o peso absoluto
      }
    });

    // 8. Calcula scores finais
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const categoryResults = [];

    categoryMap.forEach(category => {
      const categoryScore = category.totalWeight > 0
        ? Math.round(category.weightedScore / category.totalWeight)
        : 0;

      totalWeightedScore += category.weightedScore;
      totalWeight += category.totalWeight;

      categoryResults.push({
        name: category.name,
        score: categoryScore,
        criteria: category.criteria
      });
    });

    const overallScore = totalWeight > 0
      ? Math.round(totalWeightedScore / totalWeight)
      : 0;

    const result = {
      overallScore,
      profileName: profileData.perfil?.nome || profileData.name,
      profileHeadline: profileData.perfil?.titulo || profileData.headline,
      categories: categoryResults,
      evaluations: evaluations, // Mantém a lista flat para facilitar exibição detalhada
      essentialFailed,
      essentialCriterion,
      essentialTag,
      essentialJustification
    };

    const duration = Date.now() - startTime;
    log(`✓ Análise FULL CONTEXT concluída em ${duration}ms. Score: ${overallScore}%`);

    return result;

  } catch (err) {
    logError('Erro na análise:', err.message);
    throw err;
  }
};