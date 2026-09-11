import { apiFetch } from './client';

export function buscarHistoricoAssistente() {
  return apiFetch('/api/assistente/historico');
}

export function enviarMensagemAssistente(mensagem) {
  return apiFetch('/api/assistente/chat', { method: 'POST', body: JSON.stringify({ mensagem }) });
}

export function limparHistoricoAssistente() {
  return apiFetch('/api/assistente/historico', { method: 'DELETE' });
}
