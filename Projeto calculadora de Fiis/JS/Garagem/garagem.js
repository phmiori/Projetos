/**
 * JS/Garagem/garagem.js
 * Lógica do Módulo Garagem (Hub Pessoal): ficha completa dos veículos,
 * histórico de manutenções e histórico de veículos vendidos.
 */

const API_BASE = '/api';

const stateGaragem = {
    veiculos: [],
    buscaAtivos: '',
    ordenarAtivos: 'recentes',
    viewMode: localStorage.getItem('financehub_garagem_view') || 'grid',
    selecionados: new Set(),
    editVeiculoId: null,
    fichaVeiculoId: null,
    editManutencaoId: null
};

let chartComparativoCustos = null;
let chartResultadoVendidos = null;
let chartFichaCategoria = null;
let chartFichaEvolucao = null;

const CORES_GRAFICO = ['#EEBB00', '#D32F2F', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#6B7280', '#2E7D32'];

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initSubNav();
    initBuscaAtivos();
    initOrdenacao();
    initViewToggle();
    initComparador();
    initModalVeiculo();
    initModalFicha();
    initModalManutencao();
    carregarVeiculos();
});

// =========================================================
// SUB-NAVEGAÇÃO EM ABAS
// =========================================================

function initSubNav() {
    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.garagem-subview').forEach(v => v.classList.remove('active'));
            const alvo = document.getElementById(btn.getAttribute('data-subtarget'));
            if (alvo) alvo.classList.add('active');
        });
    });
}

// =========================================================
// CARREGAMENTO E CÁLCULOS
// =========================================================

async function carregarVeiculos() {
    try {
        const resp = await fetch(`${API_BASE}/garagem/veiculos`);
        if (!resp.ok) throw new Error('Erro ao buscar veículos');
        stateGaragem.veiculos = await resp.json();

        const idsAtivos = new Set(stateGaragem.veiculos.filter(v => v.status === 'Ativo').map(v => v.id));
        stateGaragem.selecionados.forEach(id => { if (!idsAtivos.has(id)) stateGaragem.selecionados.delete(id); });

        renderAtivos();
        renderHistorico();
    } catch (err) {
        console.warn('[Garagem] Erro ao carregar veículos.', err.message);
    }
}

function buscarVeiculo(id) {
    return stateGaragem.veiculos.find(v => v.id === id);
}

function calcularGastoManutencao(veiculo) {
    return (veiculo.manutencoes || []).reduce((s, m) => s + (m.valor || 0), 0);
}

function calcularCustoTotal(veiculo) {
    return (veiculo.valorCompra || 0) + calcularGastoManutencao(veiculo);
}

function calcularResultado(veiculo) {
    if (veiculo.valorVenda === null || veiculo.valorVenda === undefined) return null;
    return veiculo.valorVenda - calcularCustoTotal(veiculo);
}

function mesesEntre(dataInicial, dataFinal) {
    const d1 = new Date(dataInicial);
    const d2 = new Date(dataFinal);
    return Math.max(0, (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()));
}

function calcularMesesPosse(veiculo) {
    const fim = veiculo.status === 'Vendido' && veiculo.dataVenda ? new Date(veiculo.dataVenda) : new Date();
    return mesesEntre(veiculo.dataCompra, fim);
}

function calcularCustoMedioMensal(veiculo) {
    const meses = Math.max(1, calcularMesesPosse(veiculo));
    return calcularGastoManutencao(veiculo) / meses;
}

function calcularCustoPorKm(veiculo) {
    const kmFinal = veiculo.quilometragemVenda ?? veiculo.quilometragem;
    if (veiculo.quilometragemCompra !== null && veiculo.quilometragemCompra !== undefined && kmFinal !== null && kmFinal !== undefined && kmFinal > veiculo.quilometragemCompra) {
        return calcularCustoTotal(veiculo) / (kmFinal - veiculo.quilometragemCompra);
    }
    if (!veiculo.quilometragem || veiculo.quilometragem <= 0) return null;
    return calcularCustoTotal(veiculo) / veiculo.quilometragem;
}

// Exibe "2014/2015" quando há ano de fabricação diferente do ano do modelo, senão só o ano do modelo
function formatarAno(veiculo) {
    if (veiculo.anoFabricacao && veiculo.anoFabricacao !== veiculo.ano) {
        return `${veiculo.anoFabricacao}/${veiculo.ano}`;
    }
    return veiculo.ano ? String(veiculo.ano) : '';
}

// Sufixo pronto para título/nome do veículo: " (2014/2015)" ou "" se não houver ano
function anoSufixo(veiculo) {
    const ano = formatarAno(veiculo);
    return ano ? ` (${ano})` : '';
}

// Selo de alerta do card: revisão vencida tem prioridade sobre tempo sem manutenção
function calcularAlertaVeiculo(veiculo) {
    const hoje = new Date();

    if (veiculo.dataProximaRevisao && new Date(veiculo.dataProximaRevisao) < hoje) {
        return { texto: 'Revisão vencida', classe: 'pill-expense' };
    }

    const manutencoes = veiculo.manutencoes || [];
    const referencia = manutencoes.length ? manutencoes[0].data : veiculo.dataCompra;
    const meses = mesesEntre(referencia, hoje);

    if (meses >= 6) {
        return { texto: `Sem manutenção há ${meses} meses`, classe: 'pill-expense' };
    }

    return null;
}

