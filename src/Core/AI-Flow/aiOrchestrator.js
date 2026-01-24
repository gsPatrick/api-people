// ARQUIVO COMPLETO: src/Core/AI-Flow/aiOrchestrator.js

import axios from 'axios';
import 'dotenv/config';
import { OpenAI } from 'openai';
import { log, error } from '../../utils/logger.service.js';
import { getTalentById } from '../../Inhire/Talents/talents.service.js';
import { extractProfileData } from '../../Linkedin/profile.service.js';
import { getCachedProfile, saveCachedProfile, getCacheStatus } from '../../Platform/Cache/cache.service.js';

// --- NOVAS IMPORTAÇÕES PARA A LÓGICA DE FEEDBACK E ANÁLISE (DO CÓDIGO 02) ---
import { setEvaluationToCache } from '../../services/aiEvaluationCache.service.js';
// import { createEmbeddings } from '../../services/embedding.service.js'; // REMOVIDO: Full Context
// import { createProfileVectorTable, dropProfileVectorTable } from '../../services/vector.service.js'; // REMOVIDO: Full Context
import { analyzeAllCriteriaInBatch } from '../../services/ai.service.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });


// Esta função permanece inalterada.
export const syncProfileFromLinkedIn = async (talentId) => {
    log(`--- ORQUESTRADOR IA: Sincronizando perfil do Talento ID: ${talentId} ---`);
    try {
        const talentInHire = await getTalentById(talentId);
        if (!talentInHire) throw new Error(`Talento com ID ${talentId} não encontrado.`);
        const linkedinUsername = talentInHire.linkedinUsername;
        if (!linkedinUsername) throw new Error(`O talento ${talentInHire.name} não possui um LinkedIn associado.`);
        log(`Forçando scraping para "${linkedinUsername}"...`);
        const profileUrl = `https://www.linkedin.com/in/${linkedinUsername}/`;
        const richProfileData = await extractProfileData(profileUrl);
        if (!richProfileData) throw new Error(`Falha ao extrair dados do LinkedIn para ${profileUrl}.`);
        saveCachedProfile(linkedinUsername, richProfileData);
        return { success: true, message: 'Perfil sincronizado com sucesso.', lastScrapedAt: Date.now() };
    } catch (err) {
        error("Erro ao forçar sincronização de perfil:", err.message);
        throw err;
    }
};

// =================================================================================
// FUNÇÃO PRINCIPAL MODIFICADA PARA ORQUESTRAR ANÁLISE E CACHE (DO CÓDIGO 02)
// =================================================================================
import db from '../../models/index.js';
// const { LocalTalent, LocalApplication, LocalJob } = db; // REMOVIDO: Destruturação no topo causa undefined

