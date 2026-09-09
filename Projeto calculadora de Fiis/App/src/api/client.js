import Constants from 'expo-constants';

/**
 * src/api/client.js
 * Cliente HTTP compartilhado, falando com o MESMO backend/banco do site (server.js + Neon) —
 * o app não acessa o banco diretamente, só a API REST que já existe em routes/*.js.
 *
 * A sessão de login usa cookie (express-session, igual ao site), e o fetch nativo do React
 * Native mantém esse cookie sozinho entre chamadas (armazenamento nativo de cookies do
 * Android/iOS), sem precisar de configuração extra.
 *
 * URL do backend configurada em app.json (expo.extra.apiUrl) — por padrão já aponta para a
 * produção no Render, então "compartilha o mesmo banco" desde o primeiro uso.
 */
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://projetos-mnw4.onrender.com';

export class ApiError extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

export async function apiFetch(caminho, opcoes = {}) {
  const resp = await fetch(`${API_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(opcoes.headers || {})
    }
  });

  const corpo = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new ApiError(corpo.error || 'Erro ao falar com o servidor.', resp.status);
  }

  return corpo;
}

export { API_URL };
