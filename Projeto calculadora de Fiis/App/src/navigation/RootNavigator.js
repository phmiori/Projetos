import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FiiScreen from '../screens/FiiScreen';
import CriptoScreen from '../screens/CriptoScreen';
import LeilaoScreen from '../screens/LeilaoScreen';
import CasasLeilaoScreen from '../screens/CasasLeilaoScreen';
import CofrinhoScreen from '../screens/CofrinhoScreen';
import CalendarioScreen from '../screens/CalendarioScreen';
import ClimaScreen from '../screens/ClimaScreen';
import FinancasScreen from '../screens/FinancasScreen';
import TreinosSaudeScreen from '../screens/TreinosSaudeScreen';
import GaragemScreen from '../screens/GaragemScreen';
import NotificacoesScreen from '../screens/NotificacoesScreen';
import ConfiguracoesScreen from '../screens/ConfiguracoesScreen';
import AssistenteScreen from '../screens/AssistenteScreen';

const Drawer = createDrawerNavigator();

const temaEscuro = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bgMain,
    card: colors.bgSurface,
    border: colors.border,
    text: colors.textMain
  }
};

// Mesmo agrupamento da sidebar do site (ver HTML/*/[modulo].html): Hub Financeiro e Hub Pessoal.
// `modulo` casa com a chave usada em Configurações > Negócios do Hub Financeiro (data-modulo no site).
const HUB_FINANCEIRO = [
  { rota: 'Dashboard', label: 'Visão Geral' },
  { rota: 'FII', label: 'Fundos Imobiliários', modulo: 'fii' },
  { rota: 'Cripto', label: 'Cripto Moedas', modulo: 'cripto' },
  { rota: 'Leilao', label: 'Carros de Leilão', modulo: 'leilao' },
  { rota: 'CasasLeilao', label: 'Casas de Leilão', modulo: 'casasleilao' },
  { rota: 'Cofrinho', label: 'Cofrinho', modulo: 'cofrinho' }
];

const HUB_PESSOAL = [
  { rota: 'Calendario', label: 'Calendário' },
  { rota: 'Clima', label: 'Clima' },
  { rota: 'Financas', label: 'Finanças' },
  { rota: 'TreinosSaude', label: 'Treinos & Saúde' },
  { rota: 'Garagem', label: 'Garagem' },
  { rota: 'Notificacoes', label: 'Notificações' }
];

function ItemMenu({ label, ativo, onPress }) {
  return (
    <TouchableOpacity style={[estilos.item, ativo && estilos.itemAtivo]} onPress={onPress}>
      <Text style={[estilos.itemTexto, ativo && estilos.itemTextoAtivo]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConteudoDrawer(props) {
  const { usuario, sair, modulosOcultos } = useAuth();
  const rotaAtual = props.state.routeNames[props.state.index];
  const hubFinanceiroVisivel = HUB_FINANCEIRO.filter((item) => !item.modulo || !modulosOcultos.includes(item.modulo));

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={estilos.drawer}>
      <Text style={estilos.usuarioNome}>{usuario?.nome}</Text>
      <Text style={estilos.usuarioLogin}>@{usuario?.username}</Text>

      <Text style={estilos.secaoLabel}>Hub Financeiro</Text>
      {hubFinanceiroVisivel.map((item) => (
        <ItemMenu key={item.rota} label={item.label} ativo={rotaAtual === item.rota} onPress={() => props.navigation.navigate(item.rota)} />
      ))}

      <Text style={estilos.secaoLabel}>Hub Pessoal</Text>
      {HUB_PESSOAL.map((item) => (
        <ItemMenu key={item.rota} label={item.label} ativo={rotaAtual === item.rota} onPress={() => props.navigation.navigate(item.rota)} />
      ))}

      <View style={estilos.divisor} />
      <ItemMenu label="Assistente IA" ativo={rotaAtual === 'Assistente'} onPress={() => props.navigation.navigate('Assistente')} />
      <ItemMenu label="Configurações" ativo={rotaAtual === 'Configuracoes'} onPress={() => props.navigation.navigate('Configuracoes')} />

      <TouchableOpacity style={estilos.botaoSair} onPress={sair}>
        <Text style={estilos.botaoSairTexto}>Sair do Sistema</Text>
      </TouchableOpacity>
    </DrawerContentScrollView>
  );
}

function TelasPrincipais() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <ConteudoDrawer {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgSurface },
        headerTintColor: colors.textMain,
        drawerType: 'front'
      }}
    >
      <Drawer.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Visão Geral' }} />
      <Drawer.Screen name="FII" component={FiiScreen} options={{ title: 'Fundos Imobiliários' }} />
      <Drawer.Screen name="Cripto" component={CriptoScreen} options={{ title: 'Cripto Moedas' }} />
      <Drawer.Screen name="Leilao" component={LeilaoScreen} options={{ title: 'Carros de Leilão' }} />
      <Drawer.Screen name="CasasLeilao" component={CasasLeilaoScreen} options={{ title: 'Casas de Leilão' }} />
      <Drawer.Screen name="Cofrinho" component={CofrinhoScreen} options={{ title: 'Cofrinho' }} />
      <Drawer.Screen name="Calendario" component={CalendarioScreen} options={{ title: 'Calendário' }} />
      <Drawer.Screen name="Clima" component={ClimaScreen} options={{ title: 'Clima' }} />
      <Drawer.Screen name="Financas" component={FinancasScreen} options={{ title: 'Finanças' }} />
      <Drawer.Screen name="TreinosSaude" component={TreinosSaudeScreen} options={{ title: 'Treinos & Saúde' }} />
      <Drawer.Screen name="Garagem" component={GaragemScreen} options={{ title: 'Garagem' }} />
      <Drawer.Screen name="Notificacoes" component={NotificacoesScreen} options={{ title: 'Notificações' }} />
      <Drawer.Screen name="Assistente" component={AssistenteScreen} options={{ headerShown: false }} />
      <Drawer.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
    </Drawer.Navigator>
  );
}

export default function RootNavigator() {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgMain, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={temaEscuro}>
      {usuario ? <TelasPrincipais /> : <LoginScreen />}
    </NavigationContainer>
  );
}

const estilos = StyleSheet.create({
  drawer: { backgroundColor: colors.bgSurface, flexGrow: 1, paddingTop: 8 },
  usuarioNome: { color: colors.textMain, fontWeight: '800', fontSize: 16, paddingHorizontal: 16 },
  usuarioLogin: { color: colors.textSub, fontSize: 12, paddingHorizontal: 16, marginBottom: 12 },
  secaoLabel: {
    color: colors.textSub,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 6
  },
  item: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginHorizontal: 8 },
  itemAtivo: { backgroundColor: colors.bgMain },
  itemTexto: { color: colors.textSub, fontSize: 14 },
  itemTextoAtivo: { color: colors.accent, fontWeight: '700' },
  divisor: { height: 1, backgroundColor: colors.border, marginVertical: 16, marginHorizontal: 16 },
  botaoSair: { paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 8, marginTop: 8 },
  botaoSairTexto: { color: colors.expense, fontWeight: '700' }
});
