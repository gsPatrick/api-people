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
    log('AI PARSER SERVICE: Iniciando extração de identidade...');

    const prompt = `
        Você é um especialista em extração de IDENTIDADE de perfis profissionais.
        Analise o texto do perfil do LinkedIn abaixo e extraia os dados básicos de identificação do candidato.

        REGRAS DE OURO PARA O NOME:
        1. O NOME de uma pessoa NUNCA é "Contact", "Experience", "AWS", "Education", "Repositories", "Página" ou qualquer label de seção.
        2. O NOME é o nome próprio humano do dono do perfil (Ex: "Leonardo Magalhães", "Ana Silva").
        3. Se encontrar o nome seguido de um título (Ex: "João Silva - Engenheiro de Software"), o NOME é apenas "João Silva".
        4. O nome geralmente aparece com destaque ou no início, mas identifique-o onde quer que esteja.

        REGRAS PARA O TÍTULO (HEADLINE):
        1. É a descrição profissional (Ex: "Software Engineer", "Head de Recrutamento").
        2. Se estiver junto com o nome, separe-os.

        TEXTO DO PERFIL:
        ---
        ${rawText}
        ---

        Responda APENAS um JSON no formato:
        {
            "nome": "Nome Completo do Candidato",
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

        const result = JSON.parse(response.choices[0].message.content);
        log(`AI PARSER SERVICE: Identidade extraída: ${result.nome} | ${result.titulo}`);
        return result;
    } catch (err) {
        logError(`AI PARSER SERVICE: Erro ao extrair identidade`, err.message);
        return { nome: null, titulo: null, localizacao: null };
    }
};
