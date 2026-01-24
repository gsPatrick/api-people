// ARQUIVO NOVO: src/Core/Candidate-Flow/aiDataMapper.service.js

import { OpenAI } from 'openai';
import { log, error as logError } from '../../utils/logger.service.js';
import { createEmbeddings } from '../../services/embedding.service.js';
// Vector imports removed (Full Context migration)

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 10000, // Timeout agressivo para garantir performance
    maxRetries: 1
});

// Função auxiliar para "fatiar" o perfil em pedaços de texto relevantes
const chunkProfileForMapping = (profileData) => {
    const chunks = [];
    if (profileData.headline) chunks.push(`Título Principal: ${profileData.headline}`);
    if (profileData.about) chunks.push(`Resumo Pessoal: ${profileData.about}`);
    if (profileData.location) chunks.push(`Localização: ${profileData.location}`);
    if (profileData.skills?.length) chunks.push(`Competências Chave: ${profileData.skills.join(', ')}`);
    if (profileData.experience) {
        profileData.experience.forEach(exp => {
            chunks.push(`Experiência como ${exp.title} na ${exp.companyName}. Descrição: ${exp.description || ''}`.trim());
        });
    }
    if (profileData.education) {
        profileData.education.forEach(edu => {
            chunks.push(`Formação: ${edu.degree || ''} em ${edu.schoolName}. Período: ${edu.dateRange || ''}`.trim());
        });
    }
    return chunks.filter(Boolean);
};

/**
 * Pede à IA para extrair o valor para UM ÚNICO campo, usando evidências específicas.
 * @param {object} fieldDefinition - A definição do campo (nome, tipo, opções).
 * @param {string[]} relevantChunks - Pedaços de texto do perfil relevantes para este campo.
 * @returns {Promise<object|null>} O valor formatado para a API ou null.
 */
const extractSingleFieldWithAI = async (fieldDefinition, relevantChunks) => {
    if (!relevantChunks || relevantChunks.length === 0) {
        return null; // Sem evidências, não há o que fazer.
    }

    const evidence = relevantChunks.slice(0, 3).join('\n---\n'); // Limita para manter o prompt enxuto
    let prompt;
    let responseFormat = { type: "json_object" };

    if (fieldDefinition.type === 'select') {
        prompt = `
            Você é um assistente de extração de dados. Sua tarefa é escolher a melhor opção para o campo abaixo, com base na evidência fornecida.

            CAMPO: "${fieldDefinition.name}"
            OPÇÕES DISPONÍVEIS: ${JSON.stringify(fieldDefinition.answerOptions, null, 2)}
            EVIDÊNCIA DO PERFIL:
            "${evidence}"

            Analise a evidência e escolha a opção mais apropriada da lista.
            Responda em JSON com o objeto COMPLETO da opção escolhida: {"value": {"id": "...", "value": "...", "label": "..."}}
            Se nenhuma opção for claramente correta, responda: {"value": null}
        `;
    } else { // text, textarea, date etc.
        prompt = `
            Você é um assistente de extração de dados. Sua tarefa é extrair um valor para o campo abaixo, com base na evidência fornecida.

            CAMPO A PREENCHER: "${fieldDefinition.name}"
            EVIDÊNCIA DO PERFIL:
            "${evidence}"

            Analise a evidência e extraia o valor exato para o campo.
            Se o campo for uma data, formate como AAAA-MM-DD.
            Responda em JSON: {"value": "<valor extraído aqui>"}
            Se não houver informação na evidência para preencher o campo, responda: {"value": null}
        `;
    }

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: responseFormat,
            temperature: 0,
            max_tokens: 200
        });

        const result = JSON.parse(response.choices[0].message.content);
        return result.value;

    } catch (err) {
        logError(`IA Mapper: Erro ao extrair campo "${fieldDefinition.name}":`, err.message);
        return null; // Falha na análise não deve quebrar o fluxo todo
    }
};

/**
 * Orquestra o mapeamento de campos personalizados usando IA, vetores e paralelismo.
 * @param {object} scrapedData - Os dados brutos do perfil do LinkedIn.
 * @param {object[]} customFieldDefinitions - As definições dos campos da InHire.
 * @returns {Promise<{talentPayload: object, customFieldsPayload: object[]}>}
 */
export const mapProfileToCustomFieldsWithAI = async (scrapedData, customFieldDefinitions) => {
    const startTime = Date.now();
    const tempTableName = `map_${Date.now()}`;
    log(`--- IA MAPPER: Iniciando mapeamento para ${customFieldDefinitions.length} campos... ---`);
    let profileTable;

    try {
        // ETAPA 1: Manter o mapeamento estático para campos básicos e rápidos do talento.
        const talentPayload = {
            name: scrapedData.name,
            headline: scrapedData.headline,
            linkedinUsername: scrapedData.linkedinUsername,
            location: scrapedData.location,
            company: scrapedData.experience?.[0]?.companyName || null,
        };

        // ETAPA 2: Preparar chunks (evidências) - Full Context Strategy
        const profileChunks = chunkProfileForMapping(scrapedData);
        if (profileChunks.length === 0) {
            logError("IA Mapper: Perfil sem conteúdo textualmente analisável.");
            return { talentPayload, customFieldsPayload: [] };
        }

        // Na estratégia Full Context, usamos todos os chunks para todos os campos.
        // O perfil de um candidato cabe tranquilamente no contexto do GPT-4o-mini.
        const allChunks = profileChunks;

        // ETAPA 3: Chamar a IA para extrair o valor de CADA campo em PARALELO.
        // Não precisamos de busca vetorial prévia.
        const extractionPromises = customFieldDefinitions.map(field =>
            extractSingleFieldWithAI(field, allChunks)
        );
        const extractedValues = await Promise.all(extractionPromises);

        // ETAPA 5: Montar o payload final com os resultados.
        const customFieldsPayload = [];
        customFieldDefinitions.forEach((field, index) => {
            const value = extractedValues[index];
            if (value !== null && value !== undefined) {
                customFieldsPayload.push({
                    id: field.id,
                    name: field.name,
                    type: field.type,
                    value: value
                });
            }
        });

        const duration = Date.now() - startTime;
        log(`✓ IA MAPPER: Mapeamento concluído em ${duration}ms. ${customFieldsPayload.length} campos preenchidos.`);

        return { talentPayload, customFieldsPayload };

    } catch (err) {
        logError('IA Mapper: Erro crítico durante o mapeamento com IA.', err.message);
        // Fallback: retorna pelo menos o payload básico
        return {
            talentPayload: { name: scrapedData.name, linkedinUsername: scrapedData.linkedinUsername },
            customFieldsPayload: []
        };
    } finally {
        if (profileTable) {
            await dropProfileVectorTable(tempTableName);
        }
    }
};