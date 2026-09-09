import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { colors } from '../theme/colors';
import { buscarResumoFinancas } from '../api/financas';
import { formatarMoeda, formatarData } from '../utils/formatadores';
import ContasTab from './financas/ContasTab';
import CategoriasTab from './financas/CategoriasTab';
import TransacoesTab from './financas/TransacoesTab';

const ABAS = ['Visão Geral', 'Transações', 'Contas', 'Categorias'];

function Kpi({ titulo, valor, cor }) {
  return (
    <View style={estilos.kpiCard}>
      <Text style={estilos.kpiTitulo}>{titulo}</Text>
      <Text style={[estilos.kpiValor, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  );
}

function VisaoGeralTab() {
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      setResumo(await buscarResumoFinancas());
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar o resumo financeiro.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando) {
    return <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />;
  }

  const faturasAbertas = (resumo?.faturasAbertas || []).filter((c) => c.fatura);

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} tintColor={colors.accent} />}>
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      {resumo && (
        <>
          <View style={estilos.kpiGrid}>
            <Kpi titulo="Saldo Total" valor={formatarMoeda(resumo.saldoTotal)} />
            <Kpi titulo="Receita do Mês" valor={formatarMoeda(resumo.receitaMes)} cor={colors.income} />
            <Kpi titulo="Despesa do Mês" valor={formatarMoeda(resumo.despesaMes)} cor={colors.expense} />
          </View>

          <Text style={estilos.secaoTitulo}>Faturas em Aberto</Text>
          {faturasAbertas.length === 0 ? (
            <Text style={estilos.vazio}>Nenhuma fatura em aberto.</Text>
          ) : (
            faturasAbertas.map((c) => (
              <View key={c.cartaoId} style={estilos.card}>
                <Text style={estilos.cardTitulo}>{c.nome}</Text>
                <Text style={estilos.cardLinha}>Vence em {formatarData(c.fatura.dataVencimento)}</Text>
                <Text style={estilos.cardValor}>{formatarMoeda(c.fatura.valorTotal)}</Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

export default function FinancasScreen() {
  const [aba, setAba] = useState('Visão Geral');

  return (
    <SafeAreaView style={estilos.container}>
      <Text style={estilos.titulo}>Finanças</Text>

      <View style={estilos.abas}>
        {ABAS.map((nome) => (
          <TouchableOpacity key={nome} style={[estilos.aba, aba === nome && estilos.abaAtiva]} onPress={() => setAba(nome)}>
            <Text style={[estilos.abaTexto, aba === nome && estilos.abaTextoAtivo]}>{nome}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {aba === 'Visão Geral' && <VisaoGeralTab />}
        {aba === 'Transações' && <TransacoesTab />}
        {aba === 'Contas' && <ContasTab />}
        {aba === 'Categorias' && <CategoriasTab />}
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain, paddingHorizontal: 16, paddingTop: 16 },
  titulo: { color: colors.textMain, fontSize: 22, fontWeight: '800', marginBottom: 12 },
  abas: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  aba: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderColor: colors.border, borderWidth: 1 },
  abaAtiva: { backgroundColor: colors.accent, borderColor: colors.accent },
  abaTexto: { color: colors.textSub, fontSize: 12, fontWeight: '600' },
  abaTextoAtivo: { color: colors.accentText },
  erro: { color: colors.expense, marginBottom: 12 },
  vazio: { color: colors.textSub },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: {
    flexGrow: 1,
    minWidth: '30%',
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12
  },
  kpiTitulo: { color: colors.textSub, fontSize: 11, marginBottom: 4 },
  kpiValor: { color: colors.textMain, fontWeight: '800', fontSize: 15 },
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
  cardLinha: { color: colors.textSub, fontSize: 13, marginBottom: 4 },
  cardValor: { color: colors.textMain, fontWeight: '700', fontSize: 15 }
});
