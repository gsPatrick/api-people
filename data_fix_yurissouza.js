import db from './src/models/index.js';

async function fix() {
  try {
    console.log('--- Iniciando Data Fix para Yurissouza ---');
    const talent = await db.LocalTalent.findOne({ where: { linkedinUsername: 'yurissouza' } });
    if (talent) {
      console.log('Talento encontrado. Status atual:', talent.status);
      const updatedData = { ...(talent.data || {}), status: 'ACTIVE' };
      await talent.update({ status: 'ACTIVE', data: updatedData });
      console.log('Status do talento atualizado para ACTIVE.');

      // O usuário mencionou que na vaga continua zerado, mas a API retorna.
      // Vamos garantir que a LocalApplication também esteja com status ACTIVE e stage lowercase 'applied'
      const app = await db.LocalApplication.findOne({ where: { talentId: talent.id } });
      if (app) {
        console.log('Candidatura encontrada. Estágio atual:', app.stage);
        await app.update({ status: 'ACTIVE', stage: 'applied' });
        console.log('Candidatura atualizada.');
      }
    } else {
      console.log('Talento yurissouza não encontrado.');
    }
  } catch (err) {
    console.error('Erro no fix:', err);
  } finally {
    process.exit();
  }
}

fix();
