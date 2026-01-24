
import db, { initializeModels, sequelize } from '../models/index.js';
import { log, error } from '../utils/logger.service.js';

const initLocalTables = async () => {
    log('--- MIGRAÇÃO LOCAL-FIRST: Inicializando Tabelas ---');
    try {
        await sequelize.authenticate();
        log('✅ Conexão com PostgreSQL estabelecida.');

        await initializeModels();
        log('✅ Modelos carregados.');

        // 'alter: true' ajusta as tabelas para baterem com o modelo sem dropar dados existentes (se houver)
        // Como são tabelas novas, ele vai criá-las.
        await sequelize.sync({ alter: true });

        log('✅ Tabelas LocalTalent, LocalJob, LocalApplication sincronizadas com sucesso!');
        log('🚀 Infraestrutura Local-First pronta.');

    } catch (err) {
        error('❌ Falha na migração:', err.message);
        console.error(err);
    } finally {
        await sequelize.close();
    }
};

initLocalTables();
