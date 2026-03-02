/**
 * Adaptador de armazenamento em memória, perfeito para testes automatizados (Jest).
 */
let store = {};
export const memoryStorageAdapter = {
  async set(key, value) {
    store[key] = value;
  },
  async get(key) {
    return store[key] || null;
  },
  async remove(key) {
    delete store[key];
  },
  _clear: () => { store = {}; } // Função auxiliar para testes
};