export const evaluateScorecardFromCache = async (talentId, jobDetails, scorecard, weights) => {
    log(`--- ORQUESTRADOR IA: Avaliando e preparando feedback para Talento ID: ${talentId} ---`);

    try {
        // ETAPA 0: Resolver Entidades Locais (Local-First Persistence)
        let localTalent = await db.LocalTalent.findByPk(talentId);

        // Se não achou por PK, tenta pelo external ID ou username (caso venha ID antigo)
        if (!localTalent) {
            // Tenta buscar na InHire para obter username e resolver localmente
            const talentInHire = await getTalentById(talentId);
            if (talentInHire && talentInHire.linkedinUsername) {
                localTalent = await db.LocalTalent.findOne({ where: { linkedinUsername: talentInHire.linkedinUsername } });
            }
        }

        if (!localTalent) throw new Error(`Talento Local não encontrado para análise (ID/Ref: ${talentId})`);

        // Busca ou cria Job Local
        let localJob = await db.LocalJob.findOne({ where: { externalId: jobDetails.id } });
        if (!localJob && jobDetails.id) {
            // Fallback: se não existir job local (ex: job criado antes da migração), cria stub
            localJob = await db.LocalJob.create({
                title: jobDetails.name,
                externalId: jobDetails.id,
                status: 'OPEN',
                isSynced: true
            });
        }

        // ETAPA 1: Obter dados do perfil do candidato (lógica existente - agora via LocalTalent.data ou Cache)
        // Prioriza dados locais se existirem
        let profileData = localTalent.data;
        if (!profileData) {
            const cached = await getCachedProfile(localTalent.linkedinUsername);
            if (!cached) throw new Error('Dados do perfil não encontrados no cache. Sincronize primeiro.');
            profileData = cached.profile;
        }

        // ETAPA 2: FULL CONTEXT - Preparar texto completo do perfil
        let fullProfileText = "";
        const profile = profileData || {};
        if (profile.name) fullProfileText += `NOME: ${profile.name}\n`;
        if (profile.headline) fullProfileText += `HEADLINE: ${profile.headline}\n`;
        if (profile.about) fullProfileText += `SOBRE: ${profile.about}\n`;
        if (profile.experience && profile.experience.length) {
            fullProfileText += `EXPERIÊNCIA:\n` + profile.experience.map(exp => `- ${exp.title} na ${exp.companyName}. ${exp.description || ''}`).join('\n') + `\n`;
        }
        if (profile.skills && profile.skills.length) {
            fullProfileText += `SKILLS: ${profile.skills.join(', ')}\n`;
        }

        const allCriteria = scorecard.skillCategories.flatMap(cat => cat.skills.map(skill => ({ id: skill.id, name: skill.name })));

        // Em vez de buscar chunks, passamos o texto TODO para todos os critérios
        const criteriaWithChunks = allCriteria.map(criterion => ({
            criterion,
            chunks: [fullProfileText] // Passamos 1 chunk gigante
        }));

        // ETAPA 3: Chamar a IA para avaliar cada critério em paralelo
        const evaluations = await analyzeAllCriteriaInBatch(criteriaWithChunks, {
            name: profile.name,
            headline: profile.headline,
            summary: profile.about
        });

        // ETAPA 4: Gerar o feedback geral e a decisão final com base nas avaliações
        const summaryResult = await generateOverallFeedback(jobDetails, profile, evaluations, weights);
        const finalResult = { evaluations, ...summaryResult };

        // ETAPA 4.5: Calcular Match Score Ponderado (0-100 ou 0-5)
        // Vamos usar base 5 para alinhar com estrelas
        let totalScore = 0;
        let totalWeight = 0;
        const weightMap = { 1: 1, 2: 2, 3: 3 }; // Low=1, Med=2, High=3

        evaluations.forEach(ev => {
            const w = weightMap[weights[ev.id] || 2] || 2;
            totalScore += (ev.score * w);
            totalWeight += w;
        });

        const finalMatchScore = totalWeight > 0 ? (totalScore / totalWeight) : 0;


        // ETAPA 5: Persistência Local (LocalApplication)
        if (localJob) {
            const [application, created] = await db.LocalApplication.findOrCreate({
                where: { talentId: localTalent.id, jobId: localJob.id },
                defaults: { stage: 'Applied' }
            });

            await application.update({
                matchScore: parseFloat(finalMatchScore.toFixed(2)),
                aiReview: finalResult
            });

            // Também atualiza o score mais recente no Talento para listagem rápida
            await localTalent.update({ matchScore: parseFloat(finalMatchScore.toFixed(2)) });

            log(`PERSISTÊNCIA: Avaliação salva em LocalApplication (Score: ${finalMatchScore.toFixed(2)})`);
        }

        // Cache Legado (Manter por compatibilidade com frontend antigo se necessário)
        const evidenceMap = criteriaWithChunks.reduce((map, item) => {
            map[item.criterion.id] = ["Análise realizada com contexto completo do perfil."];
            return map;
        }, {});

        const cacheKey = `${talentId}_${jobDetails.id}`;
        setEvaluationToCache(cacheKey, {
            aiScores: evaluations,
            evidenceMap: evidenceMap
        });

        return finalResult;

    } catch (err) {
        error("Erro na orquestração da avaliação do scorecard:", err.message);
        throw err; // Re-lança o erro para a rota lidar
    }
};

/**
 * Função auxiliar para gerar o feedback geral e a decisão final (DO CÓDIGO 02).
 */
