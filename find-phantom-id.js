import axios from 'axios';
import 'dotenv/config'; // Para carregar o .env


async function listAllPhantoms(apiKey) {
  try {
    const response = await axios.get(
      "https://api.phantombuster.com/api/v2/agents/fetch-all",
      {
        headers: {
          "X-Phantombuster-Key-1": apiKey,
          "Accept": "application/json"
        }
      }
    );
    return response.data;
  } catch (err) {
    console.error("Erro ao buscar agents:", err.response?.data || err.message);
    throw err;
  }
}

// Exemplo de uso
(async () => {
  const apiKey = process.env.PHANTOM_API_KEY || "11RBm8MB7y1q15yaPhMl1FuW2c3lyaxFgwRjCd9rH4o";
  const agents = await listAllPhantoms(apiKey);
  console.log("Agents encontrados:", agents.length);
  agents.forEach(agent => {
    console.log(`• ID: ${agent.id}, Name: ${agent.name}, OutputTypes: ${agent.outputTypes?.join(", ")}`);
  });
})();
