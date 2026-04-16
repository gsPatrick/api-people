// CRIE O ARQUIVO: src/middleware/authMiddleware.js

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto-padrao';

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

    // Proteção contra tokens "fantasmas" (string "undefined" enviada pelo frontend)
    if (token === 'undefined' || !token) {
        console.warn(`[AUTH-TOKEN] Bloqueado: Token é ${token === 'undefined' ? 'string "undefined"' : 'nulo'}`);
        return res.status(401).json({ 
            error: 'Token não fornecido ou inválido', 
            hint: 'O frontend enviou um token nulo ou a string "undefined". Verifique a sessão.' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error(`[AUTH-TOKEN] JWT Verify Error: ${err.message} | SecretPrefix: ${JWT_SECRET.substring(0, 3)}***`);
            return res.status(403).json({ 
                error: 'Token inválido ou expirado', 
                details: err.message,
                hint: 'Verifique se o JWT_SECRET do servidor coincide com o gerador do token.'
            });
        }
        req.user = user;
        next();
    });
};

export const isAdmin = (req, res, next) => {
    // Garantir que temos um objeto role tratável
    const rawRole = req.user && req.user.role ? String(req.user.role) : '';
    const userRole = rawRole.trim().toLowerCase();
    
    console.log(`[AUTH-CHECK] Email: ${req.user?.email} | Role Capturada: "${rawRole}" | Role Processada: "${userRole}"`);
    
    if (userRole === 'admin') {
        console.log(`[AUTH-CHECK] ✅ ACESSO PERMITIDO para ${req.user?.email}`);
        next();
    } else {
        console.warn(`[AUTH-CHECK] ❌ ACESSO NEGADO para ${req.user?.email}. Role encontrada: "${userRole}"`);
        res.status(403).json({ 
            error: 'Acesso negado. Rota exclusiva para administradores.',
            details: { roleFound: userRole, expected: 'admin' }
        });
    }
};