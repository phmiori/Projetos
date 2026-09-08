const express = require('express');
const prisma = require('../lib/prisma');
const { chamarAssistenteIA } = require('../lib/assistente-shared');

const router = express.Router();

const LIMITE_HISTORICO = 30;

/**
 * GET /api/assistente/historico
 * Tolerante à tabela MensagemAssistente ainda não existir (pendente de `npm run prisma:push`).
 */
router.get('/historico', async (req, res) => {
    try {
        const mensagens = await prisma.mensagemAssistente.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'asc' },
            take: 100
        });
        res.json(mensagens);
    } catch (err) {
        console.warn('[Assistente] Histórico indisponível (tabela pode não existir ainda):', err.message);
        res.json([]);
    }
});

/**
 * POST /api/assistente/chat
 * Body: { mensagem: string }
 */
router.post('/chat', async (req, res) => {
    try {
        const mensagemUsuario = String(req.body?.mensagem || '').trim();
        if (!mensagemUsuario) return res.status(400).json({ error: 'Mensagem vazia.' });

        const usuario = await prisma.usuario.findUnique({ where: { id: req.session.userId } });

        let historico = [];
        try {
            historico = await prisma.mensagemAssistente.findMany({
                where: { usuarioId: req.session.userId },
                orderBy: { createdAt: 'desc' },
                take: LIMITE_HISTORICO
            });
            historico.reverse();
        } catch (e) {
            console.warn('[Assistente] Não foi possível carregar o histórico (tabela pendente de migração):', e.message);
        }

        const { resposta, emailEnviado } = await chamarAssistenteIA({
            usuarioId: req.session.userId,
            emailUsuario: usuario?.email || null,
            historico,
            mensagemUsuario
        });

        try {
            await prisma.mensagemAssistente.create({ data: { usuarioId: req.session.userId, papel: 'usuario', conteudo: mensagemUsuario } });
            await prisma.mensagemAssistente.create({ data: { usuarioId: req.session.userId, papel: 'assistente', conteudo: resposta } });
        } catch (e) {
            console.warn('[Assistente] Não foi possível salvar a conversa (tabela pendente de migração):', e.message);
        }

        res.json({ resposta, emailEnviado });
    } catch (err) {
        console.error('Erro no chat do assistente:', err);
        res.status(500).json({ error: 'Erro ao conversar com o assistente. Tente novamente.' });
    }
});

/**
 * DELETE /api/assistente/historico — limpa a conversa do usuário logado
 */
router.delete('/historico', async (req, res) => {
    try {
        await prisma.mensagemAssistente.deleteMany({ where: { usuarioId: req.session.userId } });
        res.json({ success: true });
    } catch (err) {
        console.warn('[Assistente] Falha ao limpar histórico:', err.message);
        res.json({ success: true });
    }
});

module.exports = router;
