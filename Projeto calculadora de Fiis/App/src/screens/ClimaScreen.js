import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { buscarClimaFavorito } from '../api/clima';

export default function ClimaScreen() {
  const [clima, setClima] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const dados = await buscarClimaFavorito();
      setClima(dados);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar o clima.');
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

  return (
    <SafeAreaView style={estilos.container}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} tintColor={colors.accent} />}
      >
        <Text style={estilos.titulo}>Clima</Text>
        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

        {clima ? (
          <View style={estilos.card}>
            <Text style={estilos.local}>{clima.nome}{clima.estado ? `, ${clima.estado}` : ''}</Text>
            <Text style={estilos.temperatura}>{Math.round(clima.current?.temperature_2m)}°</Text>
          </View>
        ) : (
          <Text style={estilos.vazio}>
            Nenhum local favorito configurado ainda. Escolha um "favorito do cabeçalho" no
            módulo Clima do site.
          </Text>
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
  vazio: { color: colors.textSub },
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center'
  },
  local: { color: colors.textSub, fontSize: 15, marginBottom: 8 },
  temperatura: { color: colors.accent, fontSize: 48, fontWeight: '800' }
});
