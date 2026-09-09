import { apiFetch } from './client';

export function listarVeiculosGaragem() {
  return apiFetch('/api/garagem/veiculos');
}
