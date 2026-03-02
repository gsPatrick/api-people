/**
 * Orquestrador para o fluxo de autenticação.
 */
import { loginInhire } from '../../Inhire/Auth/auth.service.js';
import { saveTokens } from '../../Inhire/Auth/authStorage.service.js';
import { log, error } from '../../utils/logger.service.js';

import 'dotenv/config'; // Para carregar as variáveis de ambiente

/**
 * Realiza o login na InHire e salva os tokens no armazenamento.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const performLogin = async () => {
    log("--- ORQUESTRADOR DE AUTENTICAÇÃO: performLogin ---");
    try {
        const email = process.env.INHIRE_EMAIL;
        const password = process.env.INHIRE_PASSWORD;

        if (!email || !password) {
            throw new Error("Credenciais INHIRE_EMAIL e INHIRE_PASSWORD não encontradas no arquivo .env");
        }

        const tokens = await loginInhire(email, password);
        if (!tokens) throw new Error("Falha ao obter tokens da API da InHire.");

        await saveTokens(tokens);
        return { success: true };

    } catch (err) {
        error("Erro em performLogin:", err.message);
        return { success: false, error: err.message };
    }
};