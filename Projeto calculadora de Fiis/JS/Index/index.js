/**
 * JS/Index/index.js
 * Lógica da Visão Geral Consolidada (FinanceHub)
 * Carrega métricas consolidadas dos módulos, gerencia tema e navegação global
 */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initDateDisplay();
    carregarModuloLeilaoCarros();
    carregarBadgeCofrinho();
    carregarBadgeFii();
    carregarModuloCasas();
    carregarModuloCripto();
    carregarDadosConsolidadosHub();
    carregarResumoDoDia();
});

/**
 * Resumo do Dia: combina o próximo evento do Calendário, o clima do local favorito
 * e a fatura de cartão mais próxima do vencimento num único painel no topo do dashboard.
 */
async function carregarResumoDoDia() {
    const elEvento = document.getElementById('todaySummaryEvento');
    const cardClima = document.getElementById('todaySummaryClimaCard');
    const elClimaIcone = document.getElementById('todaySummaryClimaIcone');
    const elClima = document.getElementById('todaySummaryClima');
    const cardFatura = document.getElementById('todaySummaryFaturaCard');
    const elFatura = document.getElementById('todaySummaryFatura');

    const agora = new Date();
    const daquiA14Dias = new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [eventosRes, climaRes, resumoRes] = await Promise.allSettled([
        fetch(`/api/eventos?inicio=${agora.toISOString()}&fim=${daquiA14Dias.toISOString()}`),
        fetch('/api/clima/favorito'),
        fetch('/api/financas/resumo')
    ]);

    if (elEvento) {
        let texto = 'Nenhum evento próximo';
        try {
            if (eventosRes.status === 'fulfilled' && eventosRes.value.ok) {
                const eventos = await eventosRes.value.json();
                const proximo = (Array.isArray(eventos) ? eventos : [])
                    .filter(ev => new Date(ev.fim) >= agora)
                    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0];
                if (proximo) texto = `${formatarDataResumoEvento(proximo.inicio, proximo.diaTodo)} · ${proximo.titulo}`;
            }
        } catch { /* mantém texto padrão */ }
        elEvento.textContent = texto;
        elEvento.classList.remove('is-loading');
    }

    try {
        if (climaRes.status === 'fulfilled' && climaRes.value.ok) {
            const dados = await climaRes.value.json();
            if (dados && dados.current && typeof obterInfoClima === 'function') {
                const info = obterInfoClima(dados.current.weather_code, dados.current.is_day);
                if (elClimaIcone) elClimaIcone.textContent = info.icone;
                if (elClima) elClima.textContent = `${Math.round(dados.current.temperature_2m)}° em ${dados.nome}`;
                if (cardClima) cardClima.style.display = 'flex';
            }
        }
    } catch { /* widget de clima permanece oculto */ }

    try {
        if (resumoRes.status === 'fulfilled' && resumoRes.value.ok) {
            const resumo = await resumoRes.value.json();
            const proxima = (resumo.faturasAbertas || [])
                .filter(f => f.fatura && f.fatura.dataVencimento)
                .sort((a, b) => new Date(a.fatura.dataVencimento) - new Date(b.fatura.dataVencimento))[0];
            if (proxima && elFatura && cardFatura) {
                const dataFmt = new Date(proxima.fatura.dataVencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                elFatura.textContent = `${proxima.nome}: ${formatarMoeda(proxima.fatura.valorTotal)} (vence ${dataFmt})`;
                cardFatura.style.display = 'flex';
            }
        }
    } catch { /* card de fatura permanece oculto */ }
}

