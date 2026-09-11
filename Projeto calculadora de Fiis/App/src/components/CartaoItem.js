import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * src/components/CartaoItem.js
 * Cartão padrão de item de lista: título + tag opcional, uma ou mais linhas de detalhe, e um
 * valor em destaque no rodapé — mesmo layout usado em todas as telas de carteira/lista.
 */
export default function CartaoItem({ titulo, tag, tagCor, linhas = [], valor, valorCor }) {
  return (
    <View style={estilos.card}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>{titulo}</Text>
        {tag ? (
          <Text style={[estilos.tag, tagCor ? { color: tagCor, borderColor: tagCor } : null]}>{tag}</Text>
        ) : null}
      </View>

      {linhas.map((linha, i) => (
        <Text key={i} style={estilos.linha}>{linha}</Text>
      ))}

      {valor ? <Text style={[estilos.valor, valorCor ? { color: valorCor } : null]}>{valor}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10
  },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  titulo: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 16,
    flexShrink: 1
  },
  tag: {
    color: colors.textSub,
    fontSize: 11,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  linha: {
    color: colors.textSub,
    fontSize: 13,
    marginBottom: 2
  },
  valor: {
    color: colors.textMain,
    fontWeight: '700',
    fontSize: 15,
    marginTop: 4
  }
});
