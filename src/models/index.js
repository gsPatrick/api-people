// ARQUIVO COMPLETO: src/models/index.js

import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dbConfig from '../config/database.js'; // <-- MUDANÇA: Importa a nova configuração

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usa a configuração 'development' do nosso novo arquivo
const config = dbConfig.development;
const sequelize = new Sequelize(config.database, config.username, config.password, config);

const db = {};

const initializeModels = async () => {
  const files = fs.readdirSync(__dirname).filter(file =>
    (file.indexOf('.') !== 0) && (file !== path.basename(__filename)) && (file.slice(-9) === '.model.js')
  );

  for (const file of files) {
    const modelImporter = await import(new URL(file, import.meta.url).href);
    const model = modelImporter.default(sequelize);
    db[model.name] = model;
  }

  Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
      db[modelName].associate(db);
    }
  });
};

// Retiramos o await top-level que estava travando
// await initializeModels();

db.sequelize = sequelize;
db.Sequelize = Sequelize;
db.initializeModels = initializeModels; // Exporta para ser chamado no arranque

export default db;
export { sequelize, initializeModels }; // <-- MUDANÇA: Exporta a função para ser chamada explicitamente