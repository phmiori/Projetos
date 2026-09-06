/**
 * JS/Financas/financas.js
 * Lógica do Módulo Finanças (Hub Pessoal): Contas Bancárias, Cartões de Crédito,
 * Faturas, Transações (Receitas/Despesas/Transferências) e Categorias.
 */

const API_BASE = '/api/financas';

const stateFin = {
    contas: [],
    cartoes: [],
    categorias: [],
    transacoes: [],
    faturas: [],
    filtroTipoTransacao: 'Todas',
    filtroCartaoFatura: 'Todos',
    editContaId: null,
    editCartaoId: null,
    editCategoriaId: null,
    editTransacaoId: null,
    faturaAbertaId: null
};

let chartGastoCategoria = null;
let chartEvolucaoMensal = null;

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initSubNav();
    initModalConta();
    initModalCartao();
    initModalCategoria();
    initModalTransacao();
    initModalFatura();
    initFiltroTipoTransacao();
    carregarTudo();
});

async function carregarTudo() {
    await Promise.all([carregarContas(), carregarCartoes(), carregarCategorias()]);
    await Promise.all([carregarTransacoes(), carregarFaturas()]);
    await Promise.all([carregarResumo(), carregarProjecao()]);
}

// =========================================================
// SUB-NAVEGAÇÃO EM ABAS
// =========================================================

function initSubNav() {
    document.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.financas-subview').forEach(v => v.classList.remove('active'));
            const alvo = document.getElementById(btn.getAttribute('data-subtarget'));
            if (alvo) alvo.classList.add('active');
        });
    });
}

// =========================================================
// CONTAS BANCÁRIAS
// =========================================================

async function carregarContas() {
    try {
        const resp = await fetch(`${API_BASE}/contas`);
        if (!resp.ok) throw new Error('Erro ao buscar contas');
        stateFin.contas = await resp.json();
        renderContas();
        popularSelectsContas();
    } catch (err) {
        console.warn('[Finanças] Erro ao carregar contas.', err.message);
    }
}

function renderContas() {
    const grid = document.getElementById('contasGrid');
    grid.innerHTML = '';

    if (!stateFin.contas.length) {
        grid.innerHTML = '<p class="financas-table-empty">Nenhuma conta cadastrada.</p>';
        return;
    }

    stateFin.contas.forEach(conta => {
        const card = document.createElement('div');
        card.className = 'financas-conta-card';
        card.style.setProperty('--conta-cor', conta.cor);
        card.innerHTML = `
            <span class="financas-conta-nome">${escapeHtml(conta.nome)}</span>
            <span class="financas-conta-banco">${escapeHtml(conta.banco)} · ${escapeHtml(conta.tipo)}</span>
            <span class="financas-conta-saldo ${conta.saldoAtual < 0 ? 'text-expense' : 'text-income'}">${formatarMoeda(conta.saldoAtual)}</span>
        `;
        card.addEventListener('click', () => abrirModalConta(conta));
        grid.appendChild(card);
    });
}

function popularSelectsContas() {
    const ativos = stateFin.contas.filter(c => c.ativa);
    const opcoes = ativos.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} (${escapeHtml(c.banco)})</option>`).join('');

    document.getElementById('inputTransacaoConta').innerHTML = `<option value="">Selecione</option>${opcoes}`;
    document.getElementById('inputTransacaoContaDestino').innerHTML = `<option value="">Selecione</option>${opcoes}`;
    document.getElementById('inputCartaoContaVinculada').innerHTML = `<option value="">Nenhuma</option>${opcoes}`;
}

function initModalConta() {
    document.getElementById('btnNovaConta').addEventListener('click', () => abrirModalConta(null));
    document.getElementById('modalContaClose').addEventListener('click', fecharModalConta);
    document.getElementById('btnContaCancelar').addEventListener('click', fecharModalConta);
    document.getElementById('modalContaOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalContaOverlay') fecharModalConta();
    });
    document.getElementById('contaForm').addEventListener('submit', salvarConta);
    document.getElementById('btnContaExcluir').addEventListener('click', excluirConta);
}

function abrirModalConta(conta) {
    stateFin.editContaId = conta ? conta.id : null;
    document.getElementById('modalContaTitle').textContent = conta ? 'Editar Conta' : 'Nova Conta';
    document.getElementById('btnContaExcluir').style.display = conta ? 'inline-flex' : 'none';
    document.getElementById('formContaId').value = conta ? conta.id : '';
    document.getElementById('inputContaNome').value = conta ? conta.nome : '';
    document.getElementById('inputContaBanco').value = conta ? conta.banco : '';
    document.getElementById('inputContaTipo').value = conta ? conta.tipo : 'Corrente';
    document.getElementById('inputContaSaldoInicial').value = conta ? conta.saldoInicial : '';
    document.getElementById('inputContaCor').value = conta ? conta.cor : '#EEBB00';
    document.getElementById('modalContaOverlay').classList.add('active');
}

function fecharModalConta() {
    document.getElementById('modalContaOverlay').classList.remove('active');
}

async function salvarConta(e) {
    e.preventDefault();
    const payload = {
        nome: document.getElementById('inputContaNome').value.trim(),
        banco: document.getElementById('inputContaBanco').value.trim(),
        tipo: document.getElementById('inputContaTipo').value,
        saldoInicial: Number(document.getElementById('inputContaSaldoInicial').value) || 0,
        cor: document.getElementById('inputContaCor').value
    };

    try {
        const id = stateFin.editContaId;
        const resp = await fetch(id ? `${API_BASE}/contas/${id}` : `${API_BASE}/contas`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar conta');

        fecharModalConta();
        await carregarContas();
        await carregarResumo();
    } catch (err) {
        alert(`Não foi possível salvar a conta. ${err.message}`);
    }
}

async function excluirConta() {
    if (!stateFin.editContaId) return;
    if (!confirm('Excluir esta conta? Transações vinculadas perdem a referência à conta.')) return;

    try {
        const resp = await fetch(`${API_BASE}/contas/${stateFin.editContaId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir conta');

        fecharModalConta();
        await carregarTudo();
    } catch (err) {
        alert(`Não foi possível excluir a conta. ${err.message}`);
    }
}