// =========================================================
// ABA 1: MINHA GARAGEM (VEÍCULOS ATIVOS)
// =========================================================

function initBuscaAtivos() {
    document.getElementById('inputGaragemBusca').addEventListener('input', (e) => {
        stateGaragem.buscaAtivos = e.target.value.trim().toLowerCase();
        renderAtivos();
    });
}

function initOrdenacao() {
    document.getElementById('selectGaragemOrdenar').addEventListener('change', (e) => {
        stateGaragem.ordenarAtivos = e.target.value;
        renderAtivos();
    });
}

function ordenarListaAtivos(lista, criterio) {
    const copia = [...lista];
    switch (criterio) {
        case 'custo-desc': return copia.sort((a, b) => calcularCustoTotal(b) - calcularCustoTotal(a));
        case 'custo-asc': return copia.sort((a, b) => calcularCustoTotal(a) - calcularCustoTotal(b));
        case 'posse-desc': return copia.sort((a, b) => new Date(a.dataCompra) - new Date(b.dataCompra));
        case 'marca': return copia.sort((a, b) => `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`));
        default: return copia;
    }
}

function initViewToggle() {
    const grid = document.getElementById('garagemAtivosGrid');
    const btnGrid = document.getElementById('btnViewGrid');
    const btnList = document.getElementById('btnViewList');

    function aplicarView(modo) {
        stateGaragem.viewMode = modo;
        grid.classList.toggle('view-list', modo === 'list');
        btnGrid.classList.toggle('active', modo === 'grid');
        btnList.classList.toggle('active', modo === 'list');
        localStorage.setItem('financehub_garagem_view', modo);
    }

    btnGrid.addEventListener('click', () => aplicarView('grid'));
    btnList.addEventListener('click', () => aplicarView('list'));
    aplicarView(stateGaragem.viewMode);
}

function renderAtivos() {
    const grid = document.getElementById('garagemAtivosGrid');
    grid.innerHTML = '';

    let ativos = stateGaragem.veiculos.filter(v => v.status === 'Ativo');

    if (stateGaragem.buscaAtivos) {
        const termo = stateGaragem.buscaAtivos;
        ativos = ativos.filter(v =>
            v.marca.toLowerCase().includes(termo) ||
            v.modelo.toLowerCase().includes(termo) ||
            (v.placa || '').toLowerCase().includes(termo)
        );
    }

    ativos = ordenarListaAtivos(ativos, stateGaragem.ordenarAtivos);

    if (!ativos.length) {
        grid.innerHTML = stateGaragem.buscaAtivos
            ? '<div class="garagem-empty">Nenhum veículo encontrado para essa busca.</div>'
            : `<div class="garagem-empty empty-state">
                <span class="empty-state-icon">🚗</span>
                <p class="empty-state-title">Nenhum veículo na garagem</p>
                <p class="empty-state-text">Cadastre seu primeiro veículo para acompanhar quilometragem, manutenções e custos.</p>
                <button type="button" class="btn-missao-primary" onclick="abrirModalVeiculo(null)">+ Adicionar Veículo</button>
               </div>`;
    } else {
        ativos.forEach(v => grid.appendChild(criarCardVeiculo(v)));
    }

    atualizarKpisAtivos(ativos);
    renderGraficoComparativo(ativos);
    atualizarBotaoComparar();
}

function atualizarKpisAtivos(ativos) {
    document.getElementById('kpiGaragemAtivos').textContent = ativos.length;
    const totalCompras = ativos.reduce((s, v) => s + (v.valorCompra || 0), 0);
    const totalManutencao = ativos.reduce((s, v) => s + calcularGastoManutencao(v), 0);
    document.getElementById('kpiGaragemValorCompras').textContent = formatarMoeda(totalCompras);
    document.getElementById('kpiGaragemManutencao').textContent = formatarMoeda(totalManutencao);
}

// Placeholder de foto: ícone de carro numa caixa colorida (upload de foto real ainda não implementado)
function criarFotoPlaceholder(v) {
    if (v.fotoUrl) {
        return `<div class="garagem-card-photo"><img src="${escapeHtml(v.fotoUrl)}" alt="Foto de ${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}"></div>`;
    }
    return `<div class="garagem-card-photo" title="Sem foto cadastrada">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.354a2 2 0 0 0-1.855 1.3L5 10 3 8"></path>
            <rect width="18" height="8" x="3" y="10" rx="2"></rect>
            <circle cx="7" cy="17" r="1.5"></circle>
            <circle cx="17" cy="17" r="1.5"></circle>
        </svg>
    </div>`;
}

function criarBarraProgresso(v, custoTotal) {
    if (!v.valorMercado || v.valorMercado <= 0) return '';
    const percentual = (custoTotal / v.valorMercado) * 100;
    const acimaDoValor = custoTotal > v.valorMercado;
    return `
        <div class="garagem-progress-wrap">
            <div class="garagem-progress-labels">
                <span>Custo vs. Valor de Mercado</span>
                <span>${percentual.toFixed(0)}%</span>
            </div>
            <div class="garagem-progress-track">
                <div class="garagem-progress-fill${acimaDoValor ? ' progress-alerta' : ''}" style="width:${Math.min(percentual, 100)}%"></div>
            </div>
        </div>
    `;
}

