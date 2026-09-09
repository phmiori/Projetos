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