function formatarDataResumoEvento(inicioIso, diaTodo) {
    const data = new Date(inicioIso);
    const agora = new Date();
    const amanha = new Date(agora);
    amanha.setDate(amanha.getDate() + 1);

    let prefixo;
    if (data.toDateString() === agora.toDateString()) prefixo = 'Hoje';
    else if (data.toDateString() === amanha.toDateString()) prefixo = 'Amanhã';
    else prefixo = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    if (diaTodo) return prefixo;
    return `${prefixo}, ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Cores fixas por módulo, espelhando os acentos usados nos cards da grade
 * (ver .module-feature-card[data-modulo] em CSS/Index/index.css).
 */
const CORES_MODULOS_HUB = {
    fii: '#EEBB00',
    cripto: '#3B82F6',
    leilao: '#F97316',
    casasleilao: '#8B5CF6',
    cofrinho: '#EC4899'
};

let chartAlocacaoModulos = null;
let chartResultadoModulos = null;
let ultimosDadosGraficosHub = null;

async function carregarDadosConsolidadosHub() {
    const [fiiRes, criptoRes, cofrinhoRes, imoveisRes, dashboardRes] = await Promise.allSettled([
        fetch('/api/fii', { cache: 'no-store' }),
        fetch('/api/cripto'),
        fetch('/api/cofrinhos'),
        fetch('/api/imoveis'),
        fetch('/api/dashboard')
    ]);

    const lerJson = async (resultado) => {
        if (resultado.status !== 'fulfilled' || !resultado.value.ok) return [];
        try { return await resultado.value.json(); } catch { return []; }
    };

    const fundos = await lerJson(fiiRes);
    const moedas = await lerJson(criptoRes);
    const cofrinhos = await lerJson(cofrinhoRes);
    const imoveis = await lerJson(imoveisRes);
    const dashboard = dashboardRes.status === 'fulfilled' && dashboardRes.value.ok
        ? await dashboardRes.value.json().catch(() => ({}))
        : {};

    // FII: patrimônio de mercado, custo de aquisição e renda mensal estimada
    let fiiPatrimonio = 0, fiiInvestido = 0, fiiRendaMensal = 0;
    (Array.isArray(fundos) ? fundos : []).forEach(item => {
        const cotas = item.cotas || 0;
        const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
        fiiPatrimonio += cotas * (precoRef || 0);
        fiiInvestido += cotas * (item.precoMedio || 0);
        fiiRendaMensal += cotas * (item.ultimoDividendo || 0);
    });

    // Cripto: patrimônio de mercado e valorização em R$
    let criptoPatrimonio = 0, criptoInvestido = 0;
    (Array.isArray(moedas) ? moedas : []).forEach(m => {
        const precoRef = m.precoAtual != null ? m.precoAtual : m.precoMedio;
        criptoInvestido += (m.quantidade || 0) * (m.precoMedio || 0);
        criptoPatrimonio += (m.quantidade || 0) * (precoRef || 0);
    });
    const criptoValorizacaoRS = criptoPatrimonio - criptoInvestido;

    // Cofrinho: valor investido e rendimento bruto acumulado
    let cofrinhoInvestido = 0, cofrinhoRendimento = 0;
    (Array.isArray(cofrinhos) ? cofrinhos : []).forEach(item => {
        const valorInvestido = Number(item.valorInvestido) || 0;
        const rendaPorDia = Number(item.rendaPorDia) || 0;
        const taxaDiaria = valorInvestido > 0 ? rendaPorDia / valorInvestido : 0;
        const diasCorridos = calcularDiasCorridosCofrinho(item.dataInicio);
        const diasUteis = contarDiasUteisCofrinho(item.dataInicio, diasCorridos);
        const saldoBruto = valorInvestido * Math.pow(1 + taxaDiaria, diasUteis);

        cofrinhoInvestido += valorInvestido;
        cofrinhoRendimento += saldoBruto - valorInvestido;
    });

    // Casas de Leilão: capital alocado em estoque, lucro apurado em vendas e custo total investido (vendidos + estoque)
    let casasCapital = 0, casasLucro = 0, casasCustoTotal = 0, casasEmEstoque = 0, casasVendidos = 0;
    (Array.isArray(imoveis) ? imoveis : []).forEach(im => {
        casasCustoTotal += Number(im.custoTotal || 0);
        if (im.status === 'Vendido') {
            casasVendidos++;
            if (im.lucroBruto !== null && im.lucroBruto !== undefined) casasLucro += Number(im.lucroBruto);
        } else {
            casasEmEstoque++;
            casasCapital += Number(im.custoTotal || 0);
        }
    });

    // Carros de Leilão: capital alocado, lucro acumulado e contagens (via /api/dashboard)
    const kpis = dashboard.kpis || {};
    const leilaoCapital = Number(kpis.capitalInvestidoParado || 0);
    const leilaoLucro = Number(kpis.lucroTotalAcumulado || 0);
    const leilaoEmEstoque = Number(kpis.totalEstoque || 0);
    const leilaoVendidos = Number(kpis.totalVendidos || 0);

    ultimosDadosGraficosHub = {
        alocacao: [fiiPatrimonio, criptoPatrimonio, cofrinhoInvestido, casasCapital, leilaoCapital],
        resultado: [fiiRendaMensal, criptoValorizacaoRS, cofrinhoRendimento, casasLucro, leilaoLucro]
    };
    if (typeof Chart !== 'undefined') renderizarGraficosHub(ultimosDadosGraficosHub);

    atualizarKpisGlobaisHub({
        capitalAlocado: fiiPatrimonio + criptoPatrimonio + cofrinhoInvestido + casasCapital + leilaoCapital,
        ativosEmAndamento: (Array.isArray(fundos) ? fundos.length : 0)
            + (Array.isArray(moedas) ? moedas.length : 0)
            + (Array.isArray(cofrinhos) ? cofrinhos.length : 0)
            + casasEmEstoque + leilaoEmEstoque,
        lucroLiquido: casasLucro + leilaoLucro + cofrinhoRendimento,
        operacoesFinalizadas: casasVendidos + leilaoVendidos,
        ganhoParaRoi: (fiiPatrimonio - fiiInvestido) + criptoValorizacaoRS + cofrinhoRendimento + casasLucro + leilaoLucro,
        capitalBaseRoi: fiiInvestido + criptoInvestido + cofrinhoInvestido + casasCustoTotal + leilaoCapital
    });
}

/**
 * Preenche os 3 KPIs "Globais" do painel com totais que somam todos os módulos
 * (FII, Cripto, Cofrinho, Casas e Carros de Leilão), não apenas Carros de Leilão.
 */
function atualizarKpisGlobaisHub({ capitalAlocado, ativosEmAndamento, lucroLiquido, operacoesFinalizadas, ganhoParaRoi, capitalBaseRoi }) {
    const roiGlobal = capitalBaseRoi > 0 ? (ganhoParaRoi / capitalBaseRoi) * 100 : 0;

    const hubLucroTotal = document.getElementById('hubLucroTotal');
    const hubQtdOperacoes = document.getElementById('hubQtdOperacoes');
    const hubCapitalAlocado = document.getElementById('hubCapitalAlocado');
    const hubQtdAtivos = document.getElementById('hubQtdAtivos');
    const hubRoiMedio = document.getElementById('hubRoiMedio');

    if (hubLucroTotal) { hubLucroTotal.textContent = formatarMoeda(lucroLiquido); hubLucroTotal.classList.remove('is-loading'); }
    if (hubQtdOperacoes) hubQtdOperacoes.textContent = `${operacoesFinalizadas} operação(ões) finalizada(s)`;
    if (hubCapitalAlocado) { hubCapitalAlocado.textContent = formatarMoeda(capitalAlocado); hubCapitalAlocado.classList.remove('is-loading'); }
    if (hubQtdAtivos) hubQtdAtivos.textContent = `${ativosEmAndamento} ativo(s) em andamento`;
    if (hubRoiMedio) { hubRoiMedio.textContent = `${roiGlobal.toFixed(1)}%`; hubRoiMedio.classList.remove('is-loading'); }
}

function renderizarGraficosHub({ alocacao, resultado }) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#FFFFFF' : '#1C1C1E';
    const borderColor = isDark ? '#2C2C2E' : '#E5E5EA';
    const labels = ['FIIs', 'Cripto', 'Cofrinho', 'Casas de Leilão', 'Carros de Leilão'];
    const cores = [
        CORES_MODULOS_HUB.fii,
        CORES_MODULOS_HUB.cripto,
        CORES_MODULOS_HUB.cofrinho,
        CORES_MODULOS_HUB.casasleilao,
        CORES_MODULOS_HUB.leilao
    ];

    const ctxAlocacao = document.getElementById('chartAlocacaoModulos');
    if (ctxAlocacao) {
        if (chartAlocacaoModulos) chartAlocacaoModulos.destroy();

        const temDados = alocacao.some(v => v > 0);
        chartAlocacaoModulos = new Chart(ctxAlocacao, {
            type: 'doughnut',
            data: {
                labels: temDados ? labels : ['Sem dados ainda'],
                datasets: [{
                    data: temDados ? alocacao : [1],
                    backgroundColor: temDados ? cores : [borderColor],
                    borderColor: isDark ? '#1C1C1E' : '#FFFFFF',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: textColor, font: { weight: '600', size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: ${formatarMoeda(ctx.raw)}`
                        }
                    }
                }
            }
        });
    }

    const ctxResultado = document.getElementById('chartResultadoModulos');
    if (ctxResultado) {
        if (chartResultadoModulos) chartResultadoModulos.destroy();

        chartResultadoModulos = new Chart(ctxResultado, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Resultado (R$)',
                    data: resultado,
                    backgroundColor: cores,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${formatarMoeda(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor }
                    },
                    y: {
                        grid: { color: borderColor },
                        ticks: {
                            color: textColor,
                            callback: (v) => formatarMoeda(v)
                        }
                    }
                }
            }
        });
    }
}

