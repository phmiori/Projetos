import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { listarCarteiraFii } from '../api/fii';
import { listarCarteiraCripto } from '../api/cripto';
import { listarCofrinhos } from '../api/cofrinho';
import { listarCasasLeilao } from '../api/leilao';
import { buscarDashboardCarros } from '../api/dashboard';
import { buscarResumoFinancas } from '../api/financas';
import { formatarMoeda } from '../utils/formatadores';
import { calcularRendimentoBrutoCofrinho } from '../utils/cofrinhoCalc';

function Kpi({ titulo, valor, tag, cor }) {
  return (
    <View style={estilos.kpiCard}>
      <Text style={estilos.kpiTitulo}>{titulo}</Text>
      <Text style={[estilos.kpiValor, cor ? { color: cor } : null]}>{valor}</Text>
      {tag ? <Text style={estilos.kpiTag}>{tag}</Text> : null}
    </View>
  );
}

function LinhaModulo({ nome, valor, contagem }) {
  return (
    <View style={estilos.linhaModulo}>
      <Text style={estilos.linhaModuloNome}>{nome}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={estilos.linhaModuloValor}>{valor}</Text>
        <Text style={estilos.linhaModuloContagem}>{contagem}</Text>
      </View>
    </View>
  );
}

// Mesmas cores por módulo do site (ver JS/Index/index.js, CORES_MODULOS_HUB)
const CORES_MODULOS = { fii: '#EEBB00', cripto: '#3B82F6', leilao: '#F97316', casasleilao: '#8B5CF6', cofrinho: '#EC4899' };

/**
 * Gráfico de barras horizontais simples (sem depender de nenhuma lib de gráfico) — mesma
 * informação dos gráficos Chart.js do site (Alocação e Resultado por Módulo), só que em barras.
 */
