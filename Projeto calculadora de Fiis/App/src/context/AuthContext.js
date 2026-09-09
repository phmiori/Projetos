import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authApi from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const verificarSessao = useCallback(async () => {
    try {
      const dados = await authApi.buscarUsuarioLogado();
      setUsuario(dados);
    } catch {
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    verificarSessao();
  }, [verificarSessao]);

  async function entrar(username, senha) {
    const resposta = await authApi.login(username, senha);
    setUsuario(resposta.usuario);
  }

  async function sair() {
    try {
      await authApi.logout();
    } finally {
      setUsuario(null);
    }
  }

  async function atualizarPerfil(dados) {
    const atualizado = await authApi.atualizarPerfil(dados);
    setUsuario((atual) => ({ ...atual, ...atualizado }));
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair, atualizarPerfil }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
