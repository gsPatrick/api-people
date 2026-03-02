// ARQUIVO COMPLETO E CORRIGIDO: src/controllers/match.controller.js

import * as matchService from '../services/match.service.js';
import { log, error as logError } from '../utils/logger.service.js';

/**
 * Manipulador para analisar um perfil. Cada requisição tem seu próprio try...catch.
 */
export const analyzeProfile = async (req, res) => {
  const { scorecardId } = req.params;
  const profileData = req.body;

  if (!scorecardId) return res.status(400).json({ message: 'O ID do Scorecard é obrigatório.' });
  if (!profileData || Object.keys(profileData).length === 0) return res.status(400).json({ message: 'Dados do perfil são obrigatórios.' });

  // <-- MUDANÇA: O try...catch agora está aqui, envolvendo a chamada do serviço.
  try {
    log(`CONTROLLER: Iniciando chamada de serviço para o scorecard: ${scorecardId}`);
    
    const matchResult = await matchService.analyze(scorecardId, profileData);
    
    res.status(200).json(matchResult);

  } catch (err) {
    // Este catch só será acionado pelo erro da SUA própria requisição.
    logError(`CONTROLLER: Erro capturado para a análise do scorecard ${scorecardId}:`, err.message);
    
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ message: err.message || 'Ocorreu um erro interno no servidor.' });
  }
};