// =========================================================
// CARTÕES DE CRÉDITO
// =========================================================

async function carregarCartoes() {
    try {
        const resp = await fetch(`${API_BASE}/cartoes`);
        if (!resp.ok) throw new Error('Erro ao buscar cartões');
        stateFin.cartoes = await resp.json();
        renderCartoes();
        popularSelectsCartoes();
        renderFiltroCartaoFatura();
    } catch (err) {
        console.warn('[Finanças] Erro ao carregar cartões.', err.message);
    }
}

function renderCartoes() {
    const grid = document.getElementById('cartoesGrid');
    grid.innerHTML = '';

    if (!stateFin.cartoes.length) {
        grid.innerHTML = '<p class="financas-table-empty">Nenhum cartão cadastrado.</p>';
        return;
    }

    stateFin.cartoes.forEach(cartao => {
        const pctUsado = cartao.limite > 0 ? Math.min(100, (cartao.limiteUsado / cartao.limite) * 100) : 0;
        const card = document.createElement('div');
        card.className = 'financas-cartao-visual';
        card.style.setProperty('--cartao-cor', cartao.cor);
        card.innerHTML = `
            <div class="financas-cartao-topo">
                <div>
                    <div class="financas-cartao-banco">${escapeHtml(cartao.banco)}</div>
                    <div class="financas-cartao-nome">${escapeHtml(cartao.nome)}</div>
                </div>
                <span class="financas-cartao-bandeira">${escapeHtml(cartao.bandeira)}</span>
            </div>
            <div class="financas-cartao-limite">
                <div class="financas-cartao-limite-barra">
                    <div class="financas-cartao-limite-barra-fill" style="width:${pctUsado}%;"></div>
                </div>
                <div class="financas-cartao-limite-texto">
                    <span>Disp.: ${formatarMoeda(cartao.limiteDisponivel)}</span>
                    <span>Limite: ${formatarMoeda(cartao.limite)}</span>
                </div>
            </div>
        `;
        card.addEventListener('click', () => abrirModalCartao(cartao));
        grid.appendChild(card);
    });
}

function popularSelectsCartoes() {
    const ativos = stateFin.cartoes.filter(c => c.ativo);
    document.getElementById('inputTransacaoCartao').innerHTML = ativos
        .map(c => `<option value="${c.id}">${escapeHtml(c.nome)} (${escapeHtml(c.banco)})</option>`).join('') || '<option value="">Nenhum cartão cadastrado</option>';
}

function initModalCartao() {
    document.getElementById('btnNovoCartao').addEventListener('click', () => abrirModalCartao(null));
    document.getElementById('modalCartaoClose').addEventListener('click', fecharModalCartao);
    document.getElementById('btnCartaoCancelar').addEventListener('click', fecharModalCartao);
    document.getElementById('modalCartaoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalCartaoOverlay') fecharModalCartao();
    });
    document.getElementById('cartaoForm').addEventListener('submit', salvarCartao);
    document.getElementById('btnCartaoExcluir').addEventListener('click', excluirCartao);
}

function abrirModalCartao(cartao) {
    stateFin.editCartaoId = cartao ? cartao.id : null;
    document.getElementById('modalCartaoTitle').textContent = cartao ? 'Editar Cartão' : 'Novo Cartão';
    document.getElementById('btnCartaoExcluir').style.display = cartao ? 'inline-flex' : 'none';
    document.getElementById('formCartaoId').value = cartao ? cartao.id : '';
    document.getElementById('inputCartaoNome').value = cartao ? cartao.nome : '';
    document.getElementById('inputCartaoBanco').value = cartao ? cartao.banco : '';
    document.getElementById('inputCartaoBandeira').value = cartao ? cartao.bandeira : 'Visa';
    document.getElementById('inputCartaoLimite').value = cartao ? cartao.limite : '';
    document.getElementById('inputCartaoFechamento').value = cartao ? cartao.diaFechamento : '';
    document.getElementById('inputCartaoVencimento').value = cartao ? cartao.diaVencimento : '';
    document.getElementById('inputCartaoContaVinculada').value = cartao && cartao.contaVinculadaId ? cartao.contaVinculadaId : '';
    document.getElementById('inputCartaoCor').value = cartao ? cartao.cor : '#EEBB00';
    document.getElementById('modalCartaoOverlay').classList.add('active');
}

