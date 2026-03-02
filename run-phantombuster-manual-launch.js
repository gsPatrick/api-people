// run-phantombuster-manual-launch.js
import axios from 'axios';
import 'dotenv/config';

const API_BASE_URL = 'https://api.phantombuster.com/api/v2';
const AGENT_ID = process.env.PHANTOMBUSTER_LINKEDIN_AGENT_ID; // ex: 3747946547900470
const API_KEY = process.env.PHANTOMBUSTER_API_KEY; // sua API key

const launchAgentManually = async () => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/agents/launch`,
      {
        id: AGENT_ID,
        manualLaunch: true
      },
      {
        headers: {
          'x-phantombuster-key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const containerId = response.data.containerId;
    console.log(`✅ Agente iniciado manualmente! Container ID: ${containerId}`);
  } catch (err) {
    console.error('❌ Erro ao iniciar agente manualmente:', err.response?.data || err.message);
  }
};

launchAgentManually();
