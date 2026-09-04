// JS/Configuracoes/configuracoes.js
// Módulo de Configurações da Conta: edição de perfil (nome/foto) e módulos visíveis no Hub Financeiro

const MODULOS_HUB_FINANCEIRO = [
    {
        chave: 'fii',
        nome: 'Fundos Imobiliários',
        desc: 'Carteira de FIIs, calculadora de bola de neve e radar Funds Explorer.',
        icone: '<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M8 10h.01"></path><path d="M16 10h.01"></path>'
    },
    {
        chave: 'cripto',
        nome: 'Cripto Moedas',
        desc: 'Carteira de criptoativos com cotação ao vivo.',
        icone: '<circle cx="12" cy="12" r="10"></circle><path d="M9.5 8h3.2a2.3 2.3 0 0 1 0 4.6H9.5"></path><path d="M9.5 12.6h3.6a2.3 2.3 0 0 1 0 4.6H9.5"></path><path d="M9.5 8V6.5"></path><path d="M9.5 17.2v1.5"></path><path d="M12.3 8V6.5"></path><path d="M12.3 17.2v1.5"></path>'
    },
    {
        chave: 'leilao',
        nome: 'Carros de Leilão',
        desc: 'Compra, reforma e venda de carros arrematados em leilão.',
        icone: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle>'
    },
    {
        chave: 'casasleilao',
        nome: 'Casas de Leilão',
        desc: 'Compra, reforma e venda de imóveis arrematados em leilão.',
        icone: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>'
    },
    {
        chave: 'cofrinho',
        nome: 'Cofrinho',
        desc: 'Renda diária com projeção automática de IOF e IR.',
        icone: '<path d="M19 5c-1.5-1.5-5-2-7-2-4 0-7 2-7 5 0 2 1 3 2 4l-1 4h3l1-2c1 .3 2 .5 3 .5h1v2h3v-2.3c2-.7 3-2.2 3-4.2 0-1-.3-2-1-3l1-1-1-1z"></path><circle cx="15" cy="9" r="1"></circle>'
    }
];

let pendingFotoUrl; // undefined = sem alteração pendente; string = nova foto; null = remover

document.addEventListener('DOMContentLoaded', () => {
    carregarPerfil();
    renderizarModulos();
});

async function carregarPerfil() {
    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return;
        const usuario = await response.json();
        preencherPerfil(usuario);
        if (usuario.role === 'admin') inicializarAdminUsuarios(usuario.id);
    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
    }
}

function preencherPerfil(usuario) {
    document.getElementById('inputNomePerfil').value = usuario.nome || '';
    document.getElementById('inputUsernamePerfil').value = usuario.username || '';
    document.getElementById('inputEmailPerfil').value = usuario.email || '';
    atualizarAvatar(usuario.fotoUrl, usuario.nome);

    const formPerfil = document.getElementById('formPerfil');
    formPerfil.addEventListener('submit', (e) => salvarPerfil(e));

    document.getElementById('inputFoto').addEventListener('change', (e) => selecionarFoto(e, usuario));
    document.getElementById('btnRemoverFoto').addEventListener('click', () => removerFoto());
}

function atualizarAvatar(fotoUrl, nome) {
    const img = document.getElementById('avatarImg');
    const iniciais = document.getElementById('avatarInitials');

    if (fotoUrl) {
        img.src = fotoUrl;
        img.style.display = 'block';
        iniciais.style.display = 'none';
    } else {
        img.style.display = 'none';
        iniciais.style.display = 'block';
        iniciais.textContent = (nome || '?').trim().charAt(0).toUpperCase();
    }
}

function selecionarFoto(e, usuario) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    const imagem = new Image();
    const leitor = new FileReader();

    leitor.onload = (ev) => {
        imagem.onload = () => {
            const dataUrlReduzida = redimensionarImagem(imagem, 320);
            pendingFotoUrl = dataUrlReduzida;
            atualizarAvatar(dataUrlReduzida, usuario.nome);
            salvarFoto(dataUrlReduzida);
        };
        imagem.src = ev.target.result;
    };
    leitor.readAsDataURL(arquivo);
}

