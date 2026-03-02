import axios from 'axios';

// --- DADOS HARDCODED ---
const API_KEY = "11RBm8MB7y1q15yaPhMl1FuW2c3lyaxFgwRjCd9rH4o";
const PHANTOM_ID = "3747946547900470";
// -----------------------

const API_BASE_URL = 'https://api.phantombuster.com/api/v2';

const headers = {
  'X-Phantombuster-Key-1': API_KEY,
};

async function inspectPhantom() {
  console.log(`🔍 Inspecionando a configuração do Phantom ID: ${PHANTOM_ID}...`);

  try {
    const response = await axios.get(`${API_BASE_URL}/agents/fetch?id=${PHANTOM_ID}`, { headers });
    const agentConfig = response.data;
    
    console.log(`\n✅ Configuração de "${agentConfig.name}" encontrada:`);
    console.log("--------------------------------------------------");

    const identities = agentConfig.argument?.identities;
    
    if (identities && Array.isArray(identities) && identities.length > 0) {
      const identityId = identities[0].identityId;
      console.log(`\n🎉 ENCONTRADO! O seu 'identityId' é: ${identityId}`);
      console.log("\nCopie este valor e cole no código do `phantombuster.service.js`.");
    } else {
      console.log("\n⚠️ AVISO: Não foi encontrado um 'identityId' na configuração deste Phantom.");
      console.log("Verifique se você já conectou sua conta LinkedIn a este Phantom no painel do PhantomBuster.");
    }

  } catch (error) {
    console.error("❌ Falha ao inspecionar o Phantom:", error.response?.data?.error || error.message);
  }
}

inspectPhantom();