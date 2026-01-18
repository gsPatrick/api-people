import { Router } from 'express';

// Middlewares de segurança
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import multer from 'multer'; // 1. Importe o multer

// Roteadores específicos
import { parseProfileWithAI } from '../controllers/aiParser.controller.js'; // 1. IMPORTE O NOVO CONTROLLER DE IA
import adminRoutes from './adminRoutes.js';
import scorecardRoutes from './scorecard.routes.js'; // <-- 1. IMPORTAR O ROTEADOR
import matchRoutes from './match.routes.js'; // <-- IMPORTAR O ROTEADOR DE MATCH TAMBÉM
import aiMemoryRoutes from './aimemory.routes.js';
import authenticationRouter from './authRoutes.js';
import { extractProfileFromPdf } from '../controllers/pdf.controller.js'; // 2. Importe o novo controller
import { fetchLinkedInProfilePdf, checkLinkedInCookieStatus } from '../controllers/linkedinPdf.controller.js'; // LinkedIn PDF Scraping
const upload = multer({ storage: multer.memoryStorage() }); // 3. Configure o multer para usar a memória

// Orquestradores para as rotas da aplicação
import { validateProfile, handleConfirmCreation, handleEditTalent, handleDeleteTalent } from '../Core/Candidate-Flow/candidateOrchestrator.js';
import {
    fetchAllTalents,
    fetchCandidatesForJob,
    handleUpdateApplicationStatus,
    fetchTalentDetails,
    fetchCustomFields,
    fetchCandidateDetailsForJobContext,
    handleUpdateCustomFieldsForApplication
} from '../Core/management-flow/managementOrchestrator.js';
import {
    fetchScorecardDataForApplication,
    handleScorecardSubmission,
    handleCreateScorecardAndKit,
    fetchInterviewKitDetails,
    fetchAvailableKitsForJob,
    handleSaveKitWeights
} from '../Core/Evaluation-Flow/evaluationOrchestrator.js';
import { syncProfileFromLinkedIn, evaluateSkillFromCache, getAIEvaluationCacheStatus, evaluateScorecardFromCache } from '../Core/AI-Flow/aiOrchestrator.js';
import { handleJobSelection, handleRemoveApplication, fetchPaginatedJobs } from '../Core/Job-Flow/jobOrchestrator.js';
import { handleFullProfileUpdate } from '../Core/Candidate-Flow/updateOrchestrator.js';

const router = Router();

// ==========================================================
// 1. ROTAS PÚBLICAS (NÃO EXIGEM TOKEN)
// ==========================================================
router.use('/auth', authenticationRouter);

// ==========================================================
// 2. MIDDLEWARE DE AUTENTICAÇÃO GLOBAL
// ==========================================================
router.use(authenticateToken);

// ==========================================================
// 3. ROTAS DE ADMINISTRAÇÃO (EXIGEM TOKEN + ROLE DE ADMIN)
// ==========================================================
router.use('/admin', isAdmin, adminRoutes);

// ==========================================================
// ==========================================================
// 4. ROTAS DA APLICAÇÃO (AGORA PROTEGIDAS POR TOKEN)
// ==========================================================
router.use('/scorecards', scorecardRoutes); // <-- 2. REGISTRAR O ROTEADOR AQUI
router.use('/match', matchRoutes);         // <-- 2. REGISTRAR O ROTEADOR DE MATCH AQUI
router.use('/ai-memory', aiMemoryRoutes);

// ==========================================================
// 3. ROTAS DE ADMINISTRAÇÃO (EXIGEM TOKEN + ROLE DE ADMIN)
// ==========================================================
router.use('/admin', isAdmin, adminRoutes);
router.post('/ai/evaluate-scorecard', async (req, res) => {
    // ... (restante do código permanece igual)
    const { talentId, jobDetails, scorecard, weights } = req.body;
    if (!talentId || !jobDetails || !scorecard || !weights) {
        return res.status(400).json({ error: 'Dados de talento, vaga, scorecard e pesos são obrigatórios.' });
    }
    try {
        const result = await evaluateScorecardFromCache(talentId, jobDetails, scorecard, weights);
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ error: `Falha ao processar avaliação com IA: ${err.message}` });
    }
});

