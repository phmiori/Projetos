const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { calcularCompetencia, obterOuCriarFatura } = require('../lib/financas-shared');

const router = express.Router();

// =========================================================
// CONTAS BANCÁRIAS
// GET/POST/PUT/DELETE /api/financas/contas
// =========================================================

router.get('/contas', async (req, res) => {
    try {
        const contas = await prisma.contaBancaria.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'asc' }
        });

        // Saldo atual = saldo inicial + receitas - despesas (débito/pix/dinheiro/boleto) - transferências
        // enviadas + transferências recebidas, todas com status "Pago".
        const transacoes = await prisma.transacao.findMany({
            where: { usuarioId: req.session.userId, status: 'Pago' }
        });

        const comSaldo = contas.map(conta => {
            let saldo = conta.saldoInicial;
            transacoes.forEach(t => {
                if (t.tipo === 'Transferencia') {
                    if (t.contaId === conta.id) saldo -= t.valor;
                    if (t.contaDestinoId === conta.id) saldo += t.valor;
                } else if (t.contaId === conta.id && t.formaPagamento !== 'Crédito') {
                    saldo += t.tipo === 'Receita' ? t.valor : -t.valor;
                }
            });
            return { ...conta, saldoAtual: saldo };
        });

        res.json(comSaldo);
    } catch (err) {
        console.error('Erro ao listar contas:', err);
        res.status(500).json({ error: 'Erro ao buscar contas bancárias' });
    }
});

router.post('/contas', async (req, res) => {
    try {
        const { nome, banco, tipo, saldoInicial, cor } = req.body;
        if (!nome || !banco) return res.status(400).json({ error: 'Nome e banco são obrigatórios.' });

        const nova = await prisma.contaBancaria.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                banco: String(banco).trim(),
                tipo: tipo ? String(tipo).trim() : 'Corrente',
                saldoInicial: Number(saldoInicial) || 0,
                cor: cor || '#EEBB00'
            }
        });
        res.status(201).json(nova);
    } catch (err) {
        console.error('Erro ao cadastrar conta:', err);
        res.status(500).json({ error: 'Erro ao cadastrar conta bancária' });
    }
});

router.put('/contas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existente = await prisma.contaBancaria.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Conta não encontrada' });

        const { nome, banco, tipo, saldoInicial, cor, ativa } = req.body;
        const atualizada = await prisma.contaBancaria.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                banco: banco ? String(banco).trim() : existente.banco,
                tipo: tipo ? String(tipo).trim() : existente.tipo,
                saldoInicial: saldoInicial !== undefined ? Number(saldoInicial) || 0 : existente.saldoInicial,
                cor: cor || existente.cor,
                ativa: ativa !== undefined ? Boolean(ativa) : existente.ativa
            }
        });
        res.json(atualizada);
    } catch (err) {
        console.error('Erro ao atualizar conta:', err);
        res.status(500).json({ error: 'Erro ao atualizar conta bancária' });
    }
});

router.delete('/contas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.contaBancaria.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Conta não encontrada' });
        res.json({ success: true, message: 'Conta excluída com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir conta:', err);
        res.status(500).json({ error: 'Erro ao excluir conta bancária' });
    }
});

// =========================================================
// CARTÕES DE CRÉDITO
// GET/POST/PUT/DELETE /api/financas/cartoes
// =========================================================

router.get('/cartoes', async (req, res) => {
    try {
        const cartoes = await prisma.cartaoCredito.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'asc' }
        });

        // Limite disponível = limite - soma das faturas ainda não pagas (aberta + fechada).
        const faturasAbertas = await prisma.faturaCartao.findMany({
            where: { cartaoId: { in: cartoes.map(c => c.id) }, status: { not: 'Paga' } },
            include: { transacoes: true }
        });

        const comLimite = cartoes.map(cartao => {
            const usado = faturasAbertas
                .filter(f => f.cartaoId === cartao.id)
                .reduce((s, f) => s + f.transacoes.reduce((s2, t) => s2 + t.valor, 0), 0);
            return { ...cartao, limiteUsado: usado, limiteDisponivel: cartao.limite - usado };
        });

        res.json(comLimite);
    } catch (err) {
        console.error('Erro ao listar cartões:', err);
        res.status(500).json({ error: 'Erro ao buscar cartões de crédito' });
    }
});

