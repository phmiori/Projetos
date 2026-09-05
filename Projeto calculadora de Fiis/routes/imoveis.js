const express = require('express');
const prisma = require('../lib/prisma');
const { calcularMetricasImovel } = require('../lib/calc');

const router = express.Router();

/**
 * Recalcula e atualiza as somas de gastos do imóvel com base na tabela GastoImovel
 */
async function recalcularGastosImovel(imovelId) {
    const imovel = await prisma.imovelLeilao.findUnique({
        where: { id: imovelId },
        include: { gastos: true }
    });

    if (!imovel) return null;

    let gastoReforma = 0;
    let gastoAcabamento = 0;
    let gastoLimpeza = 0;
    let gastoDocumentacao = 0;
    let custasProcessuais = 0;
    let custoDesocupacao = 0;

    imovel.gastos.forEach(g => {
        const cat = g.categoria || '';
        const val = Number(g.valor) || 0;

        if (cat.includes('Reforma')) {
            gastoReforma += val;
        } else if (cat.includes('Acabamento') || cat.includes('Pintura')) {
            gastoAcabamento += val;
        } else if (cat.includes('Limpeza')) {
            gastoLimpeza += val;
        } else if (cat.includes('Documentação') || cat.includes('Documentacao') || cat.includes('Cartório') || cat.includes('Cartorio')) {
            gastoDocumentacao += val;
        } else if (cat.includes('Desocupação') || cat.includes('Desocupacao')) {
            custoDesocupacao += val;
        } else if (cat.includes('Taxa') || cat.includes('Processual') || cat.includes('Leilão') || cat.includes('Leilao')) {
            custasProcessuais += val;
        } else {
            gastoReforma += val; // fallback
        }
    });

    const valorArremate = imovel.valorArremate || 0;
    const comissaoPct = imovel.comissaoPct || 5;
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + custasProcessuais + custoDesocupacao;
    const totalPreparacao = gastoReforma + gastoAcabamento + gastoLimpeza + gastoDocumentacao;
    const custoTotal = totalAquisicao + totalPreparacao;

    let lucroBruto = null;
    let roiPct = null;
    if (imovel.valorVenda !== null && imovel.valorVenda > 0) {
        lucroBruto = imovel.valorVenda - custoTotal;
        roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
    }

    return await prisma.imovelLeilao.update({
        where: { id: imovelId },
        data: {
            custasProcessuais,
            custoDesocupacao,
            totalAquisicao,
            gastoReforma,
            gastoAcabamento,
            gastoLimpeza,
            gastoDocumentacao,
            totalPreparacao,
            custoTotal,
            lucroBruto,
            roiPct
        },
        include: { gastos: { orderBy: { data: 'asc' } } }
    });
}

/**
 * ROTA: Listar Imóveis de Leilão (com gastos incluídos)
 * GET /api/imoveis?status=...&search=...
 */
router.get('/', async (req, res) => {
    try {
        const { status, search } = req.query;
        const where = { usuarioId: req.session.userId };

        if (status && status !== 'Todos') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { endereco: { contains: search, mode: 'insensitive' } },
                { cidade: { contains: search, mode: 'insensitive' } },
                { matricula: { contains: search, mode: 'insensitive' } },
                { origem: { contains: search, mode: 'insensitive' } },
                { leiloeiro: { contains: search, mode: 'insensitive' } }
            ];
        }

        const imoveis = await prisma.imovelLeilao.findMany({
            where,
            include: { gastos: { orderBy: { data: 'asc' } } },
            orderBy: { createdAt: 'desc' }
        });

        res.json(imoveis);
    } catch (err) {
        console.error('Erro ao listar imóveis:', err);
        res.status(500).json({ error: 'Erro ao buscar imóveis' });
    }
});

/**
 * ROTA: Obter Imóvel por ID com seus Gastos
 * GET /api/imoveis/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const imovel = await prisma.imovelLeilao.findFirst({
            where: { id, usuarioId: req.session.userId },
            include: { gastos: { orderBy: { data: 'asc' } } }
        });

        if (!imovel) {
            return res.status(404).json({ error: 'Imóvel não encontrado' });
        }

        res.json(imovel);
    } catch (err) {
        console.error('Erro ao buscar imóvel:', err);
        res.status(500).json({ error: 'Erro ao buscar imóvel' });
    }
});

/**
 * ROTA: Cadastrar Imóvel
 * POST /api/imoveis
 */
router.post('/', async (req, res) => {
    try {
        const dadosCalculados = calcularMetricasImovel(req.body);

        if (!dadosCalculados.endereco) {
            return res.status(400).json({ error: 'Endereço é obrigatório.' });
        }

        const novoImovel = await prisma.imovelLeilao.create({
            data: { ...dadosCalculados, usuarioId: req.session.userId },
            include: { gastos: true }
        });

        res.status(201).json(novoImovel);
    } catch (err) {
        console.error('Erro ao cadastrar imóvel:', err);
        res.status(500).json({ error: 'Erro ao cadastrar imóvel' });
    }
});

