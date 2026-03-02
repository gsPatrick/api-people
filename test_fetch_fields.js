import dotenv from 'dotenv';
dotenv.config();
import { getCustomFieldsForEntity } from './src/Inhire/CustomDataManager/customDataManager.service.js';

(async () => {
    console.log("Starting test...");
    try {
        const jobsFields = await getCustomFieldsForEntity('JOBS');
        console.log(`Found ${jobsFields ? jobsFields.length : 0} fields for JOBS.`);
        if (jobsFields && jobsFields.length > 0) {
            console.log(JSON.stringify(jobsFields.slice(0, 5), null, 2));
        }
    } catch (e) { console.error("Error:", e); }
    process.exit(0);
})();
