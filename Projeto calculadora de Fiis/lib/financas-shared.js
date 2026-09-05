/**
 * lib/financas-shared.js
 * Helpers de Fatura de Cartão (competência, datas do ciclo e find-or-create) e geração de
 * transações recorrentes, compartilhados entre routes/financas.js (uso direto do usuário)
 * e o cron de recorrência agendado em server.js.
 */

const prisma = require('./prisma');

/**
 * Determina em qual competência (mês/ano) de fatura uma compra no crédito cai, com base no
 * dia de fechamento do cartão: compras após o fechamento vão para a fatura do mês seguinte.
 */
function calcularCompetencia(dataCompra, diaFechamento) {
    const d = new Date(dataCompra);
    let mes = d.getUTCDate() > diaFechamento ? d.getUTCMonth() + 2 : d.getUTCMonth() + 1;
    let ano = d.getUTCFullYear();
    if (mes > 12) { mes = 1; ano += 1; }
    return { mes, ano };
}

/**
 * Calcula a data de fechamento (no mês de referência) e de vencimento da fatura. Quando o dia
 * de vencimento é menor ou igual ao de fechamento, o vencimento cai no mês seguinte (padrão
 * mais comum de cartões: ex. fecha dia 28, vence dia 5).
 */
function calcularDatasFatura(mes, ano, diaFechamento, diaVencimento) {
    const dataFechamento = new Date(Date.UTC(ano, mes - 1, diaFechamento));
    let vencMes = mes, vencAno = ano;
    if (diaVencimento <= diaFechamento) {
        vencMes += 1;
        if (vencMes > 12) { vencMes = 1; vencAno += 1; }
    }
    const dataVencimento = new Date(Date.UTC(vencAno, vencMes - 1, diaVencimento));
    return { dataFechamento, dataVencimento };
}

async function obterOuCriarFatura(cartao, mes, ano) {
    let fatura = await prisma.faturaCartao.findUnique({
        where: { cartaoId_mesReferencia_anoReferencia: { cartaoId: cartao.id, mesReferencia: mes, anoReferencia: ano } }
    });
    if (!fatura) {
        const { dataFechamento, dataVencimento } = calcularDatasFatura(mes, ano, cartao.diaFechamento, cartao.diaVencimento);
        fatura = await prisma.faturaCartao.create({
            data: { cartaoId: cartao.id, mesReferencia: mes, anoReferencia: ano, dataFechamento, dataVencimento }
        });
    }
    return fatura;
}

/**
 * Gera a próxima ocorrência (mês seguinte) de cada transação marcada como recorrente cuja
 * data já passou e que ainda não gerou sua sucessora. A nova transação também nasce
 * recorrente=true e recorrenciaProximaGerada=false, formando uma corrente que se auto-alimenta
 * um elo por vez — sem gerar duplicatas mesmo rodando o cron várias vezes.
 * Para parar a recorrência, o usuário exclui ou desmarca a ocorrência mais recente da série.
 */
async function gerarTransacoesRecorrentesPendentes() {
    const hoje = new Date();

    const pendentes = await prisma.transacao.findMany({
        where: {
            recorrente: true,
            recorrenciaProximaGerada: false,
            data: { lte: hoje }
        },
        include: { cartao: true }
    });

    let geradas = 0;
    for (const original of pendentes) {
        try {
            const proximaData = new Date(original.data);
            proximaData.setUTCMonth(proximaData.getUTCMonth() + 1);

            let faturaId = null;
            if (original.formaPagamento === 'Crédito' && original.cartao) {
                const { mes, ano } = calcularCompetencia(proximaData, original.cartao.diaFechamento);
                const fatura = await obterOuCriarFatura(original.cartao, mes, ano);
                faturaId = fatura.id;
            }

            await prisma.transacao.create({
                data: {
                    usuarioId: original.usuarioId,
                    tipo: original.tipo,
                    descricao: original.descricao,
                    valor: original.valor,
                    data: proximaData,
                    formaPagamento: original.formaPagamento,
                    status: 'Pendente',
                    recorrente: true,
                    categoriaId: original.categoriaId,
                    contaId: original.contaId,
                    contaDestinoId: original.contaDestinoId,
                    cartaoId: original.cartaoId,
                    faturaId,
                    recorrenciaOrigemId: original.id
                }
            });

            await prisma.transacao.update({
                where: { id: original.id },
                data: { recorrenciaProximaGerada: true }
            });
            geradas++;
        } catch (err) {
            console.error(`Erro ao gerar próxima ocorrência da transação recorrente ${original.id}:`, err);
        }
    }

    return geradas;
}

module.exports = {
    calcularCompetencia,
    calcularDatasFatura,
    obterOuCriarFatura,
    gerarTransacoesRecorrentesPendentes
};