function criarMiniTimeline(v) {
    const recentes = (v.manutencoes || []).slice(0, 2);
    if (!recentes.length) return '';
    return `
        <div class="garagem-mini-timeline">
            <span class="garagem-mini-timeline-title">Últimas Manutenções</span>
            ${recentes.map(m => `
                <div class="garagem-mini-timeline-item">
                    <span class="garagem-mini-timeline-desc">${escapeHtml(m.descricao)}</span>
                    <span class="garagem-mini-timeline-meta">${formatarDataBR(m.data)} · ${formatarMoeda(m.valor)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function criarCardVeiculo(v) {
    const card = document.createElement('div');
    card.className = 'garagem-veiculo-card';

    const gastoManutencao = calcularGastoManutencao(v);
    const custoTotal = calcularCustoTotal(v);
    const alerta = calcularAlertaVeiculo(v);
    const marcado = stateGaragem.selecionados.has(v.id);

    card.innerHTML = `
        ${criarFotoPlaceholder(v)}
        <div class="garagem-card-header">
            <div>
                <div class="garagem-card-titulo">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}${anoSufixo(v)}</div>
                ${v.placa ? `<div class="garagem-card-placa">${escapeHtml(v.placa)}</div>` : ''}
            </div>
            <span class="garagem-pill pill-accent">${escapeHtml(v.status)}</span>
        </div>
        ${alerta ? `<span class="garagem-pill ${alerta.classe}">⚠ ${escapeHtml(alerta.texto)}</span>` : ''}
        <div class="garagem-card-body">
        <div class="garagem-card-stats">
            <div>
                <span class="garagem-card-stat-label">Valor de Compra</span>
                <span class="garagem-card-stat-val">${formatarMoeda(v.valorCompra)}</span>
            </div>
            <div>
                <span class="garagem-card-stat-label">Data de Compra</span>
                <span class="garagem-card-stat-val">${formatarDataBR(v.dataCompra)}</span>
            </div>
            <div>
                <span class="garagem-card-stat-label">Manutenção</span>
                <span class="garagem-card-stat-val text-accent">${formatarMoeda(gastoManutencao)}</span>
            </div>
            <div>
                <span class="garagem-card-stat-label">KM Atual</span>
                <span class="garagem-card-stat-val">${(v.quilometragem !== null && v.quilometragem !== undefined) ? `${v.quilometragem} km` : '—'}</span>
            </div>
        </div>
        ${criarBarraProgresso(v, custoTotal)}
        ${criarMiniTimeline(v)}
        </div>
        <div class="garagem-card-actions">
            <div class="garagem-card-select">
                <input type="checkbox" id="compararCk${v.id}" data-comparar-check ${marcado ? 'checked' : ''}>
                <label for="compararCk${v.id}">Comparar</label>
            </div>
            <button type="button" class="btn-garagem-action" data-ver-ficha>Ver Ficha</button>
            <button type="button" class="btn-garagem-action" data-editar-veiculo>Editar</button>
        </div>
    `;

    card.querySelector('[data-ver-ficha]').addEventListener('click', () => abrirFicha(v.id));
    card.querySelector('[data-editar-veiculo]').addEventListener('click', () => abrirModalVeiculo(v));
    card.querySelector('[data-comparar-check]').addEventListener('change', (e) => {
        if (e.target.checked) stateGaragem.selecionados.add(v.id);
        else stateGaragem.selecionados.delete(v.id);
        atualizarBotaoComparar();
    });

    return card;
}

// =========================================================
// ABA 2: HISTÓRICO DE VENDIDOS
// =========================================================

function renderHistorico() {
    const tbody = document.getElementById('historicoTableBody');
    tbody.innerHTML = '';

    const vendidos = stateGaragem.veiculos.filter(v => v.status === 'Vendido');

    if (!vendidos.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="garagem-table-empty">Nenhum veículo vendido no histórico ainda.</td></tr>';
    } else {
        vendidos.forEach(v => {
            const gastoManutencao = calcularGastoManutencao(v);
            const resultado = calcularResultado(v);
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}${anoSufixo(v)}</td>
                <td>${formatarDataBR(v.dataCompra)}</td>
                <td>${formatarMoeda(v.valorCompra)}</td>
                <td>${v.dataVenda ? formatarDataBR(v.dataVenda) : '—'}</td>
                <td>${(v.valorVenda !== null && v.valorVenda !== undefined) ? formatarMoeda(v.valorVenda) : '—'}</td>
                <td>${formatarMoeda(gastoManutencao)}</td>
                <td>${resultado !== null ? `<span class="garagem-pill ${resultado >= 0 ? 'pill-income' : 'pill-expense'}">${formatarMoeda(resultado)}</span>` : '—'}</td>
                <td>
                    <div class="garagem-table-actions">
                        <button type="button" class="btn-garagem-action" data-ver-ficha-hist="${v.id}">Ver Ficha</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('[data-ver-ficha-hist]').forEach(btn => {
            btn.addEventListener('click', () => abrirFicha(Number(btn.dataset.verFichaHist)));
        });
    }

    atualizarKpisHistorico(vendidos);
    renderGraficoResultadoVendidos(vendidos);
}

function atualizarKpisHistorico(vendidos) {
    document.getElementById('kpiGaragemVendidos').textContent = vendidos.length;

    const resultadoTotal = vendidos.reduce((s, v) => s + (calcularResultado(v) || 0), 0);
    const el = document.getElementById('kpiGaragemResultado');
    el.textContent = formatarMoeda(resultadoTotal);
    el.className = resultadoTotal >= 0 ? 'kpi-value text-income' : 'kpi-value text-expense';
}

// =========================================================
// GRÁFICOS (Chart.js)
// =========================================================

function corTextoGrafico() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? '#1C1C1E' : '#FFFFFF';
}

function renderGraficoComparativo(ativos) {
    const card = document.getElementById('cardComparativoCustos');
    const ctx = document.getElementById('chartComparativoCustos');
    if (!ctx) return;

    if (chartComparativoCustos) chartComparativoCustos.destroy();

    if (ativos.length < 2) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'flex';

    const textColor = corTextoGrafico();
    const labels = ativos.map(v => `${v.marca} ${v.modelo}`);

    chartComparativoCustos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Valor de Compra', data: ativos.map(v => v.valorCompra || 0), backgroundColor: '#3B82F6', borderRadius: 4 },
                { label: 'Manutenção', data: ativos.map(v => calcularGastoManutencao(v)), backgroundColor: '#EEBB00', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, ticks: { color: textColor }, grid: { display: false } },
                y: { stacked: true, ticks: { color: textColor }, grid: { color: 'rgba(160,160,160,0.15)' } }
            },
            plugins: {
                legend: { labels: { color: textColor, font: { weight: '600', size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatarMoeda(ctx.raw)}` } }
            }
        }
    });
}

function renderGraficoResultadoVendidos(vendidos) {
    const card = document.getElementById('cardResultadoVendidos');
    const ctx = document.getElementById('chartResultadoVendidos');
    if (!ctx) return;

    if (chartResultadoVendidos) chartResultadoVendidos.destroy();

    if (!vendidos.length) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'flex';

    const textColor = corTextoGrafico();
    const labels = vendidos.map(v => `${v.marca} ${v.modelo}`);
    const resultados = vendidos.map(v => calcularResultado(v) || 0);

    chartResultadoVendidos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Resultado',
                data: resultados,
                backgroundColor: resultados.map(r => r >= 0 ? '#2E7D32' : '#D32F2F'),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${formatarMoeda(ctx.raw)}` } }
            },
            scales: {
                x: { ticks: { color: textColor }, grid: { display: false } },
                y: { ticks: { color: textColor }, grid: { color: 'rgba(160,160,160,0.15)' } }
            }
        }
    });
}