const generateOverallFeedback = async (jobDetails, candidateProfile, evaluations, weights) => {
    const weightMap = { 1: 'Baixo', 2: 'Médio', 3: 'Alto' };
    const evaluationsWithWeights = evaluations.map(ev => ({
        ...ev,
        weight: weightMap[weights[ev.id] || 2] || 'Médio'
    }));

    const prompt = `
        **Contexto:** Você é um Tech Recruiter Sênior finalizando uma análise de perfil.
        **Dados da Vaga:** ${jobDetails?.name || 'Vaga não especificada'}
        **Dados do Candidato:** ${candidateProfile.name} - ${candidateProfile.headline}
        **Suas Avaliações Detalhadas (Nota/Justificativa/Peso):**
        ${JSON.stringify(evaluationsWithWeights, null, 2)}

        **Sua Tarefa:**
        1.  **Identifique Pontos Fortes:** Liste 3-5 pontos fortes principais que tornam este candidato um bom fit.
        2.  **Identifique Pontos de Atenção:** Liste 1-3 pontos de atenção ou gaps que o recrutador deve investigar.
        3.  **Escreva um Feedback Geral:** Com base nas suas avaliações ponderadas, escreva um parágrafo conciso (2-4 frases) resumindo a adequação do candidato para a vaga. Dê ênfase aos pontos com peso 'Alto'.
        4.  **Tome a Decisão Final:** Sugira uma decisão: "YES" (bom fit), "NO" (mau fit), ou "NO_DECISION" (ambíguo).

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um objeto JSON válido.
        {
          "strengths": ["Ponto forte 1", "Ponto forte 2", ...],
          "weaknesses": ["Ponto de atenção 1", ...],
          "overallFeedback": "<seu parágrafo de feedback aqui>",
          "finalDecision": "<sua decisão aqui>"
        }
    `;
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.1,
        });
        return JSON.parse(response.choices[0].message.content);
    } catch (err) {
        error("Erro ao gerar feedback geral da IA:", err.message);
        return {
            strengths: [],
            weaknesses: [],
            overallFeedback: "Falha ao gerar o resumo.",
            finalDecision: "NO_DECISION"
        };
    }
};


export const getAIEvaluationCacheStatus = async (talentId) => {
    const talentInHire = await getTalentById(talentId);
    if (!talentInHire?.linkedinUsername) return { hasCache: false, lastScrapedAt: null };
    return getCacheStatus(talentInHire.linkedinUsername);
};

export const evaluateSkillFromCache = async (talentId, jobDetails, skillToEvaluate) => {
    log(`--- ORQUESTRADOR IA: Avaliando critério a partir do cache para Talento ID: ${talentId} ---`);
    try {
        const talentInHire = await getTalentById(talentId);
        if (!talentInHire) throw new Error(`Talento com ID ${talentId} não encontrado.`);

        const linkedinUsername = talentInHire.linkedinUsername;
        if (!linkedinUsername) throw new Error(`O talento ${talentInHire.name} não possui um LinkedIn associado.`);

        const cached = await getCachedProfile(linkedinUsername);
        if (!cached) {
            throw new Error('Dados do perfil não encontrados no cache. Por favor, sincronize com o LinkedIn primeiro.');
        }

        return await evaluateSkillWithAI(cached.profile, jobDetails, skillToEvaluate);

    } catch (err) {
        error("Erro na avaliação a partir do cache:", err.message);
        throw err;
    }
};