router.post('/cartoes', async (req, res) => {
    try {
        const { nome, banco, bandeira, limite, diaFechamento, diaVencimento, cor, contaVinculadaId } = req.body;
        if (!nome || !banco || !diaFechamento || !diaVencimento) {
            return res.status(400).json({ error: 'Nome, banco, dia de fechamento e dia de vencimento são obrigatórios.' });
        }

        const novo = await prisma.cartaoCredito.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                banco: String(banco).trim(),
                bandeira: bandeira ? String(bandeira).trim() : 'Visa',
                limite: Number(limite) || 0,
                diaFechamento: Number(diaFechamento),
                diaVencimento: Number(diaVencimento),
                cor: cor || '#EEBB00',
                contaVinculadaId: contaVinculadaId ? Number(contaVinculadaId) : null
            }
        });
        res.status(201).json(novo);
    } catch (err) {
        console.error('Erro ao cadastrar cartão:', err);
        res.status(500).json({ error: 'Erro ao cadastrar cartão de crédito' });
    }
});

router.put('/cartoes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existente = await prisma.cartaoCredito.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Cartão não encontrado' });

        const { nome, banco, bandeira, limite, diaFechamento, diaVencimento, cor, contaVinculadaId, ativo } = req.body;
        const atualizado = await prisma.cartaoCredito.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                banco: banco ? String(banco).trim() : existente.banco,
                bandeira: bandeira ? String(bandeira).trim() : existente.bandeira,
                limite: limite !== undefined ? Number(limite) || 0 : existente.limite,
                diaFechamento: diaFechamento ? Number(diaFechamento) : existente.diaFechamento,
                diaVencimento: diaVencimento ? Number(diaVencimento) : existente.diaVencimento,
                cor: cor || existente.cor,
                contaVinculadaId: contaVinculadaId !== undefined ? (contaVinculadaId ? Number(contaVinculadaId) : null) : existente.contaVinculadaId,
                ativo: ativo !== undefined ? Boolean(ativo) : existente.ativo
            }
        });
        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar cartão:', err);
        res.status(500).json({ error: 'Erro ao atualizar cartão de crédito' });
    }
});

router.delete('/cartoes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.cartaoCredito.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Cartão não encontrado' });
        res.json({ success: true, message: 'Cartão excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir cartão:', err);
        res.status(500).json({ error: 'Erro ao excluir cartão de crédito' });
    }
});

// =========================================================
// CATEGORIAS FINANCEIRAS
// GET/POST/PUT/DELETE /api/financas/categorias
// =========================================================

router.get('/categorias', async (req, res) => {
    try {
        const categorias = await prisma.categoriaFinanceira.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { nome: 'asc' }
        });
        res.json(categorias);
    } catch (err) {
        console.error('Erro ao listar categorias:', err);
        res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
});

router.post('/categorias', async (req, res) => {
    try {
        const { nome, tipo, cor, orcamentoMensal } = req.body;
        if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

        const nova = await prisma.categoriaFinanceira.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                tipo: tipo ? String(tipo).trim() : 'Despesa',
                cor: cor || '#A0A0A0',
                orcamentoMensal: orcamentoMensal !== undefined && orcamentoMensal !== '' ? Number(orcamentoMensal) : null
            }
        });
        res.status(201).json(nova);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Já existe uma categoria com esse nome e tipo.' });
        console.error('Erro ao cadastrar categoria:', err);
        res.status(500).json({ error: 'Erro ao cadastrar categoria' });
    }
});

