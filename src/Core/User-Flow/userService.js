// src/Core/User-Flow/userService.js

import db from '../../models/index.js'; // Importa models do Sequelize
import bcrypt from 'bcrypt';
import { log, error } from '../../utils/logger.service.js';

const SALT_ROUNDS = 10;

export const findUserByEmail = async (email) => {
    try {
        // Usa o model 'User' (certifique-se que o model está definido como 'User' no src/models/user.model.js)
        // Se o nome do model for diferente, ajuste aqui.
        const User = db.User;
        if (!User) throw new Error("Model User não inicializado.");

        const user = await User.findOne({ where: { email } });
        return user ? user.toJSON() : null;
    } catch (err) {
        error("Erro ao buscar usuário por email:", err.message);
        return null;
    }
};

export const createUser = async ({ name, email, password, role = 'user' }) => {
    try {
        const User = db.User;
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            throw new Error('Um usuário com este email já existe.');
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
            role
        });

        log(`Usuário '${name}' criado com sucesso com ID: ${newUser.id}`);
        return newUser.toJSON();
    } catch (err) {
        error("Erro ao criar usuário:", err.message);
        throw err;
    }
};

export const getAllUsers = async () => {
    try {
        const User = db.User;
        const users = await User.findAll({
            attributes: ['id', 'name', 'email', 'role', 'createdAt', 'updatedAt'], // Exclui password
            order: [['name', 'ASC']]
        });
        return users.map(u => u.toJSON());
    } catch (err) {
        error("Erro ao buscar todos os usuários:", err.message);
        return [];
    }
};

export const updateUser = async (id, { name, email, password, role }) => {
    try {
        const User = db.User;
        const updates = {};
        if (name) updates.name = name;
        if (email) updates.email = email;
        if (role) updates.role = role;
        if (password) {
            updates.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        if (Object.keys(updates).length === 0) {
            throw new Error("Nenhum campo para atualizar foi fornecido.");
        }

        const [affectedRows] = await User.update(updates, {
            where: { id }
        });

        if (affectedRows === 0) {
            throw new Error("Usuário não encontrado ou nada a atualizar.");
        }

        log(`Usuário ID ${id} atualizado com sucesso.`);
        return true;
    } catch (err) {
        error(`Erro ao atualizar usuário ID ${id}:`, err.message);
        throw err;
    }
};

export const deleteUser = async (id) => {
    try {
        const User = db.User;
        const affectedRows = await User.destroy({
            where: { id }
        });

        if (affectedRows === 0) {
            throw new Error('Nenhum usuário encontrado com este ID.');
        }
        log(`Usuário ID ${id} deletado com sucesso.`);
        return true;
    } catch (err) {
        error(`Erro ao deletar usuário ID ${id}:`, err.message);
        throw err;
    }
};