const evaluateSkillWithAI = async (candidateProfileData, jobDetails, skillToEvaluate) => {
    log(`Enviando perfil de "${candidateProfileData?.name || 'N/A'}" para análise do critério "${skillToEvaluate?.name || 'N/A'}" no contexto da vaga "${jobDetails?.name || 'N/A'}"`);
    if (!OPENAI_API_KEY) {
        throw new Error("A chave da API da OpenAI (OPENAI_API_KEY) não está configurada no .env");
    }

    const prompt = `
        Você é um Tech Recruiter Sênior, especialista em realizar análises profundas de perfis do LinkedIn.
        Sua tarefa é avaliar o perfil COMPLETO de um candidato para um critério de avaliação específico, DENTRO DO CONTEXTO de uma vaga.

        **Dados da Vaga (Contexto):**
        ${JSON.stringify(jobDetails, null, 2)}

        **Dados do Candidato (JSON):**
        ${JSON.stringify(candidateProfileData, null, 2)}

        **Critério Específico a ser Avaliado:**
        "${skillToEvaluate.name}"

        **Seu Processo de Análise (Siga estritamente):**
        1.  **Entenda o Contexto:** Leia os detalhes da vaga para entender o que é importante para esta posição.
        2.  **Examine o Perfil Completo:** Analise TODAS as seções do perfil do candidato (headline, description, experience, education, skills).
        3.  **Avalie o Critério vs. Contexto:** Se o critério for genérico como "experiência similar à do nosso cliente", use os dados da vaga para entender quem é o cliente e qual a natureza da empresa. Se o critério for um placeholder como "Colocar +5 competências", interprete isso como uma instrução para avaliar as competências mais relevantes do candidato para a vaga em questão. Tente sempre fornecer uma avaliação útil.
        4.  **Atribua a Nota (0 a 5):** Use a rubrica com base na FORÇA das evidências encontradas no perfil em relação à vaga.
            - **5/5:** Evidência explícita, forte e diretamente alinhada com as necessidades da vaga.
            - **3-4/5:** Evidência clara, mas talvez menos detalhada ou em experiências passadas.
            - **1-2/5:** Evidência fraca, indireta ou apenas tangencial.
            - **0/5:** Nenhuma evidência encontrada.
        5.  **Escreva a Justificativa:** Crie uma justificativa curta (1-2 frases). Mesmo que a nota seja 0, explique o porquê. Se você teve que interpretar um critério de placeholder, mencione isso brevemente (ex: "Avaliando as competências do perfil para a vaga...").

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um objeto JSON válido.
        {
          "score": <sua nota de 0 a 5>,
          "justification": "<sua justificativa>"
        }
    `;

    try {
        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        const result = JSON.parse(response.data.choices[0].message.content);
        log(`IA retornou para "${skillToEvaluate.name}": Nota ${result.score}, Justificativa: "${result.justification}"`);
        return result;
    } catch (err) {
        error("Erro ao chamar a API da OpenAI:", err.response?.data || err.message);
        throw err;
    }
};

// --- FUNÇÕES DE MAPEAMENTO DO CÓDIGO 01 MANTIDAS ---

export const mapProfileToCustomFieldsWithAI = async (scrapedProfileData, customFieldDefinitions) => {
    log(`--- ORQUESTRADOR IA: Mapeando perfil de "${scrapedProfileData.name}" para campos personalizados ---`);
    if (!OPENAI_API_KEY) throw new Error("A chave da API da OpenAI (OPENAI_API_KEY) não está configurada no .env");

    const prompt = `
        Você é um Tech Recruiter Sênior com uma habilidade excepcional para analisar perfis do LinkedIn. Sua tarefa é realizar uma análise profunda e holística de um dossiê de dados de um candidato (em JSON) e usar seu entendimento para preencher, da forma mais completa e precisa possível, os campos de um sistema de recrutamento (ATS).

        **Dossiê do Candidato (Fonte de Evidências):**
        Este JSON representa TUDO o que sabemos sobre o candidato. Leia-o por completo para formar um entendimento geral da pessoa. As informações podem estar em qualquer campo (headline, description, jobTitle, etc.).
        ${JSON.stringify(scrapedProfileData, null, 2)}

        **Campos do ATS a Serem Preenchidos (Destino):**
        ${JSON.stringify(customFieldDefinitions, null, 2)}

        **Sua Tarefa (Siga estritamente):**
        1.  **Análise Contextual Profunda:** NÃO FAÇA um mapeamento campo a campo. Em vez disso, leia e entenda o "Dossiê do Candidato" como um todo. Quem é essa pessoa? Qual sua senioridade? Onde ela mora? Quais são suas habilidades?
        2.  **Busca por Evidências:** Para CADA campo no "Destino", vasculhe TODO o "Dossiê" em busca de qualquer pista ou evidência que ajude a preenchê-lo. A resposta para o campo "Nível Hierárquico" pode estar no 'jobTitle', mas também pode ser inferida a partir da 'description' ou do tempo de experiência.
        3.  **Preenchimento Inteligente:**
            *   **Campos de Texto:** Se o destino pede "Pretensão Salarial" e a 'description' do candidato diz "buscando oportunidades na faixa de 15k BRL", use essa informação. Se pede "Disponibilidade para mudança" e o 'headline' diz "Open to relocate", preencha "Sim".
            *   **Campos de Seleção (select):** Com base no seu entendimento holístico, escolha a OPÇÃO EXATA da lista 'options' que melhor representa o candidato. Por exemplo, para "Nível Hierárquico", considere o cargo, as responsabilidades descritas e o tempo de carreira. O valor retornado DEVE ser o objeto completo da opção (ex: { "id": "...", "value": "Sênior", "label": "Sênior" }).
            *   **Inferência Lógica:** Infira o gênero a partir do primeiro nome. Calcule o tempo total de experiência se possível.
        4.  **Regra de Ouro - Sem Invenções:** A precisão é crucial. Se, após analisar todo o dossiê, você não encontrar NENHUMA evidência (direta ou indireta) para preencher um campo, retorne 'null' para o valor daquele campo.

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um objeto JSON válido, onde as chaves são os IDs dos campos personalizados e os valores são o que você determinou.
        Exemplo de resposta:
        {
          "01": "XP Inc.",
          "03": { "id": "f054fecc-a8f5-4402-8bc5-996fc61cd7dd", "value": "Masculino", "label": "Masculino" },
          "19": { "id": "ID_ESPECIALISTA_AQUI", "value": "Especialista", "label": "Especialista" },
          "campo_sem_evidencia_id": null
        }
    `;

    try {
        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        const result = JSON.parse(response.data.choices[0].message.content);
        log(`IA concluiu o mapeamento holístico de campos para "${scrapedProfileData.name}".`);
        return result;
    } catch (err) {
        error("Erro ao chamar a IA para mapeamento holístico de campos:", err.response?.data || err.message);
        throw err;
    }
};

