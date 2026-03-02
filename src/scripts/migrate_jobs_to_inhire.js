
import db, { initializeModels } from '../models/index.js';
import { log, error } from '../utils/logger.service.js';

async function migrate() {
    log('--- MIGRATION: Iniciando migração de Vagas para InHire ---');
    try {
        await initializeModels();
        
        log('[MIGRATION] Sincronizando schema do banco de dados...');
        await db.sequelize.sync({ alter: true });
        
        // Todas as vagas existentes atualmente vieram da InHire (conforme informado pelo usuário)
        const [updatedCount] = await db.LocalJob.update(
            { 
                source: 'INHIRE', 
                syncStatus: 'SYNCHRONIZED',
                isSynced: true 
            },
            { 
                where: {} // Todas as vagas
            }
        );

        log(`--- MIGRATION: Sucesso! ${updatedCount} vagas atualizadas como 'INHIRE' ---`);
        process.exit(0);
    } catch (err) {
        error('--- MIGRATION: ERRRO NA MIGRAÇÃO ---', err);
        process.exit(1);
    }
}

migrate();
