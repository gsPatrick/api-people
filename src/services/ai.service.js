// ARQUIVO ATUALIZADO: src/services/ai.service.js

import { OpenAI } from 'openai';
import { log, error as logError } from '../utils/logger.service.js';

const getClient = () => {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 1800000,  // 30 minutos - garante que avaliações complexas com GPT-4o não falhem
        maxRetries: 3     // 3 tentativas automáticas antes de declarar falha
    });
};

// ==========================================================
// MUDANÇA PRINCIPAL APLICADA AQUI
// Esta função foi atualizada com um prompt muito mais rigoroso.
// ==========================================================
// Função auxiliar para formatar memórias
const formatMemoriesForPrompt = (memories) => {
    if (!memories || memories.length === 0) return "";
    return `
    **GLOSSÁRIO DA EMPRESA (MEMÓRIA):**
    Use estas definições para interpretar termos específicos. Se o candidato mencionar estes termos, considere-os conforme definido abaixo:
    ${memories.map(m => `- "${m.term}": ${m.definition}`).join('\n')}
    `;
};

const analyzeCriterionWithGPT = async (criterion, relevantChunks, globalContext, memoriesStr) => {
    if (!relevantChunks || relevantChunks.length === 0) {
        return {
            name: criterion.name,
            score: 0,
            justification: "Nenhuma evidência relevante encontrada no perfil para este critério específico."
        };
    }

    const limitedChunks = relevantChunks.slice(0, 5);

    // Construção do Contexto Global (Resumo do Candidato)
    let contextStr = "";
    if (globalContext) {
        contextStr = `
        **CONTEXTO GLOBAL DO CANDIDATO:**
        Nome: ${globalContext.name || "N/A"}
        Título: ${globalContext.headline || "N/A"}
        Resumo/Sobre: ${globalContext.summary || "N/A"}
        `;
    }

    // NOVO PROMPT: Análise Estratégica, Inferencial e Contextual de Mercado
    const prompt = `
        **Persona:** Você é um Headhunter Executivo de Elite (Ex-McKinsey/Egon Zehnder).
        Sua especialidade é correlacionar a *trajetória* do candidato com o *desafio* da vaga.
        
        **Superpoderes Liberados:**
        1. **Knowledge Graph de Mercado:** Você CONHECE as empresas. Se o candidato trabalhou no "Nubank", você sabe que é Fintech, Alta Escala, AWS e Cultura Forte. Use isso!
        2. **Inferência de Complexidade:** Se ele foi "Head de Eng" em um Banco, ele lidou com Regulação (Bacen). Se foi "CTO" de Startup, lidou com "Zero to One".
        3. **Leitura de Entrelinhas:** Converta "cargos" em "competências".

        **Tarefa:** Avalie o candidato para o critério abaixo.

        ${contextStr}

        ${memoriesStr}

        **Critério de Avaliação:**
        "${criterion.name}"

        **Evidências (Texto do Perfil):**
        ${limitedChunks.map((c, i) => `[Frag ${i + 1}]: ${c}`).join('\n')}

        **Rubrica de Avaliação (Inferência Permitida):**
        - **90-100 (Excepcional):** Experiência comprovada em empresas referência (Big Tech, Unicórnios) ou cargos de alto impacto no tema. Domínio absoluto.
        - **70-89 (Forte):** Experiência sólida. O contexto das empresas anteriores valida a competência de forma clara.
        - **40-69 (Médio/Potencial):** Possui conhecimento ou o histórico sugere forte capacidade, mas lacks a "prova definitiva". Indício de transferibilidade.
        - **10-39 (Fraco):** Experiência rasa, em escopo reduzido ou contexto pouco relevante para este critério.
        - **0-9 (Ausente):** Nada conecta o candidato ao tema, nem direta nem indiretamente.

        **Protocolo de Análise (Obrigatoriamente use seu conhecimento sobre as empresas):**
        1. **Analise as Empresas:** Onde ele trabalhou? É consultoria? Produto? Banco? Startup? Isso valida o critério?
        2. **Analise o Tempo de Casa:** Ficou 5 anos promovido 3x? É sinal de alta performance.
        3. **Conecte os Pontos:** Use inferência ativamente.
        4. **Nota Mínima Estrita:** Se as evidências estiverem completamente ausentes para passar, ou houver extrema falta de dados, você DEVE retornar no mínimo uma nota *10* para designar "fracasso" da entrevista. Retorne *0* APENAS em caso excepcional de erro/recusa não tratável do currículo. Toda nota é de 0 a 100 em blocos redondos de dezenos de preferência (10, 20, 30... 100).

        **Formato da Resposta JSON:**
        {
            "thinking": "Cite quais empresas do perfil ajudaram na inferência e por quê...",
            "score": <inteiro de 0 a 100>,
            "justification": "Resposta de nível executivo. Explique O PORQUÊ do score citando o contexto das empresas."
        }
    `;

    try {
        const client = getClient();
        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 500 // Aumentado de 300 para garantir que justificativas longas não cortem
        });

        let content = response.choices[0].message.content;
        let result;
        
        try {
            result = JSON.parse(content);
        } catch (parseErr) {
            logError(`JSON malformado detectado para "${criterion.name}". Tentando reparo básico...`);
            // Reparo básico de JSON se estiver cortado (ex: falta de fechamento de aspas ou chaves)
            if (content.lastIndexOf('"') > content.lastIndexOf(':') && !content.endsWith('"') && !content.endsWith('"}')) {
                content += '"';
            }
            if (!content.trim().endsWith('}')) {
                content += ' }';
            }
            try {
                result = JSON.parse(content);
            } catch (e) {
                throw new Error(`Falha crítica de parsing JSON: ${e.message}`);
            }
        }

        return {
            id: criterion.id,
            name: criterion.name,
            score: result.score !== undefined ? result.score : 0,
            justification: result.justification || "Análise incompleta",
        };
    } catch (err) {
        // DIAGNÓSTICO DE CHAVE:
        const keyPrefix = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 20) : 'SEM_CHAVE';
        logError(`Erro ao avaliar (GPT-4o) "${criterion.name}": ${err.message}. Key Prefix: ${keyPrefix}...`);

        return {
            id: criterion.id, // Adicionado para fallback
            name: criterion.name,
            score: 0,
            justification: `Erro na análise da IA: ${err.message}`
        };
    }
};

