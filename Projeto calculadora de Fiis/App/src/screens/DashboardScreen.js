import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

export default function DashboardScreen() {
  const { usuario, sair } = useAuth();

  return (
    <SafeAreaView style={estilos.container}>
      <Text style={estilos.saudacao}>Olá, {usuario?.nome}</Text>
      <Text style={estilos.texto}>
        Este é o começo do app mobile do FinanceHub — mesma conta e mesmos dados do site,
        já que fala com a mesma API/banco. Os módulos completos (FIIs, Cripto, Finanças, etc.)
        entram aqui aos poucos.
      </Text>

      <TouchableOpacity style={estilos.botaoSair} onPress={sair}>
        <Text style={estilos.botaoSairTexto}>Sair</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
    padding: 24
  },
  saudacao: {
    color: colors.textMain,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12
  },
  texto: {
    color: colors.textSub,
    fontSize: 15,
    lineHeight: 22
  },
  botaoSair: {
    marginTop: 24,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center'
  },
  botaoSairTexto: {
    color: colors.textSub,
    fontWeight: '600'
  }
});
