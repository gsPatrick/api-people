
import { log, error } from '../utils/logger.service.js';
import InhireProvider from '../Inhire/Providers/inhire.provider.js';
import db from '../models/index.js';

const { LocalTalent } = db;

class SyncService {
    constructor() {
        this.provider = InhireProvider; // Default strategy. Could be dynamic in future.
        this.isSyncing = false;
        this.queue = [];
    }

    /**
     * Adds a talent sync task to the background queue.
     * @param {string} localTalentId - The UUID of the LocalTalent to sync.
     * @param {string} jobId - Optional. ID of the job to associate with.
     */
    triggerBackgroundSync(localTalentId, jobId) {
        log(`SYNC: Agendando sincronização para LocalTalent ${localTalentId}...`);

        // Use setImmediate to detach from the main event loop return
        setImmediate(() => {
            this.syncTalent(localTalentId, jobId).catch(err => {
                error(`SYNC: Erro não tratado na sync background de ${localTalentId}:`, err);
            });
        });
    }

    /**
     * Performs the actual synchronization logic.
     */
    async syncTalent(localTalentId, jobId) {
        log(`SYNC: Iniciando processamento para ${localTalentId}`);

        try {
            const localTalent = await LocalTalent.findByPk(localTalentId);
            if (!localTalent) {
                error(`SYNC: LocalTalent ${localTalentId} não encontrado.`);
                return;
            }

            // 1. Create in External Provider
            // We map the local data to what the provider expects
            const payload = {
                name: localTalent.name,
                linkedinUsername: localTalent.linkedinUsername,
                headline: localTalent.headline,
                email: localTalent.email,
                phone: localTalent.phone,
                location: localTalent.location,
                ...localTalent.data // Spread raw data as fallback/enrichment
            };

            const externalResult = await this.provider.createTalent(payload);

            if (externalResult && externalResult.id) {
                // 2. Update Local Record with External ID
                await localTalent.update({
                    externalId: externalResult.id,
                    syncStatus: 'SYNCED'
                });
                log(`SYNC: Sucesso! LocalTalent ${localTalentId} vinculado ao External ID ${externalResult.id}`);

                // 3. Link to Job if provided
                if (jobId) {
                    await this.provider.addTalentToJob(jobId, externalResult.id);
                    log(`SYNC: Talento adicionado à vaga ${jobId} externamente.`);
                }

            } else {
                throw new Error("Provider não retornou um ID válido.");
            }

        } catch (err) {
            error(`SYNC: Falha ao sincronizar ${localTalentId}:`, err.message);

            // Update status to ERROR so we can retry later
            const localTalent = await LocalTalent.findByPk(localTalentId);
            if (localTalent) {
                await localTalent.update({ syncStatus: 'ERROR' });
            }
        }
    }
}

export default new SyncService();
