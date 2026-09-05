const express = require('express');
const prisma = require('../lib/prisma');
const { obterUsuarioIdsCompartilhadosLeilao } = require('../lib/leilao-shared');

const router = express.Router();

/**
 * ROTA: Dashboard de Métricas Consolidadas
 * GET /api/dashboard
 */
router.get('/', async (req, res) => {
    try {
        const usuarioIds = await obterUsuarioIdsCompartilhadosLeilao(req.session.userId);
        const veiculos = await prisma.veiculo.findMany({
            where: { usuarioId: { in: usuarioIds } }
        });

        let lucroTotalAcumulado = 0;
        let capitalInvestidoParado = 0;
        let totalVendidos = 0;
        let totalEstoque = 0;
        let somaRoi = 0;

        const contagemStatus = {
            'Em Trânsito': 0,
            'Em Preparação': 0,
            'Regularização': 0,
            'Anunciado': 0,
            'Vendido': 0
        };

        veiculos.forEach(v => {
            if (contagemStatus[v.status] !== undefined) {
                contagemStatus[v.status]++;
            }

            if (v.status === 'Vendido') {
                totalVendidos++;
                if (v.lucroBruto !== null) {
                    lucroTotalAcumulado += v.lucroBruto;
                }
                if (v.roiPct !== null) {
                    somaRoi += v.roiPct;
                }
            } else {
                totalEstoque++;
                capitalInvestidoParado += v.custoTotal;
            }
        });

        const roiMedio = totalVendidos > 0 ? (somaRoi / totalVendidos) : 0;

        res.json({
            success: true,
            kpis: {
                lucroTotalAcumulado,
                capitalInvestidoParado,
                totalEstoque,
                totalVendidos,
                roiMedio,
                totalGeral: veiculos.length
            },
            contagemStatus
        });
    } catch (err) {
        console.error('Erro no dashboard:', err);
        res.status(500).json({ error: 'Erro ao calcular métricas do dashboard' });
    }
});

module.exports = router;
