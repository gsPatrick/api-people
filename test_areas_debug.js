import dotenv from 'dotenv';
dotenv.config();
import { fetchAvailableAreas } from './src/Core/Job-Flow/jobOrchestrator.js';

(async () => {
    try {
        console.log("Calling fetchAvailableAreas...");
        const res = await fetchAvailableAreas();
        console.log("Result:", JSON.stringify(res, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
})();
