const prisma = require('./prisma');
const { buscarCotacaoCripto } = require('./cripto-shared');
const { enviarEmailAlertaPrecoAtivo } = require('./fii-alerts');

/**
 * Atualiza a cotação (já buscada) de um InvestimentoCripto e, se ele tiver um
 * alertaPrecoAbaixoDe configurado, dispara um e-mail quando o preço cruza abaixo do
 * limite. Mesma regra da flag alertaDisparado usada pelo FII: só reenvia depois que o
 * preço se recupera acima do limite e cai outra vez.
 */
async function atualizarPrecoCriptoEChecarAlerta(inv, precoAtual, emailUsuario) {
    const data = { precoAtual, precoAtualizadoEm: new Date() };

    if (inv.alertaPrecoAbaixoDe != null) {
        if (precoAtual < inv.alertaPrecoAbaixoDe && !inv.alertaDisparado) {
            data.alertaDisparado = true;
            if (emailUsuario) {
                enviarEmailAlertaPrecoAtivo(emailUsuario, inv.ticker, precoAtual, inv.alertaPrecoAbaixoDe, 'Criptomoeda', 'carteira')
                    .catch(e => console.error(`[Alerta Cripto] Falha ao enviar e-mail (${inv.ticker}):`, e.message));
            }
        } else if (precoAtual >= inv.alertaPrecoAbaixoDe && inv.alertaDisparado) {
            data.alertaDisparado = false;
        }
    }

    await prisma.investimentoCripto.update({ where: { id: inv.id }, data });
    return precoAtual;
}

/**
 * Job agendado: a cada 5 minutos, atualiza a cotação de toda criptomoeda que tenha um
 * alerta de preço configurado e dispara e-mail quando o preço cruzar abaixo do limite.
 * Busca as cotações da CoinGecko em uma única chamada (evita bater o rate limit da API).
 */
async function verificarAlertasPrecoCripto() {
    try {
        const investimentos = await prisma.investimentoCripto.findMany({
            where: { alertaPrecoAbaixoDe: { not: null } },
            include: { usuario: { select: { email: true } } }
        });

        if (investimentos.length === 0) return;

        let cotacoes = {};
        try {
            cotacoes = await buscarCotacaoCripto(investimentos.map(inv => inv.moedaId));
        } catch (e) {
            console.error('[Alerta Cripto] Falha ao buscar cotações:', e.message);
            return;
        }

        await Promise.all(investimentos.map(async (inv) => {
            const precoAtual = cotacoes[inv.moedaId]?.brl;
            if (typeof precoAtual !== 'number') return;
            try {
                await atualizarPrecoCriptoEChecarAlerta(inv, precoAtual, inv.usuario?.email);
            } catch (e) {
                console.error(`[Alerta Cripto] Falha ao checar ${inv.ticker}:`, e.message);
            }
        }));
    } catch (err) {
        console.error('[Alerta Cripto] Falha no job agendado:', err.message);
    }
}

module.exports = { atualizarPrecoCriptoEChecarAlerta, verificarAlertasPrecoCripto };
