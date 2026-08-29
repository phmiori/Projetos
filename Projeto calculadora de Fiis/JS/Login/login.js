// JS/Login/login.js
// Lógica da tela de login: autenticação via sessão no backend

document.addEventListener('DOMContentLoaded', () => {
    verificarSessaoExistente();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', realizarLogin);
    }
});

async function verificarSessaoExistente() {
    try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
            window.location.replace('../Index/index.html');
        }
    } catch (err) {
        // API indisponível: permanece na tela de login
    }
}

async function realizarLogin(e) {
    e.preventDefault();

    const username = document.getElementById('inputUsername').value.trim();
    const senha = document.getElementById('inputSenha').value;
    const errorBox = document.getElementById('loginError');
    const submitBtn = document.getElementById('btnLoginSubmit');

    errorBox.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, senha })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Não foi possível entrar.');
        }

        window.location.replace('../Index/index.html');
    } catch (err) {
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Entrar';
    }
}
