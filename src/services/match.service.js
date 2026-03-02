import { analyzeAllCriteriaInBatch } from './ai.service.js';
import { log, error as logError } from '../utils/logger.service.js';
import { findById as findLocalScorecardById } from './scorecard.service.js';
import { fetchInterviewKitDetails } from '../Core/Evaluation-Flow/evaluationOrchestrator.js';

// Função para converter o perfil estruturado em um texto rico e legível para a IA
const formatProfileToText = (profileData) => {
  const nome = profileData.perfil?.nome || profileData.name || 'N/A';
  const titulo = profileData.perfil?.titulo || profileData.headline || 'N/A';
  const local = profileData.perfil?.localizacao || profileData.location || 'N/A';

  let text = `NOME: ${nome}\n`;
  text += `TÍTULO: ${titulo}\n`;
  text += `LOCALIZAÇÃO: ${local}\n\n`;

  if (profileData.about) {
    text += `RESUMO/SOBRE:\n${profileData.about}\n\n`;
  }

  if (profileData.structureExperience && profileData.structureExperience.length > 0) {
    text += `EXPERIÊNCIA PROFISSIONAL:\n`;
    profileData.structureExperience.forEach(exp => {
      text += `- ${exp.role} na ${exp.company} (${exp.start} - ${exp.end || 'Momento'})\n`;
      if (exp.description) text += `  Detalhes: ${exp.description}\n`;
    });
    text += `\n`;
  } else if (profileData.experience && profileData.experience.length > 0) {
    // Fallback para estrutura antiga
    text += `EXPERIÊNCIA PROFISSIONAL:\n`;
    profileData.experience.forEach(exp => {
      text += `- ${exp.title} na ${exp.companyName}. ${exp.description || ''}\n`;
    });
    text += `\n`;
  }

  if (profileData.structureEducation && profileData.structureEducation.length > 0) {
    text += `FORMAÇÃO ACADÊMICA:\n`;
    profileData.structureEducation.forEach(edu => {
      text += `- ${edu.degree} em ${edu.field} na ${edu.school} (${edu.start} - ${edu.end})\n`;
    });
    text += `\n`;
  }

  if (profileData.skills && profileData.skills.length > 0) {
    text += `COMPETÊNCIAS:\n${profileData.skills.join(', ')}\n\n`;
  }

  if (profileData.certifications && profileData.certifications.length > 0) {
    text += `CERTIFICAÇÕES:\n${profileData.certifications.join(', ')}\n`;
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

// Normalização para unificar InHire Kit, Kit Virtual e Scorecard Local
const normalizeScorecard = (source) => {
  if (!source) return null;

  // Se for estrutura de Kit vinda do orquestrador (skillCategories)
  if (source.skillCategories) {
    return {
      id: source.id,
      name: source.name,
      categories: source.skillCategories.map(cat => ({
        name: cat.name,
        criteria: (cat.skills || []).map(skill => ({
          id: skill.id,
          name: skill.name,
          weight: source.weights?.[skill.id] || 2
        }))
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
          weight: crit.weight || 2
        }))
      }))
    };
  }

  return null;
};

export const analyze = async (scorecardId, profileData) => {
  const startTime = Date.now();
  log(`Iniciando análise FULL CONTEXT para o scorecard/kit: ${scorecardId}`);

  try {
    // 1. Busca scorecard ou kit unificado via orquestrador
    let source = null;

    // Tenta primeiro via orquestrador (Kits InHire e Virtuais)
    const kitResult = await fetchInterviewKitDetails(scorecardId);
    if (kitResult.success && kitResult.kit) {
      source = kitResult.kit;
    } else {
      // Fallback para Scorecard Local
      source = await findLocalScorecardById(scorecardId);
    }

    if (!source) {
      const err = new Error('Scorecard ou Kit de Entrevista não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const scorecard = normalizeScorecard(source);
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

    log(`Preparando análise para ${allCriteriaWithMeta.length} critérios...`);

    // 4. Prepara a estrutura para a IA (passando o texto completo como único "chunk")
    // O ai.service espera um array de chunks. Vamos passar um array com 1 elemento: o perfil todo.
    const criteriaWithChunks = allCriteriaWithMeta.map(({ criterion, categoryName, weight }) => ({
      categoryName,
      criterion,
      weight,
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

    criteriaWithChunks.forEach(({ categoryName, criterion, weight }, index) => {
      let evaluation = evaluations[index];

      if (!evaluation || typeof evaluation.score === 'undefined') {
        evaluation = {
          name: criterion.name,
          score: 1,
          justification: "Falha na análise da IA"
        };
      } else {
        evaluation.name = criterion.name;
        // Ajuste no justification caso a IA cite "Fragmento 1" (estética)
        evaluation.justification = evaluation.justification.replace(/\[Frag \d+\]:?/g, '').trim();
      }

      const category = categoryMap.get(categoryName);
      if (category) {
        category.criteria.push(evaluation);
        category.weightedScore += evaluation.score * weight;
        category.totalWeight += 5 * weight;
      }
    });

    // 8. Calcula scores finais
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const categoryResults = [];

    categoryMap.forEach(category => {
      const categoryScore = category.totalWeight > 0
        ? Math.round((category.weightedScore / category.totalWeight) * 100)
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
      ? Math.round((totalWeightedScore / totalWeight) * 100)
      : 0;

    const result = {
      overallScore,
      profileName: profileData.perfil?.nome || profileData.name,
      profileHeadline: profileData.perfil?.titulo || profileData.headline,
      categories: categoryResults,
      evaluations: evaluations // Mantém a lista flat para facilitar exibição detalhada
    };

    const duration = Date.now() - startTime;
    log(`✓ Análise FULL CONTEXT concluída em ${duration}ms. Score: ${overallScore}%`);

    return result;

  } catch (err) {
    logError('Erro na análise:', err.message);
    throw err;
  }
};