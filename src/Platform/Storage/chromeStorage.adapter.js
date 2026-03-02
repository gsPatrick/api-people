/**
 * Adaptador de armazenamento que usa a API chrome.storage.session.
 */
export const chromeStorageAdapter = {
  async set(key, value) {
    await chrome.storage.session.set({ [key]: value });
  },
  async get(key) {
    const result = await chrome.storage.session.get(key);
    return result[key] || null;
  },
  async remove(key) {
    await chrome.storage.session.remove(key);
  }
};