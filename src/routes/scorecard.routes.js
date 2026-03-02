import { Router } from 'express';
import * as scorecardController from '../controllers/scorecard.controller.js'; // Criaremos a seguir

const router = Router();

// CRUD para Scorecards
router.post('/', scorecardController.createScorecard);
router.get('/', scorecardController.getAllScorecards);
router.get('/:id', scorecardController.getScorecardById);
router.put('/:id', scorecardController.updateScorecard);
router.delete('/:id', scorecardController.deleteScorecard);

export default router;