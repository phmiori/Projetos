import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import FiiScreen from '../screens/FiiScreen';

const Tab = createBottomTabNavigator();

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

function TabsPrincipais() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSub,
        tabBarStyle: { backgroundColor: colors.bgSurface, borderTopColor: colors.border }
      }}
    >
      <Tab.Screen name="Visão Geral" component={DashboardScreen} />
      <Tab.Screen name="FIIs" component={FiiScreen} />
    </Tab.Navigator>
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
      {usuario ? <TabsPrincipais /> : <LoginScreen />}
    </NavigationContainer>
  );
}