function renderGraficosFicha(veiculo) {
    const wrap = document.getElementById('fichaGraficosWrap');
    const manutencoes = veiculo.manutencoes || [];

    if (chartFichaCategoria) chartFichaCategoria.destroy();
    if (chartFichaEvolucao) chartFichaEvolucao.destroy();

    if (!manutencoes.length) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = 'grid';

    const textColor = corTextoGrafico();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // --- Donut: gastos por categoria ---
    const porCategoria = {};
    manutencoes.forEach(m => { porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + (m.valor || 0); });

    const ctxCategoria = document.getElementById('chartFichaCategoria');
    chartFichaCategoria = new Chart(ctxCategoria, {
        type: 'doughnut',
        data: {
            labels: Object.keys(porCategoria),
            datasets: [{
                data: Object.values(porCategoria),
                backgroundColor: CORES_GRAFICO,
                borderColor: isDark ? '#1C1C1E' : '#FFFFFF',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: textColor, font: { weight: '600', size: 10 }, boxWidth: 12 } },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatarMoeda(ctx.raw)}` } }
            }
        }
    });

    // --- Linha: evolução do custo acumulado (compra + manutenções em ordem cronológica) ---
    const eventos = [{ data: veiculo.dataCompra, valor: veiculo.valorCompra || 0 }]
        .concat(manutencoes.map(m => ({ data: m.data, valor: m.valor || 0 })))
        .sort((a, b) => new Date(a.data) - new Date(b.data));

    let acumulado = 0;
    const pontosEvolucao = eventos.map(ev => {
        acumulado += ev.valor;
        return { x: formatarDataBR(ev.data), y: acumulado };
    });

    const ctxEvolucao = document.getElementById('chartFichaEvolucao');
    chartFichaEvolucao = new Chart(ctxEvolucao, {
        type: 'line',
        data: {
            labels: pontosEvolucao.map(p => p.x),
            datasets: [{
                label: 'Custo Acumulado',
                data: pontosEvolucao.map(p => p.y),
                borderColor: '#EEBB00',
                backgroundColor: 'rgba(238, 187, 0, 0.15)',
                fill: true,
                tension: 0.25,
                pointBackgroundColor: '#EEBB00'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${formatarMoeda(ctx.raw)}` } }
            },
            scales: {
                x: { ticks: { color: textColor }, grid: { display: false } },
                y: { ticks: { color: textColor }, grid: { color: 'rgba(160,160,160,0.15)' } }
            }
        }
    });
}

