const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * ROTA: Listar Cofrinhos do Usuário Logado
 * GET /api/cofrinhos
 */
router.get('/', async (req, res) => {
    try {
        const cofrinhos = await prisma.cofrinho.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(cofrinhos);
    } catch (err) {
        console.error('Erro ao listar cofrinhos:', err);
        res.status(500).json({ error: 'Erro ao buscar cofrinhos' });
    }
});

/**
 * ROTA: Cadastrar Novo Cofrinho
 * POST /api/cofrinhos
 */
router.post('/', async (req, res) => {
    try {
        const { nome, valorInvestido, rendaPorDia, dataInicio, observacoes } = req.body;

        if (!nome || !valorInvestido || rendaPorDia === undefined) {
            return res.status(400).json({ error: 'Nome, valor investido e renda do dia 1 são obrigatórios.' });
        }

        const novoCofrinho = await prisma.cofrinho.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                valorInvestido: Number(valorInvestido) || 0,
                rendaPorDia: Number(rendaPorDia) || 0,
                dataInicio: dataInicio ? new Date(dataInicio) : new Date(),
                observacoes: observacoes ? String(observacoes).trim() : null
            }
        });

        res.status(201).json(novoCofrinho);
    } catch (err) {
        console.error('Erro ao cadastrar cofrinho:', err);
        res.status(500).json({ error: 'Erro ao cadastrar cofrinho' });
    }
});

/**
 * ROTA: Atualizar Cofrinho
 * PUT /api/cofrinhos/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { nome, valorInvestido, rendaPorDia, dataInicio, observacoes } = req.body;

        const existente = await prisma.cofrinho.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'Cofrinho não encontrado' });
        }

        const atualizado = await prisma.cofrinho.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                valorInvestido: valorInvestido !== undefined ? Number(valorInvestido) || 0 : existente.valorInvestido,
                rendaPorDia: rendaPorDia !== undefined ? Number(rendaPorDia) || 0 : existente.rendaPorDia,
                dataInicio: dataInicio ? new Date(dataInicio) : existente.dataInicio,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar cofrinho:', err);
        res.status(500).json({ error: 'Erro ao atualizar cofrinho' });
    }
});

/**
 * ROTA: Excluir Cofrinho
 * DELETE /api/cofrinhos/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.cofrinho.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Cofrinho não encontrado' });
        }

        res.json({ success: true, message: 'Cofrinho excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir cofrinho:', err);
        res.status(500).json({ error: 'Erro ao excluir cofrinho' });
    }
});

module.exports = router;
