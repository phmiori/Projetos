/**
 * server.js
 * Servidor API REST com Express e Prisma ORM para Gestão de Carros de Leilão
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '3mb' })); // limite maior para acomodar foto de perfil em Base64

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

    res.json({ id: usuario.id, username: usuario.username, nome: usuario.nome, fotoUrl: usuario.fotoUrl, email: usuario.email });
});

/**
 * ROTA: Atualizar Perfil do Usuário Logado (Nome, Foto e E-mail)
 * PUT /api/auth/perfil
 */
app.put('/api/auth/perfil', requireAuth, async (req, res) => {
    try {
        const { nome, fotoUrl, email } = req.body;

        const data = {};
        if (nome !== undefined) {
            if (!String(nome).trim()) {
                return res.status(400).json({ error: 'O nome não pode ficar em branco.' });
            }
            data.nome = String(nome).trim();
        }
        if (fotoUrl !== undefined) {
            data.fotoUrl = fotoUrl ? String(fotoUrl) : null;
        }
        if (email !== undefined) {
            const emailLimpo = email ? String(email).trim() : '';
            if (emailLimpo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
                return res.status(400).json({ error: 'Informe um e-mail válido.' });
            }
            data.email = emailLimpo || null;
        }

        const usuario = await prisma.usuario.update({
            where: { id: req.session.userId },
            data
        });

        res.json({ id: usuario.id, username: usuario.username, nome: usuario.nome, fotoUrl: usuario.fotoUrl, email: usuario.email });
    } catch (err) {
        console.error('Erro ao atualizar perfil:', err);
        res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
});

/**
 * ROTA: Listar Módulos do Hub Financeiro Ocultados pelo Usuário Logado
 * GET /api/auth/modulos-ocultos
 */
app.get('/api/auth/modulos-ocultos', requireAuth, async (req, res) => {
    try {
        const ocultos = await prisma.moduloOculto.findMany({
            where: { usuarioId: req.session.userId }
        });
        res.json(ocultos.map(o => o.modulo));
    } catch (err) {
        console.error('Erro ao listar módulos ocultos:', err);
        res.status(500).json({ error: 'Erro ao buscar módulos ocultos' });
    }
});

/**
 * ROTA: Ocultar um Módulo do Hub Financeiro
 * POST /api/auth/modulos-ocultos/:modulo
 */
const MODULOS_HUB_FINANCEIRO = ['fii', 'cripto', 'leilao', 'casasleilao', 'cofrinho'];

app.post('/api/auth/modulos-ocultos/:modulo', requireAuth, async (req, res) => {
    try {
        const modulo = String(req.params.modulo).trim().toLowerCase();
        if (!MODULOS_HUB_FINANCEIRO.includes(modulo)) {
            return res.status(400).json({ error: 'Módulo inválido.' });
        }

        await prisma.moduloOculto.upsert({
            where: { usuarioId_modulo: { usuarioId: req.session.userId, modulo } },
            update: {},
            create: { usuarioId: req.session.userId, modulo }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao ocultar módulo:', err);
        res.status(500).json({ error: 'Erro ao ocultar módulo' });
    }
});

/**
 * ROTA: Reexibir um Módulo do Hub Financeiro
 * DELETE /api/auth/modulos-ocultos/:modulo
 */
app.delete('/api/auth/modulos-ocultos/:modulo', requireAuth, async (req, res) => {
    try {
        const modulo = String(req.params.modulo).trim().toLowerCase();

        await prisma.moduloOculto.deleteMany({
            where: { usuarioId: req.session.userId, modulo }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao reexibir módulo:', err);
        res.status(500).json({ error: 'Erro ao reexibir módulo' });
    }
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

// Protege as rotas de dados dos módulos de Leilão, Imóveis, FII, Cripto, Cofrinho, Calendário, Notificações, Clima, Finanças & Casa, Treinos & Saúde e Garagem: exige login
app.use(['/api/dashboard', '/api/veiculos', '/api/imoveis', '/api/fii', '/api/cripto', '/api/cofrinhos', '/api/eventos', '/api/notificacoes', '/api/clima', '/api/casa', '/api/treinos', '/api/saude', '/api/garagem'], requireAuth);

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

    // Método de Arrematação: À Vista ou Parcelado (25% de entrada sobre o lance, desconsiderando a comissão do leiloeiro)
    const metodoPagamento = data.metodoPagamento === 'Parcelado' ? 'Parcelado' : 'À Vista';
    const valorEntrada = metodoPagamento === 'Parcelado' ? valorArremate * 0.25 : 0;
    const valorParcelado = metodoPagamento === 'Parcelado' ? valorArremate - valorEntrada : 0;
    const qtdParcelas = metodoPagamento === 'Parcelado' ? (parseInt(data.qtdParcelas, 10) || 0) : 0;
    const valorParcela = qtdParcelas > 0 ? valorParcelado / qtdParcelas : 0;

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
        metodoPagamento,
        valorEntrada,
        valorParcelado,
        qtdParcelas,
        valorParcela,
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
        const veiculos = await prisma.veiculo.findMany({
            where: { usuarioId: req.session.userId }
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

/**
 * ROTA: Listar Veículos (com gastos incluídos)
 * GET /api/veiculos?status=...&search=...
 */
app.get('/api/veiculos', async (req, res) => {
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
app.get('/api/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const veiculo = await prisma.veiculo.findFirst({
            where: { id, usuarioId: req.session.userId },
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
app.put('/api/veiculos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const dadosCalculados = calcularMetricas(req.body);

        const veiculoExistente = await prisma.veiculo.findFirst({
            where: { id, usuarioId: req.session.userId }
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
app.get('/api/veiculos/:id/gastos', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const veiculo = await prisma.veiculo.findFirst({
            where: { id, usuarioId: req.session.userId }
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
app.post('/api/veiculos/:id/gastos', async (req, res) => {
    try {
        const veiculoId = parseInt(req.params.id, 10);
        const { data, categoria, descricao, oficina, valor } = req.body;

        const veiculo = await prisma.veiculo.findFirst({
            where: { id: veiculoId, usuarioId: req.session.userId }
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
app.delete('/api/veiculos/:id/gastos/:gastoId', async (req, res) => {
    try {
        const veiculoId = parseInt(req.params.id, 10);
        const gastoId = parseInt(req.params.gastoId, 10);

        const veiculo = await prisma.veiculo.findFirst({
            where: { id: veiculoId, usuarioId: req.session.userId }
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
app.post('/api/veiculos/:id/vender', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { valorVenda, dataVenda, precoAnuncio, status } = req.body;

        const veiculo = await prisma.veiculo.findFirst({ where: { id, usuarioId: req.session.userId } });
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

        const resultado = await prisma.veiculo.deleteMany({
            where: { id, usuarioId: req.session.userId }
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


/**
 * Função utilitária para cálculo automático de totais, lucro e ROI de imóveis de leilão
 */
function calcularMetricasImovel(data) {
    const valorArremate = Number(data.valorArremate) || 0;
    const comissaoPct = Number(data.comissaoPct) || 0;
    const custasProcessuais = Number(data.custasProcessuais) || 0;
    const custoDesocupacao = Number(data.custoDesocupacao) || 0;

    // Total de Aquisição: Lance + Comissão % + Custas Processuais + Desocupação
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + custasProcessuais + custoDesocupacao;

    const gastoReforma = Number(data.gastoReforma) || 0;
    const gastoAcabamento = Number(data.gastoAcabamento) || 0;
    const gastoLimpeza = Number(data.gastoLimpeza) || 0;
    const gastoDocumentacao = Number(data.gastoDocumentacao) || 0;

    // Total de Preparação
    const totalPreparacao = gastoReforma + gastoAcabamento + gastoLimpeza + gastoDocumentacao;

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
        endereco: data.endereco ? String(data.endereco).trim() : '',
        cidade: data.cidade ? String(data.cidade).trim() : null,
        uf: data.uf ? String(data.uf).trim().toUpperCase() : null,
        tipoImovel: data.tipoImovel ? String(data.tipoImovel).trim() : 'Casa',
        areaM2: data.areaM2 !== undefined && data.areaM2 !== '' && data.areaM2 !== null ? Number(data.areaM2) : null,
        quartos: data.quartos !== undefined && data.quartos !== '' && data.quartos !== null ? parseInt(data.quartos, 10) : null,
        banheiros: data.banheiros !== undefined && data.banheiros !== '' && data.banheiros !== null ? parseInt(data.banheiros, 10) : null,
        matricula: data.matricula ? String(data.matricula).trim() : null,
        origem: data.origem ? String(data.origem).trim() : 'Banco',
        leiloeiro: data.leiloeiro ? String(data.leiloeiro).trim() : null,
        dataCompra,
        status: data.status ? String(data.status).trim() : 'Em Desocupação',
        observacoes: data.observacoes ? String(data.observacoes).trim() : null,
        valorArremate,
        comissaoPct,
        custasProcessuais,
        custoDesocupacao,
        totalAquisicao,
        gastoReforma,
        gastoAcabamento,
        gastoLimpeza,
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
app.get('/api/imoveis', async (req, res) => {
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
app.get('/api/imoveis/:id', async (req, res) => {
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
app.post('/api/imoveis', async (req, res) => {
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
app.put('/api/imoveis/:id', async (req, res) => {
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
app.get('/api/imoveis/:id/gastos', async (req, res) => {
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
app.post('/api/imoveis/:id/gastos', async (req, res) => {
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
app.delete('/api/imoveis/:id/gastos/:gastoId', async (req, res) => {
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
app.post('/api/imoveis/:id/vender', async (req, res) => {
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
app.delete('/api/imoveis/:id', async (req, res) => {
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


/**
 * Busca a cotação atual de um ticker de FII na B3 via Yahoo Finance (fonte pública, sem chave de API)
 */
async function buscarCotacaoTicker(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.SA?interval=1d&range=1d`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

    if (!response.ok) {
        throw new Error('Cotação indisponível no momento');
    }

    const json = await response.json();
    const meta = json?.chart?.result?.[0]?.meta;

    if (!meta || typeof meta.regularMarketPrice !== 'number') {
        throw new Error('Ticker não encontrado na B3');
    }

    return {
        precoAtual: meta.regularMarketPrice,
        fechamentoAnterior: typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : null
    };
}

/**
 * Transportador de e-mail (Gmail SMTP) usado para os alertas de queda de preço de FII.
 * Requer as variáveis de ambiente SMTP_USER (endereço Gmail) e SMTP_PASS (senha de app do Gmail).
 */
const mailTransporter = (process.env.SMTP_USER && process.env.SMTP_PASS)
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
    : null;

async function enviarEmailAlertaPrecoFII(destinatario, ticker, precoAtual, limite) {
    if (!mailTransporter) {
        console.warn('[Alerta FII] SMTP_USER/SMTP_PASS não configurados — e-mail de alerta não enviado.');
        return;
    }

    await mailTransporter.sendMail({
        from: `"FinanceHub" <${process.env.SMTP_USER}>`,
        to: destinatario,
        subject: `🔻 ${ticker} caiu abaixo de R$ ${limite.toFixed(2)}`,
        text: `O fundo imobiliário ${ticker} está cotado a R$ ${precoAtual.toFixed(2)}, abaixo do limite de R$ ${limite.toFixed(2)} configurado no FinanceHub.`,
        html: `<p>O fundo imobiliário <strong>${ticker}</strong> caiu abaixo do limite que você configurou no FinanceHub.</p>
               <p><strong>Preço atual:</strong> R$ ${precoAtual.toFixed(2)}<br>
               <strong>Limite configurado:</strong> R$ ${limite.toFixed(2)}</p>`
    });
}

/**
 * Atualiza a cotação de um InvestimentoFII e, se ele tiver um alertaPrecoAbaixoDe configurado,
 * dispara um e-mail quando o preço cruza abaixo do limite. Usa a flag alertaDisparado para não
 * reenviar o alerta repetidamente: só envia de novo depois que o preço se recupera acima do
 * limite e cai outra vez.
 */
async function atualizarPrecoFiiEChecarAlerta(inv, emailUsuario) {
    const { precoAtual } = await buscarCotacaoTicker(inv.ticker);
    const data = { precoAtual, precoAtualizadoEm: new Date() };

    if (inv.alertaPrecoAbaixoDe != null) {
        if (precoAtual < inv.alertaPrecoAbaixoDe && !inv.alertaDisparado) {
            data.alertaDisparado = true;
            if (emailUsuario) {
                enviarEmailAlertaPrecoFII(emailUsuario, inv.ticker, precoAtual, inv.alertaPrecoAbaixoDe)
                    .catch(e => console.error(`[Alerta FII] Falha ao enviar e-mail (${inv.ticker}):`, e.message));
            }
        } else if (precoAtual >= inv.alertaPrecoAbaixoDe && inv.alertaDisparado) {
            data.alertaDisparado = false;
        }
    }

    await prisma.investimentoFII.update({ where: { id: inv.id }, data });
    return precoAtual;
}

/**
 * ROTA: Listar Carteira de FIIs do Usuário Logado
 * GET /api/fii
 */
app.get('/api/fii', async (req, res) => {
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
app.post('/api/fii', async (req, res) => {
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
app.put('/api/fii/:id', async (req, res) => {
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
app.delete('/api/fii/:id', async (req, res) => {
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
app.post('/api/fii/atualizar-precos', async (req, res) => {
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
 * Busca a cotação atual (em Reais) de uma ou mais criptomoedas na CoinGecko (fonte pública, sem chave de API)
 */
async function buscarCotacaoCripto(moedaIds) {
    const ids = [...new Set(moedaIds)].join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=brl`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
        throw new Error('Cotação indisponível no momento');
    }

    return await response.json();
}

/**
 * ROTA: Listar Carteira de Criptomoedas do Usuário Logado
 * GET /api/cripto
 */
app.get('/api/cripto', async (req, res) => {
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
app.post('/api/cripto', async (req, res) => {
    try {
        const { moedaId, ticker, nome, categoria, quantidade, precoMedio, observacoes } = req.body;

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
                observacoes: observacoes ? String(observacoes).trim() : null
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
app.put('/api/cripto/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { moedaId, ticker, nome, categoria, quantidade, precoMedio, observacoes } = req.body;

        const existente = await prisma.investimentoCripto.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'Criptomoeda não encontrada na carteira' });
        }

        const atualizado = await prisma.investimentoCripto.update({
            where: { id },
            data: {
                moedaId: moedaId ? String(moedaId).trim().toLowerCase() : existente.moedaId,
                ticker: ticker ? String(ticker).trim().toUpperCase() : existente.ticker,
                nome: nome ? String(nome).trim() : existente.nome,
                categoria: categoria ? String(categoria).trim() : existente.categoria,
                quantidade: quantidade !== undefined ? Number(quantidade) || 0 : existente.quantidade,
                precoMedio: precoMedio !== undefined ? Number(precoMedio) || 0 : existente.precoMedio,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
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
app.delete('/api/cripto/:id', async (req, res) => {
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
app.post('/api/cripto/atualizar-precos', async (req, res) => {
    try {
        const investimentos = await prisma.investimentoCripto.findMany({
            where: { usuarioId: req.session.userId }
        });

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
            await prisma.investimentoCripto.update({
                where: { id: inv.id },
                data: { precoAtual: preco, precoAtualizadoEm: new Date() }
            });
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

/**
 * ROTA: Listar Cofrinhos do Usuário Logado
 * GET /api/cofrinhos
 */
app.get('/api/cofrinhos', async (req, res) => {
    try {
        const cofrinhos = await prisma.cofrinho.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(cofrinhos);
    } catch (err) {
        console.error('Erro ao listar cofrinhos:', err);
        res.status(500).json({ error: 'Erro ao buscar cofrinhos' });
    }
});

/**
 * ROTA: Cadastrar Novo Cofrinho
 * POST /api/cofrinhos
 */
app.post('/api/cofrinhos', async (req, res) => {
    try {
        const { nome, valorInvestido, rendaPorDia, dataInicio, observacoes } = req.body;

        if (!nome || !valorInvestido || rendaPorDia === undefined) {
            return res.status(400).json({ error: 'Nome, valor investido e renda do dia 1 são obrigatórios.' });
        }

        const novoCofrinho = await prisma.cofrinho.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                valorInvestido: Number(valorInvestido) || 0,
                rendaPorDia: Number(rendaPorDia) || 0,
                dataInicio: dataInicio ? new Date(dataInicio) : new Date(),
                observacoes: observacoes ? String(observacoes).trim() : null
            }
        });

        res.status(201).json(novoCofrinho);
    } catch (err) {
        console.error('Erro ao cadastrar cofrinho:', err);
        res.status(500).json({ error: 'Erro ao cadastrar cofrinho' });
    }
});

/**
 * ROTA: Atualizar Cofrinho
 * PUT /api/cofrinhos/:id
 */
app.put('/api/cofrinhos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { nome, valorInvestido, rendaPorDia, dataInicio, observacoes } = req.body;

        const existente = await prisma.cofrinho.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'Cofrinho não encontrado' });
        }

        const atualizado = await prisma.cofrinho.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                valorInvestido: valorInvestido !== undefined ? Number(valorInvestido) || 0 : existente.valorInvestido,
                rendaPorDia: rendaPorDia !== undefined ? Number(rendaPorDia) || 0 : existente.rendaPorDia,
                dataInicio: dataInicio ? new Date(dataInicio) : existente.dataInicio,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar cofrinho:', err);
        res.status(500).json({ error: 'Erro ao atualizar cofrinho' });
    }
});

/**
 * ROTA: Excluir Cofrinho
 * DELETE /api/cofrinhos/:id
 */
app.delete('/api/cofrinhos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.cofrinho.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Cofrinho não encontrado' });
        }

        res.json({ success: true, message: 'Cofrinho excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir cofrinho:', err);
        res.status(500).json({ error: 'Erro ao excluir cofrinho' });
    }
});

/**
 * ROTA: Listar Eventos do Calendário do Usuário Logado (opcionalmente filtrado por período)
 * GET /api/eventos?inicio=ISO&fim=ISO
 */
app.get('/api/eventos', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const where = { usuarioId: req.session.userId };

        if (inicio && fim) {
            where.inicio = { lte: new Date(fim) };
            where.fim = { gte: new Date(inicio) };
        }

        const eventos = await prisma.evento.findMany({
            where,
            orderBy: { inicio: 'asc' }
        });

        res.json(eventos);
    } catch (err) {
        console.error('Erro ao listar eventos:', err);
        res.status(500).json({ error: 'Erro ao buscar eventos do calendário' });
    }
});

/**
 * ROTA: Cadastrar Novo Evento no Calendário
 * POST /api/eventos
 */
app.post('/api/eventos', async (req, res) => {
    try {
        const { titulo, descricao, local, inicio, fim, diaTodo, cor, lembreteMinutos } = req.body;

        if (!titulo || !inicio || !fim) {
            return res.status(400).json({ error: 'Título, início e fim são obrigatórios.' });
        }

        const novoEvento = await prisma.evento.create({
            data: {
                usuarioId: req.session.userId,
                titulo: String(titulo).trim(),
                descricao: descricao ? String(descricao).trim() : null,
                local: local ? String(local).trim() : null,
                inicio: new Date(inicio),
                fim: new Date(fim),
                diaTodo: Boolean(diaTodo),
                cor: cor ? String(cor).trim() : '#EEBB00',
                lembreteMinutos: lembreteMinutos !== undefined && lembreteMinutos !== null && lembreteMinutos !== ''
                    ? parseInt(lembreteMinutos, 10) : null
            }
        });

        res.status(201).json(novoEvento);
    } catch (err) {
        console.error('Erro ao cadastrar evento:', err);
        res.status(500).json({ error: 'Erro ao cadastrar evento' });
    }
});

/**
 * ROTA: Atualizar Evento do Calendário
 * PUT /api/eventos/:id
 */
app.put('/api/eventos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { titulo, descricao, local, inicio, fim, diaTodo, cor, lembreteMinutos } = req.body;

        const existente = await prisma.evento.findFirst({
            where: { id, usuarioId: req.session.userId }
        });
        if (!existente) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        const atualizado = await prisma.evento.update({
            where: { id },
            data: {
                titulo: titulo ? String(titulo).trim() : existente.titulo,
                descricao: descricao !== undefined ? (descricao ? String(descricao).trim() : null) : existente.descricao,
                local: local !== undefined ? (local ? String(local).trim() : null) : existente.local,
                inicio: inicio ? new Date(inicio) : existente.inicio,
                fim: fim ? new Date(fim) : existente.fim,
                diaTodo: diaTodo !== undefined ? Boolean(diaTodo) : existente.diaTodo,
                cor: cor ? String(cor).trim() : existente.cor,
                lembreteMinutos: lembreteMinutos !== undefined
                    ? (lembreteMinutos === null || lembreteMinutos === '' ? null : parseInt(lembreteMinutos, 10))
                    : existente.lembreteMinutos,
                notificacaoDispensada: false
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar evento:', err);
        res.status(500).json({ error: 'Erro ao atualizar evento' });
    }
});

/**
 * ROTA: Excluir Evento do Calendário
 * DELETE /api/eventos/:id
 */
app.delete('/api/eventos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.evento.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Evento não encontrado' });
        }

        res.json({ success: true, message: 'Evento excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir evento:', err);
        res.status(500).json({ error: 'Erro ao excluir evento' });
    }
});

/**
 * Identifica o nome de um local a partir de coordenadas (geolocalização do navegador)
 * usando a API pública e gratuita BigDataCloud (sem necessidade de chave de API)
 */
async function buscarNomeLocalPorCoordenadas(lat, lon) {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=pt`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error('Não foi possível identificar o local');
    }

    const data = await response.json();

    return {
        nome: data.locality || data.city || data.principalSubdivision || 'Local Atual',
        cidade: data.city || data.locality || null,
        estado: data.principalSubdivision || null,
        pais: data.countryName || null
    };
}

/**
 * ROTA: Identificar Local a partir de Coordenadas (Geolocalização do Navegador)
 * GET /api/clima/local-atual?lat=&lon=
 */
app.get('/api/clima/local-atual', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude e longitude são obrigatórias.' });
        }

        const local = await buscarNomeLocalPorCoordenadas(lat, lon);
        res.json(local);
    } catch (err) {
        console.error('Erro ao identificar local atual:', err);
        res.status(500).json({ error: 'Erro ao identificar o local atual' });
    }
});

/**
 * ROTA: Buscar Localidades (Cidade ou Bairro) por Nome via Open-Meteo Geocoding
 * GET /api/clima/buscar-local?query=
 */
app.get('/api/clima/buscar-local', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || String(query).trim().length < 2) {
            return res.status(400).json({ error: 'Digite ao menos 2 caracteres para buscar.' });
        }

        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(query).trim())}&count=8&language=pt&format=json`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Serviço de busca indisponível');
        }

        const data = await response.json();
        const resultados = (data.results || []).map(r => ({
            nome: r.name,
            estado: r.admin1 || null,
            pais: r.country || null,
            lat: r.latitude,
            lon: r.longitude
        }));

        res.json(resultados);
    } catch (err) {
        console.error('Erro ao buscar local:', err);
        res.status(500).json({ error: 'Erro ao buscar localidades' });
    }
});

/**
 * ROTA: Previsão do Tempo Atual, Horária e Diária via Open-Meteo (sem necessidade de chave de API)
 * GET /api/clima/previsao?lat=&lon=
 */
app.get('/api/clima/previsao', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Latitude e longitude são obrigatórias.' });
        }

        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
            hourly: 'temperature_2m,weather_code,precipitation_probability',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
            timezone: 'auto',
            forecast_days: '7'
        });

        const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Serviço de previsão indisponível');
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Erro ao buscar previsão do tempo:', err);
        res.status(500).json({ error: 'Erro ao buscar a previsão do tempo' });
    }
});

/**
 * ROTA: Listar Locais de Clima Salvos do Usuário Logado
 * GET /api/clima/salvos
 */
app.get('/api/clima/salvos', async (req, res) => {
    try {
        const locais = await prisma.localClimaSalvo.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { createdAt: 'asc' }
        });
        res.json(locais);
    } catch (err) {
        console.error('Erro ao listar locais salvos:', err);
        res.status(500).json({ error: 'Erro ao buscar locais salvos' });
    }
});

/**
 * ROTA: Salvar Novo Local de Clima
 * POST /api/clima/salvos
 */
app.post('/api/clima/salvos', async (req, res) => {
    try {
        const { nome, estado, pais, lat, lon } = req.body;
        if (!nome || lat === undefined || lon === undefined) {
            return res.status(400).json({ error: 'Nome, latitude e longitude são obrigatórios.' });
        }

        const novoLocal = await prisma.localClimaSalvo.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                estado: estado ? String(estado).trim() : null,
                pais: pais ? String(pais).trim() : null,
                lat: Number(lat),
                lon: Number(lon)
            }
        });

        res.status(201).json(novoLocal);
    } catch (err) {
        console.error('Erro ao salvar local:', err);
        res.status(500).json({ error: 'Erro ao salvar local' });
    }
});

/**
 * ROTA: Remover Local de Clima Salvo
 * DELETE /api/clima/salvos/:id
 */
app.delete('/api/clima/salvos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.localClimaSalvo.deleteMany({
            where: { id, usuarioId: req.session.userId }
        });
        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Local não encontrado' });
        }

        res.json({ success: true, message: 'Local removido com sucesso' });
    } catch (err) {
        console.error('Erro ao remover local salvo:', err);
        res.status(500).json({ error: 'Erro ao remover local salvo' });
    }
});

/**
 * ROTA: Definir/Remover o Local Favorito exibido no widget do cabeçalho
 * PUT /api/clima/salvos/:id/favorito
 */
app.put('/api/clima/salvos/:id/favorito', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const favorito = !!req.body.favorito;
        const usuarioId = req.session.userId;

        const local = await prisma.localClimaSalvo.findFirst({ where: { id, usuarioId } });
        if (!local) {
            return res.status(404).json({ error: 'Local não encontrado' });
        }

        if (favorito) {
            await prisma.localClimaSalvo.updateMany({
                where: { usuarioId, favoritoHeader: true },
                data: { favoritoHeader: false }
            });
        }

        const atualizado = await prisma.localClimaSalvo.update({
            where: { id },
            data: { favoritoHeader: favorito }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao definir local favorito:', err);
        res.status(500).json({ error: 'Erro ao definir local favorito' });
    }
});

/**
 * ROTA: Clima Atual do Local Favorito (widget compartilhado no cabeçalho de todos os módulos)
 * GET /api/clima/favorito
 */
app.get('/api/clima/favorito', async (req, res) => {
    try {
        const local = await prisma.localClimaSalvo.findFirst({
            where: { usuarioId: req.session.userId, favoritoHeader: true }
        });

        if (!local) {
            return res.json(null);
        }

        const params = new URLSearchParams({
            latitude: local.lat,
            longitude: local.lon,
            current: 'temperature_2m,weather_code,is_day',
            timezone: 'auto'
        });

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Serviço de previsão indisponível');
        }

        const dados = await response.json();
        res.json({
            nome: local.nome,
            estado: local.estado,
            pais: local.pais,
            current: dados.current
        });
    } catch (err) {
        console.error('Erro ao buscar clima do local favorito:', err);
        res.status(500).json({ error: 'Erro ao buscar clima do local favorito' });
    }
});

/**
 * ROTA: Listar Gastos da Casa (opcionalmente filtrado por mês/ano/categoria)
 * GET /api/casa/gastos?mes=&ano=&categoria=
 */
app.get('/api/casa/gastos', async (req, res) => {
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
app.post('/api/casa/gastos', async (req, res) => {
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
app.put('/api/casa/gastos/:id', async (req, res) => {
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
app.delete('/api/casa/gastos/:id', async (req, res) => {
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
app.get('/api/casa/despensa', async (req, res) => {
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
app.post('/api/casa/despensa', async (req, res) => {
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
app.put('/api/casa/despensa/:id', async (req, res) => {
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
app.delete('/api/casa/despensa/:id', async (req, res) => {
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
app.get('/api/casa/tarefas', async (req, res) => {
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
app.post('/api/casa/tarefas', async (req, res) => {
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
app.put('/api/casa/tarefas/:id', async (req, res) => {
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
app.delete('/api/casa/tarefas/:id', async (req, res) => {
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

/**
 * ROTA: Listar Blocos de Treino (com exercícios incluídos)
 * GET /api/treinos/blocos
 */
app.get('/api/treinos/blocos', async (req, res) => {
    try {
        const blocos = await prisma.blocoTreino.findMany({
            where: { usuarioId: req.session.userId },
            include: { exercicios: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] } },
            orderBy: [{ ordem: 'asc' }, { id: 'asc' }]
        });
        res.json(blocos);
    } catch (err) {
        console.error('Erro ao listar blocos de treino:', err);
        res.status(500).json({ error: 'Erro ao buscar blocos de treino' });
    }
});

/**
 * ROTA: Cadastrar Bloco de Treino
 * POST /api/treinos/blocos
 */
app.post('/api/treinos/blocos', async (req, res) => {
    try {
        const { nome, diaSemana, observacoes } = req.body;
        if (!nome) return res.status(400).json({ error: 'Nome do bloco é obrigatório.' });

        const ultimo = await prisma.blocoTreino.findFirst({
            where: { usuarioId: req.session.userId },
            orderBy: { ordem: 'desc' }
        });

        const novoBloco = await prisma.blocoTreino.create({
            data: {
                usuarioId: req.session.userId,
                nome: String(nome).trim(),
                diaSemana: diaSemana ? String(diaSemana).trim() : null,
                observacoes: observacoes ? String(observacoes).trim() : null,
                ordem: ultimo ? ultimo.ordem + 1 : 0
            },
            include: { exercicios: true }
        });

        res.status(201).json(novoBloco);
    } catch (err) {
        console.error('Erro ao cadastrar bloco de treino:', err);
        res.status(500).json({ error: 'Erro ao cadastrar bloco de treino' });
    }
});

/**
 * ROTA: Atualizar Bloco de Treino
 * PUT /api/treinos/blocos/:id
 */
app.put('/api/treinos/blocos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { nome, diaSemana, observacoes } = req.body;

        const existente = await prisma.blocoTreino.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Bloco não encontrado' });

        const atualizado = await prisma.blocoTreino.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                diaSemana: diaSemana !== undefined ? (diaSemana ? String(diaSemana).trim() : null) : existente.diaSemana,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            },
            include: { exercicios: { orderBy: [{ ordem: 'asc' }, { id: 'asc' }] } }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar bloco de treino:', err);
        res.status(500).json({ error: 'Erro ao atualizar bloco de treino' });
    }
});

/**
 * ROTA: Excluir Bloco de Treino (e seus exercícios em cascata)
 * DELETE /api/treinos/blocos/:id
 */
app.delete('/api/treinos/blocos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.blocoTreino.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Bloco não encontrado' });
        res.json({ success: true, message: 'Bloco excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir bloco de treino:', err);
        res.status(500).json({ error: 'Erro ao excluir bloco de treino' });
    }
});

/**
 * ROTA: Cadastrar Exercício em um Bloco de Treino
 * POST /api/treinos/blocos/:blocoId/exercicios
 */
app.post('/api/treinos/blocos/:blocoId/exercicios', async (req, res) => {
    try {
        const blocoId = parseInt(req.params.blocoId, 10);
        const { nome, series, repeticoes, carga, observacoes } = req.body;

        const bloco = await prisma.blocoTreino.findFirst({ where: { id: blocoId, usuarioId: req.session.userId } });
        if (!bloco) return res.status(404).json({ error: 'Bloco não encontrado' });

        if (!nome) return res.status(400).json({ error: 'Nome do exercício é obrigatório.' });

        const ultimo = await prisma.exercicioTreino.findFirst({ where: { blocoId }, orderBy: { ordem: 'desc' } });

        const novoExercicio = await prisma.exercicioTreino.create({
            data: {
                blocoId,
                nome: String(nome).trim(),
                series: series !== undefined && series !== '' ? parseInt(series, 10) : null,
                repeticoes: repeticoes ? String(repeticoes).trim() : null,
                carga: carga ? String(carga).trim() : null,
                observacoes: observacoes ? String(observacoes).trim() : null,
                ordem: ultimo ? ultimo.ordem + 1 : 0
            }
        });

        res.status(201).json(novoExercicio);
    } catch (err) {
        console.error('Erro ao cadastrar exercício:', err);
        res.status(500).json({ error: 'Erro ao cadastrar exercício' });
    }
});

/**
 * ROTA: Atualizar Exercício de Treino
 * PUT /api/treinos/exercicios/:id
 */
app.put('/api/treinos/exercicios/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { nome, series, repeticoes, carga, observacoes } = req.body;

        const existente = await prisma.exercicioTreino.findFirst({
            where: { id, bloco: { usuarioId: req.session.userId } }
        });
        if (!existente) return res.status(404).json({ error: 'Exercício não encontrado' });

        const atualizado = await prisma.exercicioTreino.update({
            where: { id },
            data: {
                nome: nome ? String(nome).trim() : existente.nome,
                series: series !== undefined ? (series !== '' ? parseInt(series, 10) : null) : existente.series,
                repeticoes: repeticoes !== undefined ? (repeticoes ? String(repeticoes).trim() : null) : existente.repeticoes,
                carga: carga !== undefined ? (carga ? String(carga).trim() : null) : existente.carga,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar exercício:', err);
        res.status(500).json({ error: 'Erro ao atualizar exercício' });
    }
});

/**
 * ROTA: Excluir Exercício de Treino
 * DELETE /api/treinos/exercicios/:id
 */
app.delete('/api/treinos/exercicios/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.exercicioTreino.deleteMany({
            where: { id, bloco: { usuarioId: req.session.userId } }
        });
        if (resultado.count === 0) return res.status(404).json({ error: 'Exercício não encontrado' });
        res.json({ success: true, message: 'Exercício excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir exercício:', err);
        res.status(500).json({ error: 'Erro ao excluir exercício' });
    }
});

/**
 * ROTA: Listar Registros de Saúde (peso/medidas, água, sono)
 * GET /api/saude/registros
 */
app.get('/api/saude/registros', async (req, res) => {
    try {
        const registros = await prisma.registroSaude.findMany({
            where: { usuarioId: req.session.userId },
            orderBy: { data: 'desc' }
        });
        res.json(registros);
    } catch (err) {
        console.error('Erro ao listar registros de saúde:', err);
        res.status(500).json({ error: 'Erro ao buscar registros de saúde' });
    }
});

/**
 * ROTA: Cadastrar Registro de Saúde
 * POST /api/saude/registros
 */
app.post('/api/saude/registros', async (req, res) => {
    try {
        const { data, peso, cintura, aguaMl, sonoHoras, observacoes } = req.body;

        const novoRegistro = await prisma.registroSaude.create({
            data: {
                usuarioId: req.session.userId,
                data: data ? new Date(data) : new Date(),
                peso: peso !== undefined && peso !== '' ? Number(peso) : null,
                cintura: cintura !== undefined && cintura !== '' ? Number(cintura) : null,
                aguaMl: aguaMl !== undefined && aguaMl !== '' ? parseInt(aguaMl, 10) : null,
                sonoHoras: sonoHoras !== undefined && sonoHoras !== '' ? Number(sonoHoras) : null,
                observacoes: observacoes ? String(observacoes).trim() : null
            }
        });

        res.status(201).json(novoRegistro);
    } catch (err) {
        console.error('Erro ao cadastrar registro de saúde:', err);
        res.status(500).json({ error: 'Erro ao cadastrar registro de saúde' });
    }
});

/**
 * ROTA: Atualizar Registro de Saúde
 * PUT /api/saude/registros/:id
 */
app.put('/api/saude/registros/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { data, peso, cintura, aguaMl, sonoHoras, observacoes } = req.body;

        const existente = await prisma.registroSaude.findFirst({ where: { id, usuarioId: req.session.userId } });
        if (!existente) return res.status(404).json({ error: 'Registro não encontrado' });

        const atualizado = await prisma.registroSaude.update({
            where: { id },
            data: {
                data: data ? new Date(data) : existente.data,
                peso: peso !== undefined ? (peso !== '' ? Number(peso) : null) : existente.peso,
                cintura: cintura !== undefined ? (cintura !== '' ? Number(cintura) : null) : existente.cintura,
                aguaMl: aguaMl !== undefined ? (aguaMl !== '' ? parseInt(aguaMl, 10) : null) : existente.aguaMl,
                sonoHoras: sonoHoras !== undefined ? (sonoHoras !== '' ? Number(sonoHoras) : null) : existente.sonoHoras,
                observacoes: observacoes !== undefined ? (observacoes ? String(observacoes).trim() : null) : existente.observacoes
            }
        });

        res.json(atualizado);
    } catch (err) {
        console.error('Erro ao atualizar registro de saúde:', err);
        res.status(500).json({ error: 'Erro ao atualizar registro de saúde' });
    }
});

/**
 * ROTA: Excluir Registro de Saúde
 * DELETE /api/saude/registros/:id
 */
app.delete('/api/saude/registros/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const resultado = await prisma.registroSaude.deleteMany({ where: { id, usuarioId: req.session.userId } });
        if (resultado.count === 0) return res.status(404).json({ error: 'Registro não encontrado' });
        res.json({ success: true, message: 'Registro excluído com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir registro de saúde:', err);
        res.status(500).json({ error: 'Erro ao excluir registro de saúde' });
    }
});

/**
 * ROTA: Listar Veículos da Garagem Pessoal (com manutenções incluídas)
 * GET /api/garagem/veiculos?status=&search=
 */
app.get('/api/garagem/veiculos', async (req, res) => {
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
app.post('/api/garagem/veiculos', async (req, res) => {
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
app.put('/api/garagem/veiculos/:id', async (req, res) => {
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
app.delete('/api/garagem/veiculos/:id', async (req, res) => {
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
app.post('/api/garagem/veiculos/:id/manutencoes', async (req, res) => {
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
app.put('/api/garagem/manutencoes/:id', async (req, res) => {
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
app.delete('/api/garagem/manutencoes/:id', async (req, res) => {
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

/**
 * Busca os eventos do usuário cujo lembrete configurado já está dentro da janela de aviso
 * (do horário do lembrete até o término do evento) e que ainda não foram dispensados.
 */
async function buscarEventosComNotificacaoAtiva(usuarioId) {
    const agora = new Date();
    const limiteFuturo = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

    const eventos = await prisma.evento.findMany({
        where: {
            usuarioId,
            lembreteMinutos: { not: null },
            notificacaoDispensada: false,
            fim: { gte: agora },
            inicio: { lte: limiteFuturo }
        },
        orderBy: { inicio: 'asc' }
    });

    return eventos.filter(ev => {
        const horarioLembrete = new Date(ev.inicio.getTime() - (ev.lembreteMinutos || 0) * 60 * 1000);
        return agora >= horarioLembrete;
    });
}

/**
 * ROTA: Notificações Pendentes (sino do cabeçalho)
 * Retorna os eventos cujo lembrete configurado já está dentro da janela de aviso
 * (do horário do lembrete até o término do evento), para alertar o usuário.
 * GET /api/notificacoes
 */
app.get('/api/notificacoes', async (req, res) => {
    try {
        const agora = new Date();
        const eventos = await buscarEventosComNotificacaoAtiva(req.session.userId);

        const notificacoes = eventos.map(ev => ({
            id: ev.id,
            titulo: ev.titulo,
            local: ev.local,
            inicio: ev.inicio,
            fim: ev.fim,
            diaTodo: ev.diaTodo,
            cor: ev.cor,
            atualizadoEm: ev.updatedAt,
            emAndamento: agora >= ev.inicio && agora <= ev.fim
        }));

        res.json(notificacoes);
    } catch (err) {
        console.error('Erro ao buscar notificações:', err);
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

/**
 * ROTA: Dispensar Todas as Notificações Ativas do Usuário
 * (marca os eventos correspondentes como notificacaoDispensada, sem apagar os eventos)
 * DELETE /api/notificacoes
 */
app.delete('/api/notificacoes', async (req, res) => {
    try {
        const eventos = await buscarEventosComNotificacaoAtiva(req.session.userId);
        const ids = eventos.map(ev => ev.id);

        if (ids.length > 0) {
            await prisma.evento.updateMany({
                where: { id: { in: ids }, usuarioId: req.session.userId },
                data: { notificacaoDispensada: true }
            });
        }

        res.json({ success: true, removidas: ids.length });
    } catch (err) {
        console.error('Erro ao apagar notificações:', err);
        res.status(500).json({ error: 'Erro ao apagar notificações' });
    }
});

/**
 * ROTA: Dispensar uma Notificação Específica
 * (marca o evento como notificacaoDispensada, sem apagar o evento em si)
 * DELETE /api/notificacoes/:id
 */
app.delete('/api/notificacoes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        const resultado = await prisma.evento.updateMany({
            where: { id, usuarioId: req.session.userId },
            data: { notificacaoDispensada: true }
        });

        if (resultado.count === 0) {
            return res.status(404).json({ error: 'Notificação não encontrada' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao apagar notificação:', err);
        res.status(500).json({ error: 'Erro ao apagar notificação' });
    }
});

// Redirecionamento da raiz para a página inicial
app.get('/', (req, res) => {
    res.redirect('/HTML/Index/index.html');
});

/**
 * Garante que as colunas novas do alerta de preço de FII existam no banco, mesmo que o
 * `prisma db push` não tenha sido rodado manualmente ainda. Idempotente (IF NOT EXISTS),
 * seguro de rodar toda vez que o servidor sobe.
 */
async function garantirColunasAlertaFII() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "email" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "InvestimentoFII" ADD COLUMN IF NOT EXISTS "alertaPrecoAbaixoDe" DOUBLE PRECISION`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "InvestimentoFII" ADD COLUMN IF NOT EXISTS "alertaDisparado" BOOLEAN NOT NULL DEFAULT false`);
        console.log('[Prisma] Colunas de alerta de preço de FII verificadas/criadas com sucesso.');
    } catch (e) {
        console.error('[Prisma] Falha ao garantir colunas de alerta de FII:', e.message);
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

/**
 * Job agendado: a cada 5 minutos, atualiza a cotação de todo FII que tenha um alerta de preço
 * configurado (alertaPrecoAbaixoDe) e dispara e-mail para o dono da carteira quando o preço
 * cruzar abaixo do limite. Roda no servidor, independente de alguém estar com o site aberto.
 */
async function verificarAlertasPrecoFII() {
    try {
        const investimentos = await prisma.investimentoFII.findMany({
            where: { alertaPrecoAbaixoDe: { not: null } },
            include: { usuario: { select: { email: true } } }
        });

        await Promise.all(investimentos.map(async (inv) => {
            try {
                await atualizarPrecoFiiEChecarAlerta(inv, inv.usuario?.email);
            } catch (e) {
                console.error(`[Alerta FII] Falha ao checar ${inv.ticker}:`, e.message);
            }
        }));
    } catch (err) {
        console.error('[Alerta FII] Falha no job agendado:', err.message);
    }
}

cron.schedule('*/5 * * * *', verificarAlertasPrecoFII);

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(` AutoLeilão Hub (FinanceHub) rodando na porta ${PORT}`);
    console.log(` Acesso web: http://localhost:${PORT}/HTML/Index/index.html`);
    console.log(`====================================================`);
    console.log(mailTransporter ? ' Alertas de preço por e-mail: ativos (SMTP configurado)' : ' Alertas de preço por e-mail: DESATIVADOS (defina SMTP_USER e SMTP_PASS no .env)');
    console.log(`====================================================`);
    await garantirColunasAlertaFII();
    await seedUsuarios();
});
