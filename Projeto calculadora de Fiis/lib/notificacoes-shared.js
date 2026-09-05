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
 * Busca os itens da Despensa com estoque abaixo do mínimo configurado, excluindo os que
 * o usuário já dispensou no sino (NotificacaoDispensada com tipo 'estoque').
 */
async function buscarItensEstoqueBaixoAtivos(usuarioId) {
    const itens = await prisma.itemDespensa.findMany({
        where: { usuarioId, quantidadeMinima: { gt: 0 } }
    });

    const baixos = itens.filter(item => item.quantidade < item.quantidadeMinima);
    if (baixos.length === 0) return [];

    const dispensadas = await prisma.notificacaoDispensada.findMany({
        where: { usuarioId, tipo: 'estoque', entidadeId: { in: baixos.map(i => i.id) } }
    });
    const idsDispensados = new Set(dispensadas.map(d => d.entidadeId));

    return baixos.filter(item => !idsDispensados.has(item.id));
}

/**
 * Busca as Tarefas & Manutenção da Casa com data prevista já vencida e ainda não concluídas,
 * excluindo as que o usuário já dispensou no sino (NotificacaoDispensada com tipo 'tarefa').
 */
async function buscarTarefasVencidasAtivas(usuarioId) {
    const agora = new Date();
    const tarefas = await prisma.tarefaCasa.findMany({
        where: { usuarioId, dataPrevista: { lt: agora }, status: { not: 'Concluída' } }
    });

    if (tarefas.length === 0) return [];

    const dispensadas = await prisma.notificacaoDispensada.findMany({
        where: { usuarioId, tipo: 'tarefa', entidadeId: { in: tarefas.map(t => t.id) } }
    });
    const idsDispensados = new Set(dispensadas.map(d => d.entidadeId));

    return tarefas.filter(t => !idsDispensados.has(t.id));
}

module.exports = {
    buscarEventosComNotificacaoAtiva,
    buscarItensEstoqueBaixoAtivos,
    buscarTarefasVencidasAtivas
};
