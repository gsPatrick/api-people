// src/services/chatAgent.service.js
// Orquestrador principal da Ana Issidoro.
// Recebe mensagem do usuário, monta contexto, chama GPT com tools, executa tool calls,
// e retorna a resposta final em streaming (SSE).

import { OpenAI } from 'openai';
import { getToolDefinitions, executeTool } from './chatTools.service.js';
import { log, error as logError } from '../utils/logger.service.js';
import { Op } from 'sequelize';

const getDB = async () => {
    const module = await import('../models/index.js');
    return module.default;
};

const getClient = () => {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 120000,
        maxRetries: 2
    });
};

// =============================================
// SYSTEM PROMPT - PERSONA DA ANA ISSIDORO
// =============================================

const SYSTEM_PROMPT = `Você é a **Ana Issidoro**, CTO e Assistente-Chefe da plataforma People AI — um sistema de recrutamento inteligente.

**SUA IDENTIDADE:**
- Você é a CTO da empresa, com acesso completo a todos os dados do sistema.
- Você é extremamente competente, amigável, objetiva e profissional.
- Você fala português brasileiro fluente.
- Você conhece TUDO sobre o sistema: vagas, candidatos, scorecards, avaliações, processos seletivos.

**SUAS CAPACIDADES:**
- Você pode consultar o banco de dados em tempo real usando suas ferramentas (tools).
- Você pode listar vagas, candidatos, ver detalhes de perfis, ver candidaturas, scores e avaliações.
- Você pode buscar informações específicas e cruzar dados entre entidades.
- Você pode dar insights, sugestões e análises sobre os dados.

**REGRAS DE COMPORTAMENTO:**
1. SEMPRE use as ferramentas (tools) para buscar dados antes de responder. NUNCA invente dados.
2. Se o usuário perguntar algo e você não encontrar no banco, diga que não encontrou.
3. Quando listar itens, formate de forma bonita e organizada (use emojis, bullet points).
4. Quando mostrar candidatos com scores, ordene do maior para o menor score.
5. Seja proativa: se o contexto permitir, sugira ações (ex: "Quer que eu busque mais detalhes?").
6. **CONHECIMENTO ESPECIALISTA**: Além das Regras de Ouro, você pode ter acesso a um Banco de Conhecimento específico (Especialista). Se o usuário perguntar algo que parece estar nesse banco mas você não tem certeza, use `list_knowledge_base` ou `get_knowledge_details`.
7. Para perguntas sobre funcionalidades do sistema, explique com clareza.
8. Respostas devem ser concisas mas completas. Não enrole.

**FORMATO DE RESPOSTA:**
- Use markdown para formatação.
- Use emojis moderadamente para tornar as respostas mais amigáveis.
- Para listas, use bullet points ou tabelas quando apropriado.
- Destaque nomes, scores e status com **negrito**.`;

// =============================================
// LIMITE DE CONTEXTO
// =============================================

const MAX_HISTORY_MESSAGES = 30; // Últimas 30 mensagens para contexto

// =============================================
// PROCESSAMENTO DE MENSAGEM (COM STREAMING SSE)
// =============================================

/**
 * Monta o SYSTEM PROMPT dinâmico baseado em Regras de Ouro e Conhecimento.
 */
