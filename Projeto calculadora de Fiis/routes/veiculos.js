const express = require('express');
const prisma = require('../lib/prisma');
const { obterUsuarioIdsCompartilhadosLeilao } = require('../lib/leilao-shared');
const { calcularMetricas } = require('../lib/calc');

const router = express.Router();

/**
 * Recalcula e atualiza as somas de gastos do veículo com base na tabela GastoVeiculo
 */
async function recalcularGastosVeiculo(veiculoId) {
    const veiculo = await prisma.veiculo.findUnique({
        where: { id: veiculoId },
        include: { gastos: true }
    });

    if (!veiculo) return null;

    let gastoMecanica = 0;
    let gastoFunilaria = 0;
    let gastoEstetica = 0;
    let gastoDocumentacao = 0;
    let taxasPatio = 0;
    let custoGuincho = 0;

    veiculo.gastos.forEach(g => {
        const cat = g.categoria || '';
        const val = Number(g.valor) || 0;

        if (cat.includes('Mecânica') || cat.includes('Mecanica') || cat.includes('Oficina')) {
            gastoMecanica += val;
        } else if (cat.includes('Funilaria') || cat.includes('Pintura')) {
            gastoFunilaria += val;
        } else if (cat.includes('Estética') || cat.includes('Estetica') || cat.includes('Higienização')) {
            gastoEstetica += val;
        } else if (cat.includes('Documentação') || cat.includes('Documentacao') || cat.includes('Detran') || cat.includes('IPVA')) {
            gastoDocumentacao += val;
        } else if (cat.includes('Guincho')) {
            custoGuincho += val;
        } else if (cat.includes('Taxa') || cat.includes('Pátio') || cat.includes('Patio') || cat.includes('Leiloeiro')) {
            taxasPatio += val;
        } else {
            gastoMecanica += val; // fallback
        }
    });

    const valorArremate = veiculo.valorArremate || 0;
    const comissaoPct = veiculo.comissaoPct || 5;
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + taxasPatio + custoGuincho;
    const totalPreparacao = gastoMecanica + gastoFunilaria + gastoEstetica + gastoDocumentacao;
    const custoTotal = totalAquisicao + totalPreparacao;

    let lucroBruto = null;
    let roiPct = null;
    if (veiculo.valorVenda !== null && veiculo.valorVenda > 0) {
        lucroBruto = veiculo.valorVenda - custoTotal;
        roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
    }

    return await prisma.veiculo.update({
        where: { id: veiculoId },
        data: {
            taxasPatio,
            custoGuincho,
            totalAquisicao,
            gastoMecanica,
            gastoFunilaria,
            gastoEstetica,
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
 * ROTA: Listar Veículos (com gastos incluídos)
 * GET /api/veiculos?status=...&search=...
 */
router.get('/', async (req, res) => {
    try {
        const { status, search } = req.query;
        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const where = { usuarioId: { in: usuarioIds } };

        if (status && status !== 'Todos') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { modelo: { contains: search, mode: 'insensitive' } },
                { marca: { contains: search, mode: 'insensitive' } },
                { placa: { contains: search, mode: 'insensitive' } },
                { origem: { contains: search, mode: 'insensitive' } },
                { leiloeiro: { contains: search, mode: 'insensitive' } }
            ];
        }

        const veiculos = await prisma.veiculo.findMany({
            where,
            include: { gastos: { orderBy: { data: 'asc' } } },
            orderBy: { createdAt: 'desc' }
        });

        res.json(veiculos);
    } catch (err) {
        console.error('Erro ao listar veículos:', err);
        res.status(500).json({ error: 'Erro ao buscar veículos' });
    }
});

/**
 * ROTA: Obter Veículo por ID com seus Gastos
 * GET /api/veiculos/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const veiculo = await prisma.veiculo.findFirst({
            where: { id, usuarioId: { in: usuarioIds } },
            include: { gastos: { orderBy: { data: 'asc' } } }
        });

        if (!veiculo) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        res.json(veiculo);
    } catch (err) {
        console.error('Erro ao buscar veículo:', err);
        res.status(500).json({ error: 'Erro ao buscar veículo' });
    }
});

/**
 * ROTA: Cadastrar Veículo
 * POST /api/veiculos
 */
router.post('/', async (req, res) => {
    try {
        const dadosCalculados = calcularMetricas(req.body);

        if (!dadosCalculados.modelo || !dadosCalculados.marca) {
            return res.status(400).json({ error: 'Marca e Modelo são obrigatórios.' });
        }

        const novoVeiculo = await prisma.veiculo.create({
            data: { ...dadosCalculados, usuarioId: req.session.userId },
            include: { gastos: true }
        });

        res.status(201).json(novoVeiculo);
    } catch (err) {
        console.error('Erro ao cadastrar veículo:', err);
        res.status(500).json({ error: 'Erro ao cadastrar veículo' });
    }
});

/**
 * ROTA: Atualizar Veículo
 * PUT /api/veiculos/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dadosCalculados = calcularMetricas(req.body);

        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const veiculoExistente = await prisma.veiculo.findFirst({
            where: { id, usuarioId: { in: usuarioIds } }
        });
        if (!veiculoExistente) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        const veiculoAtualizado = await prisma.veiculo.update({
            where: { id },
            data: dadosCalculados,
            include: { gastos: { orderBy: { data: 'asc' } } }
        });

        res.json(veiculoAtualizado);
    } catch (err) {
        console.error('Erro ao atualizar veículo:', err);
        res.status(500).json({ error: 'Erro ao atualizar veículo' });
    }
});

/**
 * ROTA: Listar Gastos de um Veículo
 * GET /api/veiculos/:id/gastos
 */
router.get('/:id/gastos', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const veiculo = await prisma.veiculo.findFirst({
            where: { id, usuarioId: { in: usuarioIds } }
        });
        if (!veiculo) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        const gastos = await prisma.gastoVeiculo.findMany({
            where: { veiculoId: id },
            orderBy: { data: 'asc' }
        });

        res.json(gastos);
    } catch (err) {
        console.error('Erro ao listar gastos:', err);
        res.status(500).json({ error: 'Erro ao buscar gastos do veículo' });
    }
});