async function carregarBadgeCofrinho() {
    const badge = document.getElementById('badgeCofrinhoCountIndex');

    try {
        const response = await fetch('/api/cofrinhos');
        if (!response.ok) throw new Error('API indisponível');
        const cofrinhos = await response.json();

        if (badge) badge.textContent = cofrinhos.length;

        let totalInvestido = 0;
        let totalRendaDia = 0;
        let totalRendimentoBruto = 0;

        cofrinhos.forEach(item => {
            const valorInvestido = Number(item.valorInvestido) || 0;
            const rendaPorDia = Number(item.rendaPorDia) || 0;
            const taxaDiaria = valorInvestido > 0 ? rendaPorDia / valorInvestido : 0;

            const diasCorridos = calcularDiasCorridosCofrinho(item.dataInicio);
            const diasUteis = contarDiasUteisCofrinho(item.dataInicio, diasCorridos);
            const saldoBruto = valorInvestido * Math.pow(1 + taxaDiaria, diasUteis);

            totalInvestido += valorInvestido;
            totalRendaDia += saldoBruto * taxaDiaria;
            totalRendimentoBruto += saldoBruto - valorInvestido;
        });

        const moduleCofrinhoCount = document.getElementById('moduleCofrinhoCount');
        const moduleCofrinhoInvestido = document.getElementById('moduleCofrinhoInvestido');
        const moduleCofrinhoRendaDia = document.getElementById('moduleCofrinhoRendaDia');
        const moduleCofrinhoRendimento = document.getElementById('moduleCofrinhoRendimento');

        if (moduleCofrinhoCount) moduleCofrinhoCount.textContent = `${cofrinhos.length} cofrinhos`;
        [
            [moduleCofrinhoInvestido, formatarMoeda(totalInvestido)],
            [moduleCofrinhoRendaDia, formatarMoeda(totalRendaDia)],
            [moduleCofrinhoRendimento, formatarMoeda(totalRendimentoBruto)]
        ].forEach(([el, texto]) => { if (el) { el.textContent = texto; el.classList.remove('is-loading'); } });
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de cofrinhos.', err.message);
    }
}

