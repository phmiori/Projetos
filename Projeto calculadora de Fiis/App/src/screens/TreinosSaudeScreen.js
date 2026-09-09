import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { colors } from '../theme/colors';
import { listarBlocosTreino, listarRegistrosSaude } from '../api/treinosSaude';
import { formatarData } from '../utils/formatadores';

export default function TreinosSaudeScreen() {
  const [blocos, setBlocos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const [bl, reg] = await Promise.all([listarBlocosTreino(), listarRegistrosSaude()]);
      setBlocos(bl);
      setRegistros(reg);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar treinos & saúde.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando) {
    return (
      <SafeAreaView style={[estilos.container, estilos.centralizado]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  const ultimoRegistro = registros[0];

  return (
    <SafeAreaView style={estilos.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} tintColor={colors.accent} />}>
        <Text style={estilos.titulo}>Treinos & Saúde</Text>
        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

        <Text style={estilos.secaoTitulo}>Blocos de Treino</Text>
        {blocos.length === 0 ? (
          <Text style={estilos.vazio}>Nenhum bloco cadastrado ainda.</Text>
        ) : (
          blocos.map((b) => (
            <View key={b.id} style={estilos.card}>
              <Text style={estilos.cardTitulo}>{b.nome}</Text>
              <Text style={estilos.cardLinha}>
                {b.diaSemana || 'Sem dia definido'} · {b.exercicios.length} exercício{b.exercicios.length === 1 ? '' : 's'}
              </Text>
            </View>
          ))
        )}

        <Text style={[estilos.secaoTitulo, { marginTop: 20 }]}>Último Registro de Saúde</Text>
        {!ultimoRegistro ? (
          <Text style={estilos.vazio}>Nenhum registro cadastrado ainda.</Text>
        ) : (
          <View style={estilos.card}>
            <Text style={estilos.cardLinha}>{formatarData(ultimoRegistro.data)}</Text>
            {ultimoRegistro.peso != null && <Text style={estilos.cardLinha}>Peso: {ultimoRegistro.peso} kg</Text>}
            {ultimoRegistro.aguaMl != null && <Text style={estilos.cardLinha}>Água: {ultimoRegistro.aguaMl} ml</Text>}
            {ultimoRegistro.sonoHoras != null && <Text style={estilos.cardLinha}>Sono: {ultimoRegistro.sonoHoras}h</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain, paddingHorizontal: 16, paddingTop: 16 },
  centralizado: { justifyContent: 'center' },
  titulo: { color: colors.textMain, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  erro: { color: colors.expense, marginBottom: 12 },
  vazio: { color: colors.textSub, marginBottom: 10 },
  secaoTitulo: { color: colors.textMain, fontWeight: '700', fontSize: 16, marginBottom: 10 },
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10
  },
  cardTitulo: { color: colors.accent, fontWeight: '800', fontSize: 15, marginBottom: 4 },
  cardLinha: { color: colors.textSub, fontSize: 13, marginBottom: 2 }
});
