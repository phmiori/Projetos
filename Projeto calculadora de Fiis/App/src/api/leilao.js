import { apiFetch } from './client';

export function listarCarrosLeilao() {
  return apiFetch('/api/veiculos');
}

export function listarCasasLeilao() {
  return apiFetch('/api/imoveis');
}
