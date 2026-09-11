import { apiFetch } from './client';

export function listarCarteiraFii() {
  return apiFetch('/api/fii');
}

export function criarFii(dados) {
  return apiFetch('/api/fii', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarFii(id, dados) {
  return apiFetch(`/api/fii/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirFii(id) {
  return apiFetch(`/api/fii/${id}`, { method: 'DELETE' });
}

export function atualizarCotacoesFii() {
  return apiFetch('/api/fii/atualizar-precos', { method: 'POST' });
}

export function listarWatchlistFii() {
  return apiFetch('/api/fii/watchlist');
}

export function criarWatchlistFii(dados) {
  return apiFetch('/api/fii/watchlist', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarWatchlistFii(id, dados) {
  return apiFetch(`/api/fii/watchlist/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirWatchlistFii(id) {
  return apiFetch(`/api/fii/watchlist/${id}`, { method: 'DELETE' });
}