router.put('/categorias/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existente = await prisma.categoriaFinanceira.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Categoria não encontrada' });

        const { nome, tipo, cor, orcamentoMensal } = req.body;
        const atualizada = await prisma.categoriaFinanceira.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                tipo: tipo ? String(tipo).trim() : existente.tipo,
                cor: cor || existente.cor,
                orcamentoMensal: orcamentoMensal !== undefined ? (orcamentoMensal !== '' ? Number(orcamentoMensal) : null) : existente.orcamentoMensal
            }
        });
        res.json(atualizada);
    } catch (err) {
        console.error('Erro ao atualizar categoria:', err);
        res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
});

router.delete('/categorias/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.categoriaFinanceira.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
        res.json({ success: true, message: 'Categoria excluída com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir categoria:', err);
        res.status(500).json({ error: 'Erro ao excluir categoria' });
    }
});

// =========================================================
// TRANSAÇÕES (Receitas, Despesas e Transferências)
// GET/POST/PUT/DELETE /api/financas/transacoes
// =========================================================

router.get('/transacoes', async (req, res) => {
    try {
        const { mes, ano, tipo, categoriaId, contaId, cartaoId, formaPagamento } = req.query;
        const where = { usuarioId: req.session.userId };

        if (tipo) where.tipo = tipo;
        if (categoriaId) where.categoriaId = Number(categoriaId);
        if (contaId) where.contaId = Number(contaId);
        if (cartaoId) where.cartaoId = Number(cartaoId);
        if (formaPagamento) where.formaPagamento = formaPagamento;
        if (mes && ano) {
            const inicio = new Date(Date.UTC(Number(ano), Number(mes) - 1, 1));
            const fim = new Date(Date.UTC(Number(ano), Number(mes), 0, 23, 59, 59, 999));
            where.data = { gte: inicio, lte: fim };
        }

        const transacoes = await prisma.transacao.findMany({
            where,
            include: { categoria: true, conta: true, cartao: true, fatura: true },
            orderBy: { data: 'desc' }
        });
        res.json(transacoes);
    } catch (err) {
        console.error('Erro ao listar transações:', err);
        res.status(500).json({ error: 'Erro ao buscar transações' });
    }
});

