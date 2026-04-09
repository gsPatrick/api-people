// ARQUIVO COMPLETO: server.js (Fluxo de Inicialização Sequencial e Seguro)

import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import _ from 'lodash';
import express from 'express';
import { configureLogger, log, error as logError } from './src/utils/logger.service.js';
import { memoryStorageAdapter } from './src/Platform/Storage/memoryStorage.adapter.js';
import { initializeSessionService } from './src/Core/session.service.js';
import { initializeAuthStorage } from './src/Inhire/Auth/authStorage.service.js';
import { performLogin } from './src/Core/Auth-Flow/authOrchestrator.js';
import { sequelize, initializeModels } from './src/models/index.js';
import { syncEntityCache } from './src/utils/sync.service.js';
import { fetchAllJobsWithDetails } from './src/Core/Job-Flow/jobOrchestrator.js';
import { fetchAllTalentsForSync, fetchCandidatesForJob } from './src/Core/management-flow/managementOrchestrator.js';
import { getFromCache } from './src/utils/cache.service.js';
import { createUser, findUserByEmail } from './src/Core/User-Flow/userService.js';
import apiRoutes from './src/routes/apiRoutes.js';
import cors from 'cors';
// import { initializeVectorDB } from './src/services/vector.service.js'; // DESATIVADO: Full Context Mode
import * as scorecardService from './src/services/scorecard.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4000;
const JOBS_CACHE_KEY = 'all_jobs_with_details';
const TALENTS_CACHE_KEY = 'all_talents';

export const initializeDatabase = async () => {
    log('--- INICIALIZAÇÃO DO BANCO DE DADOS (PostgreSQL + Sequelize) ---');
    try {
        await sequelize.authenticate();
        // log('✅ Conexão com o PostgreSQL estabelecida com sucesso.');

        log('Carregando models dinamicamente...');
        await initializeModels(); // <-- CHAMADA EXPLÍCITA
        // log('✅ Models carregados.');

        log('Sincronizando models com o banco de dados (force: false)...');
        await sequelize.sync({ force: false });
        // log('✅ Models sincronizados com sucesso (tabelas recriadas/atualizadas).');
    } catch (err) {
        logError('Falha crítica ao inicializar o banco de dados PostgreSQL:', { message: err.message, stack: err.stack });
        process.exit(1);
    }
};

// ... Rest of the file constant logic ...

const syncJobs = () => syncEntityCache(JOBS_CACHE_KEY, fetchAllJobsWithDetails);
const syncTalents = () => syncEntityCache(TALENTS_CACHE_KEY, fetchAllTalentsForSync);

const prefetchAllCandidates = async () => {
    // log('--- PREFETCH WORKER: Iniciando pré-carregamento de candidatos InHire (em segundo plano) ---');
    const allJobs = getFromCache(JOBS_CACHE_KEY);
    if (!allJobs || allJobs.length === 0) {
        logError('PREFETCH WORKER: Não há vagas no cache para buscar candidatos. Pulando.');
        return;
    }
    // log(`PREFETCH WORKER: Encontradas ${allJobs.length} vagas. Buscando candidatos...`);
    const concurrencyLimit = 5;
    const batches = _.chunk(allJobs, concurrencyLimit);
    for (const batch of batches) {
        await Promise.all(batch.map(job => fetchCandidatesForJob(job.id)));
        // log(`PREFETCH WORKER: Lote de ${batch.length} vagas processado.`);
    }
    // log('--- PREFETCH WORKER: Pré-carregamento de candidatos concluído. ---');
};

const seedAdminUser = async () => {
    const adminEmail = 'admin@admin.com';
    const existingAdmin = await findUserByEmail(adminEmail);
    if (!existingAdmin) {
        log('Nenhum usuário admin encontrado. Criando um novo...');
        try {
            await createUser({
                name: 'Administrador',
                email: adminEmail,
                password: 'senhasuperdificil',
                role: 'admin'
            });
            // log('✅ Usuário admin criado com sucesso.');
        } catch (err) {
            logError('Falha crítica ao criar o usuário admin:', err.message);
            process.exit(1);
        }
    } else {
        // log('Usuário admin já existe.');
    }
};

const startServer = async () => {
    // --- ETAPA 0: Configuração Inicial ---
    configureLogger({ toFile: true });
    log('--- INICIANDO SERVIDOR ---');
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    try {
        // --- ETAPA 1: INICIALIZAÇÃO DAS BASES DE DADOS ---
        // log('ETAPA 1: Conectando e sincronizando bancos de dados...');
        await initializeDatabase();
        // await initializeVectorDB(); // DESATIVADO: Full Context Mode
        // log('✅ Bancos de dados (PostgreSQL Relacional) prontos.');

        // --- ETAPA 2: AUTENTICAÇÃO E PREPARAÇÃO DE SERVIÇOS ---
        // log('ETAPA 2: Configurando serviços e autenticação...');
        initializeSessionService(memoryStorageAdapter);
        initializeAuthStorage(memoryStorageAdapter);
        await seedAdminUser();
        const loginResult = await performLogin();
        if (!loginResult.success) {
            throw new Error('Falha crítica no login da API InHire.');
        }
        // log('✅ Autenticação com a API externa bem-sucedida.');

        // --- ETAPA 3: SINCRONIZAÇÃO DE DADOS CRÍTICOS (BLOQUEANTE) ---
        // log('ETAPA 3: Sincronizando dados essenciais (Vagas, Talentos, Scorecards)...');
        // Usamos Promise.all para executar em paralelo, mas o 'await' garante que o fluxo só continua após a conclusão de TODAS.
        await Promise.all([
            scorecardService.findAll(), // Carrega e cacheia os scorecards
            syncJobs(),               // Carrega e cacheia as vagas
            syncTalents()             // Carrega e cacheia os talentos
        ]);
        // log('✅ Sincronização inicial de dados essenciais concluída. O cache está pronto.');

        // --- ETAPA 4: CONFIGURAÇÃO DAS ROTAS DA API ---
        // log('ETAPA 4: Configurando as rotas da API...');
        app.use('/api', apiRoutes);
        // log('✅ Rotas da API prontas.');

        // --- ETAPA 5: ABERTURA DO SERVIDOR PARA REQUISIÇÕES ---
        // Esta é a última etapa. O servidor só começa a aceitar conexões AQUI.
        // log('ETAPA 5: Abrindo a porta do servidor...');
        app.listen(PORT, () => {
            log(`🚀 SERVIDOR PRONTO E OUVINDO NA PORTA ${PORT}`);

            // Tarefas não-críticas que podem rodar em segundo plano após o início
            // log('Iniciando tarefas de segundo plano (pré-carregamento de candidatos)...');
            prefetchAllCandidates().catch(err => logError("Erro durante o pré-carregamento em segundo plano:", err));
        });

        // --- ETAPA 6: AGENDAMENTO DE TAREFAS PERIÓDICAS ---
        // log('ETAPA 6: Agendando sincronizações periódicas...');
        setInterval(syncJobs, 60000);
        setInterval(syncTalents, 60000);
        // log('🔄 Sincronização periódica agendada a cada 60s.');

    } catch (error) {
        logError('❌ FALHA CRÍTICA NA INICIALIZAÇÃO DO SERVIDOR. O PROCESSO SERÁ ENCERRADO.', error.message);
        process.exit(1); // Encerra o servidor se qualquer etapa crítica falhar.
    }
};

startServer();