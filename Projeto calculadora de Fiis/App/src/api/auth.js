import { apiFetch } from './client';

export function login(username, senha) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, senha })
  });
}

export function logout() {
  return apiFetch('/api/auth/logout', { method: 'POST' });
}

export function buscarUsuarioLogado() {
  return apiFetch('/api/auth/me');
}

export function atualizarPerfil(dados) {
  return apiFetch('/api/auth/perfil', { method: 'PUT', body: JSON.stringify(dados) });
}

export function alterarSenha(senhaAtual, novaSenha) {
  return apiFetch('/api/auth/senha', { method: 'PUT', body: JSON.stringify({ senhaAtual, novaSenha }) });
}
