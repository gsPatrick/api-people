import { OpenAI } from 'openai';
import { log, error as logError } from '../utils/logger.service.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20000,
    maxRetries: 1
});

/**
 * Extract a specific field using AI.
 */
export const extractFieldWithAI = async (rawText, question, formatDescription) => {
    const prompt = `
        Você é um especialista em extração de dados de currículos e perfis do LinkedIn.
        Analise o texto abaixo e responda APENAS à pergunta específica.
        
        IMPORTANTE: Ignore labels de navegação ou contato (como "Contact", "Experience", "Education", "Repositories") se eles aparecerem onde deveria estar o nome. O nome do candidato é o identificador principal da pessoa.

        TEXTO:
        ---
        ${rawText.slice(0, 5000)} 
        ---

        PERGUNTA:
        ${question}

        INSTRUÇÕES DE FORMATO:
        Responda APENAS com um objeto JSON no formato: {"data": ${formatDescription}}.
        Se a informação não for encontrada ou for ambígua, retorne {"data": null}.
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 500
        });
        const result = JSON.parse(response.choices[0].message.content);
        return result.data;
    } catch (err) {
        logError(`AI PARSER SERVICE: Erro na pergunta "${question}"`, err.message);
        return null;
    }
};

/**
 * Extract identity fields (Name, Headline, Location) in a single call for efficiency.
 */
export const extractIdentityWithAI = async (rawText) => {
    const prompt = `
        Analise o topo de um perfil do LinkedIn e extraia a identidade do candidato.
        
        REGRAS CRÍTICAS:
        1. O NOME não pode ser "Contact", "Experience", "AWS...", "Repositories", "Página...", ou URLs.
        2. O NOME é geralmente a primeira linha de conteúdo real (não labels).
        3. O TÍTULO (Headline) é a descrição profissional logo abaixo do nome.
        4. A LOCALIZAÇÃO é a cidade/estado/país.

        TEXTO (Início do Perfil):
        ---
        ${rawText.slice(0, 2000)}
        ---

        Responda APENAS um JSON no formato:
        {
            "nome": "Nome Completo",
            "titulo": "Headline Profissional",
            "localizacao": "Cidade, Estado, País"
        }
    `;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0,
            max_tokens: 200
        });
        return JSON.parse(response.choices[0].message.content);
    } catch (err) {
        logError(`AI PARSER SERVICE: Erro ao extrair identidade`, err.message);
        return { nome: null, titulo: null, localizacao: null };
    }
};
