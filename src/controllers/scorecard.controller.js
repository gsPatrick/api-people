import * as scorecardService from '../services/scorecard.service.js';

/**
 * Cria um novo scorecard.
 * O corpo da requisição deve conter o nome, atsIntegration e um array de categorias com seus critérios.
 */
export const createScorecard = async (req, res) => {
  try {
    if (!req.body.name || !Array.isArray(req.body.categories)) {
      return res.status(400).json({ error: 'O nome e a estrutura de categorias são obrigatórios.' });
    }
    const scorecard = await scorecardService.create(req.body);
    res.status(201).json(scorecard);
  } catch (error) {
    res.status(500).json({ error: `Falha ao criar scorecard: ${error.message}` });
  }
};

/**
 * Retorna todos os scorecards (sem o campo 'embedding' para otimização).
 */
export const getAllScorecards = async (req, res) => {
  try {
    const scorecards = await scorecardService.findAll();
    res.status(200).json(scorecards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Retorna um scorecard específico pelo ID, incluindo todos os detalhes.
 */
export const getScorecardById = async (req, res) => {
  try {
    const { id } = req.params;
    const scorecard = await scorecardService.findById(id);
    if (!scorecard) {
      return res.status(404).json({ error: 'Scorecard não encontrado.' });
    }
    res.status(200).json(scorecard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Atualiza um scorecard existente.
 * A lógica de atualização (delete e recria filhos) está no serviço.
 */
export const updateScorecard = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedScorecard = await scorecardService.update(id, req.body);
    if (!updatedScorecard) {
        return res.status(404).json({ error: 'Scorecard não encontrado para atualização.' });
    }
    res.status(200).json(updatedScorecard);
  } catch (error) {
    res.status(500).json({ error: `Falha ao atualizar scorecard: ${error.message}` });
  }
};

/**
 * Deleta um scorecard pelo ID.
 */
export const deleteScorecard = async (req, res) => {
  try {
    const { id } = req.params;
    const success = await scorecardService.remove(id);
    if (!success) {
      return res.status(404).json({ error: 'Scorecard não encontrado para exclusão.' });
    }
    // Retorna 204 No Content, um padrão para exclusão bem-sucedida.
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};