export const analyzeAllCriteriaInBatch = async (criteriaWithChunks, globalContext) => {
    const startTime = Date.now();
    log(`Análise CONTROLADA de ${criteriaWithChunks.length} critérios com GPT-4o...`);

    try {
        let memories = [];
        try {
            const db = (await import('../models/index.js')).default;
            const AIMemory = db.AIMemory;
            if (AIMemory) {
                memories = await AIMemory.findAll();
            }
        } catch (memErr) {
            logError('Erro ao carregar memórias:', memErr.message);
        }

        const memoriesStr = formatMemoriesForPrompt(memories);

        // REVERTIDO: Executa todos os critérios em paralelo (FULL PARALLELISM)
        // O throttling será feito a nível de PERFIL no frontend, não de critério.
        log(`Executando ${criteriaWithChunks.length} análises em paralelo...`);

        const allPromises = criteriaWithChunks.map(({ criterion, chunks }) =>
            analyzeCriterionWithGPT(criterion, chunks, globalContext, memoriesStr)
        );

        const results = await Promise.all(allPromises);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        log(`✓ Análise controlada concluída em ${duration}s. Total: ${results.length}`);
        return results;

    } catch (err) {
        logError('Erro crítico na análise controlada:', err.message);
        return criteriaWithChunks.map(({ criterion }) => ({
            name: criterion.name,
            score: 0,
            justification: "Falha na análise controlada"
        }));
    }
};

/**
 * Normaliza os dados brutos extraídos do PDF usando um prompt específico para LLM.
 * @param {object} rawData - O objeto JSON bruto contendo 'textoCompleto'
 * @returns {Promise<object>} - O JSON normalizado conforme schema
 */
