// ARQUIVO ATUALIZADO: src/services/ai.service.js

import { OpenAI } from 'openai';
import { log, error as logError } from '../utils/logger.service.js';

const getClient = () => {
    return new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 100000,
        maxRetries: 2
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
            score: 1,
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

    // NOVO PROMPT: Análise Estratégica e Inferencial
    const prompt = `
        **Persona:** Você é um Consultor de Talentos Estratégico (Sênior). Seu objetivo é identificar *potencial* e *match*, não apenas fazer checklist de palavras-chave.
        Você sabe ler nas entrelinhas: um "CTO" sabe "Liderança" mesmo que não escreva a palavra "Liderança".

        **Tarefa:** Avalie o candidato para o critério abaixo, buscando evidências diretas ou *indiretas* no contexto da carreira.

        ${contextStr}

        ${memoriesStr}

        **Critério de Avaliação:**
        "${criterion.name}"

        **Evidências (Texto do Perfil):**
        ${limitedChunks.map((c, i) => `[Frag ${i + 1}]: ${c}`).join('\n')}

        **Rubrica de Avaliação (Inferência Permitida):**
        - **5 (Excepcional):** Evidência clara de domínio expert ou senioridade elevada no tema.
        - **4 (Forte):** Experiência sólida ou inferência muito forte baseada em cargos/projetos.
        - **3 (Potencial/Investigar):** Indícios parciais ou contexto que sugere a competência, mas requer validação na entrevista.
        - **2 (Fraco):** Menção vaga ou muito junior para o que se espera.
        - **1 (Ausente/Não Detectado):** Realmente não há nada que conecte o candidato a este tema.

        **Protocolo de Análise:**
        1. **Contextualize:** Um Diretor de Engenharia provavelmente tem visão estratégica, mesmo que não cite explicitamente.
        2. **Infira:** Se pede "Java" e ele trabalha com "Spring Boot" há 5 anos, o match é 5, não 1.
        3. **Justifique para o RH:** Sua justificativa deve ajudar na decisão. Não diga apenas "não achei". Diga "Não há menção direta, mas pelo cargo X sugere vivência...".

        **Formato da Resposta JSON:**
        {
            "thinking": "Raciocínio inferencial...",
            "score": <inteiro de 1 a 5>,
            "justification": "Texto curto e direto para o Recrutador (em PT-BR). Destaque pontos fortes ou riscos reais. Use linguagem de mercado."
        }
    `;

    try {
        const client = getClient();
        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 300
        });

        const result = JSON.parse(response.choices[0].message.content);
        return {
            id: criterion.id, // Adicionado para garantir match preciso
            name: criterion.name,
            score: result.score || 1,
            justification: result.justification || "Análise incompleta",
        };
    } catch (err) {
        // DIAGNÓSTICO DE CHAVE:
        const keyPrefix = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 20) : 'SEM_CHAVE';
        logError(`Erro ao avaliar (GPT-4o) "${criterion.name}": ${err.message}. Key Prefix: ${keyPrefix}...`);

        return {
            id: criterion.id, // Adicionado para fallback
            name: criterion.name,
            score: 1,
            justification: `Erro na análise da IA: ${err.message}`
        };
    }
};

export const analyzeAllCriteriaInBatch = async (criteriaWithChunks, globalContext) => {
    const startTime = Date.now();
    log(`Análise em PARALELO de ${criteriaWithChunks.length} critérios com GPT-4o...`);

    try {
        // Carregar Memórias da IA aqui
        // Import dinâmico para evitar dependência cíclica se houver, ou apenas para garantir que o model esteja carregado
        // Mas como models/index.js já foi carregado no server start, podemos importar { AIMemory } de lá ou carregar via sequelize

        let memories = [];
        try {
            // Precisamos acessar o model AIMemory. Vamos importar models/index.js no topo ou usar aqui.
            // Importando dinamicamente para garantir.
            // Carregando o db do default export
            const db = (await import('../models/index.js')).default;
            const AIMemory = db.AIMemory;
            if (AIMemory) {
                memories = await AIMemory.findAll();
                log(`Memórias da IA carregadas: ${memories.length}`);
            }
        } catch (memErr) {
            logError('Erro ao carregar memórias da IA (continuando sem elas):', memErr.message);
        }

        const memoriesStr = formatMemoriesForPrompt(memories);

        // Envia o globalContext E memoriesStr para cada análise
        const allPromises = criteriaWithChunks.map(({ criterion, chunks }) =>
            analyzeCriterionWithGPT(criterion, chunks, globalContext, memoriesStr)
        );

        const results = await Promise.all(allPromises);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        log(`✓ Análise GPT-4o concluída em ${duration}s. Todas as ${results.length} avaliações recebidas.`);

        return results;

    } catch (err) {
        logError('Erro crítico durante a análise em paralelo (GPT-4o):', err.message);
        return criteriaWithChunks.map(({ criterion }) => ({
            name: criterion.name,
            score: 1,
            justification: "Falha geral na análise paralela"
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