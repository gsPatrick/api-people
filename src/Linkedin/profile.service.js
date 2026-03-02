// src/Linkedin/profile.service.js

import { runLinkedInScraperFromCSV } from '../phantombuster/phantombuster.service.js'; // Importação do novo serviço
import { appendProfileToCSV } from '../utils/csvHandler.service.js'; // Importação do novo serviço CSV
import { log, error } from '../utils/logger.service.js';
import { findLeadByProfileUrl } from '../phantombuster/leads.service.js'; 

/**
 * Orquestra a extração de dados de um perfil do LinkedIn usando o fluxo CSV.
 * @param {string} profileUrlToScrape - A URL do perfil do LinkedIn a ser scrapeada.
 * @returns {Promise<object|null>} Um objeto formatado com os dados do perfil, ou null em caso de falha.
 */
export const extractProfileData = async (profileUrlToScrape) => {
  log(`--- SERVIÇO LINKEDIN: Iniciando fluxo (CSV-based) para: ${profileUrlToScrape} ---`);
  
  // 1. Adicionar o perfil ao CSV local (e criar se não existir)
  try {
    await appendProfileToCSV(profileUrlToScrape);
  } catch (err) {
    error("Falha ao adicionar perfil ao CSV. Abortando extração.", err);
    return null;
  }

  // 2. Executar o agente do PhantomBuster (ele vai ler o CSV)
  const containerId = await runLinkedInScraperFromCSV();
  if (!containerId) {
    error("A execução do agente da Phantombuster falhou ao iniciar ou concluir. Abortando a extração.");
    return null;
  }

  // 3. Tentar buscar os dados do lead com retentativas
  let leadData = null;
  const maxRetries = 5; 
  const retryDelayMs = 5000; 

  log("Agente executado. Tentando buscar o lead na Phantombuster com retries...");
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log(`Tentativa ${attempt}/${maxRetries} para encontrar o lead.`);
      leadData = await findLeadByProfileUrl(profileUrlToScrape);
      if (leadData) {
          log(`Lead encontrado na tentativa ${attempt}.`);
          break; 
      }
      if (attempt < maxRetries) {
          log(`Lead não encontrado na tentativa ${attempt}. Aguardando ${retryDelayMs / 1000}s antes de tentar novamente.`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
  }

  if (!leadData) { 
    error(`NÃO foi possível encontrar o lead correspondente na Phantombuster após ${maxRetries} tentativas.`);
    return null;
  }

  // 4. Formatar os dados do lead
  try {
    log(`DEBUG: Dados brutos do lead recebidos do Phantombuster: ${JSON.stringify(leadData, null, 2)}`);

    const linkedinProfileSlug = leadData.linkedinProfileSlug ? leadData.linkedinProfileSlug.replace(/\/+$/, '') : null;

    const formattedProfile = {
      // --- Campos Padrão ---
      profileUrl: `https://www.linkedin.com/in/${linkedinProfileSlug}/`,
      name: `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim(),
      headline: leadData.linkedinHeadline || null,
      location: leadData.location || null,
      company: leadData.companyName || null,
      jobTitle: leadData.linkedinJobTitle || null,
      linkedinUsername: linkedinProfileSlug,

      // --- Dados para Campos Personalizados ---
      followersCount: leadData.linkedinFollowersCount || 0,
      profileDescription: leadData.linkedinDescription || null,
      companyWebsite: leadData.company?.properties?.websiteUrl || null,
      isHiring: leadData.linkedinIsHiringBadge || false,
      isOpenToWork: leadData.linkedinIsOpenToWorkBadge || false,
      previousJobTitle: leadData.linkedinPreviousJobTitle || null,
      previousCompany: leadData.previousCompanyName || null,
      previousJobDateRange: leadData.linkedinPreviousJobDateRange || null,
      schoolName: leadData.linkedinSchoolName || null,
      schoolDateRange: leadData.linkedinSchoolDateRange || null,
      previousSchoolName: leadData.linkedinPreviousSchoolName || null,
      previousSchoolDegree: leadData.linkedinPreviousSchoolDegree || null,

      // --- Dados Estruturados (se necessário no futuro) ---
      experience: leadData.linkedinJobTitle ? [{
          title: leadData.linkedinJobTitle,
          company: leadData.companyName,
          dateRange: leadData.linkedinJobDateRange || null,
          description: leadData.linkedinJobDescription || null
      }] : [],
      
      education: leadData.linkedinSchoolName ? [{
          institution: leadData.linkedinSchoolName,
          degree: leadData.linkedinSchoolDegree || null,
          duration: leadData.linkedinSchoolDateRange || null
      }] : [],
      
      skills: leadData.linkedinSkillsLabel ? leadData.linkedinSkillsLabel.split(',').map(s => s.trim()) : [],
    };

    log("Dados do lead obtidos e formatados com sucesso.");
    return formattedProfile;
  } catch (err) {
    error("Ocorreu um erro durante o mapeamento dos dados do lead:", err.message);
    return null;
  }
};