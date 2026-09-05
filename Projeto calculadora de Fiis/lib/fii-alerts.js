const nodemailer = require('nodemailer');
const prisma = require('./prisma');

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

/**
 * Envia o e-mail de alerta de queda de preço, reaproveitado por FII (carteira e watchlist)
 * e Criptomoedas — `tipoAtivo` só muda o texto ("Fundo imobiliário" / "Criptomoeda") e
 * `contexto` diferencia "sua carteira" de "sua lista de observação".
 */
async function enviarEmailAlertaPrecoAtivo(destinatario, ticker, precoAtual, limite, tipoAtivo = 'FII', contexto = 'carteira') {
    if (!mailTransporter) {
        console.warn(`[Alerta ${tipoAtivo}] SMTP_USER/SMTP_PASS não configurados — e-mail de alerta não enviado.`);
        return;
    }

    const nomeAtivo = tipoAtivo === 'Criptomoeda' ? 'A criptomoeda' : 'O fundo imobiliário';
    const nomeLocal = contexto === 'watchlist' ? 'sua lista de observação' : 'sua carteira';

    await mailTransporter.sendMail({
        from: `"FinanceHub" <${process.env.SMTP_USER}>`,
        to: destinatario,
        subject: `🔻 ${ticker} caiu abaixo de R$ ${limite.toFixed(2)}`,
        text: `${nomeAtivo} ${ticker} está cotado(a) a R$ ${precoAtual.toFixed(2)}, abaixo do limite de R$ ${limite.toFixed(2)} configurado em ${nomeLocal} no FinanceHub.`,
        html: `<p>${nomeAtivo} <strong>${ticker}</strong> caiu abaixo do limite que você configurou em ${nomeLocal} no FinanceHub.</p>
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
                enviarEmailAlertaPrecoAtivo(emailUsuario, inv.ticker, precoAtual, inv.alertaPrecoAbaixoDe, 'FII', 'carteira')
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
 * Igual a atualizarPrecoFiiEChecarAlerta, mas para um item da Lista de Observação
 * (FiiWatchlist) — um FII que o usuário NÃO possui na carteira. Mesma regra de
 * alertaDisparado, mesma fonte de cotação (Yahoo Finance), e-mail com contexto "watchlist".
 */
async function atualizarPrecoWatchlistEChecarAlerta(item, emailUsuario) {
    const { precoAtual } = await buscarCotacaoTicker(item.ticker);
    const data = { precoAtual, precoAtualizadoEm: new Date() };

    if (precoAtual < item.alertaPrecoAbaixoDe && !item.alertaDisparado) {
        data.alertaDisparado = true;
        if (emailUsuario) {
            enviarEmailAlertaPrecoAtivo(emailUsuario, item.ticker, precoAtual, item.alertaPrecoAbaixoDe, 'FII', 'watchlist')
                .catch(e => console.error(`[Alerta Watchlist FII] Falha ao enviar e-mail (${item.ticker}):`, e.message));
        }
    } else if (precoAtual >= item.alertaPrecoAbaixoDe && item.alertaDisparado) {
        data.alertaDisparado = false;
    }

    await prisma.fiiWatchlist.update({ where: { id: item.id }, data });
    return precoAtual;
}

/**
 * Job agendado: a cada 5 minutos, atualiza a cotação de todo FII que tenha um alerta de preço
 * configurado (alertaPrecoAbaixoDe) — tanto na carteira (InvestimentoFII) quanto na Lista de
 * Observação (FiiWatchlist) — e dispara e-mail quando o preço cruzar abaixo do limite. Roda no
 * servidor, independente de alguém estar com o site aberto.
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

    try {
        const itensWatchlist = await prisma.fiiWatchlist.findMany({
            include: { usuario: { select: { email: true } } }
        });

        await Promise.all(itensWatchlist.map(async (item) => {
            try {
                await atualizarPrecoWatchlistEChecarAlerta(item, item.usuario?.email);
            } catch (e) {
                console.error(`[Alerta Watchlist FII] Falha ao checar ${item.ticker}:`, e.message);
            }
        }));
    } catch (err) {
        // Tolerado: a tabela FiiWatchlist pode ainda não existir (pendente de `prisma db push` manual)
        console.error('[Alerta Watchlist FII] Falha no job agendado:', err.message);
    }
}

module.exports = {
    buscarCotacaoTicker,
    mailTransporter,
    enviarEmailAlertaPrecoAtivo,
    atualizarPrecoFiiEChecarAlerta,
    atualizarPrecoWatchlistEChecarAlerta,
    verificarAlertasPrecoFII
};
