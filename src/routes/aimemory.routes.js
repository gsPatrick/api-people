// src/routes/aimemory.routes.js
import express from 'express';
import * as memoryController from '../controllers/aimemory.controller.js';

const router = express.Router();

router.get('/', memoryController.getAllMemories);
router.post('/', memoryController.createMemory);
router.put('/:id', memoryController.updateMemory);
router.delete('/:id', memoryController.deleteMemory);

export default router;