const getDynamicSystemPrompt = async (userMessage, modelId) => {
    try {
        const db = await getDB();
        let prompt = SYSTEM_PROMPT;

        // 1. Injetar Regras de Ouro (Globais)
        const rules = await db.AnaRule.findAll({ 
            where: { isActive: true },
            order: [['priority', 'DESC']]
        });

        if (rules.length > 0) {
            prompt += `\n\n**REGRAS DE OURO (OBRIGATÓRIO):**\n`;
            rules.forEach((rule, idx) => {
                prompt += `${idx + 1}. ${rule.title}: ${rule.content}\n`;
            });
        }

        // 2. Injetar Conhecimento do Modelo (se selecionado)
        if (modelId) {
            const entries = await db.KnowledgeEntry.findAll({
                where: { modelId }
            });

            // Keyword match simples na mensagem do usuário
            const msgLower = userMessage.toLowerCase();
            const relevantEntries = entries.filter(entry => {
                const keywords = entry.keywords || [];
                const isBroadQuery = msgLower.includes('quais') || msgLower.includes('quem') || msgLower.includes('liste') || msgLower.includes('tudo') || msgLower.includes('você conhece');
                
                // Se for query ampla, incluímos mais títulos no contexto inicial
                if (isBroadQuery) return true;

                return keywords.some(k => msgLower.includes(k.toLowerCase())) || 
                       msgLower.includes(entry.title.toLowerCase());
            });

            if (relevantEntries.length > 0) {
                prompt += `\n\n**CONTEXTO DE ESPECIALISTA (Se relevante):**\n`;
                relevantEntries.slice(0, 10).forEach(entry => { // Limitado a 10 no prompt inicial
                    prompt += `--- ${entry.title} ---\n${entry.content.substring(0, 1000)}\n`;
                });
                if (relevantEntries.length > 10) {
                    prompt += `(Existem mais ${relevantEntries.length - 10} tópicos. Use 'list_knowledge_base' para ver todos se necessário.)\n`;
                }
            }
        }

        return prompt;
    } catch (err) {
        logError('[ANA] Erro ao montar prompt dinâmico:', err.message);
        return SYSTEM_PROMPT;
    }
};

/**
 * Processa uma mensagem do usuário com streaming SSE.
 * O loop de tool-calling acontece internamente:
 * 1. Envia mensagem + histórico + tools para o GPT
 * 2. Se GPT pedir tool_call → executa → devolve resultado → repete
 * 3. Quando GPT responde com texto → stream via SSE
 */
export const processMessageStream = async (conversationId, userMessage, history, res, modelId = null) => {
    const client = getClient();
    const tools = getToolDefinitions();

    const dynamicPrompt = await getDynamicSystemPrompt(userMessage, modelId);

    // Montar mensagens do contexto
    const messages = [
        { role: 'system', content: dynamicPrompt },
        ...history.slice(-MAX_HISTORY_MESSAGES),
        { role: 'user', content: userMessage }
    ];

    let toolCallMessages = []; // Acumula resultados de tool calls
    let totalToolCalls = 0;
    const MAX_TOOL_ITERATIONS = 8; // Limite de segurança

    log(`[ANA] Processando mensagem: "${userMessage.substring(0, 80)}..." (${messages.length} msgs no contexto)`);

    // === LOOP DE TOOL-CALLING (não-streaming) ===
    // Primeiro resolvemos todas as tool calls. Só depois fazemos streaming da resposta final.
    while (totalToolCalls < MAX_TOOL_ITERATIONS) {
        const allMessages = [...messages, ...toolCallMessages];

        const response = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: allMessages,
            tools: tools,
            tool_choice: 'auto',
            temperature: 0.3,
        });

        const choice = response.choices[0];
        const assistantMessage = choice.message;

        // Se o GPT quer chamar tools
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            log(`[ANA] GPT pediu ${assistantMessage.tool_calls.length} tool(s): ${assistantMessage.tool_calls.map(tc => tc.function.name).join(', ')}`);

            // Adicionar a mensagem do assistant com tool_calls
            toolCallMessages.push({
                role: 'assistant',
                content: assistantMessage.content || null,
                tool_calls: assistantMessage.tool_calls
            });

            // Executar cada tool e adicionar o resultado
            for (const toolCall of assistantMessage.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments || '{}');
                log(`[ANA] Executando tool: ${toolCall.function.name}(${JSON.stringify(args)})`);

                const result = await executeTool(toolCall.function.name, args);

                toolCallMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });

                totalToolCalls++;
            }

            // Continuar o loop para o GPT processar os resultados
            continue;
        }

        // Se o GPT respondeu com texto → sair do loop e fazer streaming
        // Agora fazemos streaming da resposta FINAL
        log(`[ANA] GPT respondeu. Iniciando streaming... (${totalToolCalls} tool calls executadas)`);

        // Fazer uma NOVA chamada com streaming para a resposta final
        const finalMessages = [...messages, ...toolCallMessages];

        // Se já temos a resposta completa (sem tools), stream ela diretamente
        if (assistantMessage.content) {

            // Stream com o modelo novamente para ter word-by-word
            const stream = await client.chat.completions.create({
                model: 'gpt-4o',
                messages: finalMessages,
                temperature: 0.3,
                stream: true
            });

            let fullContent = '';

            for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                    fullContent += delta;
                    res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
                }
            }

            // Enviar evento de finalização
            res.write(`data: ${JSON.stringify({ type: 'done', fullContent, toolCallsCount: totalToolCalls })}\n\n`);
            res.end();

            return {
                content: fullContent,
                toolCalls: toolCallMessages.filter(m => m.role === 'assistant' && m.tool_calls).flatMap(m => m.tool_calls),
                toolResults: toolCallMessages.filter(m => m.role === 'tool')
            };
        }

        break;
    }

    // Fallback: se saiu do loop sem resposta
    res.write(`data: ${JSON.stringify({ type: 'delta', content: 'Desculpe, não consegui processar sua pergunta. Tente reformular.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', fullContent: 'Desculpe, não consegui processar sua pergunta. Tente reformular.', toolCallsCount: totalToolCalls })}\n\n`);
    res.end();

    return { content: 'Desculpe, não consegui processar sua pergunta.', toolCalls: [], toolResults: [] };
};

