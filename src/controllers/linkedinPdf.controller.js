// src/controllers/linkedinPdf.controller.js
// Controller para baixar e processar o PDF do LinkedIn usando cookies de sessão

import axios from 'axios';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { log, error as logError } from '../utils/logger.service.js';
import db from '../models/index.js'; // Importar modelos para salvar no banco

/**
 * Extrai o username/slug de uma URL do LinkedIn
 */
const extractUsernameFromUrl = (profileUrl) => {
    try {
        const match = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    } catch (error) {
        return null;
    }
};

/**
 * Função auxiliar para limpar texto
 */
const cleanText = (text) => text?.replace(/\s+/g, ' ').trim() || '';

/**
 * Parseia o buffer do PDF do LinkedIn e extrai dados estruturados usando Heurística (Regex/Loop)
 * para garantir performance (< 1s).
 */
const parseLinkedInPdf = async (pdfBuffer) => {
    try {
        log('[PDF Parser] Convertendo Buffer para Unit8Array...');
        const uint8Array = new Uint8Array(pdfBuffer);

        log('[PDF Parser] Carregando documento PDF via pdfjs-dist...');
        const loadingTask = getDocument(uint8Array);
        const doc = await loadingTask.promise;

        log(`[PDF Parser] PDF carregado com sucesso. Páginas: ${doc.numPages}`);

        // Reconstruct lines from PDF items
        let fullText = '';
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            // Join items with simplified separator 
            const strings = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' '));
            fullText += strings.join('');
        }

        const lines = fullText.split('\n').filter(line => line.trim() !== '');

        // Clean up common PDF artifacts
        // Remove "Page X of Y" or "Página X de Y" lines
        fullText = fullText.replace(/\n(Page|Página)\s+\d+\s+(of|de)\s+\d+\s*\n/gi, '\n');

        log(`[PDF Parser] Texto extraído: ${fullText.length} chars, ~${lines.length} linhas.`);

        // Heuristic Structure Construction (Simples)
        const profileData = {
            nome: lines[0] ? cleanText(lines[0]) : null,
            headline: lines[1] ? cleanText(lines[1]) : null,
            resumo: '',
            experiencias: [],
            formacao: [],
            competencias: [],
            idiomas: [],
            certificacoes: [],
            textoCompleto: fullText // Critical data for downstream AI
        };

        log('[PDF Parser] Extração raw text concluída (Modo Rápido).');
        return profileData;

    } catch (err) {
        logError(`[PDF Parser] Erro na extração: ${err.message}`);
        throw err;
    }
};

/**
 * Endpoint principal: recebe profileUrl e cookies,
 * baixa o PDF do LinkedIn e retorna os dados extraídos.
 */
