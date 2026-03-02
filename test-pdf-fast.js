
import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Simple logger mock
const log = console.log;
const error = console.error;

const cleanText = (text) => text?.replace(/\s+/g, ' ').trim() || '';

async function run() {
    try {
        const PDF_PATH = './Profile.pdf';
        const OUTPUT_FILE = './extraction_response.txt';

        log(`--- INICIANDO TESTE FAST RAW TEXT ---`);

        if (!fs.existsSync(PDF_PATH)) {
            error(`Arquivo não encontrado: ${PDF_PATH}`);
            return;
        }

        log(`Lendo arquivo: ${PDF_PATH}`);
        const dataBuffer = fs.readFileSync(PDF_PATH);
        const uint8Array = new Uint8Array(dataBuffer);

        const startTime = process.hrtime();

        log('[PDF Parser] Carregando documento PDF via pdfjs-dist...');
        const loadingTask = getDocument(uint8Array);
        const doc = await loadingTask.promise;

        log(`[PDF Parser] PDF carregado com sucesso. Páginas: ${doc.numPages}`);

        // Reconstruct lines from PDF items
        let fullText = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();

            // Join items with simplified separator (try to preserve some flow)
            const strings = content.items.map(item => {
                return item.str + (item.hasEOL ? '\n' : ' ');
            });
            fullText += strings.join('');
        }

        const lines = fullText.split('\n').filter(line => line.trim() !== '');

        // Clean up common PDF artifacts
        // Remove "Page X of Y" or "Página X de Y" lines
        fullText = fullText.replace(/\n(Page|Página)\s+\d+\s+(of|de)\s+\d+\s*\n/gi, '\n');

        log(`[PDF Parser] Texto extraído: ${fullText.length} chars, ~${lines.length} linhas.`);

        // Simplified Return Structure (Raw Text Focus)
        // This structure matches what will be returned by the controller for downstream AI
        const profileData = {
            nome: lines[0] ? cleanText(lines[0]) : null,
            headline: lines[1] ? cleanText(lines[1]) : null,
            resumo: '',
            experiencias: [],
            formacao: [],
            competencias: [],
            idiomas: [],
            certificacoes: [],
            textoCompleto: fullText
        };

        const endTime = process.hrtime(startTime);
        const durationMs = (endTime[0] * 1000 + endTime[1] / 1e6).toFixed(2);

        log(`[PDF Parser] Extração raw text concluída em ${durationMs}ms`);

        const outputContent = JSON.stringify(profileData, null, 2);
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
