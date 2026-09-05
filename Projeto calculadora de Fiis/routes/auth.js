const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../lib/auth-middleware');

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
});

/**
 * ROTA: Login
 * POST /api/auth/login
 */
router.post('/login', loginLimiter, async (req, res) => {
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
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

/**
 * ROTA: Sessão Atual
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: req.session.userId } });
    if (!usuario) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    res.json({ id: usuario.id, username: usuario.username, nome: usuario.nome, fotoUrl: usuario.fotoUrl, email: usuario.email, role: usuario.role });
});

/**
 * ROTA: Atualizar Perfil do Usuário Logado (Nome, Foto e E-mail)
 * PUT /api/auth/perfil
 */
router.put('/perfil', requireAuth, async (req, res) => {
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
router.get('/modulos-ocultos', requireAuth, async (req, res) => {
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

router.post('/modulos-ocultos/:modulo', requireAuth, async (req, res) => {
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
router.delete('/modulos-ocultos/:modulo', requireAuth, async (req, res) => {
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
router.put('/senha', requireAuth, async (req, res) => {
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

/**
 * ROTA: Listar Todos os Usuários do Sistema (apenas Administradores)
 * GET /api/auth/usuarios
 */
router.get('/usuarios', requireAuth, requireAdmin, async (req, res) => {
    try {
        const usuarios = await prisma.usuario.findMany({
            select: { id: true, username: true, nome: true, role: true, createdAt: true },
            orderBy: { nome: 'asc' }
        });
        res.json(usuarios);
    } catch (err) {
        console.error('Erro ao listar usuários:', err);
        res.status(500).json({ error: 'Erro ao listar usuários' });
    }
});

/**
 * ROTA: Criar Novo Usuário (Administrador ou Comum) — apenas Administradores
 * POST /api/auth/usuarios
 */
router.post('/usuarios', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { username, nome, senha, role } = req.body;

        if (!username || !String(username).trim() || !nome || !String(nome).trim() || !senha) {
            return res.status(400).json({ error: 'Usuário, nome e senha são obrigatórios.' });
        }
        if (String(senha).length < 4) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
        }
        const roleFinal = role === 'admin' ? 'admin' : 'usuario';

        const senhaHash = await bcrypt.hash(senha, 10);
        const usuario = await prisma.usuario.create({
            data: { username: String(username).trim(), nome: String(nome).trim(), senhaHash, role: roleFinal }
        });

        res.status(201).json({ id: usuario.id, username: usuario.username, nome: usuario.nome, role: usuario.role, createdAt: usuario.createdAt });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'Já existe um usuário com esse nome de login.' });
        }
        console.error('Erro ao criar usuário:', err);
        res.status(500).json({ error: 'Erro ao criar usuário' });
    }
});

/**
 * ROTA: Atualizar Dados de um Usuário (Nome, Login e Cargo) — apenas Administradores
 * PUT /api/auth/usuarios/:id
 */
router.put('/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { username, nome, role } = req.body;

        const data = {};
        if (nome !== undefined) {
            if (!String(nome).trim()) return res.status(400).json({ error: 'O nome não pode ficar em branco.' });
            data.nome = String(nome).trim();
        }
        if (username !== undefined) {
            if (!String(username).trim()) return res.status(400).json({ error: 'O login não pode ficar em branco.' });
            data.username = String(username).trim();
        }
        if (role !== undefined) {
            if (!['admin', 'usuario'].includes(role)) return res.status(400).json({ error: 'Cargo inválido.' });

            if (role !== 'admin' && id === req.session.userId) {
                return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de administrador.' });
            }
            if (role !== 'admin') {
                const totalAdmins = await prisma.usuario.count({ where: { role: 'admin' } });
                const alvo = await prisma.usuario.findUnique({ where: { id }, select: { role: true } });
                if (alvo?.role === 'admin' && totalAdmins <= 1) {
                    return res.status(400).json({ error: 'Deve existir ao menos um administrador no sistema.' });
                }
            }
            data.role = role;
        }

        const usuario = await prisma.usuario.update({ where: { id }, data });
        res.json({ id: usuario.id, username: usuario.username, nome: usuario.nome, role: usuario.role });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'Já existe um usuário com esse nome de login.' });
        }
        console.error('Erro ao atualizar usuário:', err);
        res.status(500).json({ error: 'Erro ao atualizar usuário' });
    }
});

/**
 * ROTA: Redefinir a Senha de um Usuário Gerenciado — apenas Administradores
 * PUT /api/auth/usuarios/:id/senha
 */
router.put('/usuarios/:id/senha', requireAuth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { novaSenha } = req.body;

        if (!novaSenha || String(novaSenha).length < 4) {
            return res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' });
        }

        const senhaHash = await bcrypt.hash(novaSenha, 10);
        await prisma.usuario.update({ where: { id }, data: { senhaHash } });

        res.json({ success: true, message: 'Senha redefinida com sucesso.' });
    } catch (err) {
        console.error('Erro ao redefinir senha:', err);
        res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
});

/**
 * ROTA: Excluir um Usuário — apenas Administradores
 * DELETE /api/auth/usuarios/:id
 * Atenção: exclui em cascata todos os dados do usuário (veículos, imóveis, FIIs, etc.)
 */
router.delete('/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (id === req.session.userId) {
            return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
        }

        const alvo = await prisma.usuario.findUnique({ where: { id }, select: { role: true } });
        if (!alvo) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        if (alvo.role === 'admin') {
            const totalAdmins = await prisma.usuario.count({ where: { role: 'admin' } });
            if (totalAdmins <= 1) {
                return res.status(400).json({ error: 'Deve existir ao menos um administrador no sistema.' });
            }
        }

        await prisma.usuario.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao excluir usuário:', err);
        res.status(500).json({ error: 'Erro ao excluir usuário' });
    }
});

module.exports = router;
