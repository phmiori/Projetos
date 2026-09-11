import { apiFetch } from './client';

export function listarNotificacoes() {
  return apiFetch('/api/notificacoes');
}

export function registrarTokenPushExpo(token) {
  return apiFetch('/api/notificacoes/push-expo/inscrever', { method: 'POST', body: JSON.stringify({ token }) });
}

export function removerTokenPushExpo(token) {
  return apiFetch('/api/notificacoes/push-expo/inscrever', { method: 'DELETE', body: JSON.stringify({ token }) });
}
