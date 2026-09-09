import { apiFetch } from './client';

export function listarCarteiraFii() {
  return apiFetch('/api/fii');
}
