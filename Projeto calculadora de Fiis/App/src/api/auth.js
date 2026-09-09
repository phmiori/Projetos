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
