// ARQUIVO ATUALIZADO: src/Inhire/inhireCore.js

import axios from 'axios';
import { getTokens, saveTokens } from './Auth/authStorage.service.js';
import { refreshInhireToken } from './Auth/auth.service.js';
import { log, error } from '../utils/logger.service.js';

const inhireCore = axios.create({});

// Interceptor de Requisição (com logs detalhados)
inhireCore.interceptors.request.use(
  async (config) => {
    const { accessToken } = await getTokens();
    
    if (!process.env.INHIRE_TENANT) {
      log("AVISO: Variável de ambiente INHIRE_TENANT não definida!");
    }

    config.headers['X-Tenant'] = process.env.INHIRE_TENANT;

    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
      
      // ==========================================================
      // MUDANÇA PRINCIPAL: Comente a linha abaixo para silenciar
      // os logs de requisição que estão poluindo o console.
      // ==========================================================
      // log(`DEBUG REQ INTERCEPTOR: Enviando para ${config.url} - X-Tenant: ${config.headers['X-Tenant']}, Authorization: Bearer <token_present> (length: ${accessToken.length})`);

    } else {
      // Este log pode ser útil, então o mantemos por enquanto.
      log(`DEBUG REQ INTERCEPTOR: Enviando para ${config.url} - X-Tenant: ${config.headers['X-Tenant']}, NENHUM accessToken presente.`);
    }
    return config;
  },
  (err) => {
    error("Erro no interceptor de requisição:", err);
    return Promise.reject(err);
  }
);

// Interceptor de Resposta (Refinado com logs)
inhireCore.interceptors.response.use(
  (response) => response,
  async (err) => {
    const originalRequest = err.config;
    
    if (err.response?.status === 401) {
      log(`DEBUG RESP INTERCEPTOR: 401 Não Autorizado para ${originalRequest.url}. Mensagem: ${err.response.data?.message || err.message}`);
    }

    if (err.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      log("Token de acesso expirado. Tentando renovar...");
      const { refreshToken: currentRefreshToken } = await getTokens();
      
      if (currentRefreshToken) {
        try {
          const newTokens = await refreshInhireToken(currentRefreshToken);
          
          if (newTokens && newTokens.accessToken) {
            await saveTokens(newTokens);
            
            originalRequest.headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
            log("Token renovado com sucesso. Reenviando a requisição original.");
            return inhireCore(originalRequest);
          }
        } catch (refreshError) {
          error("Falha crítica ao renovar o token. O usuário pode precisar fazer login novamente.", refreshError);
          return Promise.reject(refreshError);
        }
      } else {
        log("Nenhum refreshToken encontrado. Não é possível renovar o token.");
      }
    }
    
    return Promise.reject(err);
  }
);

export default inhireCore;