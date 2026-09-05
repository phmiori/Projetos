const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * ROTA: Listar Registros de Saúde (peso/medidas, água, sono)
 * GET /api/saude/registros
 */
router.get('/registros', async (req, res) => {
    try {
        const registros = await prisma.registroSaude.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { data: 'desc' }
        });
        res.json(registros);
    } catch (err) {
        console.error('Erro ao listar registros de saúde:', err);
        res.status(500).json({ error: 'Erro ao buscar registros de saúde' });
    }
});

/**
 * ROTA: Cadastrar Registro de Saúde
 * POST /api/saude/registros
 */
router.post('/registros', async (req, res) => {
    try {
        const { data, peso, cintura, aguaMl, sonoHoras, observacoes } = req.body;

        const novoRegistro = await prisma.registroSaude.create({
            data: {
                usuarioId: req.session.userId,
                data: data ? new Date(data) : new Date(),
                peso: peso !== undefined && peso !== '' ? Number(peso) : null,
                cintura: cintura !== undefined && cintura !== '' ? Number(cintura) : null,
                aguaMl: aguaMl !== undefined && aguaMl !== '' ? parseInt(aguaMl, 10) : null,
                sonoHoras: sonoHoras !== undefined && sonoHoras !== '' ? Number(sonoHoras) : null,
                observacoes: observacoes ? String(observacoes).trim() : null
            }
        });

        res.status(201).json(novoRegistro);
    } catch (err) {
        console.error('Erro ao cadastrar registro de saúde:', err);
        res.status(500).json({ error: 'Erro ao cadastrar registro de saúde' });
    }
});

/**
 * ROTA: Atualizar Registro de Saúde
 * PUT /api/saude/registros/:id
 */
router.put('/registros/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { data, peso, cintura, aguaMl, sonoHoras, observacoes } = req.body;

        const existente = await prisma.registroSaude.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Registro não encontrado' });

        const atualizado = await prisma.registroSaude.update({
            where: { id },
            data: {
                data: data ? new Date(data) : existente.data,
                peso: peso !== undefined ? (peso !== '' ? Number(peso) : null) : existente.peso,
                cintura: cintura !== undefined ? (cintura !== '' ? Number(cintura) : null) : existente.cintura,
                aguaMl: aguaMl !== undefined ? (aguaMl !== '' ? parseInt(aguaMl, 10) : null) : existente.aguaMl,
                sonoHoras: sonoHoras !== undefined ? (sonoHoras !== '' ? Number(sonoHoras) : null) : existente.sonoHoras,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar registro de saúde:', err);
        res.status(500).json({ error: 'Erro ao atualizar registro de saúde' });
    }
});

/**
 * ROTA: Excluir Registro de Saúde
 * DELETE /api/saude/registros/:id
 */
router.delete('/registros/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.registroSaude.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Registro não encontrado' });
        res.json({ success: true, message: 'Registro excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir registro de saúde:', err);
        res.status(500).json({ error: 'Erro ao excluir registro de saúde' });
    }
});

module.exports = router;
