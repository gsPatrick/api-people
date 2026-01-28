
import db from './src/models/index.js';

async function checkTalent() {
    try {
        const talent = await db.LocalTalent.findOne({
            where: { linkedinUsername: 'leonardo-' }
        });
        if (talent) {
            console.log('Talent found:', JSON.stringify(talent, null, 2));
        } else {
            console.log('Talent not found');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error checking talent:', error);
        process.exit(1);
    }
}

checkTalent();
