import { apiFetch } from './client';

export function listarCarteiraCripto() {
  return apiFetch('/api/cripto');
}

export function criarCripto(dados) {
  return apiFetch('/api/cripto', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarCripto(id, dados) {
  return apiFetch(`/api/cripto/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirCripto(id) {
  return apiFetch(`/api/cripto/${id}`, { method: 'DELETE' });
}
