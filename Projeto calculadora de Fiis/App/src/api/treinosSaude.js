import { apiFetch } from './client';

export function listarBlocosTreino() {
  return apiFetch('/api/treinos/blocos');
}

export function criarBlocoTreino(dados) {
  return apiFetch('/api/treinos/blocos', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarBlocoTreino(id, dados) {
  return apiFetch(`/api/treinos/blocos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirBlocoTreino(id) {
  return apiFetch(`/api/treinos/blocos/${id}`, { method: 'DELETE' });
}

export function criarExercicio(blocoId, dados) {
  return apiFetch(`/api/treinos/blocos/${blocoId}/exercicios`, { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarExercicio(id, dados) {
  return apiFetch(`/api/treinos/exercicios/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirExercicio(id) {
  return apiFetch(`/api/treinos/exercicios/${id}`, { method: 'DELETE' });
}

export function listarRegistrosSaude() {
  return apiFetch('/api/saude/registros');
}

export function criarRegistroSaude(dados) {
  return apiFetch('/api/saude/registros', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarRegistroSaude(id, dados) {
  return apiFetch(`/api/saude/registros/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirRegistroSaude(id) {
  return apiFetch(`/api/saude/registros/${id}`, { method: 'DELETE' });
}