export const normalizeProfileData = async (rawData) => {

    // Otimização: Se não tiver texto completo, nem adianta chamar a IA.
    if (!rawData || (!rawData.textoCompleto && !rawData.resumo)) {
        logError('normalizeProfileData: Dados insuficientes para normalização.');
        return null;
    }

    log(`Iniciando normalização de perfil com LLM (${rawData.textoCompleto?.length || 0} chars)...`);

    const prompt = `
    Você é um AGENTE DE NORMALIZAÇÃO DE PERFIL PROFISSIONAL.

    Seu objetivo é transformar um JSON EXTRAÍDO DE LINKEDIN, DESORGANIZADO E COM RUÍDO,
    em um JSON CANÔNICO, LIMPO, DETERMINÍSTICO E PRONTO PARA VETORIZAÇÃO.

    ────────────────────────────────
    REGRAS ABSOLUTAS (NUNCA QUEBRE)
    ────────────────────────────────

    1. NÃO invente informações
    2. NÃO traduza textos
    3. NÃO resuma descrições
    4. NÃO altere o sentido original
    5. NÃO use linguagem criativa
    6. NÃO use emojis
    7. NÃO gere texto novo
    8. NÃO misture experiências
    9. NÃO utilize LLM para inferência semântica
    10. TODA transformação deve ser justificável por regra lógica

    Seu papel NÃO é interpretar o currículo.
    Seu papel é ORGANIZAR DADOS EXISTENTES.

    ────────────────────────────────
    ENTRADA
    ────────────────────────────────
    JSON BRUTO:
    ${JSON.stringify(rawData, null, 2)}

    ────────────────────────────────
    SAÍDA OBRIGATÓRIA (SCHEMA)
    ────────────────────────────────

    {
      "perfil": {
        "nome": string | null,
        "username": string | null, // Extraído de linkedin.com/in/<username>
        "titulo": string | null,
        "linkedin": string | null,
        "localizacao": string | null
      },
      "resumo": string | null,
      "experiencias": [
        {
          "empresa": string,
          "cargo": string,
          "localizacao": string | null,
          "inicio": string | null, // Formato YYYY-MM ou null
          "fim": string | null,    // Formato YYYY-MM ou null
          "descricao": string
        }
      ],
      "formacao": [
        {
          "instituicao": string,
          "curso": string,
          "inicio": string | null,
          "fim": string | null
        }
      ],
      "skills": string[],
      "certificacoes": string[]
    }

    ────────────────────────────────
    PROCESSO OBRIGATÓRIO
    ────────────────────────────────

    ETAPA 1 — LIMPEZA
    - Remova: Page X of Y, -- X of Y --, Quebras de página
    - Preserve parágrafos

    ETAPA 2 — PERFIL
    - Nome: O nome do candidato é geralmente a segunda linha ou aparece logo após headers de certificado.
      - IGNORE completamente linhas que contenham: "Certificado de Conclusão", "Certificate of Completion", "Page X of Y".
      - Se não encontrar um nome claro de pessoa (ex: "João Vitor Costa"), use o username da URL do LinkedIn como fallback (ex: "joaovitorcgds" de linkedin.com/in/joaovitorcgds).
    - Linkedin: URL válida. Extraia também o "username" (parte após /in/).
    - Localização: cidade/país explícito
    - Título: linha curta com função principal (cargo atual ou objetivo profissional)

    ETAPA 3 — RESUMO
    - Use APENAS o bloco "Resumo"

    ETAPA 4 — EXPERIÊNCIAS
    - Parse datas: "outubro de 2025" -> "2025-10", "Present" -> null
    - Descrição: Texto entre datas e próxima experiência

    ETAPA 5 — FORMAÇÃO
    - Apenas acadêmica

    ETAPA 6 — SKILLS
    - Apenas técnicas, unicas, normalizadas.

    ETAPA 7 — VALIDAÇÃO
    - JSON válido apenas.

    RETORNE APENAS O JSON FINAL.
    `;

    try {
        const client = getClient();
        const response = await client.chat.completions.create({
            model: "gpt-4o", // Usando modelo mais capaz para parsing complexo
            messages: [{ role: "system", content: prompt }], // System prompt é melhor para instrução
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const normalizedData = JSON.parse(response.choices[0].message.content);
        log('✅ Perfil normalizado com sucesso via LLM.');
        return normalizedData;

    } catch (err) {
        const keyPrefix = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 20) : 'SEM_CHAVE';
        logError(`❌ Erro na normalização com LLM: ${err.message}. Key Prefix: ${keyPrefix}...`);
        // Fallback: retorna o dado original se der erro, mas idealmente deveria tratar
        return rawData;
    }
};