function GraficoBarras({ titulo, itens, permiteNegativo }) {
  const maiorValor = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  const temDados = itens.some((i) => i.valor !== 0);

  return (
    <View style={[estilos.card, { paddingBottom: 12 }]}>
      <Text style={[estilos.secaoTitulo, { marginTop: 12 }]}>{titulo}</Text>
      {!temDados ? (
        <Text style={[estilos.linhaModuloContagem, { paddingVertical: 14 }]}>Sem dados ainda.</Text>
      ) : (
        itens.map((item) => {
          const negativo = permiteNegativo && item.valor < 0;
          const largura = `${Math.min(100, (Math.abs(item.valor) / maiorValor) * 100)}%`;
          return (
            <View key={item.nome} style={estilos.barraLinha2}>
              <View style={estilos.barraCabecalho}>
                <Text style={estilos.barraNome}>{item.nome}</Text>
                <Text style={[estilos.barraValor, negativo && { color: colors.expense }]}>{formatarMoeda(item.valor)}</Text>
              </View>
              <View style={estilos.barraFundo}>
                <View style={[estilos.barraPreenchida, { width: largura, backgroundColor: negativo ? colors.expense : item.cor }]} />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

export default function DashboardScreen() {
  const { usuario } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [modulos, setModulos] = useState(null);
  const [graficos, setGraficos] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const [fundos, moedas, cofrinhos, imoveis, dashboardCarros, financas] = await Promise.all([
        listarCarteiraFii(),
        listarCarteiraCripto(),
        listarCofrinhos(),
        listarCasasLeilao(),
        buscarDashboardCarros().catch(() => ({ kpis: {} })),
        buscarResumoFinancas().catch(() => null)
      ]);

      let fiiPatrimonio = 0, fiiInvestido = 0, fiiRendaMensal = 0;
      fundos.forEach((item) => {
        const cotas = item.cotas || 0;
        const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
        fiiPatrimonio += cotas * (precoRef || 0);
        fiiInvestido += cotas * (item.precoMedio || 0);
        fiiRendaMensal += cotas * (item.ultimoDividendo || 0);
      });

      let criptoPatrimonio = 0, criptoInvestido = 0;
      moedas.forEach((m) => {
        const precoRef = m.precoAtual != null ? m.precoAtual : m.precoMedio;
        criptoInvestido += (m.quantidade || 0) * (m.precoMedio || 0);
        criptoPatrimonio += (m.quantidade || 0) * (precoRef || 0);
      });
      const criptoValorizacaoRS = criptoPatrimonio - criptoInvestido;

      let cofrinhoInvestido = 0, cofrinhoRendimento = 0;
      cofrinhos.forEach((item) => {
        cofrinhoInvestido += Number(item.valorInvestido) || 0;
        cofrinhoRendimento += calcularRendimentoBrutoCofrinho(item);
      });

      let casasCapital = 0, casasLucro = 0, casasCustoTotal = 0, casasEmEstoque = 0, casasVendidos = 0;
      imoveis.forEach((im) => {
        casasCustoTotal += Number(im.custoTotal || 0);
        if (im.status === 'Vendido') {
          casasVendidos++;
          if (im.lucroBruto != null) casasLucro += Number(im.lucroBruto);
        } else {
          casasEmEstoque++;
          casasCapital += Number(im.custoTotal || 0);
        }
      });

      const kpisCarros = dashboardCarros.kpis || {};
      const leilaoCapital = Number(kpisCarros.capitalInvestidoParado || 0);
      const leilaoLucro = Number(kpisCarros.lucroTotalAcumulado || 0);
      const leilaoEmEstoque = Number(kpisCarros.totalEstoque || 0);
      const leilaoVendidos = Number(kpisCarros.totalVendidos || 0);

      const capitalAlocado = fiiPatrimonio + criptoPatrimonio + cofrinhoInvestido + casasCapital + leilaoCapital;
      const ativosEmAndamento = fundos.length + moedas.length + cofrinhos.length + casasEmEstoque + leilaoEmEstoque;
      const lucroLiquido = casasLucro + leilaoLucro + cofrinhoRendimento;
      const operacoesFinalizadas = casasVendidos + leilaoVendidos;
      const ganhoParaRoi = (fiiPatrimonio - fiiInvestido) + criptoValorizacaoRS + cofrinhoRendimento + casasLucro + leilaoLucro;
      const capitalBaseRoi = fiiInvestido + criptoInvestido + cofrinhoInvestido + casasCustoTotal + leilaoCapital;
      const roiGlobal = capitalBaseRoi > 0 ? (ganhoParaRoi / capitalBaseRoi) * 100 : 0;

      const saldoContas = financas ? Number(financas.saldoTotal) || 0 : 0;
      const faturasEmAberto = financas
        ? (financas.faturasAbertas || []).reduce((s, c) => s + (c.fatura ? Number(c.fatura.valorTotal) || 0 : 0), 0)
        : 0;
      const patrimonioLiquido = capitalAlocado + saldoContas - faturasEmAberto;

      setKpis({ capitalAlocado, ativosEmAndamento, lucroLiquido, operacoesFinalizadas, roiGlobal, patrimonioLiquido });
      setModulos({
        fii: { valor: formatarMoeda(fiiPatrimonio), contagem: `${fundos.length} fundo(s) · renda ${formatarMoeda(fiiRendaMensal)}/mês` },
        cripto: { valor: formatarMoeda(criptoPatrimonio), contagem: `${moedas.length} moeda(s)` },
        cofrinho: { valor: formatarMoeda(cofrinhoInvestido), contagem: `${cofrinhos.length} cofrinho(s)` },
        casas: { valor: formatarMoeda(casasCapital), contagem: `${casasEmEstoque} em estoque · ${casasVendidos} vendido(s)` },
        carros: { valor: formatarMoeda(leilaoCapital), contagem: `${leilaoEmEstoque} em estoque · ${leilaoVendidos} vendido(s)` }
      });
      setGraficos({
        alocacao: [
          { nome: 'FIIs', valor: fiiPatrimonio, cor: CORES_MODULOS.fii },
          { nome: 'Cripto', valor: criptoPatrimonio, cor: CORES_MODULOS.cripto },
          { nome: 'Cofrinho', valor: cofrinhoInvestido, cor: CORES_MODULOS.cofrinho },
          { nome: 'Casas de Leilão', valor: casasCapital, cor: CORES_MODULOS.casasleilao },
          { nome: 'Carros de Leilão', valor: leilaoCapital, cor: CORES_MODULOS.leilao }
        ],
        resultado: [
          { nome: 'FIIs (renda/mês)', valor: fiiRendaMensal, cor: CORES_MODULOS.fii },
          { nome: 'Cripto (valorização)', valor: criptoValorizacaoRS, cor: CORES_MODULOS.cripto },
          { nome: 'Cofrinho (rendimento)', valor: cofrinhoRendimento, cor: CORES_MODULOS.cofrinho },
          { nome: 'Casas de Leilão (lucro)', valor: casasLucro, cor: CORES_MODULOS.casasleilao },
          { nome: 'Carros de Leilão (lucro)', valor: leilaoLucro, cor: CORES_MODULOS.leilao }
        ]
      });
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar a visão geral.');
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
      <ScrollView refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} tintColor={colors.accent} />}>
        <Text style={estilos.saudacao}>Olá, {usuario?.nome}</Text>
        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

        {kpis && (
          <>
            <View style={estilos.kpiGrid}>
              <Kpi titulo="Patrimônio Líquido Total" valor={formatarMoeda(kpis.patrimonioLiquido)} />
              <Kpi titulo="Capital Alocado em Operações" valor={formatarMoeda(kpis.capitalAlocado)} tag={`${kpis.ativosEmAndamento} ativo(s) em andamento`} />
              <Kpi titulo="Lucro Líquido Realizado (Global)" valor={formatarMoeda(kpis.lucroLiquido)} cor={colors.income} tag={`${kpis.operacoesFinalizadas} operação(ões) finalizada(s)`} />
              <Kpi titulo="Rentabilidade Média (ROI)" valor={`${kpis.roiGlobal.toFixed(1)}%`} cor={colors.accent} />
            </View>

            <Text style={estilos.secaoTitulo}>Hub Financeiro</Text>
            <View style={estilos.card}>
              <LinhaModulo nome="Fundos Imobiliários" valor={modulos.fii.valor} contagem={modulos.fii.contagem} />
              <LinhaModulo nome="Cripto Moedas" valor={modulos.cripto.valor} contagem={modulos.cripto.contagem} />
              <LinhaModulo nome="Cofrinho" valor={modulos.cofrinho.valor} contagem={modulos.cofrinho.contagem} />
              <LinhaModulo nome="Casas de Leilão" valor={modulos.casas.valor} contagem={modulos.casas.contagem} />
              <LinhaModulo nome="Carros de Leilão" valor={modulos.carros.valor} contagem={modulos.carros.contagem} />
            </View>

            {graficos && (
              <>
                <GraficoBarras titulo="Alocação por Módulo" itens={graficos.alocacao} />
                <GraficoBarras titulo="Resultado por Módulo" itens={graficos.resultado} permiteNegativo />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain, paddingHorizontal: 16, paddingTop: 16 },
  centralizado: { justifyContent: 'center' },
  saudacao: { color: colors.textMain, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  erro: { color: colors.expense, marginBottom: 12 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard: {
    flexGrow: 1,
    minWidth: '46%',
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12
  },
  kpiTitulo: { color: colors.textSub, fontSize: 11, marginBottom: 4 },
  kpiValor: { color: colors.textMain, fontWeight: '800', fontSize: 16 },
  kpiTag: { color: colors.textSub, fontSize: 10, marginTop: 4 },
  secaoTitulo: { color: colors.textMain, fontWeight: '700', fontSize: 16, marginBottom: 10 },
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 20
  },
  linhaModulo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  linhaModuloNome: { color: colors.textMain, fontSize: 14, fontWeight: '600', flex: 1 },
  linhaModuloValor: { color: colors.textMain, fontSize: 14, fontWeight: '700' },
  linhaModuloContagem: { color: colors.textSub, fontSize: 11, marginTop: 2 },
  barraLinha2: { paddingVertical: 8 },
  barraCabecalho: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barraNome: { color: colors.textSub, fontSize: 12 },
  barraValor: { color: colors.textMain, fontSize: 12, fontWeight: '700' },
  barraFundo: { height: 8, backgroundColor: colors.bgMain, borderRadius: 4, overflow: 'hidden' },
  barraPreenchida: { height: 8, borderRadius: 4 }
});
