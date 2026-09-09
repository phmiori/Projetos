import { apiFetch } from './client';

export function buscarDashboardCarros() {
  return apiFetch('/api/dashboard');
}
