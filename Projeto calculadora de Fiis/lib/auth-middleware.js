const prisma = require('./prisma');

/**
 * Middleware de proteção: exige sessão de usuário autenticado
 */
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Não autenticado' });
    }
    next();
}

/**
 * Middleware de proteção: exige que o usuário logado seja Administrador (role "admin"),
 * usado nas rotas de gerenciamento de outros usuários
 */
async function requireAdmin(req, res, next) {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.session.userId } });
    if (!usuario || usuario.role !== 'admin') {
        return res.status(403).json({ error: 'Apenas administradores podem acessar este recurso.' });
    }
    next();
}

module.exports = { requireAuth, requireAdmin };
