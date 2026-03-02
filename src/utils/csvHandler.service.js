// src/utils/csvHandler.service.js

import fs from 'fs';
import path from 'path';
import { log, error } from './logger.service.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// O caminho completo para o arquivo CSV
// Assumindo que este arquivo está em src/utils, e o CSV em public/data
// A partir de src/utils, precisamos subir 2 níveis (..) para a raiz do projeto,
// e depois descer para public/data.
const CSV_FILE_PATH = path.join(__dirname, '..', '..', 'public', 'data', 'linkedins.csv');

/**
 * Adiciona uma URL de perfil do LinkedIn ao arquivo CSV.
 * Inclui uma verificação básica para evitar duplicatas simples.
 * Cria o arquivo se não existir (com o cabeçalho).
 * @param {string} linkedinUrl - A URL completa do perfil do LinkedIn.
 */
export const appendProfileToCSV = async (linkedinUrl) => {
  try {
    let fileContent = '';
    // Tenta ler o arquivo. Se não existir, a exception será capturada.
    try {
      fileContent = fs.readFileSync(CSV_FILE_PATH, 'utf8');
    } catch (readErr) {
      if (readErr.code === 'ENOENT') {
        // Arquivo não encontrado, cria com cabeçalho
        log('CSV file not found, creating it with header.');
        fs.writeFileSync(CSV_FILE_PATH, 'linkedinProfileUrl\n', 'utf8');
        fileContent = 'linkedinProfileUrl\n'; // Garante que o conteúdo para checagem esteja atualizado
      } else {
        throw readErr; // Outro erro de leitura, re-lança
      }
    }

    // Checagem básica de deduplicação em memória
    if (fileContent.includes(linkedinUrl)) {
      log(`AVISO: Perfil ${linkedinUrl} já existe no CSV. Não adicionado novamente.`);
      return;
    }

    const linha = `${linkedinUrl}\n`; // Adiciona nova linha no final
    fs.appendFileSync(CSV_FILE_PATH, linha, 'utf8');
    log(`✅ Perfil adicionado ao CSV: ${linkedinUrl}`);
  } catch (err) {
    error('❌ Erro ao adicionar perfil ao CSV:', err.message);
    throw err; // Re-lança para que o orquestrador possa lidar com isso
  }
};