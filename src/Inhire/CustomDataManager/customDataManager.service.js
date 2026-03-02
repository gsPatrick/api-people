// src/Inhire/CustomDataManager/customDataManager.service.js

import apiClient from '../inhireCore.js';
import { log, error } from '../../utils/logger.service.js';

const API_BASE_URL = 'https://api.inhire.app';

/**
 * Busca a definição de todos os campos personalizados para uma entidade específica.
 * Endpoint: GET /custom-data-manager/custom-fields/entity/:entity
 * @param {string} entity - A entidade ("TALENTS" ou "JOB_TALENTS").
 * @returns {Promise<Array<object>|null>} Uma lista de definições de campos personalizados.
 */
export const getCustomFieldsForEntity = async (entity) => {
    log(`--- SERVIÇO: Buscando campos personalizados para a entidade: ${entity} ---`);
    try {
        // CORREÇÃO: O caminho da URL foi corrigido para corresponder à documentação,
        // removendo o "/custom-fields" duplicado.
        const response = await apiClient.get(`${API_BASE_URL}/custom-data-manager/custom-fields/entity/${entity}`);
        return response.data || [];
    } catch (err) {
        error(`Erro ao buscar campos personalizados para ${entity}:`, err.response?.data || err.message);
        return null;
    }
};