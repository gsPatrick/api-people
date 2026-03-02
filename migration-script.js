// migration-script.js

import Database from 'better-sqlite3';
import db from './src/models/index.js'; // Importa a configuração do Sequelize/PostgreSQL
import { log, error } from './src/utils/logger.service.js';

// Caminho para o banco de dados SQLite de onde os dados virão
const sqliteDbPath = './linkedin_cache.sqlite';

const migrateUsers = async () => {
    log('--- INICIANDO SCRIPT DE MIGRAÇÃO DE USUÁRIOS ---');
    let sqlite;

    try {
        // --- ETAPA 1: Conectar aos dois bancos de dados ---
        log('Conectando ao banco de dados SQLite...');
        sqlite = new Database(sqliteDbPath, { verbose: console.log });
        log('✅ Conectado ao SQLite.');

        log('Autenticando com o PostgreSQL via Sequelize...');
        await db.sequelize.authenticate();
        log('✅ Autenticado com o PostgreSQL.');

        // --- ETAPA 2: Ler todos os usuários do SQLite ---
        log('Buscando todos os usuários do banco de dados SQLite...');
        const stmt = sqlite.prepare('SELECT id, name, email, password, role, createdAt, updatedAt FROM users');
        const usersFromSqlite = stmt.all();
        log(`Encontrados ${usersFromSqlite.length} usuários para migrar.`);

        if (usersFromSqlite.length === 0) {
            log('Nenhum usuário no SQLite para migrar. Encerrando.');
            return;
        }

        // --- ETAPA 3: Inserir cada usuário no PostgreSQL ---
        let migratedCount = 0;
        let skippedCount = 0;

        for (const user of usersFromSqlite) {
            try {
                // `findOrCreate` é seguro: ele só cria se o email não existir.
                // Isso permite que você rode o script várias vezes sem criar duplicatas.
                const [newUser, created] = await db.User.findOrCreate({
                    where: { email: user.email },
                    defaults: {
                        name: user.name,
                        // IMPORTANTE: Estamos copiando o HASH da senha, não a senha em si.
                        // O bcrypt vai funcionar perfeitamente com o hash antigo.
                        password: user.password,
                        role: user.role,
                        // As datas do SQLite estão em milissegundos (timestamp), então convertemos para o formato Date
                        createdAt: new Date(user.createdAt),
                        updatedAt: new Date(user.updatedAt)
                    }
                });

                if (created) {
                    log(`Usuário '${user.name}' (${user.email}) migrado com sucesso.`);
                    migratedCount++;
                } else {
                    log(`Usuário '${user.name}' (${user.email}) já existe no PostgreSQL. Pulando.`);
                    skippedCount++;
                }

            } catch (err) {
                error(`Falha ao migrar o usuário ${user.email}. Erro: ${err.message}`);
            }
        }

        log('--- MIGRAÇÃO CONCLUÍDA ---');
        log(`Resumo: ${migratedCount} usuários migrados, ${skippedCount} usuários pulados (já existentes).`);

    } catch (err) {
        error('❌ Ocorreu um erro crítico durante a migração:', err.message);
        error('Stack Trace:', err.stack);
    } finally {
        // --- ETAPA 4: Fechar as conexões ---
        if (sqlite) {
            sqlite.close();
            log('Conexão com SQLite fechada.');
        }
        await db.sequelize.close();
        log('Conexão com PostgreSQL fechada.');
    }
};

// Executa a função
migrateUsers();