/**
 * ROTA: Atualizar Imóvel
 * PUT /api/imoveis/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dadosCalculados = calcularMetricasImovel(req.body);

        const imovelExistente = await prisma.imovelLeilao.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!imovelExistente) {
            return res.status(404).json({ error: 'Imóvel não encontrado' });
        }

        const imovelAtualizado = await prisma.imovelLeilao.update({
            where: { id },
            data: dadosCalculados,
            include: { gastos: { orderBy: { data: 'asc' } } }
        });

        res.json(imovelAtualizado);
    } catch (err) {
        console.error('Erro ao atualizar imóvel:', err);
        res.status(500).json({ error: 'Erro ao atualizar imóvel' });
    }
});

/**
 * ROTA: Listar Gastos de um Imóvel
 * GET /api/imoveis/:id/gastos
 */
router.get('/:id/gastos', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const imovel = await prisma.imovelLeilao.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!imovel) {
            return res.status(404).json({ error: 'Imóvel não encontrado' });
        }

        const gastos = await prisma.gastoImovel.findMany({
            where: { imovelId: id },
            orderBy: { data: 'asc' }
        });

        res.json(gastos);
    } catch (err) {
        console.error('Erro ao listar gastos:', err);
        res.status(500).json({ error: 'Erro ao buscar gastos do imóvel' });
    }
});

/**
 * ROTA: Lançar Novo Gasto / Serviço para um Imóvel
 * POST /api/imoveis/:id/gastos
 */
router.post('/:id/gastos', async (req, res) => {
    try {
        const imovelId = parseInt(req.params.id, 10);
        const { data, categoria, descricao, fornecedor, valor } = req.body;

        const imovel = await prisma.imovelLeilao.findFirst({
            where: { id: imovelId, usuarioId: req.session.userId }
        });
        if (!imovel) {
            return res.status(404).json({ error: 'Imóvel não encontrado' });
        }

        if (!categoria || !descricao || valor === undefined) {
            return res.status(400).json({ error: 'Categoria, descrição e valor são obrigatórios.' });
        }

        const dataGasto = data ? new Date(data) : new Date();

        const novoGasto = await prisma.gastoImovel.create({
            data: {
                imovelId,
                data: dataGasto,
                categoria: String(categoria).trim(),
                descricao: String(descricao).trim(),
                fornecedor: fornecedor ? String(fornecedor).trim() : null,
                valor: Number(valor) || 0
            }
        });

        // Recalcular os totais consolidados no imóvel
        const imovelAtualizado = await recalcularGastosImovel(imovelId);

        res.status(201).json({
            success: true,
            gasto: novoGasto,
            imovel: imovelAtualizado
        });
    } catch (err) {
        console.error('Erro ao lançar gasto:', err);
        res.status(500).json({ error: 'Erro ao cadastrar gasto do imóvel' });
    }
});

/**
 * ROTA: Excluir Gasto Específico de um Imóvel
 * DELETE /api/imoveis/:id/gastos/:gastoId
 */
router.delete('/:id/gastos/:gastoId', async (req, res) => {
    try {
        const imovelId = parseInt(req.params.id, 10);
        const gastoId = parseInt(req.params.gastoId, 10);

        const imovel = await prisma.imovelLeilao.findFirst({
            where: { id: imovelId, usuarioId: req.session.userId }
        });
        if (!imovel) {
            return res.status(404).json({ error: 'Imóvel não encontrado' });
        }

        await prisma.gastoImovel.delete({
            where: { id: gastoId }
        });

        // Recalcular os totais consolidados no imóvel
        const imovelAtualizado = await recalcularGastosImovel(imovelId);

        res.json({
            success: true,
            message: 'Gasto removido com sucesso',
            imovel: imovelAtualizado
        });
    } catch (err) {
        console.error('Erro ao excluir gasto:', err);
        res.status(500).json({ error: 'Erro ao excluir gasto do imóvel' });
    }
});

/**
 * ROTA: Atualizar Venda / Preço Rapidamente
 * POST /api/imoveis/:id/vender
 */
router.post('/:id/vender', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { valorVenda, dataVenda, precoAnuncio, status } = req.body;

        const imovel = await prisma.imovelLeilao.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!imovel) return res.status(404).json({ error: 'Imóvel não encontrado' });

        const novoStatus = status || 'Vendido';
        const vVenda = Number(valorVenda) || null;
        const custoTotal = imovel.custoTotal || 0;
        let lucroBruto = null;
        let roiPct = null;

        if (vVenda !== null && vVenda > 0) {
            lucroBruto = vVenda - custoTotal;
            roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
        }

        const atualizado = await prisma.imovelLeilao.update({
            where: { id },
            data: {
                status: novoStatus,
                valorVenda: vVenda,
                precoAnuncio: precoAnuncio ? Number(precoAnuncio) : imovel.precoAnuncio,
                dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
                lucroBruto,
                roiPct
            },
            include: { gastos: { orderBy: { data: 'asc' } } }
        });

        res.json({ success: true, imovel: atualizado });
    } catch (err) {
        console.error('Erro ao registrar venda:', err);
        res.status(500).json({ error: 'Erro ao registrar venda do imóvel' });
    }
});

/**
 * ROTA: Excluir Imóvel
 * DELETE /api/imoveis/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.imovelLeilao.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Imóvel não encontrado' });
        }

        res.json({ success: true, message: 'Imóvel excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir imóvel:', err);
        res.status(500).json({ error: 'Erro ao excluir imóvel' });
    }
});

module.exports = router;
