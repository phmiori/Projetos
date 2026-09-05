const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * ROTA: Listar Veículos da Garagem Pessoal (com manutenções incluídas)
 * GET /api/garagem/veiculos?status=&search=
 */
router.get('/veiculos', async (req, res) => {
    try {
        const { status, search } = req.query;
        const where = { usuarioId: req.session.userId };

        if (status && status !== 'Todos') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { modelo: { contains: search, mode: 'insensitive' } },
                { marca: { contains: search, mode: 'insensitive' } },
                { placa: { contains: search, mode: 'insensitive' } }
            ];
        }

        const veiculos = await prisma.veiculoGaragem.findMany({
            where,
            include: { manutencoes: { orderBy: { data: 'desc' } } },
            orderBy: { createdAt: 'desc' }
        });

        res.json(veiculos);
    } catch (err) {
        console.error('Erro ao listar veículos da garagem:', err);
        res.status(500).json({ error: 'Erro ao buscar veículos da garagem' });
    }
});

/**
 * ROTA: Cadastrar Veículo na Garagem
 * POST /api/garagem/veiculos
 */
router.post('/veiculos', async (req, res) => {
    try {
        const { marca, modelo, ano, placa, cor, quilometragem, dataCompra, valorCompra, status, dataVenda, valorVenda, observacoes } = req.body;

        if (!marca || !modelo || !dataCompra) {
            return res.status(400).json({ error: 'Marca, modelo e data de compra são obrigatórios.' });
        }

        const novoVeiculo = await prisma.veiculoGaragem.create({
            data: {
                usuarioId: req.session.userId,
                marca: String(marca).trim(),
                modelo: String(modelo).trim(),
                ano: parseInt(ano, 10) || new Date().getFullYear(),
                placa: placa ? String(placa).trim().toUpperCase() : null,
                cor: cor ? String(cor).trim() : null,
                quilometragem: quilometragem !== undefined && quilometragem !== '' ? Number(quilometragem) : null,
                dataCompra: new Date(dataCompra),
                valorCompra: Number(valorCompra) || 0,
                status: status ? String(status).trim() : 'Ativo',
                dataVenda: dataVenda ? new Date(dataVenda) : null,
                valorVenda: valorVenda !== undefined && valorVenda !== '' ? Number(valorVenda) : null,
                observacoes: observacoes ? String(observacoes).trim() : null
            },
            include: { manutencoes: true }
        });

        res.status(201).json(novoVeiculo);
    } catch (err) {
        console.error('Erro ao cadastrar veículo da garagem:', err);
        res.status(500).json({ error: 'Erro ao cadastrar veículo da garagem' });
    }
});

/**
 * ROTA: Atualizar Veículo da Garagem
 * PUT /api/garagem/veiculos/:id
 */
router.put('/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { marca, modelo, ano, placa, cor, quilometragem, dataCompra, valorCompra, status, dataVenda, valorVenda, observacoes } = req.body;

        const existente = await prisma.veiculoGaragem.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Veículo não encontrado' });

        const atualizado = await prisma.veiculoGaragem.update({
            where: { id },
            data: {
                marca: marca ? String(marca).trim() : existente.marca,
                modelo: modelo ? String(modelo).trim() : existente.modelo,
                ano: ano !== undefined ? (parseInt(ano, 10) || existente.ano) : existente.ano,
                placa: placa !== undefined ? (placa ? String(placa).trim().toUpperCase() : null) : existente.placa,
                cor: cor !== undefined ? (cor ? String(cor).trim() : null) : existente.cor,
                quilometragem: quilometragem !== undefined ? (quilometragem !== '' ? Number(quilometragem) : null) : existente.quilometragem,
                dataCompra: dataCompra ? new Date(dataCompra) : existente.dataCompra,
                valorCompra: valorCompra !== undefined ? Number(valorCompra) || 0 : existente.valorCompra,
                status: status ? String(status).trim() : existente.status,
                dataVenda: dataVenda !== undefined ? (dataVenda ? new Date(dataVenda) : null) : existente.dataVenda,
                valorVenda: valorVenda !== undefined ? (valorVenda !== '' ? Number(valorVenda) : null) : existente.valorVenda,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            },
            include: { manutencoes: { orderBy: { data: 'desc' } } }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar veículo da garagem:', err);
        res.status(500).json({ error: 'Erro ao atualizar veículo da garagem' });
    }
});

