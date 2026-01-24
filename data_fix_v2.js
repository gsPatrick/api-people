import db, { initializeModels } from './src/models/index.js';

async function fix() {
  try {
    console.log('--- Iniciando Data Fix v2 ---');
    await initializeModels();
    
    console.log('Buscando talento Yurissouza...');
    const talent = await db.LocalTalent.findOne({ where: { linkedinUsername: 'yurissouza' } });
    
    if (talent) {
      console.log('Talento encontrado. Status atual:', talent.status);
      const updatedData = { ...(talent.data || {}), status: 'ACTIVE' };
      
      // Forçar atualização do status e do JSON interno
      await talent.update({ 
        status: 'ACTIVE', 
        data: updatedData 
      });
      
      console.log('Status do talento atualizado COM SUCESSO para ACTIVE.');

      // Garantir que a candidatura local também esteja correta
      const app = await db.LocalApplication.findOne({ where: { talentId: talent.id } });
      if (app) {
        console.log('Candidatura encontrada. Estágio atual:', app.stage);
        await app.update({ 
          status: 'ACTIVE', 
          stage: 'applied' 
        });
        console.log('Candidatura sincronizada para "applied" lowercase.');
      }
    } else {
      console.log('Talento yurissouza não encontrado no banco.');
    }
  } catch (err) {
    console.error('ERRO NO FIX:', err);
  } finally {
    process.exit();
  }
}

fix();
