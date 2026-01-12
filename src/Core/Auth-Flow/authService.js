// CRIE O ARQUIVO: src/Core/Auth-Flow/authService.js

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { findUserByEmail } from '../User-Flow/userService.js';
import { log, error } from '../../utils/logger.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-super-secreto-padrao';

export const login = async (email, password) => {
    log(`Tentativa de login para o email: ${email}`);
    const user = await findUserByEmail(email);

    if (!user) {
        error(`Falha no login: usuário ${email} não encontrado.`);
        return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        error(`Falha no login: senha inválida para o usuário ${email}.`);
        return null;
    }

    const payload = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
    log(`Login bem-sucedido para ${email}. Token gerado.`);

    return { token, user: payload };
};