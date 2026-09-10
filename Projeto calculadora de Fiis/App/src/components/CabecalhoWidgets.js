import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { colors } from '../theme/colors';
import { buscarClimaFavorito } from '../api/clima';
import { navegarPara } from '../navigation/navigationRef';

// Posicionado flutuando POR CIMA do conteúdo da tela (não faz parte do header), no canto
// superior direito — bolinha do robô sozinha quando não há local de clima favoritado, ou
// as duas em cascata diagonal quando há.
const TOPO = (Constants.statusBarHeight || 24) + 56;

export default function CabecalhoWidgets() {
  const [clima, setClima] = useState(null);

  useEffect(() => {
    let ativo = true;
    buscarClimaFavorito()
      .then((dados) => { if (ativo) setClima(dados); })
      .catch((err) => console.warn('[CabecalhoWidgets] Erro ao buscar clima favorito:', err.message));
    return () => { ativo = false; };
  }, []);

  return (
    <View style={estilos.container} pointerEvents="box-none">
      <TouchableOpacity style={estilos.bolinhaRobo} onPress={() => navegarPara('Assistente')}>
        <Text style={estilos.roboTexto}>🤖</Text>
      </TouchableOpacity>
      {clima && (
        <TouchableOpacity style={estilos.bolinhaClima} onPress={() => navegarPara('Clima')}>
          <Text style={estilos.climaTexto}>{Math.round(clima.current?.temperature_2m)}°</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { position: 'absolute', top: TOPO, right: 16, width: 84, height: 84, zIndex: 999, elevation: 999 },
  bolinhaRobo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bolinhaClima: {
    position: 'absolute',
    top: 40,
    right: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  roboTexto: { fontSize: 20 },
  climaTexto: { color: colors.textMain, fontSize: 14, fontWeight: '700' }
});
