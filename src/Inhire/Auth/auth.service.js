// src/Inhire/Auth/auth.service.js

import axios from 'axios';
import { log, error } from '../../utils/logger.service.js'; // Importar o logger

const AUTH_API_URL = process.env.INHIRE_AUTH_API_URL;
const TENANT_ID = process.env.INHIRE_TENANT;

export const loginInhire = async (email, password) => {
  const loginUrl = `${AUTH_API_URL}/login`;
  log(`Tentando autenticar no endpoint: ${loginUrl}`); // MODIFICADO: Usar log

  try {
    const response = await axios.post(loginUrl, {
      email,
      password,
    }, {
      headers: {
        'X-Tenant': TENANT_ID
      }
    });

    const { accessToken, refreshToken } = response.data;
    log(`Login realizado com sucesso. Tokens recebidos. AccessToken length: ${accessToken?.length}, RefreshToken length: ${refreshToken?.length}`); // MODIFICADO: Adicionado log de comprimento do token
    
    return { accessToken, refreshToken };

  } catch (err) { // MODIFICADO: Troquei 'error' por 'err' para evitar conflito com 'error' do logger
    error("Erro ao realizar o login na InHire:", err.response?.data || err.message); // MODIFICADO: Usar error do logger
    return null;
  }
};

/**
 * Usa o refreshToken para obter um novo accessToken.
 * @param {string} currentRefreshToken - O token de refresh que já temos.
 * @returns {Promise<{accessToken: string, refreshToken: string} | null>} Um novo par de tokens ou null em caso de erro.
 */
export const refreshInhireToken = async (currentRefreshToken) => {
  const refreshUrl = `${AUTH_API_URL}/refresh`;
  log(`Tentando renovar o token no endpoint: ${refreshUrl}`); // MODIFICADO: Usar log

  try {
    const response = await axios.post(refreshUrl, {
      refreshToken: currentRefreshToken, // Sempre usa o token atual para a requisição
    }, {
      headers: {
        'X-Tenant': TENANT_ID
      }
    });

    const { accessToken, refreshToken: newRefreshTokenFromApi } = response.data;
    log(`Token de acesso renovado com sucesso. Novo AccessToken length: ${accessToken?.length}`); // MODIFICADO: Adicionado log de comprimento do token

    const finalRefreshToken = newRefreshTokenFromApi || currentRefreshToken;

    return { accessToken, refreshToken: finalRefreshToken };

  } catch (err) { // MODIFICADO: Troquei 'error' por 'err'
    error("Erro ao renovar o token da InHire:", err.response?.data || err.message); // MODIFICADO: Usar error do logger
    return null;
  }
};