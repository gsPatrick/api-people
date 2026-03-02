import dotenv from 'dotenv';
dotenv.config();
import { fetchAvailableAreas } from './src/Core/Job-Flow/jobOrchestrator.js';

fetchAvailableAreas().then(areas => {
    console.log("AREAS:", areas);
}).catch(console.error);