// =========================================================
// COMPARADOR DE VEÍCULOS
// =========================================================

function initComparador() {
    document.getElementById('btnCompararVeiculos').addEventListener('click', abrirComparador);
    document.getElementById('modalCompararClose').addEventListener('click', fecharComparador);
    document.getElementById('btnCompararFechar').addEventListener('click', fecharComparador);
    document.getElementById('modalCompararOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalCompararOverlay') fecharComparador();
    });
}

function atualizarBotaoComparar() {
    const btn = document.getElementById('btnCompararVeiculos');
    const contagem = document.getElementById('compararContagem');
    contagem.textContent = stateGaragem.selecionados.size;
    btn.style.display = stateGaragem.selecionados.size >= 2 ? 'inline-flex' : 'none';
}

function abrirComparador() {
    const veiculos = [...stateGaragem.selecionados].map(id => buscarVeiculo(id)).filter(Boolean);
    if (veiculos.length < 2) return;

    const linhas = [
        ['Veículo', v => `${v.marca} ${v.modelo}${anoSufixo(v)}`],
        ['Status', v => v.status],
        ['Data de Compra', v => formatarDataBR(v.dataCompra)],
        ['Valor de Compra', v => formatarMoeda(v.valorCompra)],
        ['Total em Manutenção', v => formatarMoeda(calcularGastoManutencao(v))],
        ['Custo Total', v => formatarMoeda(calcularCustoTotal(v))],
        ['Quilometragem Atual', v => (v.quilometragem !== null && v.quilometragem !== undefined) ? `${v.quilometragem} km` : '—'],
        ['Quilometragem na Compra', v => (v.quilometragemCompra !== null && v.quilometragemCompra !== undefined) ? `${v.quilometragemCompra} km` : '—'],
        ['Tempo de Posse', v => `${calcularMesesPosse(v)} meses`],
        ['Custo por Km', v => { const c = calcularCustoPorKm(v); return c !== null ? formatarMoeda(c) : '—'; }]
    ];

    document.getElementById('compararTheadRow').innerHTML =
        '<th>Métrica</th>' + veiculos.map(v => `<th>${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</th>`).join('');

    document.getElementById('compararTbody').innerHTML = linhas.map(([label, fn]) => `
        <tr><td><strong>${label}</strong></td>${veiculos.map(v => `<td>${escapeHtml(String(fn(v)))}</td>`).join('')}</tr>
    `).join('');

    document.getElementById('modalCompararOverlay').classList.add('active');
}

function fecharComparador() {
    document.getElementById('modalCompararOverlay').classList.remove('active');
}

// =========================================================
// MODAL: NOVO / EDITAR VEÍCULO
// =========================================================

function initModalVeiculo() {
    document.getElementById('btnNovoVeiculoGaragem').addEventListener('click', () => abrirModalVeiculo(null));
    document.getElementById('modalVeiculoClose').addEventListener('click', fecharModalVeiculo);
    document.getElementById('btnVeiculoCancelar').addEventListener('click', fecharModalVeiculo);
    document.getElementById('modalVeiculoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalVeiculoOverlay') fecharModalVeiculo();
    });
    document.getElementById('veiculoForm').addEventListener('submit', salvarVeiculo);
    document.getElementById('btnVeiculoExcluir').addEventListener('click', excluirVeiculo);
    document.getElementById('inputVeiculoStatus').addEventListener('change', atualizarCamposVenda);
}

function atualizarCamposVenda() {
    const vendido = document.getElementById('inputVeiculoStatus').value === 'Vendido';
    document.getElementById('campoVeiculoDataVenda').style.display = vendido ? 'flex' : 'none';
    document.getElementById('campoVeiculoValorVenda').style.display = vendido ? 'flex' : 'none';
    document.getElementById('campoVeiculoKmVenda').style.display = vendido ? 'flex' : 'none';
}

