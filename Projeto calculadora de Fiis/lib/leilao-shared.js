const prisma = require('./prisma');

/**
 * Retorna os IDs de usuário que compartilham o módulo Carros de Leilão com userId
 * (ele mesmo, mais qualquer outro usuário com o mesmo grupoLeilaoCarros definido).
 * Sem grupo configurado, o acesso continua restrito ao próprio usuário.
 */
async function obterUsuarioIdsCompartilhadosLeilao(userId) {
    const usuario = await prisma.usuario.findUnique({
        where: { id: userId },
        select: { grupoLeilaoCarros: true }
    });

    if (!usuario || !usuario.grupoLeilaoCarros) return [userId];

    const membros = await prisma.usuario.findMany({
        where: { grupoLeilaoCarros: usuario.grupoLeilaoCarros },
        select: { id: true }
    });

    return membros.map(m => m.id);
}

module.exports = { obterUsuarioIdsCompartilhadosLeilao };