router.post('/transacoes', async (req, res) => {
    try {
        const {
            tipo, descricao, valor, data, formaPagamento, status, recorrente,
            categoriaId, contaId, contaDestinoId, cartaoId, parcelaTotal, parcelaAtual
        } = req.body;

        if (!tipo || !descricao || !valor || !data) {
            return res.status(400).json({ error: 'Tipo, descrição, valor e data são obrigatórios.' });
        }
        if (tipo === 'Transferencia' && (!contaId || !contaDestinoId)) {
            return res.status(400).json({ error: 'Transferência exige conta de origem e de destino.' });
        }

        const base = {
            usuarioId: req.session.userId,
            tipo,
            descricao: String(descricao).trim(),
            formaPagamento: tipo === 'Transferencia' ? 'Transferência' : (formaPagamento || 'Débito'),
            status: status || 'Pago',
            recorrente: Boolean(recorrente),
            categoriaId: categoriaId ? Number(categoriaId) : null,
            contaId: contaId ? Number(contaId) : null,
            contaDestinoId: contaDestinoId ? Number(contaDestinoId) : null,
            cartaoId: cartaoId ? Number(cartaoId) : null
        };

        const ehCredito = base.formaPagamento === 'Crédito' && base.cartaoId;
        const numParcelas = ehCredito && parcelaTotal ? Math.max(1, Number(parcelaTotal)) : 1;
        const parcelaInicial = ehCredito && parcelaAtual ? Math.min(Math.max(1, Number(parcelaAtual)), numParcelas) : 1;

        if (!ehCredito || numParcelas === 1) {
            let faturaId = null;
            if (ehCredito) {
                const cartao = await prisma.cartaoCredito.findFirst({ where: { id: base.cartaoId, usuarioId: req.session.userId } });
                if (!cartao) return res.status(404).json({ error: 'Cartão não encontrado' });
                const { mes, ano } = calcularCompetencia(data, cartao.diaFechamento);
                const fatura = await obterOuCriarFatura(cartao, mes, ano);
                faturaId = fatura.id;
            }
            const criada = await prisma.transacao.create({
                data: { ...base, valor: Number(valor), data: new Date(data), faturaId }
            });
            return res.status(201).json(criada);
        }

        // Compra parcelada: gera N transações, cada uma na fatura do mês correspondente.
        const cartao = await prisma.cartaoCredito.findFirst({ where: { id: base.cartaoId, usuarioId: req.session.userId } });
        if (!cartao) return res.status(404).json({ error: 'Cartão não encontrado' });

        // Valor informado é o valor TOTAL da compra: cada parcela recebe uma fração igual,
        // e a última absorve o arredondamento. Se a compra já está parcialmente paga
        // (parcelaInicial > 1), só as parcelas de parcelaInicial em diante são lançadas —
        // as anteriores já foram pagas antes de existir o registro no sistema.
        const valorTotal = Number(valor);
        const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;
        const grupoParcelamentoId = crypto.randomUUID();
        const criadas = [];

        for (let n = parcelaInicial; n <= numParcelas; n++) {
            const dataParcela = new Date(data);
            dataParcela.setUTCMonth(dataParcela.getUTCMonth() + (n - parcelaInicial));

            const { mes, ano } = calcularCompetencia(dataParcela, cartao.diaFechamento);
            const fatura = await obterOuCriarFatura(cartao, mes, ano);

            const ehUltima = n === numParcelas;
            const valorDaVez = ehUltima ? Math.round((valorTotal - valorParcela * (numParcelas - 1)) * 100) / 100 : valorParcela;

            const criada = await prisma.transacao.create({
                data: {
                    ...base,
                    valor: valorDaVez,
                    data: dataParcela,
                    faturaId: fatura.id,
                    grupoParcelamentoId,
                    parcelaAtual: n,
                    parcelaTotal: numParcelas,
                    descricao: `${base.descricao} (${n}/${numParcelas})`
                }
            });
            criadas.push(criada);
        }

        res.status(201).json(criadas);
    } catch (err) {
        console.error('Erro ao cadastrar transação:', err);
        res.status(500).json({ error: 'Erro ao cadastrar transação' });
    }
});

router.put('/transacoes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existente = await prisma.transacao.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Transação não encontrada' });

        const { descricao, valor, data, status, categoriaId, contaId, contaDestinoId } = req.body;

        const novaData = data ? new Date(data) : existente.data;
        let faturaId = existente.faturaId;

        // Se a transação é no crédito e a data mudou, reatribui a fatura correspondente.
        if (existente.formaPagamento === 'Crédito' && existente.cartaoId && data) {
            const cartao = await prisma.cartaoCredito.findUnique({ where: { id: existente.cartaoId } });
            const { mes, ano } = calcularCompetencia(novaData, cartao.diaFechamento);
            const fatura = await obterOuCriarFatura(cartao, mes, ano);
            faturaId = fatura.id;
        }

        const atualizada = await prisma.transacao.update({
            where: { id },
            data: {
                descricao: descricao ? String(descricao).trim() : existente.descricao,
                valor: valor !== undefined ? Number(valor) || 0 : existente.valor,
                data: novaData,
                status: status || existente.status,
                categoriaId: categoriaId !== undefined ? (categoriaId ? Number(categoriaId) : null) : existente.categoriaId,
                contaId: contaId !== undefined ? (contaId ? Number(contaId) : null) : existente.contaId,
                contaDestinoId: contaDestinoId !== undefined ? (contaDestinoId ? Number(contaDestinoId) : null) : existente.contaDestinoId,
                faturaId
            }
        });
        res.json(atualizada);
    } catch (err) {
        console.error('Erro ao atualizar transação:', err);
        res.status(500).json({ error: 'Erro ao atualizar transação' });
    }
});

