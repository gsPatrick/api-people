// src/utils/gender.service.js

import axios from 'axios';
import { log, error } from './logger.service.js';

/**
 * Consulta a API Genderize.io para inferir o gênero a partir de um primeiro nome.
 * @param {string} firstName - O primeiro nome a ser verificado.
 * @returns {Promise<string|null>} Retorna 'male', 'female' ou null em caso de falha ou incerteza.
 */
export const getGenderByName = async (firstName) => {
    if (!firstName) {
        log("GENDER API: Nome não fornecido, impossível inferir gênero.");
        return null;
    }

    // A API funciona melhor sem caracteres especiais ou espaços.
    const sanitizedName = firstName.split(' ')[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    try {
        log(`GENDER API: Consultando gênero para o nome "${sanitizedName}"`);
        const response = await axios.get(`https://api.genderize.io/?name=${sanitizedName}`);
        
        const { gender, probability } = response.data;

        // Consideramos a resposta válida apenas se a probabilidade for alta
        if (gender && probability > 0.75) {
            log(`GENDER API: Gênero inferido como "${gender}" com probabilidade de ${probability}.`);
            return gender; // 'male' or 'female'
        } else {
            log(`GENDER API: Gênero não pôde ser inferido com alta probabilidade para "${sanitizedName}".`);
            return null;
        }

    } catch (err) {
        error(`GENDER API: Erro ao consultar a API para o nome "${sanitizedName}"`, err.message);
        return null; // Retorna null em caso de erro na API
    }
};