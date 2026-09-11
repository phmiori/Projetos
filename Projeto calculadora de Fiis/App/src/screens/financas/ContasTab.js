import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import CartaoItem from '../../components/CartaoItem';
import BotaoFab from '../../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../../components/FormularioModal';
import { listarContas, criarConta, atualizarConta, excluirConta } from '../../api/financas';
import { formatarMoeda } from '../../utils/formatadores';
import { useLista } from '../../hooks/useLista';

const TIPOS = ['Corrente', 'Poupança', 'Carteira Digital'];
const FORM_VAZIO = { nome: '', banco: '', tipo: 'Corrente', saldoInicial: '' };

export default function ContasTab() {
  const { dados, erro, carregar } = useLista(listarContas);
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
    setForm({ nome: item.nome, banco: item.banco, tipo: item.tipo, saldoInicial: String(item.saldoInicial) });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim() || !form.banco.trim()) {
      Alert.alert('Campos obrigatórios', 'Informe nome e banco.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = { nome: form.nome.trim(), banco: form.banco.trim(), tipo: form.tipo, saldoInicial: Number(form.saldoInicial) || 0 };
      if (itemEditando) await atualizarConta(itemEditando.id, dadosEnvio);
      else await criarConta(dadosEnvio);
      setModalAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir Conta', `Remover a conta "${itemEditando.nome}"? Transações vinculadas perdem a referência à conta.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirConta(itemEditando.id);
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
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 90 }}>
        {(dados || []).map((item) => (
          <TouchableOpacity key={item.id} onPress={() => abrirEdicao(item)}>
            <CartaoItem
              titulo={item.nome}
              tag={item.tipo}
              linhas={[item.banco]}
              valor={formatarMoeda(item.saldoAtual)}
            />
          </TouchableOpacity>
        ))}
        {(dados || []).length === 0 && !erro && <CartaoItem titulo="Nenhuma conta cadastrada ainda" linhas={['Toque no + para adicionar']} />}
      </ScrollView>

      <BotaoFab onPress={abrirNovo} />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.nome}` : 'Nova Conta'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Nome" obrigatorio placeholder="Ex: Conta Corrente" value={form.nome} onChangeText={(v) => setForm({ ...form, nome: v })} />
        <CampoTexto label="Banco" obrigatorio placeholder="Ex: Nubank" value={form.banco} onChangeText={(v) => setForm({ ...form, banco: v })} />
        <CampoSelect label="Tipo" valor={form.tipo} onValorChange={(v) => setForm({ ...form, tipo: v })} opcoes={TIPOS} />
        <CampoTexto label="Saldo Inicial (R$)" placeholder="Ex: 1000" keyboardType="decimal-pad" value={form.saldoInicial} onChangeText={(v) => setForm({ ...form, saldoInicial: v })} />
      </FormularioModal>
    </View>
  );
}
