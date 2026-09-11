import { apiFetch } from './client';

export function buscarClimaFavorito() {
  return apiFetch('/api/clima/favorito');
}
