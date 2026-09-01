/**
 * JS/Clima/clima.js
 * Lógica do Módulo Clima (Hub Pessoal): geolocalização automática, busca manual
 * de cidade/bairro e exibição do clima atual, previsão horária e diária.
 */

const API_BASE = '/api';
const CLIMA_RECENTES_KEY = 'financehub_clima_recentes';
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const stateClima = { local: null };
let debounceBuscaClima = null;
let locaisSalvosCache = [];

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileNavigation();
    initBuscaClima();
    initSalvarLocal();
    renderChipsRecentes();
    carregarLocaisSalvos();
    detectarLocalizacaoAtual();
});

// =========================================================
// GEOLOCALIZAÇÃO E SELEÇÃO DE LOCAL
// =========================================================

function detectarLocalizacaoAtual() {
    mostrarStatus('Detectando sua localização atual...');

    if (!navigator.geolocation) {
        mostrarStatus('Seu navegador não suporta geolocalização. Busque uma cidade ou bairro manualmente.', true);
        tentarUltimoLocalRecente();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                const resp = await fetch(`${API_BASE}/clima/local-atual?lat=${latitude}&lon=${longitude}`);
                const local = await resp.json();
                if (!resp.ok) throw new Error(local.error || 'Erro ao identificar local');

                selecionarLocal({ nome: local.nome, estado: local.estado, pais: local.pais, lat: latitude, lon: longitude }, false);
            } catch (err) {
                console.warn('[Clima] Erro ao identificar local atual.', err.message);
                selecionarLocal({ nome: 'Minha Localização', estado: null, pais: null, lat: latitude, lon: longitude }, false);
            }
        },
        (err) => {
            console.warn('[Clima] Geolocalização negada ou indisponível.', err.message);
            mostrarStatus('Não foi possível acessar sua localização. Busque uma cidade ou bairro manualmente, ou permita o acesso à localização nas configurações do navegador.', true);
            tentarUltimoLocalRecente();
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
}

function tentarUltimoLocalRecente() {
    const recentes = obterRecentes();
    if (recentes.length) {
        selecionarLocal(recentes[0], false);
    }
}

async function selecionarLocal(local, salvarComoRecente = true) {
    stateClima.local = local;

    document.getElementById('climaLocationName').textContent = local.nome;
    document.getElementById('climaLocationMeta').textContent = [local.estado, local.pais].filter(Boolean).join(', ');

    if (salvarComoRecente) salvarLocalRecente(local);
    atualizarEstrelaLocalAtual();

    await carregarPrevisao(local.lat, local.lon);
}

// =========================================================
// LOCAIS SALVOS (persistidos no banco, vinculados ao usuário)
// =========================================================

function initSalvarLocal() {
    document.getElementById('btnClimaSalvarLocal').addEventListener('click', async () => {
        if (!stateClima.local) return;

        const existente = localJaSalvo(stateClima.local);
        if (existente) {
            await removerLocalSalvo(existente.id);
        } else {
            await salvarLocalAtual();
        }
    });
}

function localJaSalvo(local) {
    return locaisSalvosCache.find(l =>
        Math.abs(l.lat - local.lat) < 0.01 && Math.abs(l.lon - local.lon) < 0.01
    );
}

function atualizarEstrelaLocalAtual() {
    const btn = document.getElementById('btnClimaSalvarLocal');
    if (!btn || !stateClima.local) return;

    const existente = localJaSalvo(stateClima.local);
    btn.classList.toggle('is-saved', !!existente);
    btn.title = existente ? 'Remover dos locais salvos' : 'Salvar este local';
}

async function carregarLocaisSalvos() {
    try {
        const resp = await fetch(`${API_BASE}/clima/salvos`);
        if (!resp.ok) throw new Error('Erro ao buscar locais salvos');

        locaisSalvosCache = await resp.json();
        renderLocaisSalvos();
        atualizarEstrelaLocalAtual();
    } catch (err) {
        console.warn('[Clima] Erro ao carregar locais salvos.', err.message);
    }
}

