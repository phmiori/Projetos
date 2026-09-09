import React from 'react';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import { listarCarrosLeilao } from '../api/leilao';
import { formatarMoeda } from '../utils/formatadores';
import { colors } from '../theme/colors';

export default function LeilaoScreen() {
  return (
    <ListaTela
      titulo="Carros de Leilão"
      buscar={listarCarrosLeilao}
      keyExtractor={(item) => String(item.id)}
      vazio="Nenhum veículo cadastrado ainda."
      renderItem={({ item }) => {
        const vendido = item.status === 'Vendido';
        return (
          <CartaoItem
            titulo={`${item.marca} ${item.modelo} (${item.ano})`}
            tag={item.status}
            linhas={[`Custo total: ${formatarMoeda(item.custoTotal)}`]}
            valor={vendido ? `Lucro: ${formatarMoeda(item.lucroBruto)}` : null}
            valorCor={vendido ? (item.lucroBruto >= 0 ? colors.income : colors.expense) : undefined}
          />
        );
      }}
    />
  );
}
