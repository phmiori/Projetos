import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { entrar } = useAuth();
  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleEntrar() {
    if (!username || !senha) return;
    setErro('');
    setEnviando(true);
    try {
      await entrar(username, senha);
    } catch (err) {
      setErro(err.message || 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={estilos.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={estilos.titulo}>FinanceHub</Text>
      <Text style={estilos.subtitulo}>Entre com seu usuário e senha</Text>

      <TextInput
        style={estilos.input}
        placeholder="Usuário"
        placeholderTextColor={colors.textSub}
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={estilos.input}
        placeholder="Senha"
        placeholderTextColor={colors.textSub}
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
      />

      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

      <TouchableOpacity style={estilos.botao} onPress={handleEntrar} disabled={enviando}>
        {enviando ? <ActivityIndicator color={colors.accentText} /> : <Text style={estilos.botaoTexto}>Entrar</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
    justifyContent: 'center',
    padding: 24
  },
  titulo: {
    color: colors.accent,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4
  },
  subtitulo: {
    color: colors.textSub,
    textAlign: 'center',
    marginBottom: 32
  },
  input: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    color: colors.textMain,
    marginBottom: 14
  },
  erro: {
    color: colors.expense,
    marginBottom: 14,
    textAlign: 'center'
  },
  botao: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8
  },
  botaoTexto: {
    color: colors.accentText,
    fontWeight: '700',
    fontSize: 16
  }
});
