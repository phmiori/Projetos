import React from 'react';
import { SafeAreaView, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { useLista } from '../hooks/useLista';

/**
 * src/components/ListaTela.js
 * Casca comum pras telas de lista (busca a API, mostra loading/erro/vazio, pull-to-refresh),
 * pra cada módulo (Cripto, Cofrinho, Garagem, etc.) não repetir esse código.
 */
export default function ListaTela({ titulo, buscar, keyExtractor, renderItem, vazio, cabecalho, fab }) {
  const { dados, carregando, atualizando, erro, aoAtualizar } = useLista(buscar);

  if (carregando) {
    return (
      <SafeAreaView style={[estilos.container, estilos.centralizado]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.container}>
      {titulo ? <Text style={estilos.titulo}>{titulo}</Text> : null}
      {cabecalho}
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      <FlatList
        data={dados}
        keyExtractor={keyExtractor}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={aoAtualizar} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={estilos.vazio}>{vazio || 'Nada por aqui ainda.'}</Text>}
        renderItem={renderItem}
        contentContainerStyle={dados.length === 0 ? estilos.vazioContainer : { paddingBottom: 90 }}
      />
      {fab}
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  centralizado: {
    justifyContent: 'center'
  },
  titulo: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16
  },
  erro: {
    color: colors.expense,
    marginBottom: 12
  },
  vazio: {
    color: colors.textSub,
    textAlign: 'center'
  },
  vazioContainer: {
    flexGrow: 1,
    justifyContent: 'center'
  }
});
