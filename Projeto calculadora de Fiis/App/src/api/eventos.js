import { apiFetch } from './client';

export function listarEventos() {
  return apiFetch('/api/eventos');
}

export function criarEvento(dados) {
  return apiFetch('/api/eventos', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarEvento(id, dados) {
  return apiFetch(`/api/eventos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirEvento(id) {
  return apiFetch(`/api/eventos/${id}`, { method: 'DELETE' });
}