/**
 * Cálculo de dias corridos/úteis do Cofrinho (espelha JS/Cofrinho/cofrinho.js) para estimar
 * o rendimento bruto acumulado no card-resumo da Visão Geral.
 */
const cacheFeriadosCofrinhoIndex = {};

function calcularPascoaCofrinho(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
}

function formatarDataChaveCofrinho(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function obterFeriadosNacionaisCofrinho(ano) {
    if (cacheFeriadosCofrinhoIndex[ano]) return cacheFeriadosCofrinhoIndex[ano];
    const feriados = new Set();
    const somarDias = (data, dias) => { const n = new Date(data); n.setDate(n.getDate() + dias); return n; };
    const add = (data) => feriados.add(formatarDataChaveCofrinho(data));

    add(new Date(ano, 0, 1));
    add(new Date(ano, 3, 21));
    add(new Date(ano, 4, 1));
    add(new Date(ano, 8, 7));
    add(new Date(ano, 9, 12));
    add(new Date(ano, 10, 2));
    add(new Date(ano, 10, 15));
    add(new Date(ano, 10, 20));
    add(new Date(ano, 11, 25));

    const pascoa = calcularPascoaCofrinho(ano);
    add(somarDias(pascoa, -48));
    add(somarDias(pascoa, -47));
    add(somarDias(pascoa, -2));
    add(somarDias(pascoa, 60));

    cacheFeriadosCofrinhoIndex[ano] = feriados;
    return feriados;
}

function ehDiaUtilCofrinho(data) {
    const diaSemana = data.getDay();
    if (diaSemana === 0 || diaSemana === 6) return false;
    return !obterFeriadosNacionaisCofrinho(data.getFullYear()).has(formatarDataChaveCofrinho(data));
}

function parseDataLocalCofrinho(valor) {
    const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [, ano, mes, dia] = match;
        return new Date(Number(ano), Number(mes) - 1, Number(dia));
    }
    return new Date(valor);
}