function renderLocaisSalvos() {
    const section = document.getElementById('climaSavedSection');
    const grid = document.getElementById('climaSavedGrid');
    grid.innerHTML = '';

    if (!locaisSalvosCache.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'flex';
    locaisSalvosCache.forEach(local => grid.appendChild(criarCardLocalSalvo(local)));
}

function criarCardLocalSalvo(local) {
    const card = document.createElement('div');
    card.className = local.favoritoHeader ? 'clima-saved-card is-header-favorito' : 'clima-saved-card';

    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.className = 'clima-saved-remove';
    btnRemover.setAttribute('aria-label', 'Remover local salvo');
    btnRemover.textContent = '×';
    btnRemover.addEventListener('click', (e) => {
        e.stopPropagation();
        removerLocalSalvo(local.id);
    });

    const btnFavoritoHeader = document.createElement('button');
    btnFavoritoHeader.type = 'button';
    btnFavoritoHeader.className = local.favoritoHeader ? 'clima-saved-pin is-active' : 'clima-saved-pin';
    btnFavoritoHeader.title = local.favoritoHeader ? 'Remover do cabeçalho' : 'Mostrar no cabeçalho';
    btnFavoritoHeader.setAttribute('aria-label', btnFavoritoHeader.title);
    btnFavoritoHeader.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>';
    btnFavoritoHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        definirFavoritoHeader(local.id, !local.favoritoHeader);
    });

    const icone = document.createElement('span');
    icone.className = 'clima-saved-icon';
    icone.textContent = '…';

    const temp = document.createElement('span');
    temp.className = 'clima-saved-temp';
    temp.textContent = '';

    const nome = document.createElement('span');
    nome.className = 'clima-saved-nome';
    nome.textContent = local.nome;
    nome.title = local.nome;

    card.appendChild(btnRemover);
    card.appendChild(btnFavoritoHeader);
    card.appendChild(icone);
    card.appendChild(temp);
    card.appendChild(nome);

    card.addEventListener('click', () => {
        selecionarLocal({ nome: local.nome, estado: local.estado, pais: local.pais, lat: local.lat, lon: local.lon }, false);
    });

    fetch(`${API_BASE}/clima/previsao?lat=${local.lat}&lon=${local.lon}`)
        .then(r => r.json())
        .then(dados => {
            if (dados && dados.current) {
                const info = obterInfoClima(dados.current.weather_code, dados.current.is_day);
                icone.textContent = info.icone;
                temp.textContent = `${Math.round(dados.current.temperature_2m)}°`;
            }
        })
        .catch(() => { icone.textContent = '⚠️'; });

    return card;
}

async function salvarLocalAtual() {
    try {
        const resp = await fetch(`${API_BASE}/clima/salvos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stateClima.local)
        });
        if (!resp.ok) throw new Error('Erro ao salvar local');

        await carregarLocaisSalvos();
    } catch (err) {
        console.warn('[Clima] Erro ao salvar local.', err.message);
        alert('Não foi possível salvar este local agora.');
    }
}

async function removerLocalSalvo(id) {
    try {
        const resp = await fetch(`${API_BASE}/clima/salvos/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Erro ao remover local');

        await carregarLocaisSalvos();
        atualizarWidgetHeaderClima();
    } catch (err) {
        console.warn('[Clima] Erro ao remover local salvo.', err.message);
        alert('Não foi possível remover este local agora.');
    }
}

async function definirFavoritoHeader(id, favorito) {
    try {
        const resp = await fetch(`${API_BASE}/clima/salvos/${id}/favorito`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorito })
        });
        if (!resp.ok) throw new Error('Erro ao definir local favorito');

        await carregarLocaisSalvos();
        atualizarWidgetHeaderClima();
    } catch (err) {
        console.warn('[Clima] Erro ao definir local favorito do cabeçalho.', err.message);
        alert('Não foi possível atualizar o favorito do cabeçalho agora.');
    }
}

function atualizarWidgetHeaderClima() {
    if (typeof carregarClimaHeaderWidget === 'function') carregarClimaHeaderWidget();
}

// =========================================================
// BUSCA MANUAL DE CIDADE / BAIRRO
// =========================================================

function initBuscaClima() {
    const input = document.getElementById('inputClimaBusca');
    const resultsBox = document.getElementById('climaSearchResults');
    const btnBuscar = document.getElementById('btnClimaBuscar');
    const btnLocalizacao = document.getElementById('btnClimaLocalizacaoAtual');

    input.addEventListener('input', () => {
        clearTimeout(debounceBuscaClima);
        const valor = input.value.trim();
        if (valor.length < 2) {
            fecharResultadosBusca();
            return;
        }
        debounceBuscaClima = setTimeout(() => buscarLocal(valor), 400);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(debounceBuscaClima);
            buscarLocal(input.value.trim());
        }
    });

    btnBuscar.addEventListener('click', () => {
        clearTimeout(debounceBuscaClima);
        buscarLocal(input.value.trim());
    });

    btnLocalizacao.addEventListener('click', () => {
        input.value = '';
        fecharResultadosBusca();
        detectarLocalizacaoAtual();
    });

    document.addEventListener('click', (e) => {
        if (!resultsBox.contains(e.target) && e.target !== input) {
            fecharResultadosBusca();
        }
    });
}

