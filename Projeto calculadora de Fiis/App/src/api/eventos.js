import { apiFetch } from './client';

export function listarEventos() {
  return apiFetch('/api/eventos');
}
