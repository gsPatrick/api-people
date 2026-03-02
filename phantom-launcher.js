import axios from "axios";
import fs from "fs";
import path from "path";

// 🗂️ Caminho do log
const LOG_FILE = path.resolve("phantom-log.txt");

// 📝 Logger robusto
function log(message) {
  try {
    const timestamp = new Date().toISOString();
    const text =
      `[${timestamp}] ` +
      (typeof message === "object"
        ? JSON.stringify(message, null, 2)
        : String(message));
    console.log(text);
    fs.appendFileSync(LOG_FILE, text + "\n");
  } catch (err) {
    console.error("⚠️ Erro ao salvar no log:", err);
    console.error("Mensagem original:", message);
  }
}

// 🔐 Credenciais fixas (cuidado ao publicar)
const API_BASE = "https://api.phantombuster.com/api/v2";
const PHANTOM_API_KEY = "11RBm8MB7y1q15yaPhMl1FuW2c3lyaxFgwRjCd9rH4o";
const LI_AT_COOKIE =
  "AQEDAUDXaoMA7i-PAAABmFnkQG0AAAGYffDEbU0AGLT2VW_37sUyJpsvlU0etPiy45zvB728rfvGlF3PbLNFEoUMprRrJ6pUdLJ4IFTeSpf18WREV6UHXm9Gb3TyKheQIFXv9xWc2J3T0j0rkt9hV7hS";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
const PHANTOM_ID = "3747946547900470";
const IDENTITY_ID = "6359874665173747";
const PROFILE_URL = "https://www.linkedin.com/in/patrick-siqueira-2833a4264/";

const headers = {
  "x-phantombuster-key": PHANTOM_API_KEY,
  "Content-Type": "application/json",
};

// 🚀 Lança o Agent
async function launchAgent() {
  try {
    const payload = {
      id: PHANTOM_ID,
      argument: {
        profileUrls: [PROFILE_URL],
        identities: [
          {
            identityId: IDENTITY_ID,
            sessionCookie: LI_AT_COOKIE,
            userAgent: USER_AGENT,
          },
        ],
        emailChooser: "none",
      },
    };

    log("🚀 Lançando o agent...");

    const launchResponse = await axios.post(
      `${API_BASE}/agents/launch`,
      payload,
      { headers }
    );

    const containerId = launchResponse.data.containerId;
    const launchId = launchResponse.data.id; // ESTE É O CORRETO PARA fetch!

    if (!launchId) throw new Error("⚠️ launchId não recebido.");
    log(`✅ Agent lançado. containerId: ${containerId}`);
    log(`🎯 launchId: ${launchId}`);

    return launchId;
  } catch (error) {
    log("❌ Erro ao lançar o agent:");
    log(error.response?.data || error.stack || error.message || error);
    process.exit(1);
  }
}


// ⏳ Espera o container gerar um launchId
async function waitForLaunchId(containerId) {
  log("⏳ Aguardando o agent iniciar execução real...");
  while (true) {
    const res = await axios.get(`${API_BASE}/containers/${containerId}`, {
      headers,
    });

    const container = res.data.data;
    log(`📦 Status do container: ${container.status}`);

    if (container.status === "launched" && container.id) {
      log(`🎯 launchId obtido: ${container.id}`);
      return container.id;
    }

    if (container.status === "failed") {
      throw new Error("💥 A execução falhou.");
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
}

// 📥 Busca o resultado com o launchId
async function fetchLaunchResult(launchId) {
  try {
    log(`🔎 Buscando resultado com launchId: ${launchId}`);
    while (true) {
      const res = await axios.get(`${API_BASE}/agents/fetch/${launchId}`, {
        headers,
      });

      const status = res.data.data?.status;
      log(`📥 Status atual: ${status}`);

      if (status === "done") {
        const result = JSON.stringify(res.data.data.result, null, 2);
        log("🎉 Execução finalizada! Resultado:");
        log(result);
        break;
      } else {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } catch (error) {
    log("❌ Erro ao buscar resultado:");
    log(error.response?.data || error.stack || error.message || error);
    process.exit(1);
  }
}

// 🚦 Main runner
(async () => {
  fs.writeFileSync(LOG_FILE, "📘 Início do log PhantomBuster\n\n");
  const containerId = await launchAgent();
  const launchId = await waitForLaunchId(containerId);
  await fetchLaunchResult(launchId);
})();

// 🧯 Captura erros não tratados
process.on("unhandledRejection", (reason) => {
  log("🛑 Unhandled Rejection:");
  log(reason);
});
process.on("uncaughtException", (err) => {
  log("🛑 Uncaught Exception:");
  log(err);
});