/**
 * ROTA: Lançar Novo Gasto / Serviço para um Veículo
 * POST /api/veiculos/:id/gastos
 */
router.post('/:id/gastos', async (req, res) => {
    try {
        const veiculoId = parseInt(req.params.id, 10);
        const { data, categoria, descricao, oficina, valor } = req.body;

        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const veiculo = await prisma.veiculo.findFirst({
            where: { id: veiculoId, usuarioId: { in: usuarioIds } }
        });
        if (!veiculo) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        if (!categoria || !descricao || valor === undefined) {
            return res.status(400).json({ error: 'Categoria, descrição e valor são obrigatórios.' });
        }

        const dataGasto = data ? new Date(data) : new Date();

        const novoGasto = await prisma.gastoVeiculo.create({
            data: {
                veiculoId,
                data: dataGasto,
                categoria: String(categoria).trim(),
                descricao: String(descricao).trim(),
                oficina: oficina ? String(oficina).trim() : null,
                valor: Number(valor) || 0
            }
        });

        // Recalcular os totais consolidados no veículo
        const veiculoAtualizado = await recalcularGastosVeiculo(veiculoId);

        res.status(201).json({
            success: true,
            gasto: novoGasto,
            veiculo: veiculoAtualizado
        });
    } catch (err) {
        console.error('Erro ao lançar gasto:', err);
        res.status(500).json({ error: 'Erro ao cadastrar gasto do veículo' });
    }
});

/**
 * ROTA: Excluir Gasto Específico de um Veículo
 * DELETE /api/veiculos/:id/gastos/:gastoId
 */
router.delete('/:id/gastos/:gastoId', async (req, res) => {
    try {
        const veiculoId = parseInt(req.params.id, 10);
        const gastoId = parseInt(req.params.gastoId, 10);

        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const veiculo = await prisma.veiculo.findFirst({
            where: { id: veiculoId, usuarioId: { in: usuarioIds } }
        });
        if (!veiculo) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        await prisma.gastoVeiculo.delete({
            where: { id: gastoId }
        });

        // Recalcular os totais consolidados no veículo
        const veiculoAtualizado = await recalcularGastosVeiculo(veiculoId);

        res.json({
            success: true,
            message: 'Gasto removido com sucesso',
            veiculo: veiculoAtualizado
        });
    } catch (err) {
        console.error('Erro ao excluir gasto:', err);
        res.status(500).json({ error: 'Erro ao excluir gasto do veículo' });
    }
});

/**
 * ROTA: Atualizar Venda / Preço Rapidamente
 * POST /api/veiculos/:id/vender
 */
router.post('/:id/vender', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { valorVenda, dataVenda, precoAnuncio, status } = req.body;

        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const veiculo = await prisma.veiculo.findFirst({ where: { id, usuarioId: { in: usuarioIds } } });
        if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });

        const novoStatus = status || 'Vendido';
        const vVenda = Number(valorVenda) || null;
        const custoTotal = veiculo.custoTotal || 0;
        let lucroBruto = null;
        let roiPct = null;

        if (vVenda !== null && vVenda > 0) {
            lucroBruto = vVenda - custoTotal;
            roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
        }

        const atualizado = await prisma.veiculo.update({
            where: { id },
            data: {
                status: novoStatus,
                valorVenda: vVenda,
                precoAnuncio: precoAnuncio ? Number(precoAnuncio) : veiculo.precoAnuncio,
                dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
                lucroBruto,
                roiPct
            },
            include: { gastos: { orderBy: { data: 'asc' } } }
        });

        res.json({ success: true, veiculo: atualizado });
    } catch (err) {
        console.error('Erro ao registrar venda:', err);
        res.status(500).json({ error: 'Erro ao registrar venda do veículo' });
    }
});

/**
 * ROTA: Excluir Veículo
 * DELETE /api/veiculos/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const resultado = await prisma.veiculo.deleteMany({
            where: { id, usuarioId: { in: usuarioIds } }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Veículo não encontrado' });
        }

        res.json({ success: true, message: 'Veículo excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir veículo:', err);
        res.status(500).json({ error: 'Erro ao excluir veículo' });
    }
});

module.exports = router;
