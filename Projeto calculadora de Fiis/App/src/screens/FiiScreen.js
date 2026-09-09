import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, SafeAreaView } from 'react-native';
import { colors } from '../theme/colors';
import { listarCarteiraFii } from '../api/fii';

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function FiiScreen() {
  const [fundos, setFundos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const dados = await listarCarteiraFii();
      setFundos(dados);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar a carteira.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

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
      <Text style={estilos.titulo}>Fundos Imobiliários</Text>

      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

      <FlatList
        data={fundos}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={aoAtualizar} tintColor={colors.accent} />}
        ListEmptyComponent={<Text style={estilos.vazio}>Nenhum FII cadastrado ainda.</Text>}
        renderItem={({ item }) => {
          const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
          const totalInvestido = item.cotas * (precoRef || 0);
          return (
            <View style={estilos.card}>
              <View style={estilos.cardHeader}>
                <Text style={estilos.ticker}>{item.ticker}</Text>
                <Text style={estilos.segmento}>{item.segmento}</Text>
              </View>
              <Text style={estilos.linha}>{item.cotas} cotas · preço médio {formatarMoeda(item.precoMedio)}</Text>
              <Text style={estilos.total}>{formatarMoeda(totalInvestido)}</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgMain,
    padding: 16
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
    textAlign: 'center',
    marginTop: 40
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  ticker: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 16
  },
  segmento: {
    color: colors.textSub,
    fontSize: 12
  },
  linha: {
    color: colors.textSub,
    fontSize: 13,
    marginBottom: 4
  },
  total: {
    color: colors.textMain,
    fontWeight: '700',
    fontSize: 15
  }
});
