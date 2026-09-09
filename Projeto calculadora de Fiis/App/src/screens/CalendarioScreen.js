import React from 'react';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import { listarEventos } from '../api/eventos';
import { formatarDataHora, formatarData } from '../utils/formatadores';

export default function CalendarioScreen() {
  return (
    <ListaTela
      titulo="Calendário"
      buscar={listarEventos}
      keyExtractor={(item) => String(item.id)}
      vazio="Nenhum evento cadastrado ainda."
      renderItem={({ item }) => (
        <CartaoItem
          titulo={item.titulo}
          linhas={[item.diaTodo ? formatarData(item.inicio) : formatarDataHora(item.inicio), item.local].filter(Boolean)}
        />
      )}
    />
  );
}
