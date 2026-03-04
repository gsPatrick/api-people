// Script de migração: Adiciona campo evaluationResult na tabela local_applications
// Executar com: node src/scripts/add_evaluation_result_field.js

import { Sequelize } from 'sequelize';
import dbConfig from '../config/database.js';

const config = dbConfig.development;
const sequelize = new Sequelize(config.database, config.username, config.password, config);

const migrate = async () => {
  try {
    console.log('🔄 Iniciando migração: adicionando campo evaluationResult à tabela local_applications...');
    
    const queryInterface = sequelize.getQueryInterface();
    const tableInfo = await queryInterface.describeTable('local_applications');

    if (!tableInfo.evaluationResult) {
      await queryInterface.addColumn('local_applications', 'evaluationResult', {
        type: Sequelize.JSONB,
        allowNull: true
      });
      console.log('✅ Campo "evaluationResult" adicionado com sucesso.');
    } else {
      console.log('⏭️ Campo "evaluationResult" já existe.');
    }

    console.log('🎉 Migração concluída com sucesso.');
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
  } finally {
    await sequelize.close();
  }
};

migrate();