export const fetchLinkedInProfilePdf = async (req, res) => {
    const { profileUrl, liAtCookie, csrfToken } = req.body;

    if (!profileUrl) {
        return res.status(400).json({ error: 'O campo profileUrl é obrigatório.' });
    }

    if (!liAtCookie) {
        return res.status(400).json({ error: 'O campo liAtCookie é obrigatório.' });
    }

    const username = extractUsernameFromUrl(profileUrl);
    if (!username) {
        return res.status(400).json({ error: 'URL do LinkedIn inválida.' });
    }

    log(`--- LINKEDIN PDF: Iniciando fetch para: ${username} ---`);

    try {
        // Monta a string completa de cookies para simular sessão real do navegador
        let cookieString = `li_at=${liAtCookie}`;

        if (csrfToken) {
            const cleanCsrf = csrfToken.replace(/"/g, '');
            cookieString += `; JSESSIONID="${cleanCsrf}"`;
        }

        const baseHeaders = {
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/octet-stream, application/pdf, */*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        };

        const voyagerHeaders = {
            ...baseHeaders,
            'Accept': 'application/vnd.linkedin.normalized+json+2.1',
            'x-li-lang': 'pt_BR',
            'x-li-page-instance': 'urn:li:page:d_flagship3_profile_view_base;' + Math.random().toString(36).substring(7),
            'x-li-track': '{"clientVersion":"1.13.0","mpVersion":"1.13.0","osName":"web","timezoneOffset":-3}',
            'x-restli-protocol-version': '2.0.0',
        };

        if (csrfToken) {
            const cleanCsrf = csrfToken.replace(/"/g, '');
            voyagerHeaders['csrf-token'] = cleanCsrf;
        }

        log(`[LINKEDIN PDF] Tentando baixar PDF para: ${username}`);

        let pdfBuffer = null;
        let lastError = null;

        try {
            log(`[LINKEDIN PDF] Buscando informações do perfil via Voyager...`);
            const profileResponse = await axios.get(
                `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${username}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-19`,
                {
                    headers: voyagerHeaders,
                    timeout: 15000
                }
            );

            if (profileResponse.status === 200 && profileResponse.data) {
                log(`[LINKEDIN PDF] ✅ Perfil encontrado via Voyager API`);
                const pdfResponse = await axios.get(
                    `https://www.linkedin.com/voyager/api/identity/profiles/${username}/profileToPdf`,
                    {
                        headers: {
                            ...voyagerHeaders,
                            'Accept': 'application/octet-stream, application/pdf',
                        },
                        responseType: 'arraybuffer',
                        timeout: 30000
                    }
                );

                if (pdfResponse.data && pdfResponse.data.byteLength > 1000) {
                    pdfBuffer = Buffer.from(pdfResponse.data);
                    log(`[LINKEDIN PDF] ✅ PDF baixado via profileToPdf: ${pdfBuffer.length} bytes`);
                }
            }
        } catch (voyagerError) {
            log(`[LINKEDIN PDF] Voyager API falhou: ${voyagerError.message}`);
            lastError = voyagerError;
        }

        if (!pdfBuffer) {
            try {
                log(`[LINKEDIN PDF] Tentando método alternativo...`);
                await axios.get(`https://www.linkedin.com/in/${username}/`, {
                    headers: baseHeaders,
                    timeout: 10000,
                    maxRedirects: 5
                });
                const pdfResponse = await axios.get(
                    `https://www.linkedin.com/in/${username}/overlay/background/getAsPdf/`,
                    {
                        headers: {
                            ...baseHeaders,
                            'Accept': 'application/octet-stream, application/pdf',
                            'Referer': `https://www.linkedin.com/in/${username}/`
                        },
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        maxRedirects: 5
                    }
                );
                if (pdfResponse.data && pdfResponse.data.byteLength > 1000) {
                    pdfBuffer = Buffer.from(pdfResponse.data);
                    log(`[LINKEDIN PDF] ✅ PDF baixado via getAsPdf: ${pdfBuffer.length} bytes`);
                }
            } catch (altError) {
                log(`[LINKEDIN PDF] Método alternativo falhou: ${altError.message}`);
                lastError = altError;
            }
        }

        if (!pdfBuffer || pdfBuffer.length < 1000) {
            const errorMessage = lastError?.response?.status === 403
                ? 'Acesso negado pelo LinkedIn. O cookie pode estar expirado ou o perfil é privado.'
                : 'Não foi possível baixar o PDF do LinkedIn.';
            logError(`[LINKEDIN PDF] Falha final: ${lastError?.message || 'PDF vazio'}`);
            return res.status(401).json({
                error: errorMessage,
                code: 'PDF_DOWNLOAD_FAILED',
                details: lastError?.message
            });
        }

        const pdfSignature = pdfBuffer.slice(0, 5).toString();
        if (!pdfSignature.startsWith('%PDF')) {
            log(`[LINKEDIN PDF] ⚠️ Resposta não é PDF válido. Início: ${pdfSignature}`);
            const responsePreview = pdfBuffer.slice(0, 200).toString('utf-8');
            if (responsePreview.includes('<!DOCTYPE') || responsePreview.includes('<html')) {
                return res.status(401).json({
                    error: 'Cookie de sessão expirado. Faça login novamente no LinkedIn.',
                    code: 'SESSION_EXPIRED'
                });
            }
            return res.status(500).json({
                error: 'Resposta inesperada do LinkedIn. Tente novamente.',
                code: 'INVALID_RESPONSE'
            });
        }

        // Processa o PDF
        log(`[LINKEDIN PDF] Processando PDF (${pdfBuffer.length} bytes)...`);
        const profileData = await parseLinkedInPdf(pdfBuffer);

        log('✅ LINKEDIN PDF: Extração concluída com sucesso.');

        // SALVAR NO BANCO DE DADOS
        try {
            if (db.LinkedInProfile) {
                log(`[DB] Salvando perfil de ${username} no banco de dados...`);
                await db.LinkedInProfile.upsert({
                    linkedinHandle: username,
                    fullProfileText: profileData.textoCompleto,
                    lastUpdated: new Date()
                });
                log(`[DB] Perfil ${username} salvo/atualizado com sucesso.`);
            } else {
                logError('[DB] Modelo LinkedInProfile não encontrado no objeto db.');
            }
        } catch (dbError) {
            logError(`[DB] Erro ao salvar perfil no banco: ${dbError.message}`);
            // Não falha a requisição se o banco falhar, apenas loga
        }

        res.status(200).json({
            success: true,
            profile: profileData
        });

    } catch (error) {
        logError('❌ LINKEDIN PDF: Erro:', error.message);
        if (error.response) {
            const status = error.response.status;
            if (status === 401 || status === 403) return res.status(401).json({ error: 'Cookie inválido.', code: 'SESSION_EXPIRED' });
            if (status === 404) return res.status(404).json({ error: 'Perfil não encontrado.', code: 'PROFILE_NOT_FOUND' });
            if (status === 429) return res.status(429).json({ error: 'Rate limit.', code: 'RATE_LIMITED' });
        }
        res.status(500).json({ error: 'Erro interno.', details: error.message });
    }
};

export const checkLinkedInCookieStatus = async (req, res) => {
    const { liAtCookie } = req.body;
    if (!liAtCookie) return res.status(400).json({ valid: false, error: 'Cookie li_at não fornecido.' });
    try {
        const response = await axios.get('https://www.linkedin.com/voyager/api/me', {
            headers: {
                'Cookie': `li_at=${liAtCookie}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'x-restli-protocol-version': '2.0.0'
            },
            timeout: 10000
        });
        if (response.status === 200) return res.status(200).json({ valid: true, message: 'Cookie válido.' });
    } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) return res.status(200).json({ valid: false, error: 'Cookie expirado.' });
    }
    res.status(200).json({ valid: false, error: 'Não foi possível verificar.' });
};
