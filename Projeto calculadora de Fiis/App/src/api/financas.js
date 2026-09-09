import { apiFetch } from './client';

export function buscarResumoFinancas() {
  return apiFetch('/api/financas/resumo');
}
