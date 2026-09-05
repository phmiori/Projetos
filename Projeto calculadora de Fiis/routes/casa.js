const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * ROTA: Listar Gastos da Casa (opcionalmente filtrado por mês/ano/categoria)
 * GET /api/casa/gastos?mes=&ano=&categoria=
 */
router.get('/gastos', async (req, res) => {
    try {
        const { mes, ano, categoria } = req.query;
        const where = { usuarioId: req.session.userId };

        if (categoria && categoria !== 'Todas') {
            where.categoria = categoria;
        }
        if (mes && ano) {
            const inicio = new Date(Number(ano), Number(mes) - 1, 1);
            const fim = new Date(Number(ano), Number(mes), 0, 23, 59, 59, 999);
            where.data = { gte: inicio, lte: fim };
        }

        const gastos = await prisma.gastoCasa.findMany({ where, orderBy: { data: 'desc' } });
        res.json(gastos);
    } catch (err) {
        console.error('Erro ao listar gastos da casa:', err);
        res.status(500).json({ error: 'Erro ao buscar gastos da casa' });
    }
});

/**
 * ROTA: Cadastrar Gasto da Casa
 * POST /api/casa/gastos
 */
router.post('/gastos', async (req, res) => {
    try {
        const { categoria, descricao, valor, data, recorrente } = req.body;
        if (!categoria || !descricao || valor === undefined) {
            return res.status(400).json({ error: 'Categoria, descrição e valor são obrigatórios.' });
        }

        const novoGasto = await prisma.gastoCasa.create({
            data: {
                usuarioId: req.session.userId,
                categoria: String(categoria).trim(),
                descricao: String(descricao).trim(),
                valor: Number(valor) || 0,
                data: data ? new Date(data) : new Date(),
                recorrente: Boolean(recorrente)
            }
        });

        res.status(201).json(novoGasto);
    } catch (err) {
        console.error('Erro ao cadastrar gasto da casa:', err);
        res.status(500).json({ error: 'Erro ao cadastrar gasto da casa' });
    }
});

/**
 * ROTA: Atualizar Gasto da Casa
 * PUT /api/casa/gastos/:id
 */
router.put('/gastos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { categoria, descricao, valor, data, recorrente } = req.body;

        const existente = await prisma.gastoCasa.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Gasto não encontrado' });

        const atualizado = await prisma.gastoCasa.update({
            where: { id },
            data: {
                categoria: categoria ? String(categoria).trim() : existente.categoria,
                descricao: descricao ? String(descricao).trim() : existente.descricao,
                valor: valor !== undefined ? Number(valor) || 0 : existente.valor,
                data: data ? new Date(data) : existente.data,
                recorrente: recorrente !== undefined ? Boolean(recorrente) : existente.recorrente
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar gasto da casa:', err);
        res.status(500).json({ error: 'Erro ao atualizar gasto da casa' });
    }
});

/**
 * ROTA: Excluir Gasto da Casa
 * DELETE /api/casa/gastos/:id
 */
router.delete('/gastos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.gastoCasa.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Gasto não encontrado' });
        res.json({ success: true, message: 'Gasto excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir gasto da casa:', err);
        res.status(500).json({ error: 'Erro ao excluir gasto da casa' });
    }
});

/**
 * ROTA: Listar Itens da Despensa
 * GET /api/casa/despensa
 */
router.get('/despensa', async (req, res) => {
    try {
        const itens = await prisma.itemDespensa.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { nome: 'asc' }
        });
        res.json(itens);
    } catch (err) {
        console.error('Erro ao listar itens da despensa:', err);
        res.status(500).json({ error: 'Erro ao buscar itens da despensa' });
    }
});

/**
 * ROTA: Cadastrar Item da Despensa
 * POST /api/casa/despensa
 */
router.post('/despensa', async (req, res) => {
    try {
        const { nome, categoria, quantidade, unidade, quantidadeMinima, ultimaCompra } = req.body;
        if (!nome) {
            return res.status(400).json({ error: 'Nome é obrigatório.' });
        }

        const novoItem = await prisma.itemDespensa.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                categoria: categoria ? String(categoria).trim() : 'Outros',
                quantidade: Number(quantidade) || 0,
                unidade: unidade ? String(unidade).trim() : 'un',
                quantidadeMinima: Number(quantidadeMinima) || 0,
                ultimaCompra: ultimaCompra ? new Date(ultimaCompra) : null
            }
        });

        res.status(201).json(novoItem);
    } catch (err) {
        console.error('Erro ao cadastrar item da despensa:', err);
        res.status(500).json({ error: 'Erro ao cadastrar item da despensa' });
    }
});

/**
 * ROTA: Atualizar Item da Despensa
 * PUT /api/casa/despensa/:id
 */
router.put('/despensa/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { nome, categoria, quantidade, unidade, quantidadeMinima, ultimaCompra } = req.body;

        const existente = await prisma.itemDespensa.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Item não encontrado' });

        const atualizado = await prisma.itemDespensa.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                categoria: categoria ? String(categoria).trim() : existente.categoria,
                quantidade: quantidade !== undefined ? Number(quantidade) || 0 : existente.quantidade,
                unidade: unidade ? String(unidade).trim() : existente.unidade,
                quantidadeMinima: quantidadeMinima !== undefined ? Number(quantidadeMinima) || 0 : existente.quantidadeMinima,
                ultimaCompra: ultimaCompra !== undefined ? (ultimaCompra ? new Date(ultimaCompra) : null) : existente.ultimaCompra
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar item da despensa:', err);
        res.status(500).json({ error: 'Erro ao atualizar item da despensa' });
    }
});

