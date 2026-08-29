/**
 * server.js
 * Servidor API REST com Express e Prisma ORM para Gestão de Carros de Leilão
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'autoleilao-hub-chave-local-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 8 * 60 * 60 * 1000 // 8 horas
    }
}));

/**
 * Middleware de proteção: exige sessão de usuário autenticado
 */
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    next();
}

// Servir arquivos estáticos do frontend
app.use(express.static(__dirname));

/**
 * ROTA: Login
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, senha } = req.body;

        if (!username || !senha) {
            return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
        }

        const usuario = await prisma.usuario.findUnique({ where: { username: String(username).trim() } });
        if (!usuario) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
        if (!senhaValida) {
            return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        }

        req.session.userId = usuario.id;

        res.json({ success: true, usuario: { id: usuario.id, username: usuario.username, nome: usuario.nome } });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro ao processar login' });
    }
});

/**
 * ROTA: Logout
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

/**
 * ROTA: Sessão Atual
 * GET /api/auth/me
 */
app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: req.session.userId } });
    if (!usuario) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    res.json({ id: usuario.id, username: usuario.username, nome: usuario.nome });
});

/**
 * ROTA: Alterar Senha do Usuário Logado
 * PUT /api/auth/senha
 */
app.put('/api/auth/senha', requireAuth, async (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body;

        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
        }
        if (String(novaSenha).length < 4) {
            return res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' });
        }

        const usuario = await prisma.usuario.findUnique({ where: { id: req.session.userId } });
        const senhaValida = await bcrypt.compare(senhaAtual, usuario.senhaHash);
        if (!senhaValida) {
            return res.status(401).json({ error: 'Senha atual incorreta.' });
        }

        const novoHash = await bcrypt.hash(novaSenha, 10);
        await prisma.usuario.update({
            where: { id: usuario.id },
            data: { senhaHash: novoHash }
        });

        res.json({ success: true, message: 'Senha alterada com sucesso.' });
    } catch (err) {
        console.error('Erro ao alterar senha:', err);
        res.status(500).json({ error: 'Erro ao alterar senha' });
    }
});

// Protege as rotas de dados do módulo de Leilão: exige login
app.use(['/api/dashboard', '/api/veiculos'], requireAuth);

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

    let dataCompra = null;
    if (data.dataCompra) {
        dataCompra = new Date(data.dataCompra);
    }

    return {
        marca: data.marca ? String(data.marca).trim() : '',
        modelo: data.modelo ? String(data.modelo).trim() : '',
        ano: parseInt(data.ano, 10) || new Date().getFullYear(),
        placa: data.placa ? String(data.placa).trim().toUpperCase() : null,
        chassi: data.chassi ? String(data.chassi).trim().toUpperCase() : null,
        origem: data.origem ? String(data.origem).trim() : 'Seguradora',
        leiloeiro: data.leiloeiro ? String(data.leiloeiro).trim() : null,
        dataCompra,
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
 * ROTA: Listar Veículos (com gastos incluídos)
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
                { origem: { contains: search } },
                { leiloeiro: { contains: search } }
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
app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const veiculo = await prisma.veiculo.findUnique({
            where: { id },
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
app.post('/api/veiculos', async (req, res) => {
    try {
        const dadosCalculados = calcularMetricas(req.body);

        if (!dadosCalculados.modelo || !dadosCalculados.marca) {
            return res.status(400).json({ error: 'Marca e Modelo são obrigatórios.' });
        }

        const novoVeiculo = await prisma.veiculo.create({
            data: dadosCalculados,
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
app.put('/api/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dadosCalculados = calcularMetricas(req.body);

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
app.get('/api/veiculos/:id/gastos', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
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
app.post('/api/veiculos/:id/gastos', async (req, res) => {
    try {
        const veiculoId = parseInt(req.params.id, 10);
        const { data, categoria, descricao, oficina, valor } = req.body;

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
app.delete('/api/veiculos/:id/gastos/:gastoId', async (req, res) => {
    try {
        const veiculoId = parseInt(req.params.id, 10);
        const gastoId = parseInt(req.params.gastoId, 10);

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
app.post('/api/veiculos/:id/vender', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { valorVenda, dataVenda, precoAnuncio, status } = req.body;

        const veiculo = await prisma.veiculo.findUnique({ where: { id } });
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

/**
 * Função de Seed dos Usuários Administradores (fixos, cadastrados apenas uma vez)
 */
async function seedUsuarios() {
    try {
        const count = await prisma.usuario.count();
        if (count === 0) {
            console.log('[Prisma] Cadastrando usuários administradores...');

            const admins = [
                { username: 'Davi_olp', nome: 'Davi', senha: 'adm123' },
                { username: 'PhMiori', nome: 'Ph Miori', senha: 'adm123' }
            ];

            for (const admin of admins) {
                const senhaHash = await bcrypt.hash(admin.senha, 10);
                await prisma.usuario.create({
                    data: { username: admin.username, nome: admin.nome, senhaHash }
                });
            }

            console.log('[Prisma] Usuários administradores cadastrados com sucesso!');
        }
    } catch (e) {
        console.warn('[Prisma] Aviso na inicialização de usuários:', e.message);
    }
}

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(` AutoLeilão Hub (FinanceHub) rodando na porta ${PORT}`);
    console.log(` Acesso web: http://localhost:${PORT}/HTML/Index/index.html`);
    console.log(`====================================================`);
    await seedInitialData();
    await seedUsuarios();
});
