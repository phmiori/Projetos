const express = require('express');
const prisma = require('../lib/prisma');
const { buscarCotacaoCripto } = require('../lib/cripto-shared');
const { atualizarPrecoCriptoEChecarAlerta } = require('../lib/cripto-alerts');

const router = express.Router();

/**
 * ROTA: Listar Carteira de Criptomoedas do Usuário Logado
 * GET /api/cripto
 */
router.get('/', async (req, res) => {
    try {
        const investimentos = await prisma.investimentoCripto.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(investimentos);
    } catch (err) {
        console.error('Erro ao listar criptomoedas:', err);
        res.status(500).json({ error: 'Erro ao buscar carteira de criptomoedas' });
    }
});

/**
 * ROTA: Cadastrar Nova Criptomoeda na Carteira
 * POST /api/cripto
 */
router.post('/', async (req, res) => {
    try {
        const { moedaId, ticker, nome, categoria, quantidade, precoMedio, observacoes, alertaPrecoAbaixoDe } = req.body;

        if (!moedaId || !ticker || !quantidade || !precoMedio) {
            return res.status(400).json({ error: 'Moeda, ticker, quantidade e preço médio são obrigatórios.' });
        }

        const novoInvestimento = await prisma.investimentoCripto.create({
            data: {
                usuarioId: req.session.userId,
                moedaId: String(moedaId).trim().toLowerCase(),
                ticker: String(ticker).trim().toUpperCase(),
                nome: nome ? String(nome).trim() : String(ticker).trim().toUpperCase(),
                categoria: categoria ? String(categoria).trim() : 'Layer 1',
                quantidade: Number(quantidade) || 0,
                precoMedio: Number(precoMedio) || 0,
                observacoes: observacoes ? String(observacoes).trim() : null,
                alertaPrecoAbaixoDe: alertaPrecoAbaixoDe !== undefined && alertaPrecoAbaixoDe !== null && alertaPrecoAbaixoDe !== ''
                    ? Number(alertaPrecoAbaixoDe)
                    : null
            }
        });

        res.status(201).json(novoInvestimento);
    } catch (err) {
        console.error('Erro ao cadastrar criptomoeda:', err);
        res.status(500).json({ error: 'Erro ao cadastrar criptomoeda na carteira' });
    }
});

/**
 * ROTA: Atualizar Criptomoeda (Edição ou Aporte de Nova Quantidade)
 * PUT /api/cripto/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { moedaId, ticker, nome, categoria, quantidade, precoMedio, observacoes, alertaPrecoAbaixoDe } = req.body;

        const existente = await prisma.investimentoCripto.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'Criptomoeda não encontrada na carteira' });
        }

        const novoAlerta = alertaPrecoAbaixoDe !== undefined
            ? (alertaPrecoAbaixoDe !== null && alertaPrecoAbaixoDe !== '' ? Number(alertaPrecoAbaixoDe) : null)
            : existente.alertaPrecoAbaixoDe;

        const atualizado = await prisma.investimentoCripto.update({
            where: { id },
            data: {
                moedaId: moedaId ? String(moedaId).trim().toLowerCase() : existente.moedaId,
                ticker: ticker ? String(ticker).trim().toUpperCase() : existente.ticker,
                nome: nome ? String(nome).trim() : existente.nome,
                categoria: categoria ? String(categoria).trim() : existente.categoria,
                quantidade: quantidade !== undefined ? Number(quantidade) || 0 : existente.quantidade,
                precoMedio: precoMedio !== undefined ? Number(precoMedio) || 0 : existente.precoMedio,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes,
                alertaPrecoAbaixoDe: novoAlerta,
                // Muda de limite reabre a possibilidade de alerta (evita ficar "travado" em true com o limite antigo)
                alertaDisparado: novoAlerta !== existente.alertaPrecoAbaixoDe ? false : existente.alertaDisparado
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar criptomoeda:', err);
        res.status(500).json({ error: 'Erro ao atualizar criptomoeda da carteira' });
    }
});

/**
 * ROTA: Excluir Criptomoeda da Carteira
 * DELETE /api/cripto/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.investimentoCripto.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Criptomoeda não encontrada na carteira' });
        }

        res.json({ success: true, message: 'Criptomoeda removida da carteira com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir criptomoeda:', err);
        res.status(500).json({ error: 'Erro ao excluir criptomoeda da carteira' });
    }
});

/**
 * ROTA: Atualizar Cotações de Mercado de Todas as Criptomoedas da Carteira
 * POST /api/cripto/atualizar-precos
 */
router.post('/atualizar-precos', async (req, res) => {
    try {
        const [investimentos, usuario] = await Promise.all([
            prisma.investimentoCripto.findMany({ where: { usuarioId: req.session.userId } }),
            prisma.usuario.findUnique({ where: { id: req.session.userId } })
        ]);

        if (investimentos.length === 0) {
            return res.json({ success: true, resultados: [], investimentos: [] });
        }

        let cotacoes = {};
        let erroGeral = null;
        try {
            cotacoes = await buscarCotacaoCripto(investimentos.map(inv => inv.moedaId));
        } catch (e) {
            erroGeral = e.message;
        }

        const resultados = await Promise.all(investimentos.map(async (inv) => {
            const preco = cotacoes[inv.moedaId]?.brl;
            if (typeof preco !== 'number') {
                return { ticker: inv.ticker, sucesso: false, erro: erroGeral || 'Moeda não encontrada na CoinGecko' };
            }
            await atualizarPrecoCriptoEChecarAlerta(inv, preco, usuario?.email);
            return { ticker: inv.ticker, sucesso: true, precoAtual: preco };
        }));

        const listaAtualizada = await prisma.investimentoCripto.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ success: true, resultados, investimentos: listaAtualizada });
    } catch (err) {
        console.error('Erro ao atualizar cotações de criptomoedas:', err);
        res.status(500).json({ error: 'Erro ao atualizar cotações das criptomoedas' });
    }
});

module.exports = router;
