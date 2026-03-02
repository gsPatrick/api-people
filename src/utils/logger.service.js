import fs from 'fs';
import path from 'path';

// Configurações do logger
let logToFile = false;
let logStream;
const LOG_FILE_NAME = 'test-run.log';

/**
 * Configura o logger.
 * @param {object} options
 * @param {boolean} [options.toFile=false] - Se true, escreve os logs em um arquivo.
 */
export const configureLogger = (options = {}) => {
  logToFile = options.toFile || false;
  if (logToFile) {
    const logPath = path.join(process.cwd(), LOG_FILE_NAME);
    // Limpa o arquivo de log antigo ao iniciar
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    logStream = fs.createWriteStream(logPath, { flags: 'a' });
    log('--- Logger configurado para escrever em arquivo: test-run.log ---');
  }
};

/**
 * Função principal de log. Escreve no console e, opcionalmente, em um arquivo.
 * @param {string} message - A mensagem a ser registrada.
 */
export const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  // Sempre escreve no console
  console.log(message);

  // Escreve no arquivo se configurado
  if (logToFile && logStream) {
    logStream.write(logMessage + '\n');
  }
};

/**
 * Função para registrar erros.
 * @param {string} message - A mensagem de erro.
 * @param {any} [error] - O objeto de erro, se houver.
 */
export const error = (message, errorObject = '') => {
  const fullMessage = `${message} ${errorObject ? JSON.stringify(errorObject, null, 2) : ''}`;
  log(`❌ ERRO: ${fullMessage}`);
};

/**
 * Fecha o stream de escrita do arquivo de log.
 */
export const closeLogger = () => {
  if (logStream) {
    logStream.end();
  }
};