const express = require('express');
const prisma = require('../lib/prisma');
const { atualizarPrecoFiiEChecarAlerta, atualizarPrecoWatchlistEChecarAlerta, buscarCotacaoTicker } = require('../lib/fii-alerts');

const router = express.Router();

/**
 * ROTA: Listar Lista de Observação de FIIs (fora da carteira)
 * GET /api/fii/watchlist
 * Precisa vir ANTES de GET/PUT/DELETE /api/fii/:id para o Express não casar "watchlist" como :id.
 */
router.get('/watchlist', async (req, res) => {
    try {
        const itens = await prisma.fiiWatchlist.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(itens);
    } catch (err) {
        console.error('Erro ao listar lista de observação de FIIs:', err);
        res.status(500).json({ error: 'Erro ao buscar lista de observação de FIIs' });
    }
});

/**
 * ROTA: Adicionar Alerta de Preço para um FII Fora da Carteira
 * POST /api/fii/watchlist
 */
router.post('/watchlist', async (req, res) => {
    try {
        const { ticker, alertaPrecoAbaixoDe } = req.body;

        if (!ticker || alertaPrecoAbaixoDe === undefined || alertaPrecoAbaixoDe === null || alertaPrecoAbaixoDe === '') {
            return res.status(400).json({ error: 'Ticker e preço de alerta são obrigatórios.' });
        }

        const tickerLimpo = String(ticker).trim().toUpperCase();

        // Busca o preço atual já na criação (mesma UX de "normalize-on-write" do resto do módulo FII)
        let precoAtual = null;
        try {
            const cotacao = await buscarCotacaoTicker(tickerLimpo);
            precoAtual = cotacao.precoAtual;
        } catch (e) {
            // Ticker pode estar correto mas a API estar temporariamente indisponível — não bloqueia o cadastro
            console.warn(`[Watchlist FII] Não foi possível buscar cotação inicial de ${tickerLimpo}:`, e.message);
        }

        const novoItem = await prisma.fiiWatchlist.create({
            data: {
                usuarioId: req.session.userId,
                ticker: tickerLimpo,
                alertaPrecoAbaixoDe: Number(alertaPrecoAbaixoDe),
                precoAtual,
                precoAtualizadoEm: precoAtual !== null ? new Date() : null
            }
        });

        res.status(201).json(novoItem);
    } catch (err) {
        console.error('Erro ao adicionar item na lista de observação:', err);
        res.status(500).json({ error: 'Erro ao adicionar item na lista de observação' });
    }
});

/**
 * ROTA: Atualizar Alerta de um Item da Lista de Observação
 * PUT /api/fii/watchlist/:id
 */
router.put('/watchlist/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { ticker, alertaPrecoAbaixoDe } = req.body;

        const existente = await prisma.fiiWatchlist.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'Item não encontrado na lista de observação' });
        }

        const novoAlerta = alertaPrecoAbaixoDe !== undefined && alertaPrecoAbaixoDe !== null && alertaPrecoAbaixoDe !== ''
            ? Number(alertaPrecoAbaixoDe)
            : existente.alertaPrecoAbaixoDe;

        const atualizado = await prisma.fiiWatchlist.update({
            where: { id },
            data: {
                ticker: ticker ? String(ticker).trim().toUpperCase() : existente.ticker,
                alertaPrecoAbaixoDe: novoAlerta,
                // Muda de limite reabre a possibilidade de alerta (mesma regra do FII/Cripto)
                alertaDisparado: novoAlerta !== existente.alertaPrecoAbaixoDe ? false : existente.alertaDisparado
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar item da lista de observação:', err);
        res.status(500).json({ error: 'Erro ao atualizar item da lista de observação' });
    }
});

/**
 * ROTA: Remover Item da Lista de Observação
 * DELETE /api/fii/watchlist/:id
 */
router.delete('/watchlist/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.fiiWatchlist.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Item não encontrado na lista de observação' });
        }

        res.json({ success: true, message: 'Item removido da lista de observação com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir item da lista de observação:', err);
        res.status(500).json({ error: 'Erro ao excluir item da lista de observação' });
    }
});

/**
 * ROTA: Listar Carteira de FIIs do Usuário Logado
 * GET /api/fii
 */
router.get('/', async (req, res) => {
    try {
        const investimentos = await prisma.investimentoFII.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(investimentos);
    } catch (err) {
        console.error('Erro ao listar FIIs:', err);
        res.status(500).json({ error: 'Erro ao buscar carteira de FIIs' });
    }
});

/**
 * ROTA: Cadastrar Novo FII na Carteira
 * POST /api/fii
 */
