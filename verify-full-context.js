
import { analyze } from './src/services/match.service.js';
import * as scorecardService from './src/services/scorecard.service.js';
import { log } from './src/utils/logger.service.js';

// Mock findById to avoid DB dependency in this specific test or just rely on a real one if DB is connected
// For simplicity, I'll mock findById if possible, or create a dummy scorecard in DB.
// Actually, since I have DB connection working, I can try to use a real scorecard if I know one ID.
// But easier to Mock the service function for this test script to only test the "analyze" logic? 
// No, analyze calls findScorecardById.

// Let's create a mock version of findScorecardById for this test
scorecardService.findById = async (id) => {
    return {
        id: 'mock-scorecard',
        name: 'Mock Scorecard',
        categories: [
            {
                name: 'Technical Skills',
                order: 1,
                criteria: [
                    { name: 'Node.js', weight: 3, embedding: [] },
                    { name: 'PostgreSQL', weight: 2, embedding: [] }
                ]
            }
        ]
    };
};

const mockProfile = {
    name: "John Doe",
    headline: "Senior Backend Developer",
    location: "São Paulo",
    about: "Experienced developer with Node.js and SQL.",
    experience: [
        { title: "Backend Engineer", companyName: "Tech Corp", description: "Worked with Node.js and Postgres." }
    ],
    skills: ["Node.js", "SQL", "Git"]
};

// Mock ai.service.js analyzeAllCriteriaInBatch to avoid spending money and network calls
import * as aiService from './src/services/ai.service.js';
aiService.analyzeAllCriteriaInBatch = async (criteriaWithChunks, context) => {
    log("MOCK AI CALLED with context: " + JSON.stringify(context));
    log("Chunks length: " + criteriaWithChunks[0].chunks[0].length);
    return criteriaWithChunks.map(c => ({
        name: c.criterion.name,
        score: 4,
        justification: "Mock AI decision based on full context."
    }));
};

const runTest = async () => {
    try {
        log("Iniciando teste de Full Context Analysis...");
        const result = await analyze('mock-id', mockProfile);
        log("Resultado da análise:", JSON.stringify(result, null, 2));

        if (result.overallScore > 0 && result.categories.length > 0) {
            log("✅ TESTE PASSOU: Análise retornou score válido.");
        } else {
            log("❌ TESTE FALHOU: Score inválido.");
            process.exit(1);
        }
    } catch (err) {
        log("❌ ERRO:", err);
        process.exit(1);
    }
};

runTest();
