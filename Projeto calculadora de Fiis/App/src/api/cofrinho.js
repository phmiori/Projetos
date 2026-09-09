import { apiFetch } from './client';

export function listarCofrinhos() {
  return apiFetch('/api/cofrinhos');
}
