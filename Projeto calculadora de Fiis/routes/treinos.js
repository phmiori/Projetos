const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * ROTA: Listar Blocos de Treino (com exercícios incluídos)
 * GET /api/treinos/blocos
 */
router.get('/blocos', async (req, res) => {
    try {
        const blocos = await prisma.blocoTreino.findMany({
            where: { usuarioId: req.session.userId },
            include: { exercicios: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] } },
            orderBy: [{ ordem: 'asc' }, { id: 'asc' }]
        });
        res.json(blocos);
    } catch (err) {
        console.error('Erro ao listar blocos de treino:', err);
        res.status(500).json({ error: 'Erro ao buscar blocos de treino' });
    }
});

/**
 * ROTA: Cadastrar Bloco de Treino
 * POST /api/treinos/blocos
 */
router.post('/blocos', async (req, res) => {
    try {
        const { nome, diaSemana, observacoes } = req.body;
        if (!nome) return res.status(400).json({ error: 'Nome do bloco é obrigatório.' });

        const ultimo = await prisma.blocoTreino.findFirst({
            where: { usuarioId: req.session.userId },
            orderBy: { ordem: 'desc' }
        });

        const novoBloco = await prisma.blocoTreino.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                diaSemana: diaSemana ? String(diaSemana).trim() : null,
                observacoes: observacoes ? String(observacoes).trim() : null,
                ordem: ultimo ? ultimo.ordem + 1 : 0
            },
            include: { exercicios: true }
        });

        res.status(201).json(novoBloco);
    } catch (err) {
        console.error('Erro ao cadastrar bloco de treino:', err);
        res.status(500).json({ error: 'Erro ao cadastrar bloco de treino' });
    }
});

/**
 * ROTA: Atualizar Bloco de Treino
 * PUT /api/treinos/blocos/:id
 */
router.put('/blocos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { nome, diaSemana, observacoes } = req.body;

        const existente = await prisma.blocoTreino.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Bloco não encontrado' });

        const atualizado = await prisma.blocoTreino.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                diaSemana: diaSemana !== undefined ? (diaSemana ? String(diaSemana).trim() : null) : existente.diaSemana,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            },
            include: { exercicios: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] } }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar bloco de treino:', err);
        res.status(500).json({ error: 'Erro ao atualizar bloco de treino' });
    }
});

/**
 * ROTA: Excluir Bloco de Treino (e seus exercícios em cascata)
 * DELETE /api/treinos/blocos/:id
 */
router.delete('/blocos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.blocoTreino.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Bloco não encontrado' });
        res.json({ success: true, message: 'Bloco excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir bloco de treino:', err);
        res.status(500).json({ error: 'Erro ao excluir bloco de treino' });
    }
});

/**
 * ROTA: Cadastrar Exercício em um Bloco de Treino
 * POST /api/treinos/blocos/:blocoId/exercicios
 */
router.post('/blocos/:blocoId/exercicios', async (req, res) => {
    try {
        const blocoId = parseInt(req.params.blocoId, 10);
        const { nome, series, repeticoes, carga, observacoes } = req.body;

        const bloco = await prisma.blocoTreino.findFirst({ where: { id: blocoId, usuarioId: req.session.userId } });
        if (!bloco) return res.status(404).json({ error: 'Bloco não encontrado' });

        if (!nome) return res.status(400).json({ error: 'Nome do exercício é obrigatório.' });

        const ultimo = await prisma.exercicioTreino.findFirst({ where: { blocoId }, orderBy: { ordem: 'desc' } });

        const novoExercicio = await prisma.exercicioTreino.create({
            data: {
                blocoId,
                nome: String(nome).trim(),
                series: series !== undefined && series !== '' ? parseInt(series, 10) : null,
                repeticoes: repeticoes ? String(repeticoes).trim() : null,
                carga: carga ? String(carga).trim() : null,
                observacoes: observacoes ? String(observacoes).trim() : null,
                ordem: ultimo ? ultimo.ordem + 1 : 0
            }
        });

        res.status(201).json(novoExercicio);
    } catch (err) {
        console.error('Erro ao cadastrar exercício:', err);
        res.status(500).json({ error: 'Erro ao cadastrar exercício' });
    }
});

/**
 * ROTA: Atualizar Exercício de Treino
 * PUT /api/treinos/exercicios/:id
 */
router.put('/exercicios/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { nome, series, repeticoes, carga, observacoes } = req.body;

        const existente = await prisma.exercicioTreino.findFirst({
            where: { id, bloco: { usuarioId: req.session.userId } }
        });
        if (!existente) return res.status(404).json({ error: 'Exercício não encontrado' });

        const atualizado = await prisma.exercicioTreino.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                series: series !== undefined ? (series !== '' ? parseInt(series, 10) : null) : existente.series,
                repeticoes: repeticoes !== undefined ? (repeticoes ? String(repeticoes).trim() : null) : existente.repeticoes,
                carga: carga !== undefined ? (carga ? String(carga).trim() : null) : existente.carga,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar exercício:', err);
        res.status(500).json({ error: 'Erro ao atualizar exercício' });
    }
});

/**
 * ROTA: Excluir Exercício de Treino
 * DELETE /api/treinos/exercicios/:id
 */
router.delete('/exercicios/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.exercicioTreino.deleteMany({
            where: { id, bloco: { usuarioId: req.session.userId } }
        });
        if (resultado.count === 0) return res.status(404).json({ error: 'Exercício não encontrado' });
        res.json({ success: true, message: 'Exercício excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir exercício:', err);
        res.status(500).json({ error: 'Erro ao excluir exercício' });
    }
});

module.exports = router;
