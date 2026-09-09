import React, { useState } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoData } from '../components/FormularioModal';
import { listarVeiculosGaragem, criarVeiculoGaragem, atualizarVeiculoGaragem, excluirVeiculoGaragem } from '../api/garagem';
import { formatarMoeda } from '../utils/formatadores';
import { useLista } from '../hooks/useLista';

const FORM_VAZIO = { marca: '', modelo: '', ano: '', placa: '', cor: '', quilometragem: '', dataCompra: new Date().toISOString(), valorCompra: '', observacoes: '' };

export default function GaragemScreen() {
  const { dados, carregando, erro, carregar } = useLista(listarVeiculosGaragem);
  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setItemEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setItemEditando(item);
    setForm({
      marca: item.marca,
      modelo: item.modelo,
      ano: String(item.ano),
      placa: item.placa || '',
      cor: item.cor || '',
      quilometragem: item.quilometragem != null ? String(item.quilometragem) : '',
      dataCompra: item.dataCompra,
      valorCompra: String(item.valorCompra),
      observacoes: item.observacoes || ''
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.marca.trim() || !form.modelo.trim() || !form.dataCompra) {
      Alert.alert('Campos obrigatórios', 'Informe marca, modelo e data de compra.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        ano: Number(form.ano) || new Date().getFullYear(),
        placa: form.placa.trim() || null,
        cor: form.cor.trim() || null,
        quilometragem: form.quilometragem ? Number(form.quilometragem) : null,
        dataCompra: form.dataCompra,
        valorCompra: Number(form.valorCompra) || 0,
        observacoes: form.observacoes.trim() || null
      };
      if (itemEditando) {
        await atualizarVeiculoGaragem(itemEditando.id, dadosEnvio);
      } else {
        await criarVeiculoGaragem(dadosEnvio);
      }
      setModalAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir Veículo', `Remover ${itemEditando.marca} ${itemEditando.modelo} e todo o histórico de manutenções?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirVeiculoGaragem(itemEditando.id);
            setModalAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  return (
    <>
      <ListaTela
        titulo="Garagem"
        buscar={listarVeiculosGaragem}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhum veículo cadastrado ainda. Toque no + para adicionar."
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => abrirEdicao(item)}>
            <CartaoItem
              titulo={`${item.marca} ${item.modelo} (${item.ano})`}
              tag={item.status}
              linhas={[item.placa || 'Sem placa cadastrada']}
              valor={formatarMoeda(item.valorCompra)}
            />
          </TouchableOpacity>
        )}
        fab={<BotaoFab onPress={abrirNovo} />}
      />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.marca} ${itemEditando.modelo}` : 'Novo Veículo'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Marca" obrigatorio placeholder="Ex: Toyota" value={form.marca} onChangeText={(v) => setForm({ ...form, marca: v })} />
        <CampoTexto label="Modelo" obrigatorio placeholder="Ex: Corolla" value={form.modelo} onChangeText={(v) => setForm({ ...form, modelo: v })} />
        <CampoTexto label="Ano" placeholder="Ex: 2022" keyboardType="numeric" value={form.ano} onChangeText={(v) => setForm({ ...form, ano: v })} />
        <CampoTexto label="Placa" placeholder="Opcional" autoCapitalize="characters" value={form.placa} onChangeText={(v) => setForm({ ...form, placa: v })} />
        <CampoTexto label="Cor" placeholder="Opcional" value={form.cor} onChangeText={(v) => setForm({ ...form, cor: v })} />
        <CampoTexto label="Quilometragem" placeholder="Opcional" keyboardType="numeric" value={form.quilometragem} onChangeText={(v) => setForm({ ...form, quilometragem: v })} />
        <CampoData label="Data de Compra" obrigatorio valor={form.dataCompra} onValorChange={(v) => setForm({ ...form, dataCompra: v })} />
        <CampoTexto label="Valor de Compra (R$)" placeholder="Ex: 85000" keyboardType="decimal-pad" value={form.valorCompra} onChangeText={(v) => setForm({ ...form, valorCompra: v })} />
        <CampoTexto label="Observações" placeholder="Opcional" value={form.observacoes} onChangeText={(v) => setForm({ ...form, observacoes: v })} />
      </FormularioModal>
    </>
  );
}
