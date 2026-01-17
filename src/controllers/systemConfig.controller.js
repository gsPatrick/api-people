import db from '../models/index.js';
import { log, error as logError } from '../utils/logger.service.js';

const SystemConfig = db.SystemConfig;

export const getConfig = async (req, res) => {
    try {
        const { key } = req.params;
        const config = await SystemConfig.findByPk(key);

        if (!config) {
            return res.status(404).json({ error: 'Config not found' });
        }

        // Se for chave de API, ofusca para segurança, a menos que seja solicitado explicitamente (TODO: adicionar check de admin)
        let value = config.value;
        if (key === 'OPENAI_API_KEY' && value) {
            value = value.substring(0, 10) + '...' + value.substring(value.length - 4);
        }

        res.json({ key: config.key, value, updatedAt: config.updatedAt });
    } catch (err) {
        logError(`Erro ao buscar config ${req.params.key}:`, err.message);
        res.status(500).json({ error: err.message });
    }
};

export const setConfig = async (req, res) => {
    try {
        const { key, value } = req.body;

        if (!key) {
            return res.status(400).json({ error: 'Key is required' });
        }

        const [config, created] = await SystemConfig.upsert({
            key,
            value,
            description: 'Updated via Admin API'
        });

        log(`Configuração ${key} atualizada via API.`);
        res.json({ success: true, key, message: 'Configuração salva com sucesso.' });
    } catch (err) {
        logError(`Erro ao salvar config:`, err.message);
        res.status(500).json({ error: err.message });
    }
};
