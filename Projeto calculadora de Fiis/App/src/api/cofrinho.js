import { apiFetch } from './client';

export function listarCofrinhos() {
  return apiFetch('/api/cofrinhos');
}

export function criarCofrinho(dados) {
  return apiFetch('/api/cofrinhos', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarCofrinho(id, dados) {
  return apiFetch(`/api/cofrinhos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirCofrinho(id) {
  return apiFetch(`/api/cofrinhos/${id}`, { method: 'DELETE' });
}