function fecharResultadosBusca() {
    const resultsBox = document.getElementById('climaSearchResults');
    resultsBox.classList.remove('open');
    resultsBox.innerHTML = '';
}

async function buscarLocal(query) {
    if (!query || query.length < 2) return;
    const resultsBox = document.getElementById('climaSearchResults');

    try {
        const resp = await fetch(`${API_BASE}/clima/buscar-local?query=${encodeURIComponent(query)}`);
        const dados = await resp.json();
        if (!resp.ok) throw new Error(dados.error || 'Erro ao buscar localidades');

        resultsBox.innerHTML = '';

        if (!dados.length) {
            const vazio = document.createElement('div');
            vazio.className = 'clima-search-empty';
            vazio.textContent = 'Nenhum local encontrado.';
            resultsBox.appendChild(vazio);
        } else {
            dados.forEach(local => resultsBox.appendChild(criarItemResultadoBusca(local)));
        }

        resultsBox.classList.add('open');
    } catch (err) {
        console.warn('[Clima] Erro na busca de local.', err.message);
    }
}

function criarItemResultadoBusca(local) {
    const item = document.createElement('div');
    item.className = 'clima-search-result-item';

    const nome = document.createElement('span');
    nome.className = 'clima-search-result-nome';
    nome.textContent = local.nome;

    const meta = document.createElement('span');
    meta.className = 'clima-search-result-meta';
    meta.textContent = [local.estado, local.pais].filter(Boolean).join(', ');

    item.appendChild(nome);
    item.appendChild(meta);

    item.addEventListener('click', () => {
        fecharResultadosBusca();
        document.getElementById('inputClimaBusca').value = local.nome;
        selecionarLocal(local);
    });

    return item;
}

// =========================================================
// CARREGAMENTO E RENDERIZAÇÃO DA PREVISÃO
// =========================================================

async function carregarPrevisao(lat, lon) {
    mostrarStatus('Carregando previsão do tempo...');
    document.getElementById('climaCurrentCard').style.display = 'none';
    document.getElementById('climaHourlySection').style.display = 'none';
    document.getElementById('climaDailySection').style.display = 'none';

    try {
        const resp = await fetch(`${API_BASE}/clima/previsao?lat=${lat}&lon=${lon}`);
        const dados = await resp.json();
        if (!resp.ok) throw new Error(dados.error || 'Erro ao carregar previsão');

        esconderStatus();
        renderClimaAtual(dados.current, dados.daily);
        renderHourly(dados.hourly);
        renderDaily(dados.daily);
    } catch (err) {
        console.warn('[Clima] Erro ao carregar previsão.', err.message);
        mostrarStatus('Não foi possível carregar a previsão do tempo agora. Tente novamente mais tarde.', true);
    }
}

