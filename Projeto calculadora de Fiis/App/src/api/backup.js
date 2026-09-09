import { apiFetch } from './client';

export function exportarBackup() {
  return apiFetch('/api/backup/export');
}
