// ARQUIVO FINAL E CORRIGIDO: src/Core/Candidate-Flow/customFieldMapping.js

import { getGenderByName } from '../../utils/gender.service.js';
import { log } from '../../utils/logger.service.js';

// ===================================================================
// FUNÇÕES AUXILIARES DE TRANSFORMAÇÃO (MAIS ROBUSTAS)
// ===================================================================

function extractStateFromLocation(locationString, fieldOptions) {
    if (!locationString || !Array.isArray(fieldOptions)) return null;
    const parts = locationString.split(',').map(p => p.trim());
    if (parts.length >= 2) {
        const stateNameOrAbbreviation = parts[1];
        // Procura pela opção que corresponde ao nome do estado ou sua abreviação
        return fieldOptions.find(o => o.label === stateNameOrAbbreviation || o.value === stateNameOrAbbreviation);
    }
    return null;
}

function mapJobTitleToLevel(jobTitle, fieldOptions) {
    if (!jobTitle || !Array.isArray(fieldOptions)) return null;
    const title = jobTitle.toLowerCase();
    
    // Procura por palavras-chave nos 'labels' ou 'values' das opções
    const findOption = (keywords) => fieldOptions.find(o => keywords.some(kw => o.label.toLowerCase().includes(kw) || o.value.toLowerCase().includes(kw)));

    if (title.includes('ceo') || title.includes('cto') || title.includes('c-level') || title.includes('chief') || title.includes('founder') || title.includes('fundador')) return findOption(['c-level']);
    if (title.includes('director') || title.includes('diretor') || title.includes('head of')) return findOption(['diretor', 'director']);
    if (title.includes('manager') || title.includes('gerente') || title.includes('coordenador')) return findOption(['gerente', 'manager']);
    if (title.includes('specialist') || title.includes('especialista') || title.includes('sr.') || title.includes('sênior')) return findOption(['especialista', 'specialist', 'senior', 'sênior']);
    if (title.includes('analyst') || title.includes('analista')) return findOption(['analista', 'analyst']);
    if (title.includes('intern') || title.includes('estagiário')) return findOption(['estagiário', 'intern']);
    
    return null;
}

function formatCareerHistory(experienceArray) {
    if (!Array.isArray(experienceArray) || experienceArray.length === 0) return null;
    return experienceArray.map(exp => `${exp.title} na ${exp.companyName} (${exp.dateRange || 'N/D'})`).join('\n');
}

function formatEducationHistory(educationArray) {
    if (!Array.isArray(educationArray) || educationArray.length === 0) return null;
    return educationArray.map(edu => `${edu.degree || 'Formação'} em ${edu.schoolName} (${edu.dateRange || 'N/D'})`).join('; ');
}

// ===================================================================
// MAPEADOR PRINCIPAL (VERSÃO DE ALTA PRECISÃO)
// ===================================================================

export const mapProfileToInhirePayloads = async (scrapedData, customFieldDefinitions) => {
    log('--- INICIANDO MAPEAMENTO ESTÁTICO DE ALTA PRECISÃO ---');
    
    const talentPayload = {
        name: scrapedData.name,
        headline: scrapedData.headline,
        linkedinUsername: scrapedData.linkedinUsername,
        location: scrapedData.location,
        company: scrapedData.experience?.[0]?.companyName || null,
    };
    log(`[MAPEAMENTO] Payload Geral: ${JSON.stringify(talentPayload)}`);

    const customFieldsPayload = [];

    for (const field of customFieldDefinitions) {
        let value = null;
        const fieldName = field.name.toLowerCase();
        const firstName = scrapedData.name ? scrapedData.name.split(' ')[0] : null;
        log(`[MAPEAMENTO] Processando campo: '${field.name}' (tipo: ${field.type})`);

        try {
            if (fieldName.includes('empresa atual')) {
                value = talentPayload.company;
            } else if (fieldName.includes('sexo')) {
                const genderOptions = field.answerOptions || [];
                if (firstName) {
                    const gender = await getGenderByName(firstName);
                    if (gender === 'male') value = genderOptions.find(o => o.value?.toLowerCase().includes('masculino'));
                    if (gender === 'female') value = genderOptions.find(o => o.value?.toLowerCase().includes('feminino'));
                }
            } else if (fieldName.includes('estado (uf)') || (fieldName.includes('estado civil'))) {
                // CORREÇÃO: Passa as opções para a função de busca
                if (field.type === 'select') {
                    value = extractStateFromLocation(scrapedData.location, field.answerOptions);
                } else {
                    const parts = scrapedData.location?.split(',').map(p => p.trim());
                    if (parts?.length >= 2) value = parts[1];
                }
            } else if (fieldName.includes('cargo')) {
                // CORREÇÃO: Pega o título da primeira experiência, que é a mais recente
                value = scrapedData.experience?.[0]?.title || null;
            } else if (fieldName.includes('nível hierárquico')) {
                const currentJobTitle = scrapedData.experience?.[0]?.title || null;
                // CORREÇÃO: Passa as opções para a função de busca
                value = mapJobTitleToLevel(currentJobTitle, field.answerOptions);
            } else if (fieldName.includes('carreira')) {
                value = formatCareerHistory(scrapedData.experience);
            } else if (fieldName.includes('universidade de graduação') || fieldName.includes('formação acadêmica')) {
                value = scrapedData.education?.[0]?.schoolName || null;
            } else if (fieldName.includes('complemento de formação')) {
                value = formatEducationHistory(scrapedData.education);
            } else if (fieldName.includes('competências') || fieldName.includes('skills')) {
                if (Array.isArray(scrapedData.skills) && scrapedData.skills.length > 0) {
                    value = scrapedData.skills.map(skill => skill.name).join(', ');
                }
            } else if (fieldName.includes('idioma')) {
                if (Array.isArray(scrapedData.languages) && scrapedData.languages.length > 0) {
                    value = scrapedData.languages.map(lang => lang.language).join(', ');
                }
            }
        } catch(e) {
            log(`[MAPEAMENTO] Erro ao processar o campo '${field.name}': ${e.message}`);
        }

        log(`[MAPEAMENTO] Valor encontrado: ${JSON.stringify(value)}`);

        if (value !== null && value !== undefined && value !== '') {
            customFieldsPayload.push({
                id: field.id,
                name: field.name,
                type: field.type,
                value: value
            });
        }
    }

    log('--- MAPEAMENTO ESTÁTICO CONCLUÍDO ---');
    return { talentPayload, customFieldsPayload };
};