// ARQUIVO COMPLETO E ATUALIZADO: src/services/scorecard.service.js

import db from '../models/index.js';
// <-- MUDANÇA 1: Importa `clearCache` individualmente
import { clearCacheByPrefix, getFromCache, setToCache, clearCache } from '../utils/cache.service.js';
import { log, error as logError } from '../utils/logger.service.js';

const SCORECARDS_CACHE_PREFIX = 'scorecards_';
const ALL_SCORECARDS_CACHE_KEY = `${SCORECARDS_CACHE_PREFIX}all`;

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

export const findAll = async () => {
  const cachedScorecards = getFromCache(ALL_SCORECARDS_CACHE_KEY);
  if (cachedScorecards) {
    return cachedScorecards;
  }
  try {
    const scorecards = await db.Scorecard.findAll({
      include: [ { model: db.Category, as: 'categories', include: [{ model: db.Criterion, as: 'criteria' }] } ],
      order: [['name', 'ASC']],
    });
    const plainScorecards = scorecards.map(sc => sc.get({ plain: true }));
    plainScorecards.forEach(sortChildrenInMemory);
    setToCache(ALL_SCORECARDS_CACHE_KEY, plainScorecards);
    return plainScorecards;
  } catch (err) {
    logError('Erro ao buscar todos os scorecards:', err.message);
    throw new Error('Não foi possível recuperar os scorecards do banco de dados.');
  }
};

export const findById = async (id) => {
  const cacheKey = `${SCORECARDS_CACHE_PREFIX}${id}`;
  const cachedScorecard = getFromCache(cacheKey);
  if (cachedScorecard) {
    return cachedScorecard;
  }
  try {
    const scorecard = await db.Scorecard.findByPk(id, {
      include: [ { model: db.Category, as: 'categories', separate: true, include: [{ model: db.Criterion, as: 'criteria' }] } ],
    });
    if (scorecard) {
      const plainScorecard = scorecard.get({ plain: true });
      sortChildrenInMemory(plainScorecard);
      setToCache(cacheKey, plainScorecard);
      return plainScorecard;
    }
    return null;
  } catch (err) {
    logError(`Erro ao buscar scorecard com ID ${id}:`, err.message);
    throw new Error('Não foi possível recuperar o scorecard do banco de dados.');
  }
};

export const create = async (scorecardData) => {
  const t = await db.sequelize.transaction();
  try {
    const { categories, ...restOfData } = scorecardData;
    const newScorecard = await db.Scorecard.create(restOfData, { transaction: t });

    if (categories && categories.length > 0) {
      for (const [categoryIndex, categoryData] of categories.entries()) {
        const { criteria, ...restOfCategory } = categoryData;
        const newCategory = await db.Category.create({ ...restOfCategory, scorecardId: newScorecard.id, order: categoryIndex }, { transaction: t });
        if (criteria && criteria.length > 0) {
          for (const [criterionIndex, criterionData] of criteria.entries()) {
            if (criterionData.name && criterionData.name.trim() !== '') {
              await db.Criterion.create({ ...criterionData, categoryId: newCategory.id, order: criterionIndex }, { transaction: t });
            }
          }
        }
      }
    }
    await t.commit();
    
    // <-- MUDANÇA 2: Invalidar apenas o cache geral, não os individuais.
    clearCache(ALL_SCORECARDS_CACHE_KEY);
    log(`Cache de scorecards invalidado após a criação de '${newScorecard.name}'.`);
    
    // <-- MUDANÇA 3: A função `findById` agora vai buscar do DB e AUTOMATICAMENTE popular o cache para o novo ID.
    return findById(newScorecard.id);

  } catch (err) {
    await t.rollback();
    logError('Erro ao criar scorecard:', err.message);
    throw new Error('Falha ao criar o scorecard. A transação foi revertida.');
  }
};

// As funções `update` e `remove` já usam `clearCacheByPrefix`, que está correto para esses casos.
// O restante do arquivo permanece igual.

export const update = async (id, scorecardData) => {
    const t = await db.sequelize.transaction();
    try {
        const scorecard = await db.Scorecard.findByPk(id, { transaction: t });
        if (!scorecard) throw new Error('Scorecard não encontrado.');
        const { categories, ...restOfData } = scorecardData;
        await scorecard.update(restOfData, { transaction: t });
        await db.Category.destroy({ where: { scorecardId: id }, transaction: t });
        if (categories && categories.length > 0) {
            for (const [categoryIndex, categoryData] of categories.entries()) {
                const { criteria, ...restOfCategory } = categoryData;
                const newCategory = await db.Category.create({ ...restOfCategory, scorecardId: id, order: categoryIndex }, { transaction: t });
                if (criteria && criteria.length > 0) {
                    for (const [criterionIndex, criterionData] of criteria.entries()) {
                        if (criterionData.name && criterionData.name.trim() !== '') {
                           await db.Criterion.create({ ...criterionData, categoryId: newCategory.id, order: criterionIndex }, { transaction: t });
                        }
                    }
                }
            }
        }
        await t.commit();
        clearCacheByPrefix(SCORECARDS_CACHE_PREFIX);
        log(`Cache de scorecards invalidado após a atualização de '${scorecard.name}'.`);
        return findById(id);
    } catch (err) {
        await t.rollback();
        logError(`Erro ao atualizar scorecard ${id}:`, err.message);
        throw new Error('Falha ao atualizar o scorecard. A transação foi revertida.');
    }
};

export const remove = async (id) => {
    const t = await db.sequelize.transaction();
    try {
        const scorecard = await db.Scorecard.findByPk(id, { transaction: t });
        if (!scorecard) {
            return false;
        }
        await scorecard.destroy({ transaction: t });
        await t.commit();
        clearCacheByPrefix(SCORECARDS_CACHE_PREFIX);
        log(`Cache de scorecards invalidado após a remoção do scorecard ${id}.`);
        return true;
    } catch (err) {
        await t.rollback();
        logError(`Erro ao deletar scorecard ${id}:`, err.message);
        throw new Error('Falha ao deletar o scorecard.');
    }
};