router.post('/', async (req, res) => {
    try {
        const { ticker, segmento, cotas, precoMedio, ultimoDividendo, observacoes, alertaPrecoAbaixoDe } = req.body;

        if (!ticker || !cotas || !precoMedio) {
            return res.status(400).json({ error: 'Ticker, cotas e preço médio são obrigatórios.' });
        }

        const novoInvestimento = await prisma.investimentoFII.create({
            data: {
                usuarioId: req.session.userId,
                ticker: String(ticker).trim().toUpperCase(),
                segmento: segmento ? String(segmento).trim() : 'Papel / CRI',
                cotas: parseInt(cotas, 10) || 0,
                precoMedio: Number(precoMedio) || 0,
                ultimoDividendo: Number(ultimoDividendo) || 0,
                observacoes: observacoes ? String(observacoes).trim() : null,
                alertaPrecoAbaixoDe: alertaPrecoAbaixoDe !== undefined && alertaPrecoAbaixoDe !== null && alertaPrecoAbaixoDe !== ''
                    ? Number(alertaPrecoAbaixoDe)
                    : null
            }
        });

        res.status(201).json(novoInvestimento);
    } catch (err) {
        console.error('Erro ao cadastrar FII:', err);
        res.status(500).json({ error: 'Erro ao cadastrar FII na carteira' });
    }
});

/**
 * ROTA: Atualizar FII (Edição ou Aporte de Novas Cotas)
 * PUT /api/fii/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { ticker, segmento, cotas, precoMedio, ultimoDividendo, observacoes, alertaPrecoAbaixoDe } = req.body;

        const existente = await prisma.investimentoFII.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'FII não encontrado na carteira' });
        }

        const novoAlerta = alertaPrecoAbaixoDe !== undefined
            ? (alertaPrecoAbaixoDe !== null && alertaPrecoAbaixoDe !== '' ? Number(alertaPrecoAbaixoDe) : null)
            : existente.alertaPrecoAbaixoDe;

        const atualizado = await prisma.investimentoFII.update({
            where: { id },
            data: {
                ticker: ticker ? String(ticker).trim().toUpperCase() : existente.ticker,
                segmento: segmento ? String(segmento).trim() : existente.segmento,
                cotas: cotas !== undefined ? parseInt(cotas, 10) || 0 : existente.cotas,
                precoMedio: precoMedio !== undefined ? Number(precoMedio) || 0 : existente.precoMedio,
                ultimoDividendo: ultimoDividendo !== undefined ? Number(ultimoDividendo) || 0 : existente.ultimoDividendo,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes,
                alertaPrecoAbaixoDe: novoAlerta,
                // Muda de limite reabre a possibilidade de alerta (evita ficar "travado" em true com o limite antigo)
                alertaDisparado: novoAlerta !== existente.alertaPrecoAbaixoDe ? false : existente.alertaDisparado
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar FII:', err);
        res.status(500).json({ error: 'Erro ao atualizar FII da carteira' });
    }
});

/**
 * ROTA: Excluir FII da Carteira
 * DELETE /api/fii/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.investimentoFII.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'FII não encontrado na carteira' });
        }

        res.json({ success: true, message: 'FII removido da carteira com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir FII:', err);
        res.status(500).json({ error: 'Erro ao excluir FII da carteira' });
    }
});

/**
 * ROTA: Atualizar Cotações de Mercado de Todos os FIIs da Carteira
 * POST /api/fii/atualizar-precos
 */
router.post('/atualizar-precos', async (req, res) => {
    try {
        const [investimentos, usuario] = await Promise.all([
            prisma.investimentoFII.findMany({ where: { usuarioId: req.session.userId } }),
            prisma.usuario.findUnique({ where: { id: req.session.userId } })
        ]);

        const resultados = await Promise.all(investimentos.map(async (inv) => {
            try {
                const precoAtual = await atualizarPrecoFiiEChecarAlerta(inv, usuario?.email);
                return { ticker: inv.ticker, sucesso: true, precoAtual };
            } catch (e) {
                return { ticker: inv.ticker, sucesso: false, erro: e.message };
            }
        }));

        const listaAtualizada = await prisma.investimentoFII.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, resultados, investimentos: listaAtualizada });
    } catch (err) {
        console.error('Erro ao atualizar cotações de FIIs:', err);
        res.status(500).json({ error: 'Erro ao atualizar cotações dos FIIs' });
    }
});

/**
 * ROTA: Histórico de Preço de um FII da Carteira (para o gráfico de evolução da cota)
 * GET /api/fii/:id/historico
 */
router.get('/:id/historico', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const investimento = await prisma.investimentoFII.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!investimento) return res.status(404).json({ error: 'FII não encontrado' });

        const historico = await prisma.historicoPrecoFii.findMany({
            where: { investimentoId: id },
            orderBy: { dia: 'asc' }
        });
        res.json(historico);
    } catch (err) {
        console.error('Erro ao buscar histórico de preço do FII:', err);
        res.status(500).json({ error: 'Erro ao buscar histórico de preço' });
    }
});

module.exports = router;
