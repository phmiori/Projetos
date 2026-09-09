import { apiFetch } from './client';

export function listarBlocosTreino() {
  return apiFetch('/api/treinos/blocos');
}

export function listarRegistrosSaude() {
  return apiFetch('/api/saude/registros');
}
