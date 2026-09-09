import { apiFetch } from './client';

export function buscarResumoFinancas() {
  return apiFetch('/api/financas/resumo');
}

export function listarContas() {
  return apiFetch('/api/financas/contas');
}

export function criarConta(dados) {
  return apiFetch('/api/financas/contas', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarConta(id, dados) {
  return apiFetch(`/api/financas/contas/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirConta(id) {
  return apiFetch(`/api/financas/contas/${id}`, { method: 'DELETE' });
}

export function listarCategorias() {
  return apiFetch('/api/financas/categorias');
}

export function criarCategoria(dados) {
  return apiFetch('/api/financas/categorias', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarCategoria(id, dados) {
  return apiFetch(`/api/financas/categorias/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirCategoria(id) {
  return apiFetch(`/api/financas/categorias/${id}`, { method: 'DELETE' });
}

export function listarTransacoes() {
  return apiFetch('/api/financas/transacoes');
}

export function criarTransacao(dados) {
  return apiFetch('/api/financas/transacoes', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarTransacao(id, dados) {
  return apiFetch(`/api/financas/transacoes/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirTransacao(id) {
  return apiFetch(`/api/financas/transacoes/${id}`, { method: 'DELETE' });
}