router.get('/ai/cache-status/:talentId', async (req, res) => {
    const { talentId } = req.params;
    try {
        const result = await getAIEvaluationCacheStatus(talentId);
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ error: `Falha ao verificar status do cache: ${err.message}` });
    }
});

router.post('/update-full-profile', async (req, res) => {
    const { talentId, applicationId, scrapedData } = req.body;
    if (!talentId || !applicationId || !scrapedData) {
        return res.status(400).json({ error: 'Os campos talentId, applicationId e scrapedData são obrigatórios.' });
    }
    try {
        const result = await handleFullProfileUpdate(talentId, applicationId, scrapedData);
        if (result.success) {
            res.status(200).json(result);
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        res.status(500).json({ error: `Falha ao orquestrar a atualização do perfil: ${err.message}` });
    }
});


router.post('/ai/sync-profile', async (req, res) => {
    const { talentId } = req.body;
    if (!talentId) {
        return res.status(400).json({ error: 'ID do talento é obrigatório.' });
    }
    try {
        const result = await syncProfileFromLinkedIn(talentId);
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ error: `Falha ao sincronizar perfil: ${err.message}` });
    }
});

// ... (o restante do arquivo apiRoutes.js permanece exatamente igual)
// --- ROTAS DE VAGAS E CANDIDATURAS ---
router.get('/jobs', async (req, res) => {
    const { page, limit, status } = req.query;
    const result = await fetchPaginatedJobs(page, limit, status);
    if (result.success) res.status(200).json(result.data);
    else res.status(500).json({ error: result.error });
});

router.post('/apply', async (req, res) => {
    const { jobId, talentId } = req.body;
    if (!jobId || !talentId) return res.status(400).json({ error: 'Os campos "jobId" e "talentId" são obrigatórios.' });
    const result = await handleJobSelection(jobId, talentId);
    if (result.success) res.status(201).json(result.application);
    else res.status(500).json({ error: result.error });
});

router.delete('/applications/:id', async (req, res) => {
    const { id } = req.params;
    const result = await handleRemoveApplication(id);
    if (result.success) res.status(200).json({ message: 'Candidatura removida com sucesso.' });
    else res.status(500).json({ error: result.error });
});

// --- ROTAS DE CANDIDATO E PERFIL ---
router.post('/validate-profile', async (req, res) => {
    const { profileUrl } = req.body;
    if (!profileUrl) return res.status(400).json({ error: 'O campo "profileUrl" é obrigatório.' });
    const result = await validateProfile(profileUrl);
    if (result.success) res.status(200).json(result);
    else res.status(500).json({ error: result.error });
});

router.post('/create-talent', async (req, res) => {
    const talentData = req.body;
    const result = await handleConfirmCreation(talentData, talentData.jobId);
    if (result.success) res.status(201).json(result.talent);
    else res.status(500).json({ error: result.error });
});

// --- ROTAS DE GERENCIAMENTO (TALENTOS) ---
router.get('/talents', async (req, res) => {
    const { page, limit, searchTerm } = req.query;
    const result = await fetchAllTalents(page, limit, { searchTerm });
    if (result.success) {
        res.status(200).json(result);
    } else {
        res.status(500).json({ error: result.error });
    }
});

router.get('/talents/:id', async (req, res) => {
    const { id } = req.params;
    const result = await fetchTalentDetails(id);
    if (result.success) res.status(200).json(result);
    else res.status(404).json({ error: result.error });
});

router.patch('/talents/:id', async (req, res) => {
    const { id } = req.params;
    const result = await handleEditTalent(id, req.body);
    if (result.success) res.status(200).json({ message: 'Talento atualizado com sucesso.' });
    else res.status(500).json({ error: result.error });
});

router.delete('/talents/:id', async (req, res) => {
    const { id } = req.params;
    const result = await handleDeleteTalent(id);
    if (result.success) res.status(200).json({ message: 'Talento deletado com sucesso.' });
    else res.status(500).json({ error: result.error });
});

// --- ROTAS DE GERENCIAMENTO (VAGAS E CANDIDATURAS) ---
router.get('/jobs/:jobId/candidates', async (req, res) => {
    const { jobId } = req.params;
    const result = await fetchCandidatesForJob(jobId);
    if (result.success) res.status(200).json(result);
    else res.status(500).json({ error: result.error });
});

