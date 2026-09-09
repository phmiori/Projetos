import { apiFetch } from './client';

export function listarCarrosLeilao() {
  return apiFetch('/api/veiculos');
}

export function criarCarroLeilao(dados) {
  return apiFetch('/api/veiculos', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarCarroLeilao(id, dados) {
  return apiFetch(`/api/veiculos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirCarroLeilao(id) {
  return apiFetch(`/api/veiculos/${id}`, { method: 'DELETE' });
}

export function listarGastosCarro(veiculoId) {
  return apiFetch(`/api/veiculos/${veiculoId}/gastos`);
}

export function criarGastoCarro(veiculoId, dados) {
  return apiFetch(`/api/veiculos/${veiculoId}/gastos`, { method: 'POST', body: JSON.stringify(dados) });
}

export function excluirGastoCarro(veiculoId, gastoId) {
  return apiFetch(`/api/veiculos/${veiculoId}/gastos/${gastoId}`, { method: 'DELETE' });
}

export function listarGastosCasa(imovelId) {
  return apiFetch(`/api/imoveis/${imovelId}/gastos`);
}

export function criarGastoCasa(imovelId, dados) {
  return apiFetch(`/api/imoveis/${imovelId}/gastos`, { method: 'POST', body: JSON.stringify(dados) });
}

export function excluirGastoCasa(imovelId, gastoId) {
  return apiFetch(`/api/imoveis/${imovelId}/gastos/${gastoId}`, { method: 'DELETE' });
}

export function listarCasasLeilao() {
  return apiFetch('/api/imoveis');
}

export function criarCasaLeilao(dados) {
  return apiFetch('/api/imoveis', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarCasaLeilao(id, dados) {
  return apiFetch(`/api/imoveis/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirCasaLeilao(id) {
  return apiFetch(`/api/imoveis/${id}`, { method: 'DELETE' });
}