export const mapProfileToAllFieldsWithAI = async (scrapedProfileData, customFieldDefinitions) => {
    log(`--- ORQUESTRADOR IA: Mapeando perfil COMPLETO de "${scrapedProfileData.name}" ---`);
    if (!OPENAI_API_KEY) throw new Error("A chave da API da OpenAI não está configurada.");

    const prompt = `
        Você é um especialista em recrutamento (Headhunter) com uma capacidade analítica sobre-humana. Sua missão é analisar um dossiê de dados brutos de um perfil do LinkedIn e preencher um formulário de cadastro de um sistema de recrutamento (ATS) com o máximo de detalhes e precisão possível.

        **Dossiê do Candidato (Fonte de Evidências):**
        Analise este JSON como um todo para entender o perfil profissional completo do candidato.
        ${JSON.stringify(scrapedProfileData, null, 2)}

        **Campos do ATS a Serem Preenchidos:**
        1.  **Campos Gerais do Talento:**
            -   \`location\`: (string) A cidade/estado/país do candidato.
            -   \`company\`: (string) O nome da empresa atual.
            -   \`jobTitle\`: (string) O cargo atual.
            -   \`email\`: (string) O email de contato, se houver.
            -   \`phone\`: (string) O telefone de contato, se houver.
        2.  **Campos Personalizados da Candidatura:**
            - A lista de campos abaixo. Para cada um, encontre a melhor resposta no dossiê.
            ${JSON.stringify(customFieldDefinitions, null, 2)}

        **Suas Instruções (Siga com precisão militar):**
        1.  **Análise Holística:** Leia o dossiê completo primeiro. Não faça uma simples cópia de campos.
        2.  **Preenchimento Extensivo:** Sua meta é preencher TODOS os campos possíveis (tanto Gerais quanto Personalizados) com base nas evidências do dossiê.
        3.  **Lógica de Preenchimento:**
            - Para campos de texto, extraia a informação diretamente.
            - Para campos de seleção (select), analise o contexto (cargo, descrição) para escolher a opção mais adequada da lista 'options' e retorne o objeto completo da opção.
            - Infira o gênero a partir do nome para o campo "Sexo".
        4.  **Sem Invenções:** Se não houver evidência para um campo, omita-o do seu JSON de resposta ou retorne 'null'.

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um único objeto JSON válido. Este objeto deve conter as chaves para os campos GERAIS e uma chave "customFields" que é um objeto para os campos personalizados.
        
        **Exemplo de Resposta Perfeita:**
        {
          "location": "São Paulo, Brasil",
          "company": "Google",
          "jobTitle": "Engenheiro de Software Sênior",
          "email": null,
          "customFields": {
            "03": { "id": "f054fecc...", "value": "Masculino", "label": "Masculino" },
            "19": { "id": "ID_ESPECIALISTA...", "value": "Especialista", "label": "Especialista" },
            "outro_id": "Valor encontrado na descrição"
          }
        }
    `;

    try {
        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        const result = JSON.parse(response.data.choices[0].message.content);
        log(`IA concluiu o mapeamento completo de campos para "${scrapedProfileData.name}".`);
        return result;
    } catch (err) {
        error("Erro ao chamar a IA para mapeamento completo de campos:", err.response?.data || err.message);
        throw err;
    }
};