function fecharModalCartao() {
    document.getElementById('modalCartaoOverlay').classList.remove('active');
}

async function salvarCartao(e) {
    e.preventDefault();
    const payload = {
        nome: document.getElementById('inputCartaoNome').value.trim(),
        banco: document.getElementById('inputCartaoBanco').value.trim(),
        bandeira: document.getElementById('inputCartaoBandeira').value,
        limite: Number(document.getElementById('inputCartaoLimite').value) || 0,
        diaFechamento: Number(document.getElementById('inputCartaoFechamento').value),
        diaVencimento: Number(document.getElementById('inputCartaoVencimento').value),
        contaVinculadaId: document.getElementById('inputCartaoContaVinculada').value || null,
        cor: document.getElementById('inputCartaoCor').value
    };

    try {
        const id = stateFin.editCartaoId;
        const resp = await fetch(id ? `${API_BASE}/cartoes/${id}` : `${API_BASE}/cartoes`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error('Falha ao salvar cartão');

        fecharModalCartao();
        await carregarCartoes();
        await carregarFaturas();
        await carregarResumo();
    } catch (err) {
        alert(`Não foi possível salvar o cartão. ${err.message}`);
    }
}

async function excluirCartao() {
    if (!stateFin.editCartaoId) return;
    if (!confirm('Excluir este cartão e todas as suas faturas?')) return;

    try {
        const resp = await fetch(`${API_BASE}/cartoes/${stateFin.editCartaoId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir cartão');

        fecharModalCartao();
        await carregarTudo();
    } catch (err) {
        alert(`Não foi possível excluir o cartão. ${err.message}`);
    }
}

// =========================================================
// CATEGORIAS
// =========================================================

async function carregarCategorias() {
    try {
        const resp = await fetch(`${API_BASE}/categorias`);
        if (!resp.ok) throw new Error('Erro ao buscar categorias');
        stateFin.categorias = await resp.json();
        renderCategorias();
        popularSelectCategorias();
    } catch (err) {
        console.warn('[Finanças] Erro ao carregar categorias.', err.message);
    }
}

function renderCategorias() {
    const tbody = document.getElementById('categoriasTableBody');
    tbody.innerHTML = '';

    if (!stateFin.categorias.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="financas-table-empty">Nenhuma categoria cadastrada.</td></tr>';
        return;
    }

    stateFin.categorias.forEach(cat => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(cat.nome)}</td>
            <td><span class="financas-pill ${cat.tipo === 'Receita' ? 'pill-income' : 'pill-expense'}">${escapeHtml(cat.tipo)}</span></td>
            <td>${cat.orcamentoMensal ? formatarMoeda(cat.orcamentoMensal) : '—'}</td>
            <td>
                <div class="financas-table-actions">
                    <button type="button" class="btn-financas-action" data-editar-categoria="${cat.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-categoria]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = stateFin.categorias.find(c => c.id === Number(btn.dataset.editarCategoria));
            abrirModalCategoria(cat);
        });
    });
}

function popularSelectCategorias() {
    const opcoes = stateFin.categorias.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    document.getElementById('inputTransacaoCategoria').innerHTML = `<option value="">Sem categoria</option>${opcoes}`;
}

function initModalCategoria() {
    document.getElementById('btnNovaCategoria').addEventListener('click', () => abrirModalCategoria(null));
    document.getElementById('modalCategoriaClose').addEventListener('click', fecharModalCategoria);
    document.getElementById('btnCategoriaCancelar').addEventListener('click', fecharModalCategoria);
    document.getElementById('modalCategoriaOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalCategoriaOverlay') fecharModalCategoria();
    });
    document.getElementById('categoriaForm').addEventListener('submit', salvarCategoria);
    document.getElementById('btnCategoriaExcluir').addEventListener('click', excluirCategoria);
}

function abrirModalCategoria(cat) {
    stateFin.editCategoriaId = cat ? cat.id : null;
    document.getElementById('modalCategoriaTitle').textContent = cat ? 'Editar Categoria' : 'Nova Categoria';
    document.getElementById('btnCategoriaExcluir').style.display = cat ? 'inline-flex' : 'none';
    document.getElementById('formCategoriaId').value = cat ? cat.id : '';
    document.getElementById('inputCategoriaNome').value = cat ? cat.nome : '';
    document.getElementById('inputCategoriaTipo').value = cat ? cat.tipo : 'Despesa';
    document.getElementById('inputCategoriaOrcamento').value = (cat && cat.orcamentoMensal !== null && cat.orcamentoMensal !== undefined) ? cat.orcamentoMensal : '';
    document.getElementById('inputCategoriaCor').value = cat ? cat.cor : '#A0A0A0';
    document.getElementById('modalCategoriaOverlay').classList.add('active');
}

function fecharModalCategoria() {
    document.getElementById('modalCategoriaOverlay').classList.remove('active');
}

async function salvarCategoria(e) {
    e.preventDefault();
    const orcamentoVal = document.getElementById('inputCategoriaOrcamento').value;
    const payload = {
        nome: document.getElementById('inputCategoriaNome').value.trim(),
        tipo: document.getElementById('inputCategoriaTipo').value,
        orcamentoMensal: orcamentoVal === '' ? null : Number(orcamentoVal),
        cor: document.getElementById('inputCategoriaCor').value
    };

    try {
        const id = stateFin.editCategoriaId;
        const resp = await fetch(id ? `${API_BASE}/categorias/${id}` : `${API_BASE}/categorias`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const erro = await resp.json().catch(() => ({}));
            throw new Error(erro.error || 'Falha ao salvar categoria');
        }

        fecharModalCategoria();
        await carregarCategorias();
        await carregarResumo();
    } catch (err) {
        alert(`Não foi possível salvar a categoria. ${err.message}`);
    }
}

async function excluirCategoria() {
    if (!stateFin.editCategoriaId) return;
    if (!confirm('Excluir esta categoria?')) return;

    try {
        const resp = await fetch(`${API_BASE}/categorias/${stateFin.editCategoriaId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir categoria');

        fecharModalCategoria();
        await carregarCategorias();
        await carregarTransacoes();
        await carregarResumo();
    } catch (err) {
        alert(`Não foi possível excluir a categoria. ${err.message}`);
    }
}

// =========================================================
// TRANSAÇÕES
// =========================================================

function initFiltroTipoTransacao() {
    document.querySelectorAll('#filtroTipoTransacao .financas-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#filtroTipoTransacao .financas-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            stateFin.filtroTipoTransacao = btn.dataset.tipo;
            renderTransacoes();
        });
    });
}

