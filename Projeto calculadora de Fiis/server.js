/**
 * server.js
 * Servidor API REST com Express e Prisma ORM para Gestão de Carros de Leilão
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend
app.use(express.static(__dirname));

/**
 * Função utilitária para cálculo automático de totais, lucro e ROI
 */
function calcularMetricas(data) {
    const valorArremate = Number(data.valorArremate) || 0;
    const comissaoPct = Number(data.comissaoPct) || 0;
    const taxasPatio = Number(data.taxasPatio) || 0;
    const custoGuincho = Number(data.custoGuincho) || 0;

    // Total de Aquisição: Lance + Comissão R$ + Taxas + Guincho
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + taxasPatio + custoGuincho;

    const gastoMecanica = Number(data.gastoMecanica) || 0;
    const gastoFunilaria = Number(data.gastoFunilaria) || 0;
    const gastoEstetica = Number(data.gastoEstetica) || 0;
    const gastoDocumentacao = Number(data.gastoDocumentacao) || 0;

    // Total de Preparação
    const totalPreparacao = gastoMecanica + gastoFunilaria + gastoEstetica + gastoDocumentacao;

    // Custo Total Acumulado
    const custoTotal = totalAquisicao + totalPreparacao;

    const precoAnuncio = data.precoAnuncio !== undefined && data.precoAnuncio !== '' && data.precoAnuncio !== null
        ? Number(data.precoAnuncio) : null;
    const valorVenda = data.valorVenda !== undefined && data.valorVenda !== '' && data.valorVenda !== null
        ? Number(data.valorVenda) : null;

    let lucroBruto = null;
    let roiPct = null;

    if (valorVenda !== null && valorVenda > 0) {
        lucroBruto = valorVenda - custoTotal;
        roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
    }

    let dataVenda = null;
    if (data.dataVenda) {
        dataVenda = new Date(data.dataVenda);
    } else if (data.status === 'Vendido' && !data.dataVenda) {
        dataVenda = new Date();
    }

    return {
        marca: data.marca ? String(data.marca).trim() : '',
        modelo: data.modelo ? String(data.modelo).trim() : '',
        ano: parseInt(data.ano, 10) || new Date().getFullYear(),
        placa: data.placa ? String(data.placa).trim().toUpperCase() : null,
        chassi: data.chassi ? String(data.chassi).trim().toUpperCase() : null,
        origem: data.origem ? String(data.origem).trim() : 'Seguradora',
        status: data.status ? String(data.status).trim() : 'Em Trânsito',
        observacoes: data.observacoes ? String(data.observacoes).trim() : null,
        valorArremate,
        comissaoPct,
        taxasPatio,
        custoGuincho,
        totalAquisicao,
        gastoMecanica,
        gastoFunilaria,
        gastoEstetica,
        gastoDocumentacao,
        totalPreparacao,
        custoTotal,
        precoAnuncio,
        valorVenda,
        dataVenda,
        lucroBruto,
        roiPct
    };
}

/**
 * ROTA: Dashboard de Métricas Consolidadas
 * GET /api/dashboard
 */