/**
 * ROTA: Excluir Veículo da Garagem (e suas manutenções em cascata)
 * DELETE /api/garagem/veiculos/:id
 */
router.delete('/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.veiculoGaragem.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Veículo não encontrado' });
        res.json({ success: true, message: 'Veículo excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir veículo da garagem:', err);
        res.status(500).json({ error: 'Erro ao excluir veículo da garagem' });
    }
});

/**
 * ROTA: Lançar Manutenção em um Veículo da Garagem
 * POST /api/garagem/veiculos/:id/manutencoes
 */
router.post('/veiculos/:id/manutencoes', async (req, res) => {
    try {
        const veiculoId = parseInt(req.params.id, 10);
        const { data, categoria, descricao, valor, oficina, quilometragem } = req.body;

        const veiculo = await prisma.veiculoGaragem.findFirst({ where: { id: veiculoId, usuarioId: req.session.userId } });
        if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });

        if (!categoria || !descricao || valor === undefined) {
            return res.status(400).json({ error: 'Categoria, descrição e valor são obrigatórios.' });
        }

        const novaManutencao = await prisma.manutencaoGaragem.create({
            data: {
                veiculoId,
                data: data ? new Date(data) : new Date(),
                categoria: String(categoria).trim(),
                descricao: String(descricao).trim(),
                valor: Number(valor) || 0,
                oficina: oficina ? String(oficina).trim() : null,
                quilometragem: quilometragem !== undefined && quilometragem !== '' ? Number(quilometragem) : null
            }
        });

        const veiculoAtualizado = await prisma.veiculoGaragem.findUnique({
            where: { id: veiculoId },
            include: { manutencoes: { orderBy: { data: 'desc' } } }
        });

        res.status(201).json({ success: true, manutencao: novaManutencao, veiculo: veiculoAtualizado });
    } catch (err) {
        console.error('Erro ao lançar manutenção:', err);
        res.status(500).json({ error: 'Erro ao cadastrar manutenção do veículo' });
    }
});

/**
 * ROTA: Atualizar Manutenção de um Veículo da Garagem
 * PUT /api/garagem/manutencoes/:id
 */
router.put('/manutencoes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { data, categoria, descricao, valor, oficina, quilometragem } = req.body;

        const existente = await prisma.manutencaoGaragem.findFirst({
            where: { id, veiculo: { usuarioId: req.session.userId } }
        });
        if (!existente) return res.status(404).json({ error: 'Manutenção não encontrada' });

        const atualizada = await prisma.manutencaoGaragem.update({
            where: { id },
            data: {
                data: data ? new Date(data) : existente.data,
                categoria: categoria ? String(categoria).trim() : existente.categoria,
                descricao: descricao ? String(descricao).trim() : existente.descricao,
                valor: valor !== undefined ? Number(valor) || 0 : existente.valor,
                oficina: oficina !== undefined ? (oficina ? String(oficina).trim() : null) : existente.oficina,
                quilometragem: quilometragem !== undefined ? (quilometragem !== '' ? Number(quilometragem) : null) : existente.quilometragem
            }
        });

        res.json(atualizada);
    } catch (err) {
        console.error('Erro ao atualizar manutenção:', err);
        res.status(500).json({ error: 'Erro ao atualizar manutenção do veículo' });
    }
});

/**
 * ROTA: Excluir Manutenção de um Veículo da Garagem
 * DELETE /api/garagem/manutencoes/:id
 */
router.delete('/manutencoes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.manutencaoGaragem.deleteMany({
            where: { id, veiculo: { usuarioId: req.session.userId } }
        });
        if (resultado.count === 0) return res.status(404).json({ error: 'Manutenção não encontrada' });
        res.json({ success: true, message: 'Manutenção excluída com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir manutenção:', err);
        res.status(500).json({ error: 'Erro ao excluir manutenção do veículo' });
    }
});

module.exports = router;
