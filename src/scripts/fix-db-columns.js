// src/scripts/fix-db-columns.js
import db from '../models/index.js';

async function runFix() {
    try {
        console.log('Iniciando correção de colunas via Sequelize...');
        const queryInterface = db.sequelize.getQueryInterface();

        // 1. Tabela criteria
        try {
            await queryInterface.addColumn('criteria', 'weightType', {
                type: db.Sequelize.STRING,
                allowNull: false,
                defaultValue: 'normal'
            });
            console.log('✅ Coluna weightType adicionada.');
        } catch (e) {
            console.log('ℹ️ Coluna weightType já existe ou erro ignorado:', e.message);
        }

        try {
            await queryInterface.addColumn('criteria', 'tag', {
                type: db.Sequelize.STRING,
                allowNull: true
            });
            console.log('✅ Coluna tag adicionada.');
        } catch (e) {
            console.log('ℹ️ Coluna tag já existe ou erro ignorado:', e.message);
        }

        // 2. Tabela local_applications
        try {
            await queryInterface.addColumn('local_applications', 'evaluationResult', {
                type: db.Sequelize.JSONB,
                allowNull: true
            });
            console.log('✅ Coluna evaluationResult adicionada.');
        } catch (e) {
            console.log('ℹ️ Coluna evaluationResult já existe ou erro ignorado:', e.message);
        }

        console.log('Correção finalizada.');
        process.exit(0);
    } catch (err) {
        console.error('Erro fatal na correção:', err.message);
        process.exit(1);
    }
}

runFix();
