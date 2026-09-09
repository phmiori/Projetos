import React from 'react';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import { listarCasasLeilao } from '../api/leilao';
import { formatarMoeda } from '../utils/formatadores';
import { colors } from '../theme/colors';

export default function CasasLeilaoScreen() {
  return (
    <ListaTela
      titulo="Casas de Leilão"
      buscar={listarCasasLeilao}
      keyExtractor={(item) => String(item.id)}
      vazio="Nenhum imóvel cadastrado ainda."
      renderItem={({ item }) => {
        const vendido = item.status === 'Vendido';
        return (
          <CartaoItem
            titulo={item.endereco}
            tag={item.status}
            linhas={[`${item.tipoImovel} · custo total: ${formatarMoeda(item.custoTotal)}`]}
            valor={vendido ? `Lucro: ${formatarMoeda(item.lucroBruto)}` : null}
            valorCor={vendido ? (item.lucroBruto >= 0 ? colors.income : colors.expense) : undefined}
          />
        );
      }}
    />
  );
}
