const express = require('express');
const prisma = require('../lib/prisma');
const {
    buscarEventosComNotificacaoAtiva,
    buscarItensEstoqueBaixoAtivos,
    buscarTarefasVencidasAtivas
} = require('../lib/notificacoes-shared');

const router = express.Router();

// Cor de alerta reaproveitada de CSS/Global/global_tokens.css (--color-expense), usada como
// dado (assim como Evento.cor já é um hex salvo no banco), não como CSS hardcoded.
const COR_ALERTA = '#D32F2F';

/**
 * ROTA: Notificações Pendentes (sino do cabeçalho)
 * Une 3 fontes: lembretes de eventos do Calendário, itens da Despensa com estoque baixo
 * e Tarefas & Manutenção da Casa vencidas — cada uma mapeada para um envelope comum.
 * GET /api/notificacoes
 */
router.get('/', async (req, res) => {
    try {
        const agora = new Date();
        const usuarioId = req.session.userId;

        // Cada fonte é isolada: se a tabela NotificacaoDispensada ainda não existir no banco
        // (pendente de `prisma db push` manual), os lembretes de Calendário continuam funcionando.
        const [eventos, itensBaixos, tarefasVencidas] = await Promise.all([
            buscarEventosComNotificacaoAtiva(usuarioId),
            buscarItensEstoqueBaixoAtivos(usuarioId).catch(e => { console.warn('[Notificações] estoque indisponível:', e.message); return []; }),
            buscarTarefasVencidasAtivas(usuarioId).catch(e => { console.warn('[Notificações] tarefas indisponível:', e.message); return []; })
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

        const notificacoesEstoque = itensBaixos.map(item => ({
            id: `estoque-${item.id}`,
            tipo: 'estoque',
            titulo: `Estoque baixo: ${item.nome}`,
            subtitulo: `${item.quantidade} ${item.unidade} restante(s) (mín. ${item.quantidadeMinima})`,
            cor: COR_ALERTA,
            atualizadoEm: item.updatedAt,
            link: '../FinancasCasa/financascasa.html'
        }));

        const notificacoesTarefas = tarefasVencidas.map(t => ({
            id: `tarefa-${t.id}`,
            tipo: 'tarefa',
            titulo: `Tarefa vencida: ${t.titulo}`,
            subtitulo: t.dataPrevista ? `Venceu em ${new Date(t.dataPrevista).toLocaleDateString('pt-BR')}` : 'Sem data prevista',
            cor: COR_ALERTA,
            atualizadoEm: t.updatedAt,
            link: '../FinancasCasa/financascasa.html'
        }));

        res.json([...notificacoesEventos, ...notificacoesEstoque, ...notificacoesTarefas]);
    } catch (err) {
        console.error('Erro ao buscar notificações:', err);
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

/**
 * ROTA: Dispensar Todas as Notificações Ativas do Usuário
 * (marca eventos como notificacaoDispensada e grava NotificacaoDispensada para estoque/tarefa,
 * sem apagar os registros originais)
 * DELETE /api/notificacoes
 */
router.delete('/', async (req, res) => {
    try {
        const usuarioId = req.session.userId;

        const [eventos, itensBaixos, tarefasVencidas] = await Promise.all([
            buscarEventosComNotificacaoAtiva(usuarioId),
            buscarItensEstoqueBaixoAtivos(usuarioId).catch(() => []),
            buscarTarefasVencidasAtivas(usuarioId).catch(() => [])
        ]);

        const eventoIds = eventos.map(ev => ev.id);
        if (eventoIds.length > 0) {
            await prisma.evento.updateMany({
                where: { id: { in: eventoIds }, usuarioId },
                data: { notificacaoDispensada: true }
            });
        }

        const dispensasGenericas = [
            ...itensBaixos.map(item => ({ tipo: 'estoque', entidadeId: item.id })),
            ...tarefasVencidas.map(t => ({ tipo: 'tarefa', entidadeId: t.id }))
        ];
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
 * O :id vem prefixado pelo tipo (ex.: "evento-12", "estoque-3", "tarefa-7"), conforme
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
