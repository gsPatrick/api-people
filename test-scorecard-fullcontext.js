
import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

// Load env since we are running standalone
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                const k = key.trim();
                let v = valueParts.join('=').trim();
                if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
                process.env[k] = v;
            }
        });
    }
} catch (e) { console.error('Error loading .env', e); }

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000
});

async function runBenchmark() {
    console.log("--- INICIANDO BENCHMARK SCORECARD (FULL CONTEXT - MINI) ---");

    // 1. Carregar Texto Completo
    let fullText = "";
    try {
        const extraction = JSON.parse(fs.readFileSync('./extraction_response.txt', 'utf8'));
        fullText = extraction.textoCompleto;
        console.log(`[DATA] Texto do perfil carregado: ${fullText.length} caracteres.`);
    } catch (e) {
        console.error("Erro ao ler extraction_response.txt. Rode o teste anterior primeiro.");
        return;
    }

    // 2. Definir Scorecard Mock
    const mockCriteria = [
        { name: "Experiência com Node.js", description: "Ter trabalhado profissionalmente com Node.js" },
        { name: "ReactJS", description: "Experiência sólida com React e Hooks" },
        { name: "Inglês Avançado", description: "Capacidade de leitura e escrita técnica" },
        { name: "Formação Acadêmica", description: "Estar cursando ou completado Computação/Sistemas" }
    ];

    console.log(`[DATA] Critérios definidos: ${mockCriteria.map(c => c.name).join(', ')}`);

    // 3. Executar Chamada Otimizada
    const startTime = process.hrtime();

    const prompt = `
    **Persona:** Você é um Tech Recruiter Sênior de Elite. Seja preciso, cético e justo.

    **Tarefa:** Avalie o candidato abaixo APENAS com base no texto fornecido frente aos critérios da vaga.

    **Candidato (Texto Completo):**
    """
    ${fullText}
    """

    **Critérios da Vaga:**
    ${mockCriteria.map((c, i) => `${i + 1}. ${c.name}: ${c.description}`).join('\n')}

    **Rubrica:**
    - 5: Evidência explícita e forte.
    - 4: Evidência clara.
    - 3: Indícios parciais.
    - 2: Menção vaga.
    - 1: Sem evidência.

    **Saída Obrigatória (JSON):**
    Retorne um objeto onde as chaves são os nomes dos critérios e os valores são objetos com "score" (1-5) e "justification" (curta).
    Exemplo:
    {
       "Nome do Critério": { "score": 4, "justification": "..." }
    }
    `;

    try {
        console.log("[AI] Enviando prompt único para GPT-4o-mini...");

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // USANDO MODELO RÁPIDO
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.0,
            max_tokens: 1000
        });

        const endTime = process.hrtime(startTime);
        const durationMs = (endTime[0] * 1000 + endTime[1] / 1e6).toFixed(2);

        console.log(`[AI] Resposta recebida em: ${durationMs}ms`);
        console.log("---------------------------------------------------");
        console.log(response.choices[0].message.content);
        console.log("---------------------------------------------------");

        // Validar tempo
        if (durationMs < 3000) {
            console.log("✅ RESULTADO: SUCESSO (< 3s)");
        } else {
            console.log(`⚠️ RESULTADO: LENTO (> 3s). Tempo: ${durationMs}ms`);
        }

    } catch (error) {
        console.error("Erro na chamada AI:", error);
    }
}

runBenchmark();