function calcularDiasCorridosCofrinho(dataInicio) {
    const inicio = parseDataLocalCofrinho(dataInicio);
    inicio.setHours(0, 0, 0, 0);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24)) + 1);
}

function contarDiasUteisCofrinho(dataInicio, diasCorridos) {
    const inicio = parseDataLocalCofrinho(dataInicio);
    inicio.setHours(0, 0, 0, 0);
    let uteis = 0;
    for (let i = 0; i < diasCorridos; i++) {
        const data = new Date(inicio);
        data.setDate(data.getDate() + i);
        if (ehDiaUtilCofrinho(data)) uteis++;
    }
    return uteis;
}

async function carregarBadgeFii() {
    const badge = document.getElementById('badgeFiiCountIndex');

    try {
        const response = await fetch('/api/fii', { cache: 'no-store' });
        if (!response.ok) throw new Error('API indisponível');
        const fundos = await response.json();

        if (badge) badge.textContent = fundos.length;

        let totalInvestido = 0;
        let totalMercado = 0;
        let rendaMensalTotal = 0;

        fundos.forEach(item => {
            const cotas = item.cotas || 0;
            const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
            totalInvestido += cotas * (item.precoMedio || 0);
            totalMercado += cotas * (precoRef || 0);
            rendaMensalTotal += cotas * (item.ultimoDividendo || 0);
        });

        const yieldMedio = totalInvestido > 0 ? (rendaMensalTotal / totalInvestido) * 100 : 0;

        const moduleFiiCount = document.getElementById('moduleFiiCount');
        const moduleFiiRenda = document.getElementById('moduleFiiRenda');
        const moduleFiiPatrimonio = document.getElementById('moduleFiiPatrimonio');
        const moduleFiiYield = document.getElementById('moduleFiiYield');

        if (moduleFiiCount) moduleFiiCount.textContent = `${fundos.length} FIIs`;
        [
            [moduleFiiRenda, formatarMoeda(rendaMensalTotal)],
            [moduleFiiPatrimonio, formatarMoeda(totalMercado)],
            [moduleFiiYield, `${yieldMedio.toFixed(2)}% a.m.`]
        ].forEach(([el, texto]) => { if (el) { el.textContent = texto; el.classList.remove('is-loading'); } });
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de fundos imobiliários.', err.message);
        if (badge) badge.textContent = '0';
    }
}

