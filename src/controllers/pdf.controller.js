import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { log, error as logError } from '../utils/logger.service.js';
import { buildCanonicalProfile } from '../utils/profileNormalizer.js';
import * as aiParserService from '../services/aiParser.service.js';

// ==================================================================================
// LOADING PDF-PARSE LIBRARY SAFELY
// ==================================================================================
let pdf;

function tryLoadPdf(moduleName) {
    try {
        const lib = require(moduleName);
        if (typeof lib === 'function') return lib;
        if (lib && typeof lib.default === 'function') return lib.default;
        return lib;
    } catch (e) {
        return null;
    }
}

pdf = tryLoadPdf('pdf-parse/index');
if (!pdf) pdf = tryLoadPdf('pdf-parse');

if (!pdf || (typeof pdf !== 'function' && !pdf.PDFParse)) {
    const internal = tryLoadPdf('pdf-parse/lib/pdf-parse.js');
    if (internal) pdf = internal;
}

if (typeof pdf === 'object' && pdf !== null) {
    if (typeof pdf.PDFParse === 'function') {
        pdf = pdf.PDFParse;
    } else if (pdf.default && typeof pdf.default === 'function') {
        pdf = pdf.default;
    }
}
// ==================================================================================

/**
 * Processa um buffer de PDF e extrai informações estruturadas do perfil.
 */
export const extractProfileFromPdf = async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado.' });
    }

    // Validação final da biblioteca antes de usar
    if (typeof pdf !== 'function' && (!pdf || typeof pdf.PDFParse !== 'function')) {
        const msg = `CRITICAL: pdf-parse lib not initialized correctly. Check logs.`;
        logError(msg);
        return res.status(500).json({ error: msg });
    }

    try {
        const pdfBuffer = req.file.buffer;
        const pdfData = new Uint8Array(pdfBuffer);

        const render_page = async (pageData) => {
            const render_options = { normalizeWhitespace: false, disableCombineTextItems: false };
            const textContent = await pageData.getTextContent(render_options);
            const sidebar = [];
            const main = [];

            for (const item of textContent.items) {
                const x = item.transform[4];
                const text = item.str;
                if (!text || !text.trim()) continue;
                if (x < 180) sidebar.push(text);
                else main.push(text);
            }
            return main.join('\n') + '\n\n' + sidebar.join('\n');
        };

        const options = { pagerender: render_page };
        let data;

        try {
            data = await pdf(pdfData, options);
        } catch (callError) {
            // Fallback para instanciar como classe...
            const instance = new pdf(pdfData, options);
            if (typeof instance.getText === 'function') data = await instance.getText();
            else data = await instance;
        }

        let rawText = (typeof data === 'string') ? data : (data?.text || '');

        // 1. Extração Determinística (Experiências, Educação, Skills)
        const canonicalProfile = buildCanonicalProfile(rawText);

        // 2. REFINAMENTO COM IA (Nome, Título, Localização) - Resolver erro de "Contact", "Repositories"
        log('CONTROLLER PDF: Chamando IA para refinar Identidade (Nome/Título)...');
        const identity = await aiParserService.extractIdentityWithAI(rawText);

        if (identity && identity.nome) {
            log(`✅ IA corrigiu nome: ${canonicalProfile.perfil.nome} -> ${identity.nome}`);
            canonicalProfile.perfil.nome = identity.nome;
            canonicalProfile.perfil.titulo = identity.titulo || canonicalProfile.perfil.titulo;
            canonicalProfile.perfil.localizacao = identity.localizacao || canonicalProfile.perfil.localizacao;
        }

        log('✅ CONTROLLER PDF: Extração HÍBRIDA (IA + Determinística) concluída.');
        res.status(200).json(canonicalProfile);

    } catch (error) {
        logError('❌ CONTROLLER PDF: Erro ao processar o PDF:', error.message);
        res.status(500).json({ error: `Erro interno: ${error.message}` });
    }
};