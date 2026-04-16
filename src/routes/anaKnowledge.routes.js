// src/routes/anaKnowledge.routes.js
import { Router } from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import multer from 'multer';
import { OpenAI } from 'openai';
import { log, error as logError } from '../utils/logger.service.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Carregamento resiliente do pdf-parse (devido a incompatibilidades ESM)
let pdf;
try {
    const lib = require('pdf-parse');
    pdf = typeof lib === 'function' ? lib : (lib.default || lib);
} catch (e) {
    pdf = null;
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// LOG MESTRE: Monitorar chamadas
router.use((req, res, next) => {
    console.log(`[ANA-ROUTER] ${req.method} ${req.url} | User: ${req.user?.email}`);
    next();
});

const getDB = async () => {
    const module = await import('../models/index.js');
    return module.default;
};

const getOpenAIClient = () => {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
};

// =============================================
// REGRAS DE OURO (AnaRule)
// =============================================

router.get('/rules', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const rules = await db.AnaRule.findAll({ order: [['priority', 'DESC']] });
        res.json({ success: true, rules });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/rules', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const rule = await db.AnaRule.create(req.body);
        res.status(201).json({ success: true, rule });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/rules/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const rule = await db.AnaRule.findByPk(req.params.id);
        if (!rule) return res.status(404).json({ error: 'Regra não encontrada' });
        await rule.update(req.body);
        res.json({ success: true, rule });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/rules/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const rule = await db.AnaRule.findByPk(req.params.id);
        if (!rule) return res.status(404).json({ error: 'Regra não encontrada' });
        await rule.destroy();
        res.json({ success: true, message: 'Regra deletada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// MODELOS DE CONHECIMENTO (KnowledgeModel)
// =============================================

router.get('/models', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const models = await db.KnowledgeModel.findAll({ 
            where: { isActive: true },
            order: [['createdAt', 'DESC']] 
        });
        res.json({ success: true, models });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/models', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const model = await db.KnowledgeModel.create(req.body);
        res.status(201).json({ success: true, model });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/models/:id/entries', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        const entries = await db.KnowledgeEntry.findAll({ 
            where: { modelId: req.params.id },
            order: [['createdAt', 'ASC']]
        });
        res.json({ success: true, entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// ENTRIES (KnowledgeEntry)
// =============================================

router.post('/models/:modelId/entries', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const entry = await db.KnowledgeEntry.create({
            ...req.body,
            modelId: req.params.modelId
        });
        res.status(201).json({ success: true, entry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/entries/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const entry = await db.KnowledgeEntry.findByPk(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry não encontrada' });
        await entry.update(req.body);
        res.json({ success: true, entry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/entries/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await getDB();
        const entry = await db.KnowledgeEntry.findByPk(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry não encontrada' });
        await entry.destroy();
        res.json({ success: true, message: 'Entry deletada' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// EXTRAÇÃO DE PDF (GPT-4o-mini)
// =============================================

router.post('/extract-pdf', authenticateToken, isAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Arquivo PDF é obrigatório.' });

        const dataBuffer = req.file.buffer;
        
        if (typeof pdf !== 'function') {
            throw new Error('Biblioteca pdf-parse não carregada corretamente.');
        }

        const pdfData = await pdf(dataBuffer);
        const text = pdfData.text;

        if (!text || text.trim().length < 50) {
            return res.status(400).json({ error: 'O PDF parece estar vazio ou tem pouco texto para análise.' });
        }

        log(`[ANA] Iniciando extração de conhecimento de PDF (${text.length} caracteres)`);

        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: "Você é um especialista em estruturação de conhecimento. Sua tarefa é analisar o texto de um documento e dividi-lo em blocos de conhecimento lógicos, informativos e independentes. Cada bloco deve ter um título, uma lista de palavras-chave (keywords) e o conteúdo principal resumido mas rico em detalhes." 
                },
                { 
                    role: "user", 
                    content: `Analise o texto abaixo e extraia blocos de conhecimento. Retorne apenas um JSON no seguinte formato:
                    {
                      "blocks": [
                        { "title": "Título do bloco", "keywords": ["key1", "key2"], "content": "Conteúdo extraído..." },
                        ...
                      ]
                    }
                    
                    Texto do PDF:
                    ${text.substring(0, 15000)}` // Limite para evitar estouro de tokens
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        const result = JSON.parse(response.choices[0].message.content);
        res.json({ success: true, blocks: result.blocks });

    } catch (err) {
        logError('[ANA] Erro ao extrair PDF:', err.message);
        res.status(500).json({ error: `Erro na extração: ${err.message}` });
    }
});

export default router;
