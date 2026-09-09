import React from 'react';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import { listarNotificacoes } from '../api/notificacoes';
import { formatarDataHora } from '../utils/formatadores';

export default function NotificacoesScreen() {
  return (
    <ListaTela
      titulo="Notificações"
      buscar={listarNotificacoes}
      keyExtractor={(item) => String(item.id)}
      vazio="Nenhuma notificação no momento."
      renderItem={({ item }) => (
        <CartaoItem
          titulo={item.titulo}
          tag={item.emAndamento ? 'Agora' : undefined}
          linhas={[item.subtitulo || (item.inicio ? formatarDataHora(item.inicio) : null), item.local].filter(Boolean)}
        />
      )}
    />
  );
}