export const mapProfileToInhireSchemaWithAI = async (scrapedProfileData, talentFields, jobTalentFields) => {
    log(`--- ORQUESTRADOR IA: Mapeando perfil de "${scrapedProfileData.name}" para o schema completo da InHire ---`);
    if (!OPENAI_API_KEY) throw new Error("A chave da API da OpenAI não está configurada.");

    const prompt = `
        Você é um especialista em recrutamento e um analista de dados sênior. Sua missão é analisar um dossiê de dados brutos de um perfil do LinkedIn e preencher de forma autônoma e completa o schema de dados de um sistema de recrutamento (ATS).

        **FERRAMENTA 1: Dossiê do Candidato (Fonte de Evidências)**
        Este JSON contém todas as informações disponíveis sobre o candidato. Analise-o holisticamente.
        ${JSON.stringify(scrapedProfileData, null, 2)}

        **FERRAMENTA 2: Schema do Talento (Destino 1)**
        Estes são os campos GERAIS disponíveis para o perfil do talento.
        ${JSON.stringify(talentFields, null, 2)}

        **FERRAMENTA 3: Schema da Candidatura (Destino 2)**
        Estes são os campos PERSONALIZADOS específicos para uma candidatura.
        ${JSON.stringify(jobTalentFields, null, 2)}

        **SUA TAREFA (PROCESSO ANALÍTICO):**
        1.  **Entendimento Completo:** Leia o Dossiê para entender quem é o candidato.
        2.  **Preenchimento do Schema do Talento:** Para cada campo no "Schema do Talento", encontre a informação correspondente no Dossiê.
        3.  **Preenchimento do Schema da Candidatura:** Para cada campo no "Schema da Candidatura", encontre a informação correspondente no Dossiê. Use sua inteligência para interpretar dados:
            -   Se um campo personalizado for "Cargo Atual", use o 'jobTitle' do dossiê.
            -   Para campos de seleção (select), analise o contexto (cargo, descrição) para escolher a opção mais adequada da lista 'options' e retorne o objeto completo da opção.
            -   Infira o gênero a partir do nome.
        4.  **Regra de Ouro:** Não invente dados. Se não houver evidência para um campo, omita-o do seu JSON de resposta.

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um único objeto JSON que tenha duas chaves principais: 'talentPayload' e 'applicationPayload'.
        
        **Exemplo de Resposta Perfeita:**
        {
          "talentPayload": {
            "location": "São Paulo, Brasil",
            "company": "Google"
          },
          "applicationPayload": {
            "customFields": [
              {
                "id": "ID_DO_CAMPO_CARGO",
                "name": "Cargo",
                "type": "text",
                "value": "Engenheiro de Software Sênior"
              },
              {
                "id": "ID_DO_CAMPO_SEXO",
                "name": "Sexo",
                "type": "select",
                "value": { "id": "f054fecc...", "value": "Masculino", "label": "Masculino" }
              }
            ]
          }
        }
    `;

    try {
        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });
        const result = JSON.parse(response.data.choices[0].message.content);
        log(`IA concluiu o mapeamento autônomo para "${scrapedProfileData.name}".`);
        return result;
    } catch (err) {
        error("Erro ao chamar a IA para mapeamento autônomo:", err.response?.data || err.message);
        throw err;
    }
};