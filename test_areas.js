import dotenv from 'dotenv';
dotenv.config();
import { fetchAvailableAreas } from './src/Core/Job-Flow/jobOrchestrator.js';

(async () => {
    console.log("Starting test...");
    try {
        const areas = await fetchAvailableAreas();
        console.log(`Found ${areas ? areas.length : 0} areas.`);
        if (areas && areas.length > 0) {
            console.log(JSON.stringify(areas.slice(0, 5), null, 2));
        }
    } catch (e) { console.error("Error:", e); }
    process.exit(0);
})();
