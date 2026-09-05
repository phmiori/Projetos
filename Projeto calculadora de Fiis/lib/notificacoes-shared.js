const prisma = require('./prisma');

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
 * Busca faturas de cartão do usuário que vencem nos próximos 5 dias (ou já venceram) e ainda
 * não foram pagas, excluindo as que o usuário já dispensou no sino (NotificacaoDispensada com
 * tipo 'fatura').
 */
async function buscarFaturasVencendoAtivas(usuarioId) {
    const agora = new Date();
    const limiteFuturo = new Date(agora.getTime() + 5 * 24 * 60 * 60 * 1000);

    const faturas = await prisma.faturaCartao.findMany({
        where: {
            status: { not: 'Paga' },
            dataVencimento: { lte: limiteFuturo },
            cartao: { usuarioId }
        },
        include: { cartao: true }
    });

    if (faturas.length === 0) return [];

    const dispensadas = await prisma.notificacaoDispensada.findMany({
        where: { usuarioId, tipo: 'fatura', entidadeId: { in: faturas.map(f => f.id) } }
    });
    const idsDispensados = new Set(dispensadas.map(d => d.entidadeId));

    return faturas.filter(f => !idsDispensados.has(f.id));
}

module.exports = {
    buscarEventosComNotificacaoAtiva,
    buscarFaturasVencendoAtivas
};