async function carregarModuloCasas() {
    const badge = document.getElementById('badgeCasasCountIndex');

    try {
        const response = await fetch('/api/imoveis');
        if (!response.ok) throw new Error('API indisponível');
        const imoveis = await response.json();

        if (badge) badge.textContent = imoveis.length;

        let lucroTotal = 0;
        let capitalAlocado = 0;
        let totalEstoque = 0;
        let totalVendidos = 0;
        let somaRoi = 0;

        imoveis.forEach(im => {
            if (im.status === 'Vendido') {
                totalVendidos++;
                if (im.lucroBruto !== null && im.lucroBruto !== undefined) lucroTotal += Number(im.lucroBruto);
                if (im.roiPct !== null && im.roiPct !== undefined) somaRoi += Number(im.roiPct);
            } else {
                totalEstoque++;
                capitalAlocado += Number(im.custoTotal || 0);
            }
        });

        const roiMedio = totalVendidos > 0 ? (somaRoi / totalVendidos) : 0;

        const moduleCasasEstoque = document.getElementById('moduleCasasEstoque');
        const moduleCasasLucro = document.getElementById('moduleCasasLucro');
        const moduleCasasCapital = document.getElementById('moduleCasasCapital');
        const moduleCasasRoi = document.getElementById('moduleCasasRoi');

        if (moduleCasasEstoque) moduleCasasEstoque.textContent = `${totalEstoque} imóveis`;
        [
            [moduleCasasLucro, formatarMoeda(lucroTotal)],
            [moduleCasasCapital, formatarMoeda(capitalAlocado)],
            [moduleCasasRoi, `${roiMedio.toFixed(1)}%`]
        ].forEach(([el, texto]) => { if (el) { el.textContent = texto; el.classList.remove('is-loading'); } });
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de casas de leilão.', err.message);
    }
}

async function carregarModuloCripto() {
    const badge = document.getElementById('badgeCriptoCountIndex');

    try {
        const response = await fetch('/api/cripto');
        if (!response.ok) throw new Error('API indisponível');
        const moedas = await response.json();

        if (badge) badge.textContent = moedas.length;

        let totalInvestido = 0;
        let totalMercado = 0;

        moedas.forEach(m => {
            const precoRef = m.precoAtual != null ? m.precoAtual : m.precoMedio;
            totalInvestido += (m.quantidade || 0) * (m.precoMedio || 0);
            totalMercado += (m.quantidade || 0) * (precoRef || 0);
        });

        const valorizacaoPct = totalInvestido > 0 ? ((totalMercado - totalInvestido) / totalInvestido) * 100 : 0;

        const moduleCriptoCount = document.getElementById('moduleCriptoCount');
        const moduleCriptoPatrimonio = document.getElementById('moduleCriptoPatrimonio');
        const moduleCriptoCusto = document.getElementById('moduleCriptoCusto');
        const moduleCriptoValorizacao = document.getElementById('moduleCriptoValorizacao');

        if (moduleCriptoCount) moduleCriptoCount.textContent = `${moedas.length} moedas`;
        [
            [moduleCriptoPatrimonio, formatarMoeda(totalMercado)],
            [moduleCriptoCusto, formatarMoeda(totalInvestido)]
        ].forEach(([el, texto]) => { if (el) { el.textContent = texto; el.classList.remove('is-loading'); } });
        if (moduleCriptoValorizacao) {
            const sinal = valorizacaoPct >= 0 ? '+' : '';
            moduleCriptoValorizacao.textContent = `${sinal}${valorizacaoPct.toFixed(2)}%`;
            moduleCriptoValorizacao.className = `mini-stat-val ${valorizacaoPct >= 0 ? 'text-income' : 'text-expense'}`;
        }
    } catch (err) {
        console.warn('[FinanceHub] Não foi possível carregar o total de criptomoedas.', err.message);
    }
}

