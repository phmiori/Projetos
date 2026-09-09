import React from 'react';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import { listarVeiculosGaragem } from '../api/garagem';
import { formatarMoeda } from '../utils/formatadores';

export default function GaragemScreen() {
  return (
    <ListaTela
      titulo="Garagem"
      buscar={listarVeiculosGaragem}
      keyExtractor={(item) => String(item.id)}
      vazio="Nenhum veículo cadastrado ainda."
      renderItem={({ item }) => (
        <CartaoItem
          titulo={`${item.marca} ${item.modelo} (${item.ano})`}
          tag={item.status}
          linhas={[item.placa || 'Sem placa cadastrada']}
          valor={formatarMoeda(item.valorCompra)}
        />
      )}
    />
  );
}
