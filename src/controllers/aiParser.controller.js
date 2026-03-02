import { log, error as logError } from '../utils/logger.service.js';
import * as aiParserService from '../services/aiParser.service.js';

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
        // Define as tarefas de extração
        const tasks = [
            aiParserService.extractIdentityWithAI(rawText),
            aiParserService.extractFieldWithAI(rawText, "Extraia o resumo (seção 'Resumo') do perfil.", '"<resumo>"'),
            aiParserService.extractFieldWithAI(rawText, "Liste TODAS as experiências profissionais. Para cada uma, extraia o cargo, nome da empresa e o período.", '[{"title": "...", "companyName": "...", "dateRange": "..."}]'),
            aiParserService.extractFieldWithAI(rawText, "Liste TODAS as formações acadêmicas. Para cada uma, extraia o nome da instituição, o curso/grau e o período.", '[{"schoolName": "...", "degree": "...", "dateRange": "..."}]'),
            aiParserService.extractFieldWithAI(rawText, "Liste as principais competências mencionadas.", '[{"name": "..."}, {"name": "..."}]')
        ];

        // Executa todas as extrações em paralelo
        const [identity, about, experience, education, skills] = await Promise.all(tasks);

        // Monta o objeto final com as respostas
        const profileData = {
            perfil: {
                nome: identity.nome,
                titulo: identity.titulo,
                localizacao: identity.localizacao,
            },
            // Campos redundantes para compatibilidade
            name: identity.nome,
            headline: identity.titulo,
            location: identity.localizacao,
            about,
            experience: experience || [],
            education: education || [],
            skills: skills || []
        };

        const duration = Date.now() - startTime;
        log(`✅ AI PARSER CONTROLLER: Perfil completo estruturado em ${duration}ms.`);

        res.status(200).json(profileData);

    } catch (err) {
        logError('❌ AI PARSER CONTROLLER: Erro crítico durante o parsing paralelo:', err.message);
        res.status(500).json({ error: 'Falha ao processar o texto do perfil com a IA.' });
    }
};