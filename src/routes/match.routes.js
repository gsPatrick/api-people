import { Router } from 'express';
// Importa as funções do ARQUIVO DO CONTROLLER
import * as matchController from '../controllers/match.controller.js';

const router = Router();

/**
 * @swagger
 * /api/match/{scorecardId}:
 *   post:
 *     summary: Analisa um perfil do LinkedIn contra um scorecard específico.
 *     description: Recebe os dados de um perfil e retorna uma análise de match.
 *     tags: [Match]
 *     parameters:
 *       - in: path
 *         name: scorecardId
 *         required: true
 *         schema:
 *           type: string
 *         description: O ID do scorecard para a análise.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: O objeto JSON completo do perfil.
 *     responses:
 *       200:
 *         description: Análise de match bem-sucedida.
 *       400:
 *         description: Dados de entrada inválidos.
 *       404:
 *         description: Scorecard não encontrado.
 *       500:
 *         description: Erro interno no servidor.
 */
router.post('/:scorecardId', matchController.analyzeProfile);

export default router;