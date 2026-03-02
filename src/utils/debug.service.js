import fs from 'fs';
import path from 'path';
import { log } from './logger.service.js';

const DEBUG_DIR = path.join(process.cwd(), 'debug_logs');

// Garante que o diretório de logs de debug exista
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR);
}

/**
 * Salva um objeto JSON em um arquivo de texto para análise.
 * @param {string} filename - O nome do arquivo (ex: 'candidates_response.txt').
 * @param {object} data - O objeto a ser salvo.
 */
export const saveDebugDataToFile = (filename, data) => {
  try {
    const filePath = path.join(DEBUG_DIR, filename);
    // Usamos JSON.stringify com indentação para tornar o arquivo legível
    const fileContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, fileContent, 'utf8');
    log(`DEBUG: Dados salvos com sucesso em "${filePath}"`);
  } catch (error) {
    console.error(`Falha ao salvar dados de debug em ${filename}:`, error);
  }
};