router.delete('/transacoes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const existente = await prisma.transacao.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Transação não encontrada' });

        // ?todasParcelas=true remove todas as parcelas da mesma compra, não só a selecionada.
        if (req.query.todasParcelas === 'true' && existente.grupoParcelamentoId) {
            const resultado = await prisma.transacao.deleteMany({
                where: { grupoParcelamentoId: existente.grupoParcelamentoId, usuarioId: req.session.userId }
            });
            return res.json({ success: true, message: `${resultado.count} parcela(s) excluída(s)` });
        }

        await prisma.transacao.delete({ where: { id } });
        res.json({ success: true, message: 'Transação excluída com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir transação:', err);
        res.status(500).json({ error: 'Erro ao excluir transação' });
    }
});

// =========================================================
// FATURAS DE CARTÃO
// GET /api/financas/faturas | GET /:id | POST /:id/pagar
// =========================================================

router.get('/faturas', async (req, res) => {
    try {
        const { cartaoId, status } = req.query;
        const where = { cartao: { usuarioId: req.session.userId } };
        if (cartaoId) where.cartaoId = Number(cartaoId);
        if (status) where.status = status;

        const faturas = await prisma.faturaCartao.findMany({
            where,
            include: { cartao: true, transacoes: true },
            orderBy: [{ anoReferencia: 'desc' }, { mesReferencia: 'desc' }]
        });

        const comTotal = faturas.map(f => ({
            ...f,
            valorTotal: f.transacoes.reduce((s, t) => s + t.valor, 0)
        }));
        res.json(comTotal);
    } catch (err) {
        console.error('Erro ao listar faturas:', err);
        res.status(500).json({ error: 'Erro ao buscar faturas' });
    }
});

router.get('/faturas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const fatura = await prisma.faturaCartao.findFirst({
            where: { id, cartao: { usuarioId: req.session.userId } },
            include: { cartao: true, transacoes: { include: { categoria: true }, orderBy: { data: 'asc' } } }
        });
        if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });

        res.json({ ...fatura, valorTotal: fatura.transacoes.reduce((s, t) => s + t.valor, 0) });
    } catch (err) {
        console.error('Erro ao buscar fatura:', err);
        res.status(500).json({ error: 'Erro ao buscar fatura' });
    }
});

/**
 * ROTA: Pagar Fatura
 * Marca a fatura como Paga e, opcionalmente, lança uma Despesa em débito na conta vinculada
 * ao cartão com o valor total da fatura.
 * POST /api/financas/faturas/:id/pagar
 */
router.post('/faturas/:id/pagar', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const fatura = await prisma.faturaCartao.findFirst({
            where: { id, cartao: { usuarioId: req.session.userId } },
            include: { cartao: true, transacoes: true }
        });
        if (!fatura) return res.status(404).json({ error: 'Fatura não encontrada' });

        const valorTotal = fatura.transacoes.reduce((s, t) => s + t.valor, 0);
        const { debitarDeConta } = req.body;

        const atualizada = await prisma.faturaCartao.update({
            where: { id },
            data: { status: 'Paga', dataPagamento: new Date() }
        });

        if (debitarDeConta && fatura.cartao.contaVinculadaId && valorTotal > 0) {
            await prisma.transacao.create({
                data: {
                    usuarioId: req.session.userId,
                    tipo: 'Despesa',
                    descricao: `Pagamento fatura ${fatura.cartao.nome} (${String(fatura.mesReferencia).padStart(2, '0')}/${fatura.anoReferencia})`,
                    valor: valorTotal,
                    data: new Date(),
                    formaPagamento: 'Débito',
                    status: 'Pago',
                    contaId: fatura.cartao.contaVinculadaId
                }
            });
        }

        res.json(atualizada);
    } catch (err) {
        console.error('Erro ao pagar fatura:', err);
        res.status(500).json({ error: 'Erro ao registrar pagamento da fatura' });
    }
});

// =========================================================
// RESUMO / DASHBOARD DO MÓDULO
// GET /api/financas/resumo
// =========================================================

