import { apiFetch } from './client';

export function listarCarteiraCripto() {
  return apiFetch('/api/cripto');
}
