import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { buscarClimaFavorito } from '../api/clima';

export default function CabecalhoWidgets() {
  const navigation = useNavigation();
  const [clima, setClima] = useState(null);

  useEffect(() => {
    let ativo = true;
    buscarClimaFavorito()
      .then((dados) => { if (ativo) setClima(dados); })
      .catch((err) => console.warn('[CabecalhoWidgets] Erro ao buscar clima favorito:', err.message));
    return () => { ativo = false; };
  }, []);

  return (
    <View style={estilos.container}>
      {clima && (
        <TouchableOpacity style={estilos.bolinha} onPress={() => navigation.navigate('Clima')}>
          <Text style={estilos.climaTexto}>{Math.round(clima.current?.temperature_2m)}°</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={estilos.bolinha} onPress={() => navigation.navigate('Assistente')}>
        <Text style={estilos.roboTexto}>🤖</Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginRight: 12, gap: 8 },
  bolinha: {
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