function redimensionarImagem(imagem, tamanhoMax) {
    const escala = Math.min(1, tamanhoMax / Math.max(imagem.width, imagem.height));
    const largura = Math.round(imagem.width * escala);
    const altura = Math.round(imagem.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(imagem, 0, 0, largura, altura);

    return canvas.toDataURL('image/jpeg', 0.82);
}

async function salvarFoto(fotoUrl) {
    const feedback = document.getElementById('perfilFeedback');
    try {
        const response = await fetch('/api/auth/perfil', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fotoUrl })
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível salvar a foto.');
        pendingFotoUrl = undefined;
        if (window.atualizarAvatarHeader) window.atualizarAvatarHeader(fotoUrl);
        exibirFeedback(feedback, 'Foto de perfil atualizada.', 'sucesso');
    } catch (err) {
        exibirFeedback(feedback, err.message, 'erro');
    }
}

async function removerFoto() {
    const nomeAtual = document.getElementById('inputNomePerfil').value;
    atualizarAvatar(null, nomeAtual);
    await salvarFoto(null);
}

async function salvarPerfil(e) {
    e.preventDefault();
    const feedback = document.getElementById('perfilFeedback');
    const nome = document.getElementById('inputNomePerfil').value.trim();
    const email = document.getElementById('inputEmailPerfil').value.trim();

    try {
        const response = await fetch('/api/auth/perfil', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o perfil.');

        const nomeLabel = document.getElementById('accountNomeLabel');
        const dropdownNome = document.getElementById('accountDropdownNome');
        if (nomeLabel) nomeLabel.textContent = data.nome;
        if (dropdownNome) dropdownNome.textContent = data.nome;

        exibirFeedback(feedback, 'Perfil salvo com sucesso!', 'sucesso');
    } catch (err) {
        exibirFeedback(feedback, err.message, 'erro');
    }
}

function exibirFeedback(elemento, mensagem, tipo) {
    elemento.textContent = mensagem;
    elemento.className = 'account-feedback feedback-' + tipo;
    elemento.style.display = 'block';
}

function renderizarModulos() {
    const lista = document.getElementById('modulosLista');
    lista.innerHTML = '';

    MODULOS_HUB_FINANCEIRO.forEach(modulo => {
        const item = document.createElement('li');
        item.className = 'modulo-item';
        item.innerHTML = `
            <div class="modulo-icon-wrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${modulo.icone}</svg>
            </div>
            <div class="modulo-info">
                <span class="modulo-nome">${modulo.nome}</span>
                <span class="modulo-desc">${modulo.desc}</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" checked data-modulo-chave="${modulo.chave}">
                <span class="toggle-slider"></span>
            </label>
        `;
        lista.appendChild(item);
    });

    carregarModulosOcultos();
}

async function carregarModulosOcultos() {
    try {
        const response = await fetch('/api/auth/modulos-ocultos');
        if (!response.ok) return;
        const ocultos = await response.json();

        document.querySelectorAll('#modulosLista input[type="checkbox"]').forEach(input => {
            input.checked = !ocultos.includes(input.dataset.moduloChave);
            input.addEventListener('change', () => alternarModulo(input));
        });
    } catch (err) {
        console.error('Erro ao carregar módulos ocultos:', err);
    }
}

async function alternarModulo(input) {
    const chave = input.dataset.moduloChave;
    const feedback = document.getElementById('modulosFeedback');
    const metodo = input.checked ? 'DELETE' : 'POST';

    input.disabled = true;
    try {
        const response = await fetch(`/api/auth/modulos-ocultos/${chave}`, { method: metodo });
        if (!response.ok) throw new Error((await response.json()).error || 'Não foi possível salvar a preferência.');
        exibirFeedback(feedback, input.checked ? 'Módulo exibido no Hub Financeiro.' : 'Módulo removido do seu Hub Financeiro.', 'sucesso');
    } catch (err) {
        input.checked = !input.checked; // reverte em caso de falha
        exibirFeedback(feedback, err.message, 'erro');
    } finally {
        input.disabled = false;
    }
}

/* --- Administração de Usuários (visível apenas para contas com role "admin") --- */

function inicializarAdminUsuarios(idUsuarioLogado) {
    const card = document.getElementById('cardAdminUsuarios');
    card.style.display = 'flex';

    carregarUsuarios(idUsuarioLogado);

    const btnNovo = document.getElementById('btnNovoUsuario');
    const formNovo = document.getElementById('formNovoUsuario');
    btnNovo.addEventListener('click', () => {
        formNovo.style.display = formNovo.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('btnCancelarNovoUsuario').addEventListener('click', () => {
        formNovo.reset();
        formNovo.style.display = 'none';
    });
    formNovo.addEventListener('submit', (e) => criarUsuario(e, idUsuarioLogado));
}

async function carregarUsuarios(idUsuarioLogado) {
    const lista = document.getElementById('adminUsuariosLista');
    try {
        const response = await fetch('/api/auth/usuarios');
        if (!response.ok) throw new Error('Não foi possível carregar os usuários.');
        const usuarios = await response.json();

        lista.innerHTML = '';
        usuarios.forEach(u => lista.appendChild(criarLinhaUsuario(u, idUsuarioLogado)));
    } catch (err) {
        console.error('Erro ao carregar usuários:', err);
    }
}

function criarLinhaUsuario(usuario, idUsuarioLogado) {
    const item = document.createElement('li');
    item.className = 'admin-usuario-item';
    item.innerHTML = `
        <div class="admin-usuario-info">
            <span class="admin-usuario-nome">${usuario.nome}</span>
            <span class="admin-usuario-login">@${usuario.username}</span>
        </div>
        <span class="admin-role-badge ${usuario.role === 'admin' ? 'role-admin' : ''}">${usuario.role === 'admin' ? 'Administrador' : 'Usuário Comum'}</span>
        <div class="admin-usuario-acoes">
            <button type="button" class="btn-admin-acao" data-acao="editar">Editar</button>
            ${usuario.id !== idUsuarioLogado
                ? '<button type="button" class="btn-admin-acao btn-admin-excluir" data-acao="excluir">Excluir</button>'
                : '<span class="admin-usuario-atual-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Conta atual</span>'}
        </div>
    `;

    item.querySelector('[data-acao="editar"]').addEventListener('click', () => {
        const formExistente = item.nextElementSibling;
        if (formExistente && formExistente.classList.contains('admin-usuario-form-linha-editar')) {
            formExistente.remove();
            return;
        }
        item.after(criarFormularioEdicao(usuario, idUsuarioLogado));
    });

    const btnExcluir = item.querySelector('[data-acao="excluir"]');
    if (btnExcluir) {
        btnExcluir.addEventListener('click', () => excluirUsuario(usuario, idUsuarioLogado));
    }

    return item;
}

async function excluirUsuario(usuario, idUsuarioLogado) {
    const confirmado = confirm(`Excluir o usuário "${usuario.nome}" (@${usuario.username})?\n\nTodos os dados cadastrados por ele (veículos, imóveis, investimentos, etc.) serão apagados permanentemente.`);
    if (!confirmado) return;

    try {
        const response = await fetch(`/api/auth/usuarios/${usuario.id}`, { method: 'DELETE' });
        const dados = await response.json();
        if (!response.ok) throw new Error(dados.error || 'Não foi possível excluir o usuário.');
        carregarUsuarios(idUsuarioLogado);
    } catch (err) {
        alert(err.message);
    }
}

function criarFormularioEdicao(usuario, idUsuarioLogado) {
    const wrapper = document.createElement('li');
    wrapper.className = 'admin-usuario-form-linha-editar';

    const form = document.createElement('form');
    form.className = 'admin-usuario-form';
    const ehEuMesmo = usuario.id === idUsuarioLogado;
    form.innerHTML = `
        <div class="admin-form-linha">
            <input type="text" class="input-missao" data-campo="nome" value="${usuario.nome}" placeholder="Nome de exibição" required maxlength="80">
            <input type="text" class="input-missao" data-campo="username" value="${usuario.username}" placeholder="Usuário (login)" required maxlength="40" autocomplete="off">
        </div>
        <div class="admin-form-linha">
            <input type="password" class="input-missao" data-campo="senha" placeholder="Nova senha (deixe em branco para manter)" autocomplete="new-password">
        </div>
        <div class="admin-form-cargo">
            <label><input type="radio" name="cargo-${usuario.id}" value="usuario" ${usuario.role !== 'admin' ? 'checked' : ''} ${ehEuMesmo ? 'disabled' : ''}> Usuário Comum</label>
            <label><input type="radio" name="cargo-${usuario.id}" value="admin" ${usuario.role === 'admin' ? 'checked' : ''} ${ehEuMesmo ? 'disabled' : ''}> Administrador</label>
        </div>
        <p class="account-feedback" style="display:none;"></p>
        <div class="admin-form-acoes">
            <button type="submit" class="btn-missao-primary">Salvar Alterações</button>
            <button type="button" class="btn-admin-cancelar">Cancelar</button>
        </div>
    `;

    form.querySelector('.btn-admin-cancelar').addEventListener('click', () => wrapper.remove());
    form.addEventListener('submit', (e) => salvarEdicaoUsuario(e, usuario, idUsuarioLogado, wrapper));

    wrapper.appendChild(form);
    return wrapper;
}

async function salvarEdicaoUsuario(e, usuario, idUsuarioLogado, wrapper) {
    e.preventDefault();
    const form = e.target;
    const feedback = form.querySelector('.account-feedback');
    const nome = form.querySelector('[data-campo="nome"]').value.trim();
    const username = form.querySelector('[data-campo="username"]').value.trim();
    const senha = form.querySelector('[data-campo="senha"]').value;
    const cargoInput = form.querySelector(`input[name="cargo-${usuario.id}"]:checked`);
    const role = cargoInput ? cargoInput.value : usuario.role;

    try {
        const respDados = await fetch(`/api/auth/usuarios/${usuario.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, username, role })
        });
        const dados = await respDados.json();
        if (!respDados.ok) throw new Error(dados.error || 'Não foi possível salvar as alterações.');

        if (senha) {
            const respSenha = await fetch(`/api/auth/usuarios/${usuario.id}/senha`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ novaSenha: senha })
            });
            const dadosSenha = await respSenha.json();
            if (!respSenha.ok) throw new Error(dadosSenha.error || 'Não foi possível redefinir a senha.');
        }

        wrapper.remove();
        carregarUsuarios(idUsuarioLogado);
    } catch (err) {
        exibirFeedback(feedback, err.message, 'erro');
    }
}

async function criarUsuario(e, idUsuarioLogado) {
    e.preventDefault();
    const feedback = document.getElementById('novoUsuarioFeedback');
    const nome = document.getElementById('inputNovoNome').value.trim();
    const username = document.getElementById('inputNovoUsername').value.trim();
    const senha = document.getElementById('inputNovaSenhaUsuario').value;
    const role = document.querySelector('input[name="novoCargo"]:checked').value;

    try {
        const response = await fetch('/api/auth/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, username, senha, role })
        });
        const dados = await response.json();
        if (!response.ok) throw new Error(dados.error || 'Não foi possível criar o usuário.');

        const form = document.getElementById('formNovoUsuario');
        form.reset();
        form.style.display = 'none';
        carregarUsuarios(idUsuarioLogado);
    } catch (err) {
        exibirFeedback(feedback, err.message, 'erro');
    }
}