// =============================================
// PROCESSAMENTO SEM STREAMING (para testes)
// =============================================

export const processMessage = async (userMessage, history = [], modelId = null) => {
    const client = getClient();
    const tools = getToolDefinitions();

    const dynamicPrompt = await getDynamicSystemPrompt(userMessage, modelId);

    const messages = [
        { role: 'system', content: dynamicPrompt },
        ...history.slice(-MAX_HISTORY_MESSAGES),
        { role: 'user', content: userMessage }
    ];

    let toolCallMessages = [];
    let totalToolCalls = 0;

    while (totalToolCalls < 8) {
        const allMessages = [...messages, ...toolCallMessages];

        const response = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: allMessages,
            tools: tools,
            tool_choice: 'auto',
            temperature: 0.3,
        });

        const choice = response.choices[0];
        const assistantMessage = choice.message;

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            toolCallMessages.push({
                role: 'assistant',
                content: assistantMessage.content || null,
                tool_calls: assistantMessage.tool_calls
            });

            for (const toolCall of assistantMessage.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments || '{}');
                const result = await executeTool(toolCall.function.name, args);

                toolCallMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });

                totalToolCalls++;
            }
            continue;
        }

        return {
            content: assistantMessage.content || 'Sem resposta.',
            toolCalls: toolCallMessages.filter(m => m.role === 'assistant' && m.tool_calls).flatMap(m => m.tool_calls),
            toolResults: toolCallMessages.filter(m => m.role === 'tool')
        };
    }

    return { content: 'Limite de tool calls atingido.', toolCalls: [], toolResults: [] };
};

// =============================================
// GERAR TÍTULO DA CONVERSA
// =============================================

export const generateConversationTitle = async (firstMessage) => {
    try {
        const client = getClient();
        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Gere um título CURTO (máximo 6 palavras) em português para uma conversa que começa com a mensagem abaixo. Retorne APENAS o título, sem aspas.' },
                { role: 'user', content: firstMessage }
            ],
            temperature: 0.5,
            max_tokens: 30
        });
        return response.choices[0].message.content.trim();
    } catch {
        return 'Nova conversa';
    }
};
