// CRIE O ARQUIVO: src/routes/adminRoutes.js

import { Router } from 'express';
import { createUser, getAllUsers, updateUser, deleteUser } from '../Core/User-Flow/userService.js';

const router = Router();

router.get('/users', async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/users', async (req, res) => {
    try {
        const newUser = await createUser(req.body);
        res.status(201).json(newUser);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.put('/users/:id', async (req, res) => {
    try {
        await updateUser(req.params.id, req.body);
        res.json({ message: 'Usuário atualizado com sucesso.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        await deleteUser(req.params.id);
        res.json({ message: 'Usuário deletado com sucesso.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


export default router;