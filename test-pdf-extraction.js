
import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { log, error } from './src/utils/logger.service.js';

// 1. Manually load .env
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
        log('Variables from .env loaded manually.');
        if (process.env.OPENAI_API_KEY) {
            log('OPENAI_API_KEY loaded: ' + process.env.OPENAI_API_KEY.substring(0, 10) + '...');
        } else {
            error('OPENAI_API_KEY NOT FOUND in .env');
        }
    }
} catch (e) {
    error('Error loading .env:', e);
}

// 2. Main Logic
async function run() {
    try {
        // Dynamic import AFTER env is loaded
        const { normalizeProfileData } = await import('./src/services/ai.service.js');

        const PDF_PATH = './Profile.pdf';
        const OUTPUT_FILE = './extraction_response.txt';

        log(`--- INICIANDO TESTE DE EXTRAÇÃO DE PDF (VIA PDFJS-DIST ESM) ---`);

        if (!fs.existsSync(PDF_PATH)) {
            error(`Arquivo não encontrado: ${PDF_PATH}`);
            return;
        }

        log(`Lendo arquivo: ${PDF_PATH}`);
        const dataBuffer = fs.readFileSync(PDF_PATH);
        const uint8Array = new Uint8Array(dataBuffer);

        log('Extraindo texto bruto do PDF...');

        const loadingTask = getDocument(uint8Array);
        const doc = await loadingTask.promise;
        log(`PDF Carregado. Páginas: ${doc.numPages}`);

        let rawText = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            rawText += strings.join(' ') + '\n';
        }

        log(`Texto bruto extraído: ${rawText.length} caracteres.`);

        log('Enviando para a IA (normalizeProfileData)...');
        const startTime = Date.now();
        const normalizedData = await normalizeProfileData({ textoCompleto: rawText });
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        log(`Extração via IA concluída em ${duration}s.`);

        const outputContent = JSON.stringify(normalizedData, null, 2);
        fs.writeFileSync(OUTPUT_FILE, outputContent);

        log(`Resultado salvo em: ${OUTPUT_FILE}`);
        console.log("---------------------------------------------------");
        console.log(outputContent);
        console.log("---------------------------------------------------");

    } catch (err) {
        error(`Erro durante o teste: ${err.message}`);
        console.error(err.stack);
    }
}

run();
