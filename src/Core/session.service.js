/**
 * Gerencia o estado da sessão de um fluxo de trabalho.
 * É completamente agnóstico à plataforma, pois opera através de um adaptador de armazenamento injetado.
 */

let storageAdapter;
const SESSION_KEY = 'extension_workflow_session';

/**
 * INICIALIZADOR: Configura qual adaptador de armazenamento o serviço de sessão usará.
 * Isso deve ser chamado uma vez na inicialização da aplicação.
 * @param {object} adapter - Um objeto adaptador de armazenamento (ex: chromeStorageAdapter).
 */
export const initializeSessionService = (adapter) => {
  if (!adapter || typeof adapter.get !== 'function' || typeof adapter.set !== 'function') {
    throw new Error("Adaptador de armazenamento inválido fornecido.");
  }
  storageAdapter = adapter;
  console.log("Serviço de sessão inicializado com o adaptador:", adapter.constructor.name || 'objeto anônimo');
};

/**
 * Salva ou atualiza dados na sessão atual.
 * @param {object} dataToSave - Um objeto com os dados a serem salvos.
 */
export const updateSessionData = async (dataToSave) => {
  if (!storageAdapter) throw new Error("Serviço de sessão não inicializado.");
  const currentData = await getSessionData();
  const newData = { ...currentData, ...dataToSave };
  await storageAdapter.set(SESSION_KEY, newData);
  console.log("Sessão atualizada:", newData);
};

/**
 * Recupera todos os dados da sessão atual.
 * @returns {Promise<object>}
 */
export const getSessionData = async () => {
  if (!storageAdapter) throw new Error("Serviço de sessão não inicializado.");
  return (await storageAdapter.get(SESSION_KEY)) || {};
};

/**
 * Limpa todos os dados da sessão atual.
 */
export const clearSession = async () => {
  if (!storageAdapter) throw new Error("Serviço de sessão não inicializado.");
  await storageAdapter.remove(SESSION_KEY);
  console.log("Sessão limpa.");
};