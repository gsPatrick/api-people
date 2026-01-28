// ARQUIVO NOVO: src/controllers/aiParser.controller.js

import { OpenAI } from 'openai';
import { log, error as logError } from '../utils/logger.service.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 15000, // Timeout maior para parsing
    maxRetries: 1
});

/**
 * Função auxiliar que faz uma pergunta específica para a IA sobre o texto do currículo.
 * @param {string} rawText - O texto completo do currículo.
 * @param {string} question - A pergunta específica (ex: "Qual o nome completo?").
 * @param {string} formatDescription - Descrição do formato da resposta JSON.
 * @returns {Promise<any>} - O dado extraído.
 */
const extractFieldWithAI = async (rawText, question, formatDescription) => {
    const prompt = `
        Você é um especialista em extração de dados de currículos em texto puro.
        Analise o texto completo do currículo abaixo e responda APENAS à pergunta específica.

        TEXTO DO CURRÍCULO:
        ---
        ${rawText}
        ---

        PERGUNTA:
        ${question}

        INSTRUÇÕES DE FORMATO:
        Responda APENAS com um objeto JSON no formato: {"data": ${formatDescription}}.
        Se a informação não for encontrada, retorne {"data": null}.
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 1000 // Aumentar tokens para listas (experiência, educação)
        });
        const result = JSON.parse(response.choices[0].message.content);
        return result.data;
    } catch (err) {
        logError(`AI PARSER: Erro ao extrair campo para a pergunta "${question}"`, err.message);
        return null; // Retorna nulo em caso de erro para não quebrar o processo
    }
};


/**
 * Orquestra o parsing de um texto bruto de CV usando múltiplas chamadas de IA em paralelo.
 */
export const parseProfileWithAI = async (req, res) => {
    const { rawText } = req.body;
    if (!rawText) {
        return res.status(400).json({ error: 'O campo "rawText" é obrigatório.' });
    }

    const startTime = Date.now();
    log('--- AI PARSER CONTROLLER: Iniciando parsing com IA em paralelo. ---');

    try {
        // Define todas as "perguntas" que faremos à IA
        const tasks = [
            extractFieldWithAI(rawText, "Qual é o nome completo do candidato?", '"<nome completo>"'),
            extractFieldWithAI(rawText, "Qual é o título/headline profissional do candidato?", '"<headline>"'),
            extractFieldWithAI(rawText, "Qual é a cidade e estado de localização do candidato?", '"<cidade, estado>"'),
            extractFieldWithAI(rawText, "Extraia o resumo (seção 'Resumo') do perfil.", '"<resumo>"'),
            extractFieldWithAI(rawText, "Liste TODAS as experiências profissionais. Para cada uma, extraia o cargo, nome da empresa e o período.", '[{"title": "...", "companyName": "...", "dateRange": "..."}]'),
            extractFieldWithAI(rawText, "Liste TODAS as formações acadêmicas. Para cada uma, extraia o nome da instituição, o curso/grau e o período.", '[{"schoolName": "...", "degree": "...", "dateRange": "..."}]'),
            extractFieldWithAI(rawText, "Liste as principais competências mencionadas.", '[{"name": "..."}, {"name": "..."}]')
        ];

        // Executa todas as extrações em paralelo
        const results = await Promise.all(tasks);

        // Monta o objeto final com as respostas
        const profileData = {
            perfil: {
                nome: results[0],
                titulo: results[1],
                localizacao: results[2],
            },
            // Campos legados/redundantes facultativos para compatibilidade
            name: results[0],
            headline: results[1],
            location: results[2],
            about: results[3],
            experience: results[4] || [],
            education: results[5] || [],
            skills: results[6] || []
        };

        const duration = Date.now() - startTime;
        log(`✅ AI PARSER CONTROLLER: Perfil completo estruturado em ${duration}ms.`);

        res.status(200).json(profileData);

    } catch (err) {
        logError('❌ AI PARSER CONTROLLER: Erro crítico durante o parsing paralelo:', err.message);
        res.status(500).json({ error: 'Falha ao processar o texto do perfil com a IA.' });
    }
};