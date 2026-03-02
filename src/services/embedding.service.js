import { OpenAI } from 'openai';
import { log, error } from '../utils/logger.service.js';

// Configura o cliente da OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Modelo de embedding otimizado para performance e custo
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Converte um único texto em um vetor (embedding).
 * @param {string} text - O texto a ser convertido.
 * @returns {Promise<number[]>} O vetor de embedding.
 */
export const createEmbedding = async (text) => {
  // Se o texto for inválido, retorna null para evitar erros.
  // O model do Criterion deve lidar com a conversão de null para um Buffer.
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return null;
  }

  // Reutiliza a função plural, que já lida com a chamada da API.
  const embeddings = await createEmbeddings([text]);
  
  // Retorna apenas o primeiro (e único) embedding do array.
  return embeddings[0];
};

/**
 * Converte um array de textos em um array de vetores (embeddings).
 * @param {string[]} texts - Os textos a serem convertidos.
 * @returns {Promise<number[][]>} Um array de vetores.
 */
export const createEmbeddings = async (texts) => {
  const inputText = Array.isArray(texts) ? texts : [texts];

  const validTexts = inputText.filter(t => t && typeof t === 'string' && t.trim() !== '');
  if (validTexts.length === 0) {
    return [];
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: validTexts,
    });

    return response.data.map(item => item.embedding);
  } catch (err) {
    error('Falha ao criar embeddings com a API da OpenAI:', err.message);
    throw new Error('Falha na geração de embeddings.');
  }
};