async function carregarTransacoes() {
    try {
        const resp = await fetch(`${API_BASE}/transacoes`);
        if (!resp.ok) throw new Error('Erro ao buscar transações');
        stateFin.transacoes = await resp.json();
        renderTransacoes();
    } catch (err) {
        console.warn('[Finanças] Erro ao carregar transações.', err.message);
    }
}

function renderTransacoes() {
    const tbody = document.getElementById('transacoesTableBody');
    tbody.innerHTML = '';

    const filtradas = stateFin.filtroTipoTransacao === 'Todas'
        ? stateFin.transacoes
        : stateFin.transacoes.filter(t => t.tipo === stateFin.filtroTipoTransacao);

    if (!filtradas.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="financas-table-empty">Nenhum lançamento cadastrado.</td></tr>';
        return;
    }

    filtradas.forEach(t => {
        const tr = document.createElement('tr');
        const corValor = t.tipo === 'Receita' ? 'text-income' : (t.tipo === 'Despesa' ? 'text-expense' : '');
        const sinal = t.tipo === 'Receita' ? '+ ' : (t.tipo === 'Despesa' ? '- ' : '');
        const parcelaLabel = t.parcelaTotal ? `${t.parcelaAtual}/${t.parcelaTotal}` : '—';

        tr.innerHTML = `
            <td>${formatarDataBR(t.data)}</td>
            <td>${escapeHtml(t.descricao)}</td>
            <td>${t.categoria ? `<span class="financas-pill pill-accent">${escapeHtml(t.categoria.nome)}</span>` : '—'}</td>
            <td>${escapeHtml(t.formaPagamento)}</td>
            <td>${parcelaLabel}</td>
            <td class="${corValor}">${sinal}${formatarMoeda(t.valor)}</td>
            <td><span class="financas-pill ${pillStatusTransacao(t.status)}">${escapeHtml(t.status)}</span></td>
            <td>
                <div class="financas-table-actions">
                    <button type="button" class="btn-financas-action" data-editar-transacao="${t.id}">Editar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-editar-transacao]').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = stateFin.transacoes.find(x => x.id === Number(btn.dataset.editarTransacao));
            abrirModalTransacao(t);
        });
    });
}

function pillStatusTransacao(status) {
    if (status === 'Pago') return 'pill-income';
    if (status === 'Pendente') return 'pill-accent';
    return 'pill-muted';
}

// =========================================================
// PROJEÇÃO DE MESES FUTUROS
// =========================================================

async function carregarProjecao() {
    try {
        const resp = await fetch(`${API_BASE}/projecao`);
        if (!resp.ok) throw new Error('Erro ao buscar projeção');
        const dados = await resp.json();
        renderProjecaoMeses(dados.meses);
        renderProjecaoParcelamentos(dados.parcelamentosAbertos);
    } catch (err) {
        console.warn('[Finanças] Erro ao carregar projeção.', err.message);
    }
}

function renderProjecaoMeses(meses) {
    const tbody = document.getElementById('projecaoMesesTableBody');
    tbody.innerHTML = (meses || []).map(m => `
        <tr>
            <td>${formatarCompetencia(m.mes, m.ano)}</td>
            <td class="text-income">${formatarMoeda(m.receitas)}</td>
            <td class="text-expense">${formatarMoeda(m.despesas)}</td>
            <td class="${m.saldo >= 0 ? 'text-income' : 'text-expense'}">${formatarMoeda(m.saldo)}</td>
        </tr>
    `).join('');
}

function renderProjecaoParcelamentos(parcelamentos) {
    const tbody = document.getElementById('projecaoParcelamentosTableBody');

    if (!parcelamentos || !parcelamentos.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="financas-table-empty">Nenhuma compra parcelada em aberto.</td></tr>';
        return;
    }

    tbody.innerHTML = parcelamentos.map(p => `
        <tr>
            <td>${escapeHtml(p.descricao)}</td>
            <td>${p.cartaoNome ? escapeHtml(p.cartaoNome) : '—'}</td>
            <td>${p.proximaParcela}/${p.parcelaTotal}</td>
            <td>${formatarDataBR(p.proximaData)}</td>
            <td class="text-expense">${formatarMoeda(p.valorRestante)}</td>
        </tr>
    `).join('');
}

function initModalTransacao() {
    document.getElementById('btnNovaTransacao').addEventListener('click', () => abrirModalTransacao(null));
    document.getElementById('modalTransacaoClose').addEventListener('click', fecharModalTransacao);
    document.getElementById('btnTransacaoCancelar').addEventListener('click', fecharModalTransacao);
    document.getElementById('modalTransacaoOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalTransacaoOverlay') fecharModalTransacao();
    });
    document.getElementById('transacaoForm').addEventListener('submit', salvarTransacao);
    document.getElementById('btnTransacaoExcluir').addEventListener('click', excluirTransacao);
    document.getElementById('inputTransacaoTipo').addEventListener('change', () => {
        atualizarOpcoesFormaPagamento();
        atualizarCamposTransacao();
    });
    document.getElementById('inputTransacaoForma').addEventListener('change', atualizarCamposTransacao);
    document.getElementById('inputTransacaoParcelas').addEventListener('input', atualizarLabelValorTransacao);
}

function atualizarOpcoesFormaPagamento() {
    const tipo = document.getElementById('inputTransacaoTipo').value;
    const formaSelect = document.getElementById('inputTransacaoForma');
    const valorAtual = formaSelect.value;

    const opcoes = tipo === 'Receita'
        ? ['Débito', 'Pix', 'Dinheiro', 'Boleto']
        : ['Débito', 'Crédito', 'Pix', 'Dinheiro', 'Boleto'];

    formaSelect.innerHTML = opcoes.map(o => `<option value="${o}">${o}</option>`).join('');
    formaSelect.value = opcoes.includes(valorAtual) ? valorAtual : opcoes[0];
}

function atualizarCamposTransacao() {
    const tipo = document.getElementById('inputTransacaoTipo').value;
    const forma = document.getElementById('inputTransacaoForma').value;

    const campoCategoria = document.getElementById('campoCategoria');
    const campoFormaPagamento = document.getElementById('campoFormaPagamento');
    const campoConta = document.getElementById('campoConta');
    const campoContaDestino = document.getElementById('campoContaDestino');
    const campoCartao = document.getElementById('campoCartao');
    const campoParcelas = document.getElementById('campoParcelas');
    const labelConta = document.getElementById('labelTransacaoConta');

    if (tipo === 'Transferencia') {
        campoCategoria.style.display = 'none';
        campoFormaPagamento.style.display = 'none';
        campoConta.style.display = '';
        campoContaDestino.style.display = '';
        campoCartao.style.display = 'none';
        campoParcelas.style.display = 'none';
        labelConta.textContent = 'Conta de Origem';
        return;
    }

    campoCategoria.style.display = '';
    campoFormaPagamento.style.display = '';
    campoContaDestino.style.display = 'none';
    labelConta.textContent = 'Conta';

    const ehCredito = tipo === 'Despesa' && forma === 'Crédito';
    campoCartao.style.display = ehCredito ? '' : 'none';
    campoParcelas.style.display = ehCredito ? '' : 'none';
    campoConta.style.display = ehCredito ? 'none' : '';

    atualizarLabelValorTransacao();
}

function atualizarLabelValorTransacao() {
    const ehCredito = document.getElementById('inputTransacaoTipo').value === 'Despesa'
        && document.getElementById('inputTransacaoForma').value === 'Crédito';
    const numParcelas = Number(document.getElementById('inputTransacaoParcelas').value) || 1;
    const parcelado = ehCredito && numParcelas > 1;

    document.getElementById('labelTransacaoValor').textContent = parcelado ? 'Valor Total da Compra (R$) *' : 'Valor (R$) *';
    document.getElementById('hintTransacaoValor').style.display = parcelado ? '' : 'none';
}

function abrirModalTransacao(t) {
    stateFin.editTransacaoId = t ? t.id : null;
    document.getElementById('modalTransacaoTitle').textContent = t ? 'Editar Lançamento' : 'Novo Lançamento';
    document.getElementById('btnTransacaoExcluir').style.display = t ? 'inline-flex' : 'none';
    document.getElementById('formTransacaoId').value = t ? t.id : '';

    document.getElementById('inputTransacaoTipo').value = t ? t.tipo : 'Despesa';
    atualizarOpcoesFormaPagamento();
    document.getElementById('inputTransacaoForma').value = t ? t.formaPagamento : 'Débito';
    document.getElementById('inputTransacaoDescricao').value = t ? t.descricao : '';
    document.getElementById('inputTransacaoValor').value = t ? t.valor : '';
    document.getElementById('inputTransacaoData').value = t ? isoParaInputDate(t.data) : hojeInputDate();
    document.getElementById('inputTransacaoCategoria').value = t && t.categoriaId ? t.categoriaId : '';
    document.getElementById('inputTransacaoConta').value = t && t.contaId ? t.contaId : '';
    document.getElementById('inputTransacaoContaDestino').value = t && t.contaDestinoId ? t.contaDestinoId : '';
    document.getElementById('inputTransacaoCartao').value = t && t.cartaoId ? t.cartaoId : '';
    document.getElementById('inputTransacaoParcelas').value = t && t.parcelaTotal ? t.parcelaTotal : 1;
    document.getElementById('inputTransacaoParcelaAtual').value = t && t.parcelaAtual ? t.parcelaAtual : 1;
    document.getElementById('inputTransacaoStatus').value = t ? t.status : 'Pago';
    document.getElementById('inputTransacaoRecorrente').checked = t ? !!t.recorrente : false;

    // Tipo, forma de pagamento, cartão e nº/parcela atual só podem ser definidos na criação —
    // editar isso exigiria refazer o vínculo de fatura/parcelamento, fora do escopo do PUT.
    const bloqueados = ['inputTransacaoTipo', 'inputTransacaoForma', 'inputTransacaoCartao', 'inputTransacaoParcelas', 'inputTransacaoParcelaAtual'];
    bloqueados.forEach(id => { document.getElementById(id).disabled = !!t; });

    atualizarCamposTransacao();
    document.getElementById('modalTransacaoOverlay').classList.add('active');
}

function fecharModalTransacao() {
    document.getElementById('modalTransacaoOverlay').classList.remove('active');
}

async function salvarTransacao(e) {
    e.preventDefault();

    const tipo = document.getElementById('inputTransacaoTipo').value;
    const payload = {
        tipo,
        descricao: document.getElementById('inputTransacaoDescricao').value.trim(),
        valor: Number(document.getElementById('inputTransacaoValor').value),
        data: document.getElementById('inputTransacaoData').value,
        status: document.getElementById('inputTransacaoStatus').value,
        recorrente: document.getElementById('inputTransacaoRecorrente').checked
    };

    if (tipo === 'Transferencia') {
        payload.contaId = document.getElementById('inputTransacaoConta').value || null;
        payload.contaDestinoId = document.getElementById('inputTransacaoContaDestino').value || null;
        if (!payload.contaId || !payload.contaDestinoId || payload.contaId === payload.contaDestinoId) {
            return alert('Selecione contas de origem e destino diferentes.');
        }
    } else {
        payload.formaPagamento = document.getElementById('inputTransacaoForma').value;
        payload.categoriaId = document.getElementById('inputTransacaoCategoria').value || null;

        if (tipo === 'Despesa' && payload.formaPagamento === 'Crédito') {
            payload.cartaoId = document.getElementById('inputTransacaoCartao').value || null;
            payload.parcelaTotal = Number(document.getElementById('inputTransacaoParcelas').value) || 1;
            payload.parcelaAtual = Number(document.getElementById('inputTransacaoParcelaAtual').value) || 1;
            if (!payload.cartaoId) return alert('Selecione o cartão utilizado na compra.');
            if (payload.parcelaAtual > payload.parcelaTotal) return alert('A parcela atual não pode ser maior que o total de parcelas.');
        } else {
            payload.contaId = document.getElementById('inputTransacaoConta').value || null;
        }
    }

    try {
        const id = stateFin.editTransacaoId;
        const resp = await fetch(id ? `${API_BASE}/transacoes/${id}` : `${API_BASE}/transacoes`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const erro = await resp.json().catch(() => ({}));
            throw new Error(erro.error || 'Falha ao salvar lançamento');
        }

        fecharModalTransacao();
        await carregarTransacoes();
        await carregarFaturas();
        await carregarContas();
        await carregarCartoes();
        await carregarResumo();
        await carregarProjecao();
    } catch (err) {
        alert(`Não foi possível salvar o lançamento. ${err.message}`);
    }
}

async function excluirTransacao() {
    if (!stateFin.editTransacaoId) return;

    const transacao = stateFin.transacoes.find(t => t.id === stateFin.editTransacaoId);
    let todasParcelas = false;
    if (transacao && transacao.grupoParcelamentoId) {
        todasParcelas = confirm('Esta é uma parcela de uma compra parcelada. Excluir TODAS as parcelas dessa compra? Cancelar exclui apenas esta parcela.');
    } else if (!confirm('Deseja realmente excluir este lançamento?')) {
        return;
    }

    try {
        const url = `${API_BASE}/transacoes/${stateFin.editTransacaoId}${todasParcelas ? '?todasParcelas=true' : ''}`;
        const resp = await fetch(url, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Falha ao excluir lançamento');

        fecharModalTransacao();
        await carregarTransacoes();
        await carregarFaturas();
        await carregarContas();
        await carregarCartoes();
        await carregarResumo();
        await carregarProjecao();
    } catch (err) {
        alert(`Não foi possível excluir o lançamento. ${err.message}`);
    }
}

// =========================================================
// FATURAS
// =========================================================

function renderFiltroCartaoFatura() {
    const container = document.getElementById('filtroCartaoFatura');
    container.innerHTML = '<button type="button" class="financas-filter-btn active" data-cartao-id="Todos">Todos os cartões</button>';
    stateFin.cartoes.forEach(cartao => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'financas-filter-btn';
        btn.dataset.cartaoId = cartao.id;
        btn.textContent = cartao.nome;
        container.appendChild(btn);
    });

    container.querySelectorAll('.financas-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.financas-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            stateFin.filtroCartaoFatura = btn.dataset.cartaoId;
            renderFaturas();
        });
    });
}

async function carregarFaturas() {
    try {
        const resp = await fetch(`${API_BASE}/faturas`);
        if (!resp.ok) throw new Error('Erro ao buscar faturas');
        stateFin.faturas = await resp.json();
        renderFaturas();
    } catch (err) {
        console.warn('[Finanças] Erro ao carregar faturas.', err.message);
    }
}

function renderFaturas() {
    const tbody = document.getElementById('faturasTableBody');
    tbody.innerHTML = '';

    const filtradas = stateFin.filtroCartaoFatura === 'Todos'
        ? stateFin.faturas
        : stateFin.faturas.filter(f => f.cartaoId === Number(stateFin.filtroCartaoFatura));

    if (!filtradas.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="financas-table-empty">Nenhuma fatura gerada ainda. Lance uma compra no crédito para gerar a primeira fatura.</td></tr>';
        return;
    }

    filtradas.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(f.cartao.nome)}</td>
            <td>${formatarCompetencia(f.mesReferencia, f.anoReferencia)}</td>
            <td>${formatarDataBR(f.dataFechamento)}</td>
            <td>${formatarDataBR(f.dataVencimento)}</td>
            <td>${formatarMoeda(f.valorTotal)}</td>
            <td><span class="financas-pill ${pillStatusFatura(f.status)}">${escapeHtml(f.status)}</span></td>
            <td>
                <div class="financas-table-actions">
                    <button type="button" class="btn-financas-action" data-ver-fatura="${f.id}">Ver</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-ver-fatura]').forEach(btn => {
        btn.addEventListener('click', () => abrirModalFatura(Number(btn.dataset.verFatura)));
    });
}

function pillStatusFatura(status) {
    if (status === 'Paga') return 'pill-income';
    if (status === 'Fechada') return 'pill-accent';
    return 'pill-muted';
}

function initModalFatura() {
    document.getElementById('modalFaturaClose').addEventListener('click', fecharModalFatura);
    document.getElementById('btnFaturaFechar').addEventListener('click', fecharModalFatura);
    document.getElementById('modalFaturaOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'modalFaturaOverlay') fecharModalFatura();
    });
    document.getElementById('btnFaturaPagar').addEventListener('click', pagarFaturaAberta);
}

async function abrirModalFatura(id) {
    try {
        const resp = await fetch(`${API_BASE}/faturas/${id}`);
        if (!resp.ok) throw new Error('Erro ao buscar fatura');
        const fatura = await resp.json();

        stateFin.faturaAbertaId = fatura.id;
        document.getElementById('modalFaturaTitle').textContent = `Fatura · ${fatura.cartao.nome}`;
        document.getElementById('modalFaturaSubtitle').textContent = `Competência ${formatarCompetencia(fatura.mesReferencia, fatura.anoReferencia)} · Vencimento ${formatarDataBR(fatura.dataVencimento)}`;

        const tbody = document.getElementById('faturaDetalheTableBody');
        tbody.innerHTML = fatura.transacoes.length
            ? fatura.transacoes.map(t => `
                <tr>
                    <td>${formatarDataBR(t.data)}</td>
                    <td>${escapeHtml(t.descricao)}</td>
                    <td>${t.categoria ? escapeHtml(t.categoria.nome) : '—'}</td>
                    <td>${formatarMoeda(t.valor)}</td>
                </tr>
              `).join('')
            : '<tr><td colspan="4" class="financas-table-empty">Nenhum lançamento nesta fatura.</td></tr>';

        document.getElementById('faturaDetalheTotal').textContent = `Total: ${formatarMoeda(fatura.valorTotal)}`;

        const btnPagar = document.getElementById('btnFaturaPagar');
        btnPagar.style.display = fatura.status === 'Paga' ? 'none' : 'inline-flex';

        document.getElementById('modalFaturaOverlay').classList.add('active');
    } catch (err) {
        alert(`Não foi possível carregar a fatura. ${err.message}`);
    }
}

function fecharModalFatura() {
    document.getElementById('modalFaturaOverlay').classList.remove('active');
    stateFin.faturaAbertaId = null;
}

async function pagarFaturaAberta() {
    if (!stateFin.faturaAbertaId) return;
    const debitar = confirm('Marcar fatura como paga. Deseja lançar automaticamente uma despesa em débito na conta vinculada ao cartão?');

    try {
        const resp = await fetch(`${API_BASE}/faturas/${stateFin.faturaAbertaId}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ debitarDeConta: debitar })
        });
        if (!resp.ok) throw new Error('Falha ao registrar pagamento');

        fecharModalFatura();
        await carregarFaturas();
        await carregarTransacoes();
        await carregarContas();
        await carregarResumo();
        await carregarProjecao();
    } catch (err) {
        alert(`Não foi possível marcar a fatura como paga. ${err.message}`);
    }
}