function initTheme() {
    const STORAGE_KEY = 'financehub_theme';
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const rootElement = document.documentElement;

    const savedTheme = localStorage.getItem(STORAGE_KEY) || 'dark';
    applyTheme(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = rootElement.getAttribute('data-theme') || 'dark';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme);
            localStorage.setItem(STORAGE_KEY, nextTheme);
            if (ultimosDadosGraficosHub && typeof Chart !== 'undefined') renderizarGraficosHub(ultimosDadosGraficosHub);
        });
    }

    function applyTheme(theme) {
        rootElement.setAttribute('data-theme', theme);
        if (themeToggleBtn) {
            themeToggleBtn.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
        }
    }
}

function initMobileNavigation() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const appSidebar = document.getElementById('appSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    if (!mobileMenuBtn || !appSidebar || !sidebarBackdrop) return;

    function openMenu() {
        appSidebar.classList.add('open');
        sidebarBackdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
        appSidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    mobileMenuBtn.addEventListener('click', () => {
        appSidebar.classList.contains('open') ? closeMenu() : openMenu();
    });

    sidebarBackdrop.addEventListener('click', closeMenu);
}

function initDateDisplay() {
    const dateElement = document.getElementById('currentDateDisplay');
    if (!dateElement) return;

    try {
        const today = new Date();
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const formattedDate = today.toLocaleDateString('pt-BR', options);
        dateElement.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    } catch {
        dateElement.textContent = 'Hoje';
    }
}

async function carregarModuloLeilaoCarros() {
    try {
        const response = await fetch('/api/dashboard');
        if (!response.ok) throw new Error('API indisponível');

        const data = await response.json();
        const kpis = data.kpis || {};

        // Card do Módulo Leilão
        document.getElementById('moduleLeilaoEstoque').textContent = `${kpis.totalEstoque || 0} carros`;
        [
            ['moduleLeilaoLucro', formatarMoeda(kpis.lucroTotalAcumulado || 0)],
            ['moduleLeilaoCapital', formatarMoeda(kpis.capitalInvestidoParado || 0)],
            ['moduleLeilaoRoi', `${(kpis.roiMedio || 0).toFixed(1)}%`]
        ].forEach(([id, texto]) => { const el = document.getElementById(id); if (el) { el.textContent = texto; el.classList.remove('is-loading'); } });

        // Badge na Sidebar
        const badge = document.getElementById('badgeLeilaoCount');
        if (badge) {
            badge.textContent = kpis.totalGeral || 0;
        }

    } catch (err) {
        console.warn('[FinanceHub] Carregando dados locais de fallback...', err.message);
        
        const localData = localStorage.getItem('autoleilao_veiculos');
        let veiculos = [];
        if (localData) {
            try { veiculos = JSON.parse(localData); } catch {}
        }

        let lucroTotal = 0;
        let capitalAlocado = 0;
        let totalVendidos = 0;
        let totalEstoque = 0;
        let somaRoi = 0;

        veiculos.forEach(v => {
            if (v.status === 'Vendido') {
                totalVendidos++;
                if (v.lucroBruto) lucroTotal += Number(v.lucroBruto);
                if (v.roiPct) somaRoi += Number(v.roiPct);
            } else {
                totalEstoque++;
                capitalAlocado += Number(v.custoTotal || 0);
            }
        });

        const roiMedio = totalVendidos > 0 ? (somaRoi / totalVendidos) : 0;

        document.getElementById('moduleLeilaoEstoque').textContent = `${totalEstoque} carros`;
        [
            ['moduleLeilaoLucro', formatarMoeda(lucroTotal)],
            ['moduleLeilaoCapital', formatarMoeda(capitalAlocado)],
            ['moduleLeilaoRoi', `${roiMedio.toFixed(1)}%`]
        ].forEach(([id, texto]) => { const el = document.getElementById(id); if (el) { el.textContent = texto; el.classList.remove('is-loading'); } });

        const badge = document.getElementById('badgeLeilaoCount');
        if (badge) badge.textContent = veiculos.length;
    }
}

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
