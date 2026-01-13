// src/controllers/aimemory.controller.js
import { AIMemory } from '../models/index.js';
import { log, error as logError } from '../utils/logger.service.js';

export const getAllMemories = async (req, res) => {
    try {
        const memories = await AIMemory.findAll({ order: [['term', 'ASC']] });
        res.json(memories);
    } catch (err) {
        logError('Erro ao buscar memórias da IA:', err.message);
        res.status(500).json({ message: 'Erro ao buscar memórias.' });
    }
};

export const createMemory = async (req, res) => {
    try {
        const { term, definition } = req.body;
        if (!term || !definition) {
            return res.status(400).json({ message: 'Termo e definição são obrigatórios.' });
        }

        const newMemory = await AIMemory.create({ term, definition });
        log(`Memória da IA criada: ${term}`);
        res.status(201).json(newMemory);
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Este termo já existe.' });
        }
        logError('Erro ao criar memória da IA:', err.message);
        res.status(500).json({ message: 'Erro ao criar memória.' });
    }
};

export const updateMemory = async (req, res) => {
    try {
        const { id } = req.params;
        const { term, definition } = req.body;

        const memory = await AIMemory.findByPk(id);
        if (!memory) {
            return res.status(404).json({ message: 'Memória não encontrada.' });
        }

        memory.term = term || memory.term;
        memory.definition = definition || memory.definition;
        await memory.save();

        log(`Memória da IA atualizada: ${term}`);
        res.json(memory);
    } catch (err) {
        logError('Erro ao atualizar memória da IA:', err.message);
        res.status(500).json({ message: 'Erro ao atualizar memória.' });
    }
};

export const deleteMemory = async (req, res) => {
    try {
        const { id } = req.params;
        const memory = await AIMemory.findByPk(id);
        if (!memory) {
            return res.status(404).json({ message: 'Memória não encontrada.' });
        }

        await memory.destroy();
        log(`Memória da IA removida: ${memory.term}`);
        res.status(204).send();
    } catch (err) {
        logError('Erro ao remover memória da IA:', err.message);
        res.status(500).json({ message: 'Erro ao remover memória.' });
    }
};
