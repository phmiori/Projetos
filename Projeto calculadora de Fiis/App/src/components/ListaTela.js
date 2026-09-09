import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, Text, FlatList, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * src/components/ListaTela.js
 * Casca comum pras telas de lista (busca a API, mostra loading/erro/vazio, pull-to-refresh),
 * pra cada módulo (Cripto, Cofrinho, Garagem, etc.) não repetir esse código.
 */
export default function ListaTela({ titulo, buscar, keyExtractor, renderItem, vazio, cabecalho }) {
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const resultado = await buscar();
      setDados(Array.isArray(resultado) ? resultado : []);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar os dados.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [buscar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function aoAtualizar() {
    setAtualizando(true);
    carregar();
  }

  if (carregando) {
    return (
      <SafeAreaView style={[estilos.container, estilos.centralizado]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.container}>
      <Text style={estilos.titulo}>{titulo}</Text>
      {cabecalho}
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      <FlatList
        data={dados}
        keyExtractor={keyExtractor}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={aoAtualizar} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={estilos.vazio}>{vazio || 'Nada por aqui ainda.'}</Text>}
        renderItem={renderItem}
        contentContainerStyle={dados.length === 0 ? estilos.vazioContainer : undefined}
      />
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