// =========================================================
// VISÃO GERAL (RESUMO / DASHBOARD)
// =========================================================

async function carregarResumo() {
    try {
        const resp = await fetch(`${API_BASE}/resumo`);
        if (!resp.ok) throw new Error('Erro ao buscar resumo');
        const resumo = await resp.json();
        renderResumo(resumo);
    } catch (err) {
        console.warn('[Finanças] Erro ao carregar resumo.', err.message);
    }
}

function renderResumo(resumo) {
    document.getElementById('kpiSaldoTotal').textContent = formatarMoeda(resumo.saldoTotal);
    document.getElementById('kpiReceitaMes').textContent = formatarMoeda(resumo.receitaMes);
    document.getElementById('kpiDespesaMes').textContent = formatarMoeda(resumo.despesaMes);

    const kpiResultado = document.getElementById('kpiResultadoMes');
    kpiResultado.textContent = formatarMoeda(resumo.resultadoMes);
    kpiResultado.className = `kpi-value ${resumo.resultadoMes >= 0 ? 'text-income' : 'text-expense'}`;

    renderResumoFaturas(resumo.faturasAbertas);
    renderOrcamentos(resumo.orcamentos);
    renderGraficos(resumo);
}

function renderResumoFaturas(faturasAbertas) {
    const grid = document.getElementById('resumoFaturasGrid');
    grid.innerHTML = '';

    if (!faturasAbertas.length) {
        grid.innerHTML = '<p class="financas-table-empty">Nenhum cartão cadastrado ainda.</p>';
        return;
    }

    faturasAbertas.forEach(item => {
        const card = document.createElement('div');
        card.className = 'financas-resumo-fatura-card';
        card.style.setProperty('--cartao-cor', item.cor);
        card.innerHTML = item.fatura ? `
            <span class="financas-resumo-fatura-nome">${escapeHtml(item.nome)}</span>
            <span class="financas-resumo-fatura-valor">${formatarMoeda(item.fatura.valorTotal)}</span>
            <span class="financas-resumo-fatura-venc">Vence em ${formatarDataBR(item.fatura.dataVencimento)} · ${escapeHtml(item.fatura.status)}</span>
        ` : `
            <span class="financas-resumo-fatura-nome">${escapeHtml(item.nome)}</span>
            <span class="financas-resumo-fatura-venc">Nenhuma fatura em aberto</span>
        `;
        grid.appendChild(card);
    });
}