app.get('/api/dashboard', async (req, res) => {
    try {
        const veiculos = await prisma.veiculo.findMany();

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

/**
 * ROTA: Listar Veículos
 * GET /api/veiculos?status=...&search=...
 */
app.get('/api/veiculos', async (req, res) => {
    try {
        const { status, search } = req.query;
        const where = {};

        if (status && status !== 'Todos') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { modelo: { contains: search } },
                { marca: { contains: search } },
                { placa: { contains: search } },
                { origem: { contains: search } }
            ];
        }

        const veiculos = await prisma.veiculo.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        res.json(veiculos);
    } catch (err) {
        console.error('Erro ao listar veículos:', err);
        res.status(500).json({ error: 'Erro ao buscar veículos' });
    }
});

/**
 * ROTA: Obter Veículo por ID
 * GET /api/veiculos/:id
 */
app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const veiculo = await prisma.veiculo.findUnique({ where: { id } });

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
app.post('/api/veiculos', async (req, res) => {
    try {
        const dadosCalculados = calcularMetricas(req.body);

        if (!dadosCalculados.modelo || !dadosCalculados.marca) {
            return res.status(400).json({ error: 'Marca e Modelo são obrigatórios.' });
        }

        const novoVeiculo = await prisma.veiculo.create({
            data: dadosCalculados
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
app.put('/api/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dadosCalculados = calcularMetricas(req.body);

        const veiculoAtualizado = await prisma.veiculo.update({
            where: { id },
            data: dadosCalculados
        });

        res.json(veiculoAtualizado);
    } catch (err) {
        console.error('Erro ao atualizar veículo:', err);
        res.status(500).json({ error: 'Erro ao atualizar veículo' });
    }
});

/**
 * ROTA: Excluir Veículo
 * DELETE /api/veiculos/:id
 */
app.delete('/api/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        await prisma.veiculo.delete({ where: { id } });

        res.json({ success: true, message: 'Veículo excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir veículo:', err);
        res.status(500).json({ error: 'Erro ao excluir veículo' });
    }
});

// Redirecionamento da raiz para a página inicial
app.get('/', (req, res) => {
    res.redirect('/HTML/Index/index.html');
});

/**
 * Função de Seed Inicial (dados de demonstração se banco estiver vazio)
 */
async function seedInitialData() {
    try {
        const count = await prisma.veiculo.count();
        if (count === 0) {
            console.log('[Prisma] Inserindo dados iniciais de demonstração...');
            
            const car1 = calcularMetricas({
                marca: 'Honda',
                modelo: 'Civic EXL 2.0',
                ano: 2020,
                placa: 'BRA2E19',
                chassi: '93HB49281729381',
                origem: 'Seguradora (Pequena Monta)',
                status: 'Vendido',
                observacoes: 'Arrematado com pequena colisão frontal. Trocado parachoque e farol.',
                valorArremate: 65000,
                comissaoPct: 5,
                taxasPatio: 1200,
                custoGuincho: 450,
                gastoMecanica: 1800,
                gastoFunilaria: 2500,
                gastoEstetica: 600,
                gastoDocumentacao: 1150,
                precoAnuncio: 89900,
                valorVenda: 88500,
                dataVenda: '2026-08-15'
            });

            const car2 = calcularMetricas({
                marca: 'Volkswagen',
                modelo: 'T-Cross Highline 1.4 TSI',
                ano: 2022,
                placa: 'RIO4F22',
                chassi: '9BWZZZ2GZLP12839',
                origem: 'Banco / Financiamento',
                status: 'Anunciado',
                observacoes: 'Retomada de banco. Feito apenas polimento e revisão básica.',
                valorArremate: 82000,
                comissaoPct: 5,
                taxasPatio: 1500,
                custoGuincho: 500,
                gastoMecanica: 950,
                gastoFunilaria: 0,
                gastoEstetica: 800,
                gastoDocumentacao: 1350,
                precoAnuncio: 104900
            });

            const car3 = calcularMetricas({
                marca: 'Jeep',
                modelo: 'Compass Longitude 2.0 Flex',
                ano: 2021,
                placa: 'SPO9A88',
                chassi: '89WJ98129031823',
                origem: 'Frota / Locadora',
                status: 'Em Preparação',
                observacoes: 'Na funilaria para retoque na porta traseira e parachoque.',
                valorArremate: 74000,
                comissaoPct: 5,
                taxasPatio: 1300,
                custoGuincho: 400,
                gastoMecanica: 1200,
                gastoFunilaria: 1900,
                gastoEstetica: 0,
                gastoDocumentacao: 900,
                precoAnuncio: 96000
            });

            await prisma.veiculo.createMany({
                data: [car1, car2, car3]
            });
            console.log('[Prisma] Veículos de demonstração cadastrados com sucesso!');
        }
    } catch (e) {
        console.warn('[Prisma] Aviso na inicialização de seed:', e.message);
    }
}

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(` AutoLeilão Hub (FinanceHub) rodando na porta ${PORT}`);
    console.log(` Acesso web: http://localhost:${PORT}/HTML/Index/index.html`);
    console.log(`====================================================`);
    await seedInitialData();
});
