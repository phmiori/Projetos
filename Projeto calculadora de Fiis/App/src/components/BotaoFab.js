import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * src/components/BotaoFab.js
 * Botão flutuante "+" no canto inferior direito, pra adicionar um item novo — presente em
 * todas as telas de lista com CRUD.
 */
export default function BotaoFab({ onPress }) {
  return (
    <TouchableOpacity style={estilos.fab} onPress={onPress}>
      <Text style={estilos.texto}>+</Text>
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  texto: {
    color: colors.accentText,
    fontSize: 28,
    fontWeight: '700',
    marginTop: -2
  }
});