function renderOrcamentos(orcamentos) {
    const painel = document.getElementById('painelOrcamentos');
    const lista = document.getElementById('orcamentosList');

    if (!orcamentos.length) {
        painel.style.display = 'none';
        return;
    }

    painel.style.display = '';
    lista.innerHTML = orcamentos.map(o => {
        const pct = Math.min(100, (o.gastoAtual / o.orcamentoMensal) * 100);
        const estourado = o.gastoAtual > o.orcamentoMensal;
        return `
            <div class="financas-orcamento-item">
                <div class="financas-orcamento-linha">
                    <span>${escapeHtml(o.nome)}</span>
                    <span>${formatarMoeda(o.gastoAtual)} / ${formatarMoeda(o.orcamentoMensal)}</span>
                </div>
                <div class="financas-orcamento-barra">
                    <div class="financas-orcamento-barra-fill ${estourado ? 'estourado' : ''}" style="width:${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderGraficos(resumo) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#FFFFFF' : '#1C1C1E';

    const ctxCategoria = document.getElementById('chartGastoCategoria');
    if (ctxCategoria) {
        if (chartGastoCategoria) chartGastoCategoria.destroy();
        const labels = Object.keys(resumo.gastoPorCategoria);
        const dados = Object.values(resumo.gastoPorCategoria);

        chartGastoCategoria = new Chart(ctxCategoria, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['Sem despesas no mês'],
                datasets: [{
                    data: dados.length ? dados : [1],
                    backgroundColor: ['#EEBB00', '#D32F2F', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#6B7280', '#2E7D32'],
                    borderColor: isDark ? '#1C1C1E' : '#FFFFFF',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: textColor, font: { weight: '600', size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatarMoeda(ctx.raw)}` } }
                }
            }
        });
    }

    const ctxEvolucao = document.getElementById('chartEvolucaoMensal');
    if (ctxEvolucao) {
        if (chartEvolucaoMensal) chartEvolucaoMensal.destroy();
        const labels = resumo.evolucaoMensal.map(m => formatarCompetencia(m.mes, m.ano));

        chartEvolucaoMensal = new Chart(ctxEvolucao, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Receita', data: resumo.evolucaoMensal.map(m => m.receita), backgroundColor: '#2E7D32', borderRadius: 4 },
                    { label: 'Despesa', data: resumo.evolucaoMensal.map(m => m.despesa), backgroundColor: '#D32F2F', borderRadius: 4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { weight: '600', size: 11 } } },
                    tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${formatarMoeda(ctx.raw)}` } }
                },
                scales: {
                    x: { ticks: { color: textColor }, grid: { display: false } },
                    y: { ticks: { color: textColor }, grid: { color: 'rgba(160,160,160,0.15)' } }
                }
            }
        });
    }
}

// =========================================================
// UTILITÁRIOS
// =========================================================

function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarCompetencia(mes, ano) {
    return `${String(mes).padStart(2, '0')}/${ano}`;
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
            carregarResumo();
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
