const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * ROTA: Listar Eventos do Calendário do Usuário Logado (opcionalmente filtrado por período)
 * GET /api/eventos?inicio=ISO&fim=ISO
 */
router.get('/', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const where = { usuarioId: req.session.userId };

        if (inicio && fim) {
            where.inicio = { lte: new Date(fim) };
            where.fim = { gte: new Date(inicio) };
        }

        const eventos = await prisma.evento.findMany({
            where,
            orderBy: { inicio: 'asc' }
        });

        res.json(eventos);
    } catch (err) {
        console.error('Erro ao listar eventos:', err);
        res.status(500).json({ error: 'Erro ao buscar eventos do calendário' });
    }
});

/**
 * ROTA: Cadastrar Novo Evento no Calendário
 * POST /api/eventos
 */
router.post('/', async (req, res) => {
    try {
        const { titulo, descricao, local, inicio, fim, diaTodo, cor, lembreteMinutos } = req.body;

        if (!titulo || !inicio || !fim) {
            return res.status(400).json({ error: 'Título, início e fim são obrigatórios.' });
        }

        const novoEvento = await prisma.evento.create({
            data: {
                usuarioId: req.session.userId,
                titulo: String(titulo).trim(),
                descricao: descricao ? String(descricao).trim() : null,
                local: local ? String(local).trim() : null,
                inicio: new Date(inicio),
                fim: new Date(fim),
                diaTodo: Boolean(diaTodo),
                cor: cor ? String(cor).trim() : '#EEBB00',
                lembreteMinutos: lembreteMinutos !== undefined && lembreteMinutos !== null && lembreteMinutos !== ''
                    ? parseInt(lembreteMinutos, 10) : null
            }
        });

        res.status(201).json(novoEvento);
    } catch (err) {
        console.error('Erro ao cadastrar evento:', err);
        res.status(500).json({ error: 'Erro ao cadastrar evento' });
    }
});

/**
 * ROTA: Atualizar Evento do Calendário
 * PUT /api/eventos/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { titulo, descricao, local, inicio, fim, diaTodo, cor, lembreteMinutos } = req.body;

        const existente = await prisma.evento.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        const atualizado = await prisma.evento.update({
            where: { id },
            data: {
                titulo: titulo ? String(titulo).trim() : existente.titulo,
                descricao: descricao !== undefined ? (descricao ? String(descricao).trim() : null) : existente.descricao,
                local: local !== undefined ? (local ? String(local).trim() : null) : existente.local,
                inicio: inicio ? new Date(inicio) : existente.inicio,
                fim: fim ? new Date(fim) : existente.fim,
                diaTodo: diaTodo !== undefined ? Boolean(diaTodo) : existente.diaTodo,
                cor: cor ? String(cor).trim() : existente.cor,
                lembreteMinutos: lembreteMinutos !== undefined
                    ? (lembreteMinutos === null || lembreteMinutos === '' ? null : parseInt(lembreteMinutos, 10))
                    : existente.lembreteMinutos,
                notificacaoDispensada: false
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar evento:', err);
        res.status(500).json({ error: 'Erro ao atualizar evento' });
    }
});

/**
 * ROTA: Excluir Evento do Calendário
 * DELETE /api/eventos/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.evento.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        res.json({ success: true, message: 'Evento excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir evento:', err);
        res.status(500).json({ error: 'Erro ao excluir evento' });
    }
});

module.exports = router;
