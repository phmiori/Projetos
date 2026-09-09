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

export function listarModulosOcultos() {
  return apiFetch('/api/auth/modulos-ocultos');
}

export function ocultarModulo(modulo) {
  return apiFetch(`/api/auth/modulos-ocultos/${modulo}`, { method: 'POST' });
}

export function reexibirModulo(modulo) {
  return apiFetch(`/api/auth/modulos-ocultos/${modulo}`, { method: 'DELETE' });
}

export function listarUsuarios() {
  return apiFetch('/api/auth/usuarios');
}

export function criarUsuario(dados) {
  return apiFetch('/api/auth/usuarios', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarUsuario(id, dados) {
  return apiFetch(`/api/auth/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function redefinirSenhaUsuario(id, novaSenha) {
  return apiFetch(`/api/auth/usuarios/${id}/senha`, { method: 'PUT', body: JSON.stringify({ novaSenha }) });
}

export function excluirUsuario(id) {
  return apiFetch(`/api/auth/usuarios/${id}`, { method: 'DELETE' });
}