function abrirModalVeiculo(veiculo) {
    stateGaragem.editVeiculoId = veiculo ? veiculo.id : null;
    document.getElementById('modalVeiculoTitle').textContent = veiculo ? 'Editar Veículo' : 'Novo Veículo';
    document.getElementById('btnVeiculoExcluir').style.display = veiculo ? 'inline-flex' : 'none';
    document.getElementById('formVeiculoId').value = veiculo ? veiculo.id : '';
    document.getElementById('inputVeiculoMarca').value = veiculo ? veiculo.marca : '';
    document.getElementById('inputVeiculoModelo').value = veiculo ? veiculo.modelo : '';
    document.getElementById('inputVeiculoAnoFabricacao').value = (veiculo && veiculo.anoFabricacao !== null && veiculo.anoFabricacao !== undefined) ? veiculo.anoFabricacao : '';
    document.getElementById('inputVeiculoAno').value = veiculo ? veiculo.ano : '';
    document.getElementById('inputVeiculoPlaca').value = veiculo ? (veiculo.placa || '') : '';
    document.getElementById('inputVeiculoCor').value = veiculo ? (veiculo.cor || '') : '';
    document.getElementById('inputVeiculoKm').value = (veiculo && veiculo.quilometragem !== null && veiculo.quilometragem !== undefined) ? veiculo.quilometragem : '';
    document.getElementById('inputVeiculoKmCompra').value = (veiculo && veiculo.quilometragemCompra !== null && veiculo.quilometragemCompra !== undefined) ? veiculo.quilometragemCompra : '';
    document.getElementById('inputVeiculoKmVenda').value = (veiculo && veiculo.quilometragemVenda !== null && veiculo.quilometragemVenda !== undefined) ? veiculo.quilometragemVenda : '';
    document.getElementById('inputVeiculoDataCompra').value = veiculo ? isoParaInputDate(veiculo.dataCompra) : hojeInputDate();
    document.getElementById('inputVeiculoValorCompra').value = veiculo ? veiculo.valorCompra : '';
    document.getElementById('inputVeiculoValorMercado').value = (veiculo && veiculo.valorMercado !== null && veiculo.valorMercado !== undefined) ? veiculo.valorMercado : '';
    document.getElementById('inputVeiculoStatus').value = veiculo ? veiculo.status : 'Ativo';
    document.getElementById('inputVeiculoDataVenda').value = (veiculo && veiculo.dataVenda) ? isoParaInputDate(veiculo.dataVenda) : '';
    document.getElementById('inputVeiculoValorVenda').value = (veiculo && veiculo.valorVenda !== null && veiculo.valorVenda !== undefined) ? veiculo.valorVenda : '';
    document.getElementById('inputVeiculoObs').value = veiculo ? (veiculo.observacoes || '') : '';
    atualizarCamposVenda();
    document.getElementById('modalVeiculoOverlay').classList.add('active');
}

function fecharModalVeiculo() {
    document.getElementById('modalVeiculoOverlay').classList.remove('active');
}