router.get('/candidate-details/job/:jobId/talent/:talentId', async (req, res) => {
    const { jobId, talentId } = req.params;
    const result = await fetchCandidateDetailsForJobContext(jobId, talentId);
    if (result.success) res.status(200).json(result);
    else res.status(500).json({ error: result.error });
});

router.patch('/applications/:applicationId/status', async (req, res) => {
    const { applicationId } = req.params;
    const { stageId } = req.body;
    if (!stageId) return res.status(400).json({ error: 'O campo "stageId" é obrigatório.' });
    const result = await handleUpdateApplicationStatus(applicationId, stageId);
    if (result.success) res.status(200).json(result.application);
    else res.status(500).json({ error: result.error });
});

router.patch('/applications/:applicationId/custom-fields', async (req, res) => {
    const { applicationId } = req.params;
    const { customFields } = req.body;
    if (!Array.isArray(customFields)) {
        return res.status(400).json({ error: 'O campo "customFields" deve ser um array.' });
    }
    const result = await handleUpdateCustomFieldsForApplication(applicationId, customFields);
    if (result.success) res.status(200).json(result.application);
    else res.status(500).json({ error: result.error });
});

// --- ROTAS DE SCORECARD ---
router.get('/scorecard-data/application/:applicationId/job/:jobId', async (req, res) => {
    const { applicationId, jobId } = req.params;
    const result = await fetchScorecardDataForApplication(applicationId, jobId);
    if (result.success) res.status(200).json(result);
    else res.status(500).json({ error: result.error });
});

router.get('/jobs/:jobId/interview-kits', async (req, res) => {
    const { jobId } = req.params;
    const result = await fetchAvailableKitsForJob(jobId);
    if (result.success) res.status(200).json(result.kits);
    else res.status(500).json({ error: result.error });
});

router.post('/submit-scorecard', async (req, res) => {
    const result = await handleScorecardSubmission(req.body.applicationId, req.body.scorecardId, req.body.evaluationData);
    if (result.success) res.status(200).json(result.submission);
    else res.status(500).json({ error: result.error });
});

router.post('/create-scorecard-and-kit', async (req, res) => {
    const result = await handleCreateScorecardAndKit(req.body);
    if (result.success) res.status(201).json(result);
    else res.status(500).json({ error: result.error });
});

// --- ROTAS DE GERENCIAMENTO (CAMPOS PERSONALIZADOS E KITS) ---
router.get('/custom-fields/:entity', async (req, res) => {
    const { entity } = req.params;
    if (!['TALENTS', 'JOB_TALENTS'].includes(entity.toUpperCase())) {
        return res.status(400).json({ error: 'Entidade inválida. Use "TALENTS" ou "JOB_TALENTS".' });
    }
    const result = await fetchCustomFields(entity.toUpperCase());
    if (result.success) res.status(200).json(result.fields);
    else res.status(500).json({ error: result.error });
});

router.get('/interview-kit/:kitId', async (req, res) => {
    const { kitId } = req.params;
    const result = await fetchInterviewKitDetails(kitId);
    if (result.success) {
        res.status(200).json(result);
    } else {
        res.status(404).json({ success: false, error: result.error });
    }
});

router.post('/interview-kit/:kitId/weights', async (req, res) => {
    const { kitId } = req.params;
    const { weights } = req.body;
    if (!weights) {
        return res.status(400).json({ error: 'O campo "weights" é obrigatório.' });
    }
    const result = await handleSaveKitWeights(kitId, weights);
    if (result.success) res.status(200).json({ message: 'Pesos salvos com sucesso.' });
    else res.status(500).json({ error: result.error });
});

router.post('/extract-from-pdf', upload.single('file'), extractProfileFromPdf); // 4. Adicione a rota

// --- ROTAS DE LINKEDIN PDF SCRAPING ---
// Busca dados do perfil do LinkedIn via PDF usando cookies de sessão
router.post('/linkedin/fetch-profile-pdf', fetchLinkedInProfilePdf);

// Verifica se o cookie do LinkedIn ainda é válido
router.post('/linkedin/check-cookie-status', checkLinkedInCookieStatus);

// ==========================================================
// 5. ROTAS DE UTILIDADES (EX: PARSING)
// ==========================================================
router.post('/parse-profile-ai', parseProfileWithAI); // 2. ADICIONE A NOVA ROTA DE IA



export default router;