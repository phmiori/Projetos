import React from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

function Linha({ rotulo, valor }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor || '—'}</Text>
    </View>
  );
}

export default function ConfiguracoesScreen() {
  const { usuario, sair } = useAuth();

  return (
    <SafeAreaView style={estilos.container}>
      <Text style={estilos.titulo}>Configurações</Text>

      <View style={estilos.card}>
        <Linha rotulo="Nome" valor={usuario?.nome} />
        <Linha rotulo="Usuário" valor={`@${usuario?.username}`} />
        <Linha rotulo="E-mail" valor={usuario?.email} />
        <Linha rotulo="Cargo" valor={usuario?.role === 'admin' ? 'Administrador' : 'Usuário'} />
      </View>

      <TouchableOpacity style={estilos.botaoSair} onPress={sair}>
        <Text style={estilos.botaoSairTexto}>Sair do Sistema</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain, padding: 16 },
  titulo: { color: colors.textMain, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    marginBottom: 20
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  rotulo: { color: colors.textSub, fontSize: 14 },
  valor: { color: colors.textMain, fontSize: 14, fontWeight: '600' },
  botaoSair: {
    borderColor: colors.expense,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center'
  },
  botaoSairTexto: { color: colors.expense, fontWeight: '700' }
});
