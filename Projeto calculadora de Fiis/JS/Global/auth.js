// JS/Global/auth.js
// Guarda de autenticação e menu de conta do usuário, compartilhado por todos os módulos

(function verificarAutenticacao() {
    fetch('/api/auth/me')
        .then(response => {
            if (!response.ok) throw new Error('Não autenticado');
            return response.json();
        })
        .then(usuario => {
            document.body.classList.remove('auth-pending');
            inicializarMenuConta(usuario);
        })
        .catch(() => {
            window.location.replace('../Login/login.html');
        });
})();

function inicializarMenuConta(usuario) {
    const accountMenu = document.getElementById('accountMenu');
    const btnAccount = document.getElementById('btnAccount');
    const accountDropdown = document.getElementById('accountDropdown');
    if (!accountMenu || !btnAccount || !accountDropdown) return;

    const nomeLabel = document.getElementById('accountNomeLabel');
    const dropdownNome = document.getElementById('accountDropdownNome');
    const dropdownUsername = document.getElementById('accountDropdownUsername');
    if (nomeLabel) nomeLabel.textContent = usuario.nome;
    if (dropdownNome) dropdownNome.textContent = usuario.nome;
    if (dropdownUsername) dropdownUsername.textContent = '@' + usuario.username;

    btnAccount.addEventListener('click', (e) => {
        e.stopPropagation();
        const aberto = accountDropdown.classList.toggle('open');
        btnAccount.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
        if (!accountMenu.contains(e.target)) {
            accountDropdown.classList.remove('open');
            btnAccount.setAttribute('aria-expanded', 'false');
        }
    });

    const btnTogglePasswordForm = document.getElementById('btnTogglePasswordForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (btnTogglePasswordForm && changePasswordForm) {
        btnTogglePasswordForm.addEventListener('click', () => {
            const visivel = changePasswordForm.style.display !== 'none';
            changePasswordForm.style.display = visivel ? 'none' : 'flex';
        });

        changePasswordForm.addEventListener('submit', alterarSenha);
    }

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.replace('../Login/login.html');
        });
    }
}

async function alterarSenha(e) {
    e.preventDefault();

    const senhaAtual = document.getElementById('inputSenhaAtual').value;
    const novaSenha = document.getElementById('inputNovaSenha').value;
    const confirmaSenha = document.getElementById('inputConfirmaSenha').value;
    const feedback = document.getElementById('passwordFeedback');

    feedback.className = 'account-feedback';
    feedback.style.display = 'none';

    if (novaSenha !== confirmaSenha) {
        feedback.textContent = 'A confirmação não corresponde à nova senha.';
        feedback.classList.add('feedback-erro');
        feedback.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/auth/senha', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senhaAtual, novaSenha })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Não foi possível alterar a senha.');

        feedback.textContent = 'Senha alterada com sucesso!';
        feedback.classList.add('feedback-sucesso');
        feedback.style.display = 'block';
        e.target.reset();
    } catch (err) {
        feedback.textContent = err.message;
        feedback.classList.add('feedback-erro');
        feedback.style.display = 'block';
    }
}
