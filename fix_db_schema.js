
import db from './src/models/index.js';
import { log, error } from './src/utils/logger.service.js';

async function fixSchema() {
    log('--- INICIANDO CORREÇÃO DE SCHEMA (MIGRATION MANUAL) ---');
    try {
        await db.initializeModels();
        const queryInterface = db.sequelize.getQueryInterface();

        // --- 1. Ajustes na tabela 'scorecards' ---
        log('Verificando tabela "scorecards"...');
        const scorecardCols = await queryInterface.describeTable('scorecards');

        if (!scorecardCols.jobId) {
            log('Adicionando coluna "jobId" em "scorecards"...');
            await queryInterface.addColumn('scorecards', 'jobId', {
                type: db.Sequelize.UUID,
                allowNull: true
            });
        }

        if (!scorecardCols.syncStatus) {
            log('Adicionando coluna "syncStatus" em "scorecards"...');
            await queryInterface.addColumn('scorecards', 'syncStatus', {
                type: db.Sequelize.ENUM('SYNCHRONIZED', 'PENDING', 'FAILED'),
                defaultValue: 'PENDING'
            });
        }

        if (!scorecardCols.source) {
            log('Adicionando coluna "source" em "scorecards"...');
            await queryInterface.addColumn('scorecards', 'source', {
                type: db.Sequelize.ENUM('LOCAL', 'INHIRE'),
                defaultValue: 'LOCAL'
            });
        }

        if (!scorecardCols.isSynced) {
            log('Adicionando coluna "isSynced" em "scorecards"...');
            await queryInterface.addColumn('scorecards', 'isSynced', {
                type: db.Sequelize.BOOLEAN,
                defaultValue: false
            });
        }

        if (!scorecardCols.externalId) {
            log('Adicionando coluna "externalId" em "scorecards"...');
            await queryInterface.addColumn('scorecards', 'externalId', {
                type: db.Sequelize.STRING,
                allowNull: true
            });
        }

        // --- 2. Ajustes na tabela 'local_jobs' ---
        log('Verificando tabela "local_jobs"...');
        const jobCols = await queryInterface.describeTable('local_jobs');

        if (!jobCols.areaId) {
            log('Adicionando coluna "areaId" em "local_jobs"...');
            await queryInterface.addColumn('local_jobs', 'areaId', {
                type: db.Sequelize.STRING,
                allowNull: true
            });
        }

        log('--- CORREÇÃO DE SCHEMA CONCLUÍDA COM SUCESSO ---');
        process.exit(0);
    } catch (err) {
        error('❌ ERRO AO EXECUTAR MIGRAÇÃO DE SCHEMA:', err.message);
        console.error(err);
        process.exit(1);
    }
}

fixSchema();
