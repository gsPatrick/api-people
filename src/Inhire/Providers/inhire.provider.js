
import { createTalent, updateTalent, deleteTalent, getTalentById } from '../Talents/talents.service.js';
import { addTalentToJob } from '../JobTalents/jobTalents.service.js';
import { log, error } from '../../utils/logger.service.js';

class InhireProvider {
    constructor() {
        this.name = 'inhire';
    }

    /**
     * Creates a talent in the external system.
     * @param {object} talentData - Normalized talent data.
     * @returns {Promise<object>} The created talent object from the external provider.
     */
    async createTalent(talentData) {
        // Adapt normalized data to InHire payload if necessary
        // Assuming talentData is already compatible based on current usage
        return await createTalent(talentData);
    }

    async updateTalent(externalId, updateData) {
        return await updateTalent(externalId, updateData);
    }

    async addTalentToJob(jobId, externalTalentId) {
        return await addTalentToJob(jobId, externalTalentId);
    }

    async getTalent(externalId) {
        return await getTalentById(externalId);
    }
}

export default new InhireProvider();
