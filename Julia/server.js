require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const port = 3000;
const JWT_SECRET = 'bauso-super-secret-key-123';
const COMISSAO = 0.10; // 10%
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

// Configurar Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000',
});
const preference = new Preference(mpClient);
const payment = new Payment(mpClient);

// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Middleware de Autenticação JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
    req.user = user;
    next();
  });
}

// ── ROTAS DE AUTENTICAÇÃO ──

app.post('/api/auth/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone } = req.body;
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    await prisma.usuario.create({ data: { nome, email, senha: senhaHash, telefone } });
    res.status(201).json({ message: 'Conta criada com sucesso!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario) return res.status(400).json({ error: 'E-mail ou senha incorretos.' });
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) return res.status(400).json({ error: 'E-mail ou senha incorretos.' });
    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, email: usuario.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

// ── ROTAS DE ITENS ──

app.get('/api/itens', async (req, res) => {
  const { q, categoria } = req.query;
  let where = { ativo: true };
  if (q) where.titulo = { contains: q };
  if (categoria) where.categoria = categoria;
  try {
    const itens = await prisma.item.findMany({
      where,
      include: { anunciante: { select: { nome: true, telefone: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(itens);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar itens' });
  }
});

app.get('/api/itens/:id', async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { anunciante: { select: { nome: true, telefone: true, createdAt: true } } }
    });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar detalhes do item' });
  }
});

app.post('/api/itens', authenticateToken, upload.single('imagem'), async (req, res) => {
  try {
    const { titulo, descricao, precoDiario, categoria } = req.body;
    let imagemUrl = null;
    if (req.file) imagemUrl = `uploads/${req.file.filename}`;
    const item = await prisma.item.create({
      data: { titulo, descricao, precoDiario: parseFloat(precoDiario), categoria, imagemUrl, anuncianteId: req.user.id }
    });
    res.status(201).json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar item' });
  }
});

// ── ROTAS DE RESERVA E PAGAMENTO ──

// Criar reserva e gerar link de pagamento Mercado Pago
app.post('/api/reservas', authenticateToken, async (req, res) => {
  try {
    const { itemId, dataInicio, dataFim } = req.body;

    const item = await prisma.item.findUnique({
      where: { id: parseInt(itemId) },
      include: { anunciante: { select: { nome: true } } }
    });
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
    if (item.anuncianteId === req.user.id) return res.status(400).json({ error: 'Você não pode alugar o seu próprio item.' });

    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    const totalDias = Math.max(1, Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)));
    const valorTotal = parseFloat((totalDias * item.precoDiario).toFixed(2));
    const comissao = parseFloat((valorTotal * COMISSAO).toFixed(2));
    const valorAnunciante = parseFloat((valorTotal - comissao).toFixed(2));

    // Verificar conflito de datas
    const conflito = await prisma.reserva.findFirst({
      where: {
        itemId: item.id,
        status: 'pago',
        OR: [
          { dataInicio: { lte: fim }, dataFim: { gte: inicio } }
        ]
      }
    });
    if (conflito) return res.status(400).json({ error: 'Este item já está reservado nas datas escolhidas.' });

    // Criar reserva com status pendente
    const reserva = await prisma.reserva.create({
      data: {
        dataInicio: inicio,
        dataFim: fim,
        totalDias,
        valorTotal,
        comissao,
        valorAnunciante,
        status: 'pendente',
        itemId: item.id,
        locatarioId: req.user.id,
        pagamento: {
          create: { valor: valorTotal, status: 'pendente' }
        }
      }
    });

    // Criar preferência de pagamento no Mercado Pago
    const preferenceData = {
      items: [{
        id: String(item.id),
        title: `Aluguel: ${item.titulo} (${totalDias} dia${totalDias > 1 ? 's' : ''})`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: valorTotal
      }],
      payer: {
        name: req.user.nome,
        email: req.user.email
      },
      back_urls: {
        success: `${BASE_URL}/pagamento-sucesso.html?reserva=${reserva.id}`,
        failure: `${BASE_URL}/pagamento-falha.html?reserva=${reserva.id}`,
        pending: `${BASE_URL}/pagamento-sucesso.html?reserva=${reserva.id}&status=pendente`
      },
      auto_return: 'approved',
      notification_url: `${BASE_URL}/api/webhooks/mercadopago`,
      external_reference: String(reserva.id),
      metadata: { reservaId: reserva.id }
    };

    const mpResponse = await preference.create({ body: preferenceData });

    res.status(201).json({
      reservaId: reserva.id,
      checkoutUrl: mpResponse.init_point,      // URL real (produção)
      sandboxUrl: mpResponse.sandbox_init_point // URL de sandbox (testes)
    });
  } catch (error) {
    console.error('Erro ao criar reserva:', error);
    res.status(500).json({ error: 'Erro ao processar reserva. Verifique o token do Mercado Pago.' });
  }
});

// Webhook do Mercado Pago — chamado automaticamente quando pagamento é feito
app.post('/api/webhooks/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;
    res.sendStatus(200); // Responder rápido ao MP

    if (type === 'payment') {
      const paymentId = data?.id;
      if (!paymentId) return;

      const paymentData = await payment.get({ id: paymentId });
      const reservaId = parseInt(paymentData.external_reference);
      const mpStatus = paymentData.status; // approved | pending | rejected

      if (!reservaId) return;

      await prisma.pagamento.update({
        where: { reservaId },
        data: { mercadoPagoId: String(paymentId), status: mpStatus }
      });

      if (mpStatus === 'approved') {
        await prisma.reserva.update({
          where: { id: reservaId },
          data: { status: 'pago' }
        });
        console.log(`✅ Reserva #${reservaId} paga! MP ID: ${paymentId}`);
      }
    }
  } catch (error) {
    console.error('Erro no webhook MP:', error);
  }
});

// Buscar detalhes de uma reserva específica
app.get('/api/reservas/:id', authenticateToken, async (req, res) => {
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        item: { select: { titulo: true, imagemUrl: true, categoria: true } },
        locatario: { select: { nome: true, email: true } },
        pagamento: true
      }
    });
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada.' });
    if (reserva.locatarioId !== req.user.id && reserva.item.anuncianteId !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    res.json(reserva);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar reserva.' });
  }
});

// Minha conta — itens anunciados e reservas como locatário
app.get('/api/minha-conta', authenticateToken, async (req, res) => {
  try {
    const [itens, reservasComoLocatario, reservasComoAnunciante] = await Promise.all([
      prisma.item.findMany({
        where: { anuncianteId: req.user.id },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.reserva.findMany({
        where: { locatarioId: req.user.id },
        include: { item: { select: { titulo: true, imagemUrl: true, precoDiario: true } } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.reserva.findMany({
        where: { item: { anuncianteId: req.user.id } },
        include: { locatario: { select: { nome: true, email: true, telefone: true } }, item: { select: { titulo: true } } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    res.json({ itens, reservasComoLocatario, reservasComoAnunciante });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao carregar dados da conta.' });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    console.warn('⚠️  MERCADOPAGO_ACCESS_TOKEN não configurado! Pagamentos em modo de demonstração.');
  }
});
