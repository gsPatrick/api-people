/**
 * Gerencia o armazenamento e a recuperação dos tokens de autenticação (accessToken, refreshToken).
 * É completamente agnóstico à plataforma, operando através de um adaptador de armazenamento.
 */

let storageAdapter;

const ACCESS_TOKEN_KEY = 'inhire_accessToken';
const REFRESH_TOKEN_KEY = 'inhire_refreshToken';

/**
 * INICIALIZADOR: Configura qual adaptador de armazenamento este serviço usará.
 * @param {object} adapter - Um objeto adaptador de armazenamento (ex: chromeStorageAdapter).
 */
export const initializeAuthStorage = (adapter) => {
  storageAdapter = adapter;
  console.log("Serviço de armazenamento de autenticação inicializado.");
};

/**
 * Salva os tokens usando o adaptador configurado.
 * @param {string} accessToken
 * @param {string} refreshToken
 */
export const saveTokens = async ({ accessToken, refreshToken }) => {
  if (!storageAdapter) throw new Error("Armazenamento de autenticação não inicializado.");
  await storageAdapter.set(ACCESS_TOKEN_KEY, accessToken);
  await storageAdapter.set(REFRESH_TOKEN_KEY, refreshToken);
  console.log("Tokens de autenticação salvos.");
};

/**
 * Recupera os tokens usando o adaptador configurado.
 * @returns {Promise<{accessToken: string | null, refreshToken: string | null}>}
 */
export const getTokens = async () => {
  if (!storageAdapter) throw new Error("Armazenamento de autenticação não inicializado.");
  const accessToken = await storageAdapter.get(ACCESS_TOKEN_KEY);
  const refreshToken = await storageAdapter.get(REFRESH_TOKEN_KEY);
  return { accessToken, refreshToken };
};

/**
 * Limpa os tokens.
 */
export const clearTokens = async () => {
  if (!storageAdapter) throw new Error("Armazenamento de autenticação não inicializado.");
  await storageAdapter.remove(ACCESS_TOKEN_KEY);
  await storageAdapter.remove(REFRESH_TOKEN_KEY);
  console.log("Tokens de autenticação removidos.");
};