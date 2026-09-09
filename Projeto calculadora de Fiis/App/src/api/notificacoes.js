import { apiFetch } from './client';

export function listarNotificacoes() {
  return apiFetch('/api/notificacoes');
}
