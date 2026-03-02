// CRIE O ARQUIVO: src/routes/authRoutes.js

import { Router } from 'express';
import { login } from '../Core/Auth-Flow/authService.js';

const router = Router();

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }
    const result = await login(email, password);
    if (result) {
        res.json(result);
    } else {
        res.status(401).json({ error: 'Credenciais inválidas.' });
    }
});

export default router;