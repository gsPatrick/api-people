// Script de migração: Adicionar campos weightType e tag na tabela criteria
// Executar com: node src/scripts/add_criterion_weight_fields.js

import { Sequelize } from 'sequelize';
import dbConfig from '../config/database.js';

const config = dbConfig.development;
const sequelize = new Sequelize(config.database, config.username, config.password, config);

const migrate = async () => {
  try {
    console.log('🔄 Iniciando migração: adicionando campos weightType e tag à tabela criteria...');
    
    const queryInterface = sequelize.getQueryInterface();
    const tableInfo = await queryInterface.describeTable('criteria');

    if (!tableInfo.weightType) {
      await queryInterface.addColumn('criteria', 'weightType', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'normal'
      });
      console.log('✅ Campo "weightType" adicionado com sucesso.');
    } else {
      console.log('⏭️ Campo "weightType" já existe.');
    }

    if (!tableInfo.tag) {
      await queryInterface.addColumn('criteria', 'tag', {
        type: Sequelize.STRING,
        allowNull: true
      });
      console.log('✅ Campo "tag" adicionado com sucesso.');
    } else {
      console.log('⏭️ Campo "tag" já existe.');
    }

    console.log('🎉 Migração concluída com sucesso.');
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
  } finally {
    await sequelize.close();
  }
};

migrate();
