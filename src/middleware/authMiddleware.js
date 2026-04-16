// CRIE O ARQUIVO: src/middleware/authMiddleware.js

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto-padrao';

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

    if (token == null) {
        return res.sendStatus(401); // Unauthorized
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.sendStatus(403); // Forbidden (token inválido)
        }
        req.user = user;
        next();
    });
};

export const isAdmin = (req, res, next) => {
    const userRole = req.user?.role?.toLowerCase();
    console.log(`[AUTH] Verifying admin status for user: ${req.user?.email}, Role: ${req.user?.role}`);
    
    if (req.user && userRole === 'admin') {
        next();
    } else {
        console.warn(`[AUTH] Access denied. User role is '${req.user?.role}', expected 'admin'.`);
        res.status(403).json({ error: 'Acesso negado. Rota exclusiva para administradores.' });
    }
};