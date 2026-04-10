// src/routes/chat.routes.js
// Rotas do chat Ana Issidoro

import { Router } from 'express';
import { processMessageStream, generateConversationTitle } from '../services/chatAgent.service.js';
import { log, error as logError } from '../utils/logger.service.js';

const router = Router();

/**
 * Helper para obter o DB com lazy loading
 */
const getDB = async () => {
    const module = await import('../models/index.js');
    return module.default;
};

// =============================================
// POST /api/chat/message
// Envia mensagem e recebe resposta em streaming (SSE)
// =============================================
router.post('/message', async (req, res) => {
    const { conversationId, message } = req.body;
    const userId = req.user?.id;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Mensagem é obrigatória.' });
    }

    try {
        const db = await getDB();
        let conversation;

        // Se não tem conversationId, criar uma nova conversa
        if (!conversationId) {
            const title = await generateConversationTitle(message);
            conversation = await db.ChatConversation.create({
                userId: userId || null,
                title
            });
            log(`[CHAT] Nova conversa criada: ${conversation.id} - "${title}"`);
        } else {
            conversation = await db.ChatConversation.findByPk(conversationId);
            if (!conversation) {
                return res.status(404).json({ error: 'Conversa não encontrada.' });
            }
        }

        // Salvar mensagem do usuário
        await db.ChatMessage.create({
            conversationId: conversation.id,
            role: 'user',
            content: message
        });

        // Carregar histórico da conversa
        const dbMessages = await db.ChatMessage.findAll({
            where: { conversationId: conversation.id },
            order: [['createdAt', 'ASC']],
            limit: 50 // Últimas 50 mensagens do DB
        });

        // Converter para formato OpenAI
        const history = dbMessages.map(msg => {
            const m = msg.get({ plain: true });
            const openAiMsg = { role: m.role, content: m.content };
            if (m.toolCalls) openAiMsg.tool_calls = m.toolCalls;
            if (m.toolCallId) openAiMsg.tool_call_id = m.toolCallId;
            return openAiMsg;
        }).filter(m => m.role !== 'user' || m.content); // Remove mensagens vazias

        // Remove a última (que é a mensagem atual do user, já vai no processamento)
        const historyWithoutCurrent = history.slice(0, -1);

        // Processar com streaming
        const result = await processMessageStream(
            conversation.id,
            message,
            historyWithoutCurrent,
            res
        );

        // Após streaming completar, salvar a resposta da assistant
        if (result && result.content) {
            // Salvar tool calls intermediárias (se houver)
            if (result.toolCalls && result.toolCalls.length > 0) {
                await db.ChatMessage.create({
                    conversationId: conversation.id,
                    role: 'assistant',
                    content: null,
                    toolCalls: result.toolCalls,
                    metadata: { type: 'tool_invocation' }
                });

                for (const toolResult of (result.toolResults || [])) {
                    await db.ChatMessage.create({
                        conversationId: conversation.id,
                        role: 'tool',
                        content: toolResult.content?.substring(0, 5000), // Limitar tamanho no DB
                        toolCallId: toolResult.tool_call_id,
                        metadata: { type: 'tool_result' }
                    });
                }
            }

            // Salvar resposta final da assistant
            await db.ChatMessage.create({
                conversationId: conversation.id,
                role: 'assistant',
                content: result.content
            });
        }

        // Enviar o conversationId no stream para o frontend saber qual conversa é
        // (já foi enviado no stream via SSE)

    } catch (err) {
        logError('[CHAT] Erro ao processar mensagem:', err.message);
        // Se o stream já foi iniciado, não pode mais alterar headers
        if (!res.headersSent) {
            res.status(500).json({ error: `Erro ao processar mensagem: ${err.message}` });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            res.end();
        }
    }
});

// =============================================
// GET /api/chat/conversations
// Lista conversas do usuário
// =============================================
router.get('/conversations', async (req, res) => {
    try {
        const db = await getDB();
        const userId = req.user?.id;

        const conversations = await db.ChatConversation.findAll({
            where: userId ? { userId } : {},
            order: [['updatedAt', 'DESC']],
            attributes: ['id', 'title', 'metadata', 'createdAt', 'updatedAt'],
            limit: 50
        });

        res.status(200).json({ success: true, conversations });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// GET /api/chat/conversations/:id
// Histórico de uma conversa
// =============================================
router.get('/conversations/:id', async (req, res) => {
    try {
        const db = await getDB();
        const conversation = await db.ChatConversation.findByPk(req.params.id, {
            include: [{
                model: db.ChatMessage,
                as: 'messages',
                order: [['createdAt', 'ASC']],
                where: { role: ['user', 'assistant'] }, // Só retorna user e assistant (não tool calls intermediárias)
                required: false
            }]
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        res.status(200).json({ success: true, conversation });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// POST /api/chat/conversations
// Cria nova conversa vazia
// =============================================
router.post('/conversations', async (req, res) => {
    try {
        const db = await getDB();
        const userId = req.user?.id;

        const conversation = await db.ChatConversation.create({
            userId: userId || null,
            title: req.body.title || 'Nova conversa'
        });

        res.status(201).json({ success: true, conversation });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// DELETE /api/chat/conversations/:id
// Apaga uma conversa e todas as mensagens
// =============================================
router.delete('/conversations/:id', async (req, res) => {
    try {
        const db = await getDB();
        const conversation = await db.ChatConversation.findByPk(req.params.id);

        if (!conversation) {
            return res.status(404).json({ error: 'Conversa não encontrada.' });
        }

        await conversation.destroy(); // CASCADE deleta mensagens
        res.status(200).json({ success: true, message: 'Conversa deletada.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