/**
 * ROTA: Excluir Item da Despensa
 * DELETE /api/casa/despensa/:id
 */
router.delete('/despensa/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.itemDespensa.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Item não encontrado' });
        res.json({ success: true, message: 'Item excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir item da despensa:', err);
        res.status(500).json({ error: 'Erro ao excluir item da despensa' });
    }
});

/**
 * ROTA: Listar Tarefas & Manutenção da Casa
 * GET /api/casa/tarefas
 */
router.get('/tarefas', async (req, res) => {
    try {
        const tarefas = await prisma.tarefaCasa.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: [{ status: 'asc' }, { dataPrevista: 'asc' }]
        });
        res.json(tarefas);
    } catch (err) {
        console.error('Erro ao listar tarefas da casa:', err);
        res.status(500).json({ error: 'Erro ao buscar tarefas da casa' });
    }
});

/**
 * ROTA: Cadastrar Tarefa & Manutenção da Casa
 * POST /api/casa/tarefas
 */
router.post('/tarefas', async (req, res) => {
    try {
        const { titulo, descricao, categoria, prioridade, status, dataPrevista, custoEstimado, custoReal } = req.body;
        if (!titulo) {
            return res.status(400).json({ error: 'Título é obrigatório.' });
        }

        const novaTarefa = await prisma.tarefaCasa.create({
            data: {
                usuarioId: req.session.userId,
                titulo: String(titulo).trim(),
                descricao: descricao ? String(descricao).trim() : null,
                categoria: categoria ? String(categoria).trim() : 'Manutenção',
                prioridade: prioridade ? String(prioridade).trim() : 'Média',
                status: status ? String(status).trim() : 'Pendente',
                dataPrevista: dataPrevista ? new Date(dataPrevista) : null,
                custoEstimado: custoEstimado !== undefined && custoEstimado !== '' ? Number(custoEstimado) : null,
                custoReal: custoReal !== undefined && custoReal !== '' ? Number(custoReal) : null,
                concluidaEm: status === 'Concluída' ? new Date() : null
            }
        });

        res.status(201).json(novaTarefa);
    } catch (err) {
        console.error('Erro ao cadastrar tarefa da casa:', err);
        res.status(500).json({ error: 'Erro ao cadastrar tarefa da casa' });
    }
});

/**
 * ROTA: Atualizar Tarefa & Manutenção da Casa
 * Quando a tarefa é marcada como Concluída com um custo real e a flag
 * "lancarComoGasto" é enviada, um lançamento correspondente é criado
 * automaticamente em Gastos da Casa (categoria da própria tarefa).
 * PUT /api/casa/tarefas/:id
 */
router.put('/tarefas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { titulo, descricao, categoria, prioridade, status, dataPrevista, custoEstimado, custoReal, lancarComoGasto } = req.body;

        const existente = await prisma.tarefaCasa.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Tarefa não encontrada' });

        const novoStatus = status ? String(status).trim() : existente.status;
        const foiConcluidaAgora = novoStatus === 'Concluída' && existente.status !== 'Concluída';
        const novoCustoReal = custoReal !== undefined && custoReal !== '' ? Number(custoReal) : existente.custoReal;

        const atualizado = await prisma.tarefaCasa.update({
            where: { id },
            data: {
                titulo: titulo ? String(titulo).trim() : existente.titulo,
                descricao: descricao !== undefined ? (descricao ? String(descricao).trim() : null) : existente.descricao,
                categoria: categoria ? String(categoria).trim() : existente.categoria,
                prioridade: prioridade ? String(prioridade).trim() : existente.prioridade,
                status: novoStatus,
                dataPrevista: dataPrevista !== undefined ? (dataPrevista ? new Date(dataPrevista) : null) : existente.dataPrevista,
                custoEstimado: custoEstimado !== undefined ? (custoEstimado !== '' ? Number(custoEstimado) : null) : existente.custoEstimado,
                custoReal: novoCustoReal,
                concluidaEm: novoStatus === 'Concluída' ? (existente.concluidaEm || new Date()) : null
            }
        });

        if (foiConcluidaAgora && lancarComoGasto && novoCustoReal) {
            await prisma.gastoCasa.create({
                data: {
                    usuarioId: req.session.userId,
                    categoria: atualizado.categoria,
                    descricao: `Tarefa concluída: ${atualizado.titulo}`,
                    valor: novoCustoReal,
                    data: new Date(),
                    recorrente: false
                }
            });
        }

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar tarefa da casa:', err);
        res.status(500).json({ error: 'Erro ao atualizar tarefa da casa' });
    }
});

/**
 * ROTA: Excluir Tarefa & Manutenção da Casa
 * DELETE /api/casa/tarefas/:id
 */
router.delete('/tarefas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.tarefaCasa.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });
        res.json({ success: true, message: 'Tarefa excluída com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir tarefa da casa:', err);
        res.status(500).json({ error: 'Erro ao excluir tarefa da casa' });
    }
});

module.exports = router;
