import React from 'react';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import { listarCarteiraCripto } from '../api/cripto';
import { formatarMoeda } from '../utils/formatadores';

export default function CriptoScreen() {
  return (
    <ListaTela
      titulo="Criptomoedas"
      buscar={listarCarteiraCripto}
      keyExtractor={(item) => String(item.id)}
      vazio="Nenhuma criptomoeda cadastrada ainda."
      renderItem={({ item }) => {
        const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
        return (
          <CartaoItem
            titulo={`${item.ticker} · ${item.nome}`}
            tag={item.categoria}
            linhas={[`${item.quantidade} unid. · preço médio ${formatarMoeda(item.precoMedio)}`]}
            valor={formatarMoeda(item.quantidade * (precoRef || 0))}
          />
        );
      }}
    />
  );
}
