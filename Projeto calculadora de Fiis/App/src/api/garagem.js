import { apiFetch } from './client';

export function listarVeiculosGaragem() {
  return apiFetch('/api/garagem/veiculos');
}

export function criarVeiculoGaragem(dados) {
  return apiFetch('/api/garagem/veiculos', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarVeiculoGaragem(id, dados) {
  return apiFetch(`/api/garagem/veiculos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirVeiculoGaragem(id) {
  return apiFetch(`/api/garagem/veiculos/${id}`, { method: 'DELETE' });
}

export function criarManutencao(veiculoId, dados) {
  return apiFetch(`/api/garagem/veiculos/${veiculoId}/manutencoes`, { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarManutencao(id, dados) {
  return apiFetch(`/api/garagem/manutencoes/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirManutencao(id) {
  return apiFetch(`/api/garagem/manutencoes/${id}`, { method: 'DELETE' });
}
