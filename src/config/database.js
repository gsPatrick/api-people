// CRIE O ARQUIVO: src/config/database.js

import 'dotenv/config';

// Configuração baseada na imagem fornecida
const config = {
  development: {
    username: 'peoplebdpos',
    password: 'peoplebdpos',
    database: 'peoplebdpos',
    host: '69.62.99.122', // Host Externo
    port: 9091,            // Porta Externa
    dialect: 'postgres',
    logging: false, // Desativa os logs de SQL no console
    
    // Adicionar dialectOptions pode ser necessário para conexões remotas
    dialectOptions: {
      // Se o seu provedor de DB exigir SSL, descomente a linha abaixo
      // ssl: { require: true, rejectUnauthorized: false } 
    }
  },
  production: {
    // Você pode configurar suas variáveis de ambiente para produção aqui
    username: process.env.PROD_DB_USERNAME,
    password: process.env.PROD_DB_PASSWORD,
    database: process.env.PROD_DB_NAME,
    host: process.env.PROD_DB_HOSTNAME,
    port: process.env.PROD_DB_PORT,
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Ajuste conforme a necessidade do seu provedor
      }
    }
  }
};

export default config;