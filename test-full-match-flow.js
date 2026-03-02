// test-full-match-flow.js
// Testa o fluxo completo: PDF -> Extração -> Match com IA
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Imports de serviços serão feitos dinamicamente após carregar env

// ID de um scorecard existente para teste (substitua se necessário)
const TEST_SCORECARD_ID = '9c6de3b8-1044-4db1-8e3a-3c2f7e9d44f0'; // Trocar pelo ID real

async function extractTextFromPdf(filePath) {
    console.log(`📄 Extraindo texto do PDF: ${filePath}`);
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await getDocument({ data }).promise;
    let fullText = '';

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    console.log(`✅ Extraído: ${fullText.length} caracteres, ${doc.numPages} páginas`);
    return fullText;
}

async function main() {
    const pdfPath = path.join(__dirname, 'Profile (82).pdf');

    if (!fs.existsSync(pdfPath)) {
        console.error('❌ Arquivo PDF não encontrado:', pdfPath);
        return;
    }

    console.log('========================================');
    console.log('🧪 TESTE COMPLETO DO FLUXO DE MATCH');
    console.log('========================================\n');

    try {
        // Importação dinâmica para garantir que dotenv já carregou
        const { normalizeProfileData } = await import('./src/services/ai.service.js');
        const { analyze: matchAnalyze } = await import('./src/services/match.service.js');

        // 1. Extração do PDF
        const textoCompleto = await extractTextFromPdf(pdfPath);
        console.log('📝 Preview do texto (primeiros 500 chars):');
        console.log(textoCompleto.slice(0, 500));
        console.log('\n----------------------------------------\n');

        // 2. Normalização com IA
        console.log('🤖 Normalizando perfil com IA...');
        const normalizedProfile = await normalizeProfileData({ textoCompleto });

        if (!normalizedProfile) {
            console.error('❌ Falha na normalização do perfil');
            return;
        }

        console.log('✅ Perfil normalizado:');
        console.log(JSON.stringify(normalizedProfile, null, 2).slice(0, 1000));
        console.log('\n----------------------------------------\n');

        // 3. Match com Scorecard
        console.log('🎯 Executando análise de Match...');
        console.log(`   Scorecard ID: ${TEST_SCORECARD_ID}`);

        const matchResult = await matchAnalyze(TEST_SCORECARD_ID, normalizedProfile);

        console.log('\n========================================');
        console.log('📊 RESULTADO DO MATCH:');
        console.log('========================================');
        console.log(JSON.stringify(matchResult, null, 2));

    } catch (err) {
        console.error('\n❌ ERRO CAPTURADO:');
        console.error('   Mensagem:', err.message);
        console.error('   Stack:', err.stack);
        if (err.response) {
            console.error('   Response Status:', err.response.status);
            console.error('   Response Data:', err.response.data);
        }
    }
}

main();
