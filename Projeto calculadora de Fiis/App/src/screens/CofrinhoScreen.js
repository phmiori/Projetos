import React from 'react';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import { listarCofrinhos } from '../api/cofrinho';
import { formatarMoeda } from '../utils/formatadores';

export default function CofrinhoScreen() {
  return (
    <ListaTela
      titulo="Cofrinho"
      buscar={listarCofrinhos}
      keyExtractor={(item) => String(item.id)}
      vazio="Nenhum cofrinho cadastrado ainda."
      renderItem={({ item }) => (
        <CartaoItem
          titulo={item.nome}
          linhas={[`Renda diária base: ${formatarMoeda(item.rendaPorDia)}`]}
          valor={formatarMoeda(item.valorInvestido)}
        />
      )}
    />
  );
}