function renderClimaAtual(current, daily) {
    if (!current) return;

    const info = obterInfoClima(current.weather_code, current.is_day);
    document.getElementById('climaIconeAtual').textContent = info.icone;
    document.getElementById('climaTempAtual').textContent = `${Math.round(current.temperature_2m)}°`;
    document.getElementById('climaDescricao').textContent = info.texto;
    document.getElementById('climaSensacao').textContent = `${Math.round(current.apparent_temperature)}°`;
    document.getElementById('climaUmidade').textContent = `${Math.round(current.relative_humidity_2m)}%`;
    document.getElementById('climaVento').textContent = `${Math.round(current.wind_speed_10m)} km/h`;

    if (daily && daily.temperature_2m_max && daily.temperature_2m_max.length) {
        document.getElementById('climaMinMax').textContent =
            `${Math.round(daily.temperature_2m_min[0])}° / ${Math.round(daily.temperature_2m_max[0])}°`;
    }

    document.getElementById('climaAtualizadoEm').textContent =
        `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    document.getElementById('climaCurrentCard').style.display = 'flex';
}

function renderHourly(hourly) {
    const strip = document.getElementById('climaHourlyStrip');
    strip.innerHTML = '';
    if (!hourly || !hourly.time) return;

    const agora = new Date();
    let startIdx = hourly.time.findIndex(t => new Date(t) >= agora);
    if (startIdx === -1) startIdx = 0;

    hourly.time.slice(startIdx, startIdx + 24).forEach((tempoISO, i) => {
        const idx = startIdx + i;
        const data = new Date(tempoISO);
        const info = obterInfoClima(hourly.weather_code[idx], 1);

        const card = document.createElement('div');
        card.className = 'clima-hourly-card';

        const hora = document.createElement('span');
        hora.className = 'clima-hourly-hora';
        hora.textContent = i === 0 ? 'Agora' : `${String(data.getHours()).padStart(2, '0')}h`;

        const icone = document.createElement('span');
        icone.className = 'clima-hourly-icon';
        icone.textContent = info.icone;

        const temp = document.createElement('span');
        temp.className = 'clima-hourly-temp';
        temp.textContent = `${Math.round(hourly.temperature_2m[idx])}°`;

        const precip = document.createElement('span');
        precip.className = 'clima-hourly-precip';
        precip.textContent = `💧 ${hourly.precipitation_probability ? hourly.precipitation_probability[idx] : 0}%`;

        card.appendChild(hora);
        card.appendChild(icone);
        card.appendChild(temp);
        card.appendChild(precip);
        strip.appendChild(card);
    });

    document.getElementById('climaHourlySection').style.display = 'flex';
}

function renderDaily(daily) {
    const grid = document.getElementById('climaDailyGrid');
    grid.innerHTML = '';
    if (!daily || !daily.time) return;

    const hojeChave = formatarDataChaveClima(new Date());

    daily.time.forEach((dataISO, idx) => {
        const data = new Date(`${dataISO}T00:00:00`);
        const info = obterInfoClima(daily.weather_code[idx], 1);
        const ehHoje = formatarDataChaveClima(data) === hojeChave;

        const card = document.createElement('div');
        card.className = ehHoje ? 'clima-daily-card is-today' : 'clima-daily-card';

        const dia = document.createElement('span');
        dia.className = 'clima-daily-dia';
        dia.textContent = ehHoje ? 'Hoje' : DIAS_SEMANA[data.getDay()];

        const icone = document.createElement('span');
        icone.className = 'clima-daily-icon';
        icone.textContent = info.icone;

        const precip = document.createElement('span');
        precip.className = 'clima-daily-precip';
        precip.textContent = `💧 ${daily.precipitation_probability_max ? daily.precipitation_probability_max[idx] : 0}%`;

        const temps = document.createElement('span');
        temps.className = 'clima-daily-temps';
        temps.innerHTML = `<span class="clima-daily-max">${Math.round(daily.temperature_2m_max[idx])}°</span> <span class="clima-daily-min">${Math.round(daily.temperature_2m_min[idx])}°</span>`;

        card.appendChild(dia);
        card.appendChild(icone);
        card.appendChild(precip);
        card.appendChild(temps);
        grid.appendChild(card);
    });

    document.getElementById('climaDailySection').style.display = 'flex';
}

function formatarDataChaveClima(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =========================================================
// LOCAIS RECENTES (localStorage)
// =========================================================

function obterRecentes() {
    try {
        return JSON.parse(localStorage.getItem(CLIMA_RECENTES_KEY) || '[]');
    } catch {
        return [];
    }
}

function salvarLocalRecente(local) {
    let recentes = obterRecentes().filter(r =>
        !(r.nome === local.nome && Math.abs(r.lat - local.lat) < 0.01 && Math.abs(r.lon - local.lon) < 0.01)
    );
    recentes.unshift(local);
    recentes = recentes.slice(0, 5);
    localStorage.setItem(CLIMA_RECENTES_KEY, JSON.stringify(recentes));
    renderChipsRecentes();
}

function renderChipsRecentes() {
    const container = document.getElementById('climaRecentChips');
    container.innerHTML = '';

    obterRecentes().forEach(local => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'clima-chip';
        chip.textContent = local.nome;
        chip.addEventListener('click', () => selecionarLocal(local));
        container.appendChild(chip);
    });
}

// =========================================================
// STATUS (Carregando / Erro)
// =========================================================

function mostrarStatus(mensagem, isError) {
    const el = document.getElementById('climaStatusMsg');
    el.textContent = mensagem;
    el.classList.toggle('is-error', !!isError);
    el.style.display = 'block';
}

function esconderStatus() {
    document.getElementById('climaStatusMsg').style.display = 'none';
}

// =========================================================
// TEMA E NAVEGAÇÃO MOBILE (compartilhado com os demais módulos)
// =========================================================

function initTheme() {
    const STORAGE_KEY = 'financehub_theme';
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeLabel = document.getElementById('themeLabel');
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
        if (themeLabel) {
            themeLabel.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Escuro';
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