async function salvarVeiculo(e) {
    e.preventDefault();
    const payload = {
        marca: document.getElementById('inputVeiculoMarca').value.trim(),
        modelo: document.getElementById('inputVeiculoModelo').value.trim(),
        ano: document.getElementById('inputVeiculoAno').value,
        anoFabricacao: document.getElementById('inputVeiculoAnoFabricacao').value,
        placa: document.getElementById('inputVeiculoPlaca').value.trim(),
        cor: document.getElementById('inputVeiculoCor').value.trim(),
        quilometragem: document.getElementById('inputVeiculoKm').value,
        quilometragemCompra: document.getElementById('inputVeiculoKmCompra').value,
        quilometragemVenda: document.getElementById('inputVeiculoKmVenda').value,
        dataCompra: document.getElementById('inputVeiculoDataCompra').value,
        valorCompra: document.getElementById('inputVeiculoValorCompra').value,
        valorMercado: document.getElementById('inputVeiculoValorMercado').value,
        status: document.getElementById('inputVeiculoStatus').value,
        dataVenda: document.getElementById('inputVeiculoDataVenda').value || null,
        valorVenda: document.getElementById('inputVeiculoValorVenda').value,
        observacoes: document.getElementById('inputVeiculoObs').value.trim()
    };

    try {
        const id = stateGaragem.editVeiculoId;
        const resp = await fetch(id ? `${API_BASE}/garagem/veiculos/${id}` : `${API_BASE}/garagem/veiculos`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar veículo');

        fecharModalVeiculo();
        await carregarVeiculos();
    } catch (err) {
        alert(`Não foi possível salvar o veículo. ${err.message}`);
    }
}

async function excluirVeiculo() {
    if (!stateGaragem.editVeiculoId) return;
    if (!(await confirmarAcao('Excluir este veículo e todo o seu histórico de manutenções?', { perigo: true }))) return;

    try {
        const resp = await fetch(`${API_BASE}/garagem/veiculos/${stateGaragem.editVeiculoId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir veículo');

        fecharModalVeiculo();
        await carregarVeiculos();
    } catch (err) {
        alert(`Não foi possível excluir o veículo. ${err.message}`);
    }
}

// =========================================================
// MODAL: FICHA COMPLETA DO VEÍCULO
// =========================================================

function initModalFicha() {
    document.getElementById('modalFichaClose').addEventListener('click', fecharFicha);
    document.getElementById('btnFichaFechar').addEventListener('click', fecharFicha);
    document.getElementById('modalFichaOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalFichaOverlay') fecharFicha();
    });
    document.getElementById('btnNovaManutencao').addEventListener('click', () => {
        abrirModalManutencao(null, stateGaragem.fichaVeiculoId);
    });
    document.getElementById('btnFichaImprimir').addEventListener('click', () => window.print());
    document.getElementById('btnSalvarProximaRevisao').addEventListener('click', salvarProximaRevisao);
}

function abrirFicha(veiculoId) {
    stateGaragem.fichaVeiculoId = veiculoId;
    renderFicha();
    document.getElementById('modalFichaOverlay').classList.add('active');
}

function fecharFicha() {
    document.getElementById('modalFichaOverlay').classList.remove('active');
    stateGaragem.fichaVeiculoId = null;
}

function renderFicha() {
    const veiculo = buscarVeiculo(stateGaragem.fichaVeiculoId);
    if (!veiculo) {
        fecharFicha();
        return;
    }

    document.getElementById('fichaTitulo').textContent = `${veiculo.marca} ${veiculo.modelo}${anoSufixo(veiculo)}`;
    document.getElementById('fichaSubtitulo').textContent = veiculo.placa ? `Placa ${veiculo.placa}` : 'Sem placa cadastrada';

    const gastoManutencao = calcularGastoManutencao(veiculo);
    const custoTotal = calcularCustoTotal(veiculo);
    const resultado = calcularResultado(veiculo);

    const infoGrid = document.getElementById('fichaInfoGrid');
    infoGrid.innerHTML = '';

    const custoPorKm = calcularCustoPorKm(veiculo);
    const alerta = calcularAlertaVeiculo(veiculo);

    const itens = [
        ['Status', veiculo.status],
        ['Cor', veiculo.cor || '—'],
        ['Quilometragem Atual', (veiculo.quilometragem !== null && veiculo.quilometragem !== undefined) ? `${veiculo.quilometragem} km` : '—'],
        ['Quilometragem na Compra', (veiculo.quilometragemCompra !== null && veiculo.quilometragemCompra !== undefined) ? `${veiculo.quilometragemCompra} km` : '—'],
        ['Data de Compra', formatarDataBR(veiculo.dataCompra)],
        ['Valor de Compra', formatarMoeda(veiculo.valorCompra)],
        ['Total em Manutenção', formatarMoeda(gastoManutencao)],
        ['Custo Total', formatarMoeda(custoTotal)],
        ['Tempo de Posse', `${calcularMesesPosse(veiculo)} meses`],
        ['Custo Médio Mensal (Manutenção)', formatarMoeda(calcularCustoMedioMensal(veiculo))]
    ];

    if (custoPorKm !== null) itens.push(['Custo por Km (aprox.)', formatarMoeda(custoPorKm)]);
    if (veiculo.valorMercado) itens.push(['Valor de Mercado Estimado', formatarMoeda(veiculo.valorMercado)]);
    if (alerta) itens.push(['Alerta', alerta.texto]);

    if (veiculo.status === 'Vendido') {
        itens.push(['Data de Venda', veiculo.dataVenda ? formatarDataBR(veiculo.dataVenda) : '—']);
        itens.push(['Valor de Venda', (veiculo.valorVenda !== null && veiculo.valorVenda !== undefined) ? formatarMoeda(veiculo.valorVenda) : '—']);
        itens.push(['Quilometragem na Venda', (veiculo.quilometragemVenda !== null && veiculo.quilometragemVenda !== undefined) ? `${veiculo.quilometragemVenda} km` : '—']);
        itens.push(['Resultado', resultado !== null ? formatarMoeda(resultado) : '—']);
    }

    itens.forEach(([label, val]) => {
        const item = document.createElement('div');
        item.className = 'garagem-ficha-item';
        item.innerHTML = `<span class="garagem-ficha-label">${label}</span><span class="garagem-ficha-val">${escapeHtml(String(val))}</span>`;
        infoGrid.appendChild(item);
    });

    if (veiculo.observacoes) {
        const obsItem = document.createElement('div');
        obsItem.className = 'garagem-ficha-item';
        obsItem.style.gridColumn = '1 / -1';
        obsItem.innerHTML = `<span class="garagem-ficha-label">Observações</span><span class="garagem-ficha-val">${escapeHtml(veiculo.observacoes)}</span>`;
        infoGrid.appendChild(obsItem);
    }

    document.getElementById('inputFichaProximaRevisao').value = isoParaInputDate(veiculo.dataProximaRevisao);
    document.getElementById('fichaRevisaoFeedback').textContent = '';

    renderManutencoesFicha(veiculo);
    renderGraficosFicha(veiculo);
}

async function salvarProximaRevisao() {
    const veiculo = buscarVeiculo(stateGaragem.fichaVeiculoId);
    if (!veiculo) return;

    const feedback = document.getElementById('fichaRevisaoFeedback');
    const dataProximaRevisao = document.getElementById('inputFichaProximaRevisao').value || null;

    try {
        const resp = await fetch(`${API_BASE}/garagem/veiculos/${veiculo.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataProximaRevisao })
        });
        if (!resp.ok) throw new Error('Falha ao salvar');

        await carregarVeiculos();
        renderFicha();
        document.getElementById('fichaRevisaoFeedback').textContent = 'Salvo!';
    } catch (err) {
        feedback.textContent = `Não foi possível salvar. ${err.message}`;
    }
}