router.get('/resumo', async (req, res) => {
    try {
        const usuarioId = req.session.userId;
        const agora = new Date();
        const mesAtual = agora.getUTCMonth() + 1;
        const anoAtual = agora.getUTCFullYear();

        const [contas, cartoes, categorias, transacoes] = await Promise.all([
            prisma.contaBancaria.findMany({ where: { usuarioId } }),
            prisma.cartaoCredito.findMany({ where: { usuarioId }, include: { faturas: { where: { status: { not: 'Paga' } }, include: { transacoes: true } } } }),
            prisma.categoriaFinanceira.findMany({ where: { usuarioId } }),
            prisma.transacao.findMany({ where: { usuarioId }, include: { categoria: true } })
        ]);

        // Saldo total das contas (mesma regra usada em GET /contas).
        const pagas = transacoes.filter(t => t.status === 'Pago');
        const saldoTotal = contas.reduce((total, conta) => {
            let saldo = conta.saldoInicial;
            pagas.forEach(t => {
                if (t.tipo === 'Transferencia') {
                    if (t.contaId === conta.id) saldo -= t.valor;
                    if (t.contaDestinoId === conta.id) saldo += t.valor;
                } else if (t.contaId === conta.id && t.formaPagamento !== 'Crédito') {
                    saldo += t.tipo === 'Receita' ? t.valor : -t.valor;
                }
            });
            return total + saldo;
        }, 0);

        const transacoesMes = transacoes.filter(t => {
            const d = new Date(t.data);
            return d.getUTCMonth() + 1 === mesAtual && d.getUTCFullYear() === anoAtual;
        });
        const receitaMes = transacoesMes.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor, 0);
        const despesaMes = transacoesMes.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor, 0);

        const gastoPorCategoria = {};
        transacoesMes.filter(t => t.tipo === 'Despesa').forEach(t => {
            const nome = t.categoria ? t.categoria.nome : 'Sem categoria';
            gastoPorCategoria[nome] = (gastoPorCategoria[nome] || 0) + t.valor;
        });

        const orcamentos = categorias
            .filter(c => c.orcamentoMensal)
            .map(c => ({
                categoriaId: c.id,
                nome: c.nome,
                orcamentoMensal: c.orcamentoMensal,
                gastoAtual: gastoPorCategoria[c.nome] || 0
            }));

        const faturasAbertas = cartoes.map(cartao => {
            const faturaAtual = cartao.faturas.find(f => f.mesReferencia === mesAtual && f.anoReferencia === anoAtual)
                || cartao.faturas[0] || null;
            return {
                cartaoId: cartao.id,
                nome: cartao.nome,
                cor: cartao.cor,
                fatura: faturaAtual ? {
                    id: faturaAtual.id,
                    mesReferencia: faturaAtual.mesReferencia,
                    anoReferencia: faturaAtual.anoReferencia,
                    dataVencimento: faturaAtual.dataVencimento,
                    status: faturaAtual.status,
                    valorTotal: faturaAtual.transacoes.reduce((s, t) => s + t.valor, 0)
                } : null
            };
        });

        // Evolução dos últimos 6 meses (incluindo o atual).
        const evolucaoMensal = [];
        for (let i = 5; i >= 0; i--) {
            const ref = new Date(Date.UTC(anoAtual, mesAtual - 1 - i, 1));
            const m = ref.getUTCMonth() + 1;
            const a = ref.getUTCFullYear();
            const doMes = transacoes.filter(t => {
                const d = new Date(t.data);
                return d.getUTCMonth() + 1 === m && d.getUTCFullYear() === a;
            });
            evolucaoMensal.push({
                mes: m,
                ano: a,
                receita: doMes.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor, 0),
                despesa: doMes.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor, 0)
            });
        }

        res.json({
            saldoTotal,
            receitaMes,
            despesaMes,
            resultadoMes: receitaMes - despesaMes,
            gastoPorCategoria,
            orcamentos,
            faturasAbertas,
            evolucaoMensal
        });
    } catch (err) {
        console.error('Erro ao calcular resumo financeiro:', err);
        res.status(500).json({ error: 'Erro ao calcular resumo financeiro' });
    }
});

module.exports = router;
