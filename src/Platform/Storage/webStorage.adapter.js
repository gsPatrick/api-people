/**
 * Adaptador de armazenamento que usa a API Web Storage (sessionStorage).
 */
export const webStorageAdapter = {
  async set(key, value) {
    // sessionStorage só armazena strings, então precisamos serializar/desserializar.
    sessionStorage.setItem(key, JSON.stringify(value));
    return Promise.resolve();
  },
  async get(key) {
    const item = sessionStorage.getItem(key);
    return Promise.resolve(item ? JSON.parse(item) : null);
  },
  async remove(key) {
    sessionStorage.removeItem(key);
    return Promise.resolve();
  }
};