function renderManutencoesFicha(veiculo) {
    const tbody = document.getElementById('fichaManutencoesBody');
    tbody.innerHTML = '';

    const manutencoes = veiculo.manutencoes || [];

    if (!manutencoes.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="garagem-table-empty">Nenhuma manutenção registrada ainda.</td></tr>';
        return;
    }

    manutencoes.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatarDataBR(m.data)}</td>
            <td><span class="garagem-pill pill-accent">${escapeHtml(m.categoria)}</span></td>
            <td>${escapeHtml(m.descricao)}</td>
            <td class="text-expense">${formatarMoeda(m.valor)}</td>
            <td>${escapeHtml(m.oficina || '—')}</td>
            <td>${(m.quilometragem !== null && m.quilometragem !== undefined) ? `${m.quilometragem} km` : '—'}</td>
            <td>
                <div class="garagem-table-actions">
                    <button type="button" class="btn-garagem-action" data-editar-manutencao="${m.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-manutencao]').forEach(btn => {
        btn.addEventListener('click', () => {
            const manutencao = manutencoes.find(m => m.id === Number(btn.dataset.editarManutencao));
            abrirModalManutencao(manutencao, veiculo.id);
        });
    });
}

// =========================================================
// MODAL: NOVA / EDITAR MANUTENÇÃO
// =========================================================

function initModalManutencao() {
    document.getElementById('modalManutencaoClose').addEventListener('click', fecharModalManutencao);
    document.getElementById('btnManutencaoCancelar').addEventListener('click', fecharModalManutencao);
    document.getElementById('modalManutencaoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalManutencaoOverlay') fecharModalManutencao();
    });
    document.getElementById('manutencaoForm').addEventListener('submit', salvarManutencao);
    document.getElementById('btnManutencaoExcluir').addEventListener('click', excluirManutencao);
}

function abrirModalManutencao(manutencao, veiculoId) {
    stateGaragem.editManutencaoId = manutencao ? manutencao.id : null;
    document.getElementById('modalManutencaoTitle').textContent = manutencao ? 'Editar Manutenção' : 'Nova Manutenção';
    document.getElementById('btnManutencaoExcluir').style.display = manutencao ? 'inline-flex' : 'none';
    document.getElementById('formManutencaoId').value = manutencao ? manutencao.id : '';
    document.getElementById('formManutencaoVeiculoId').value = veiculoId;
    document.getElementById('inputManutencaoData').value = manutencao ? isoParaInputDate(manutencao.data) : hojeInputDate();
    document.getElementById('inputManutencaoCategoria').value = manutencao ? manutencao.categoria : 'Troca de Óleo';
    document.getElementById('inputManutencaoDescricao').value = manutencao ? manutencao.descricao : '';
    document.getElementById('inputManutencaoValor').value = manutencao ? manutencao.valor : '';
    document.getElementById('inputManutencaoKm').value = (manutencao && manutencao.quilometragem !== null && manutencao.quilometragem !== undefined) ? manutencao.quilometragem : '';
    document.getElementById('inputManutencaoOficina').value = manutencao ? (manutencao.oficina || '') : '';
    document.getElementById('modalManutencaoOverlay').classList.add('active');
}

function fecharModalManutencao() {
    document.getElementById('modalManutencaoOverlay').classList.remove('active');
}

async function salvarManutencao(e) {
    e.preventDefault();
    const veiculoId = document.getElementById('formManutencaoVeiculoId').value;

    const payload = {
        data: document.getElementById('inputManutencaoData').value,
        categoria: document.getElementById('inputManutencaoCategoria').value,
        descricao: document.getElementById('inputManutencaoDescricao').value.trim(),
        valor: Number(document.getElementById('inputManutencaoValor').value),
        oficina: document.getElementById('inputManutencaoOficina').value.trim(),
        quilometragem: document.getElementById('inputManutencaoKm').value
    };

    try {
        const id = stateGaragem.editManutencaoId;
        const url = id ? `${API_BASE}/garagem/manutencoes/${id}` : `${API_BASE}/garagem/veiculos/${veiculoId}/manutencoes`;
        const resp = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar manutenção');

        fecharModalManutencao();
        await carregarVeiculos();
        if (stateGaragem.fichaVeiculoId) renderFicha();
    } catch (err) {
        alert(`Não foi possível salvar a manutenção. ${err.message}`);
    }
}

async function excluirManutencao() {
    if (!stateGaragem.editManutencaoId) return;
    if (!(await confirmarAcao('Deseja realmente excluir esta manutenção?', { perigo: true }))) return;

    try {
        const resp = await fetch(`${API_BASE}/garagem/manutencoes/${stateGaragem.editManutencaoId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir manutenção');

        fecharModalManutencao();
        await carregarVeiculos();
        if (stateGaragem.fichaVeiculoId) renderFicha();
    } catch (err) {
        alert(`Não foi possível excluir a manutenção. ${err.message}`);
    }
}

// =========================================================
// UTILITÁRIOS
// =========================================================

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Evita problemas de fuso horário: lê o AAAA-MM-DD direto da string ISO,
// sem passar por new Date() + getters locais.
function formatarDataBR(isoOuData) {
    const str = typeof isoOuData === 'string' ? isoOuData : new Date(isoOuData).toISOString();
    const [ano, mes, dia] = str.substring(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
}

function isoParaInputDate(isoOuData) {
    if (!isoOuData) return '';
    const str = typeof isoOuData === 'string' ? isoOuData : new Date(isoOuData).toISOString();
    return str.substring(0, 10);
}

function hojeInputDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto || '';
    return div.innerHTML;
}

// =========================================================
// TEMA E NAVEGAÇÃO MOBILE (compartilhado com os demais módulos)
// =========================================================

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
