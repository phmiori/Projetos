const express = require('express');
const prisma = require('../lib/prisma');
const {
    buscarEventosComNotificacaoAtiva,
    buscarFaturasVencendoAtivas
} = require('../lib/notificacoes-shared');
const { pushConfigurado, VAPID_PUBLIC_KEY } = require('../lib/push-shared');

const router = express.Router();

/**
 * ROTA: Chave Pública VAPID (para o navegador gerar a inscrição de push)
 * GET /api/notificacoes/push/chave-publica
 */
router.get('/push/chave-publica', (req, res) => {
    res.json({ ativado: pushConfigurado, chavePublica: VAPID_PUBLIC_KEY || null });
});

/**
 * ROTA: Registrar Inscrição de Push deste Dispositivo
 * POST /api/notificacoes/push/inscrever
 */
router.post('/push/inscrever', async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ error: 'Inscrição de push inválida' });
        }

        await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: { usuarioId: req.session.userId, p256dh: keys.p256dh, auth: keys.auth },
            create: { usuarioId: req.session.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar inscrição de push:', err);
        res.status(500).json({ error: 'Erro ao salvar inscrição de push' });
    }
});

/**
 * ROTA: Remover Inscrição de Push deste Dispositivo
 * DELETE /api/notificacoes/push/inscrever
 */
router.delete('/push/inscrever', async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (endpoint) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint, usuarioId: req.session.userId } });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao remover inscrição de push:', err);
        res.status(500).json({ error: 'Erro ao remover inscrição de push' });
    }
});

// Cor de alerta reaproveitada de CSS/Global/global_tokens.css (--color-expense), usada como
// dado (assim como Evento.cor já é um hex salvo no banco), não como CSS hardcoded.
const COR_ALERTA = '#D32F2F';

/**
 * ROTA: Notificações Pendentes (sino do cabeçalho)
 * Une 2 fontes: lembretes de eventos do Calendário e faturas de cartão vencendo em breve —
 * cada uma mapeada para um envelope comum.
 * GET /api/notificacoes
 */
router.get('/', async (req, res) => {
    try {
        const agora = new Date();
        const usuarioId = req.session.userId;

        // Cada fonte é isolada: se a tabela NotificacaoDispensada ainda não existir no banco
        // (pendente de `prisma db push` manual), os lembretes de Calendário continuam funcionando.
        const [eventos, faturasVencendo] = await Promise.all([
            buscarEventosComNotificacaoAtiva(usuarioId),
            buscarFaturasVencendoAtivas(usuarioId).catch(e => { console.warn('[Notificações] faturas indisponível:', e.message); return []; })
        ]);

        const notificacoesEventos = eventos.map(ev => ({
            id: `evento-${ev.id}`,
            tipo: 'evento',
            titulo: ev.titulo,
            local: ev.local,
            inicio: ev.inicio,
            fim: ev.fim,
            diaTodo: ev.diaTodo,
            cor: ev.cor,
            atualizadoEm: ev.updatedAt,
            emAndamento: agora >= ev.inicio && agora <= ev.fim,
            link: '../Calendario/calendario.html'
        }));

        const notificacoesFaturas = faturasVencendo.map(f => ({
            id: `fatura-${f.id}`,
            tipo: 'fatura',
            titulo: `Fatura do ${f.cartao.nome} vencendo`,
            subtitulo: `Vence em ${new Date(f.dataVencimento).toLocaleDateString('pt-BR')}`,
            cor: COR_ALERTA,
            atualizadoEm: f.updatedAt,
            link: '../Financas/financas.html'
        }));

        res.json([...notificacoesEventos, ...notificacoesFaturas]);
    } catch (err) {
        console.error('Erro ao buscar notificações:', err);
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

/**
 * ROTA: Dispensar Todas as Notificações Ativas do Usuário
 * (marca eventos como notificacaoDispensada e grava NotificacaoDispensada para fatura,
 * sem apagar os registros originais)
 * DELETE /api/notificacoes
 */
router.delete('/', async (req, res) => {
    try {
        const usuarioId = req.session.userId;

        const [eventos, faturasVencendo] = await Promise.all([
            buscarEventosComNotificacaoAtiva(usuarioId),
            buscarFaturasVencendoAtivas(usuarioId).catch(() => [])
        ]);

        const eventoIds = eventos.map(ev => ev.id);
        if (eventoIds.length > 0) {
            await prisma.evento.updateMany({
                where: { id: { in: eventoIds }, usuarioId },
                data: { notificacaoDispensada: true }
            });
        }

        const dispensasGenericas = faturasVencendo.map(f => ({ tipo: 'fatura', entidadeId: f.id }));
        if (dispensasGenericas.length > 0) {
            try {
                await prisma.notificacaoDispensada.createMany({
                    data: dispensasGenericas.map(d => ({ usuarioId, tipo: d.tipo, entidadeId: d.entidadeId })),
                    skipDuplicates: true
                });
            } catch (e) {
                console.warn('[Notificações] Falha ao gravar dispensa genérica (tabela pendente de migração?):', e.message);
            }
        }

        res.json({ success: true, removidas: eventoIds.length + dispensasGenericas.length });
    } catch (err) {
        console.error('Erro ao apagar notificações:', err);
        res.status(500).json({ error: 'Erro ao apagar notificações' });
    }
});

/**
 * ROTA: Dispensar uma Notificação Específica
 * O :id vem prefixado pelo tipo (ex.: "evento-12", "fatura-3"), conforme
 * devolvido por GET /api/notificacoes.
 * DELETE /api/notificacoes/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const usuarioId = req.session.userId;
        const raw = String(req.params.id);
        const hifen = raw.indexOf('-');
        const tipo = hifen === -1 ? 'evento' : raw.slice(0, hifen);
        const entidadeId = parseInt(hifen === -1 ? raw : raw.slice(hifen + 1), 10);

        if (tipo === 'evento') {
            const resultado = await prisma.evento.updateMany({
                where: { id: entidadeId, usuarioId },
                data: { notificacaoDispensada: true }
            });
            if (resultado.count === 0) {
                return res.status(404).json({ error: 'Notificação não encontrada' });
            }
        } else {
            try {
                await prisma.notificacaoDispensada.upsert({
                    where: { usuarioId_tipo_entidadeId: { usuarioId, tipo, entidadeId } },
                    update: {},
                    create: { usuarioId, tipo, entidadeId }
                });
            } catch (e) {
                console.warn('[Notificações] Falha ao gravar dispensa genérica (tabela pendente de migração?):', e.message);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao apagar notificação:', err);
        res.status(500).json({ error: 'Erro ao apagar notificação' });
    }
});

module.exports = router;
