import React, { useState } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoData } from '../components/FormularioModal';
import { listarCofrinhos, criarCofrinho, atualizarCofrinho, excluirCofrinho } from '../api/cofrinho';
import { formatarMoeda } from '../utils/formatadores';
import { useLista } from '../hooks/useLista';

const FORM_VAZIO = { nome: '', valorInvestido: '', rendaPorDia: '', dataInicio: new Date().toISOString(), observacoes: '' };

export default function CofrinhoScreen() {
  const { dados, carregando, erro, carregar } = useLista(listarCofrinhos);
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
      nome: item.nome,
      valorInvestido: String(item.valorInvestido),
      rendaPorDia: String(item.rendaPorDia),
      dataInicio: item.dataInicio,
      observacoes: item.observacoes || ''
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim() || !form.valorInvestido || !form.rendaPorDia) {
      Alert.alert('Campos obrigatórios', 'Informe nome, valor investido e renda do dia 1.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        nome: form.nome.trim(),
        valorInvestido: Number(form.valorInvestido),
        rendaPorDia: Number(form.rendaPorDia),
        dataInicio: form.dataInicio,
        observacoes: form.observacoes.trim() || null
      };
      if (itemEditando) {
        await atualizarCofrinho(itemEditando.id, dadosEnvio);
      } else {
        await criarCofrinho(dadosEnvio);
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
    Alert.alert('Excluir Cofrinho', `Remover o cofrinho "${itemEditando.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirCofrinho(itemEditando.id);
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
        titulo="Cofrinho"
        buscar={listarCofrinhos}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhum cofrinho cadastrado ainda. Toque no + para adicionar."
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => abrirEdicao(item)}>
            <CartaoItem
              titulo={item.nome}
              linhas={[`Renda diária base: ${formatarMoeda(item.rendaPorDia)}`]}
              valor={formatarMoeda(item.valorInvestido)}
            />
          </TouchableOpacity>
        )}
        fab={<BotaoFab onPress={abrirNovo} />}
      />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.nome}` : 'Novo Cofrinho'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Nome do Cofrinho" obrigatorio placeholder="Ex: Reserva de Emergência" value={form.nome} onChangeText={(v) => setForm({ ...form, nome: v })} />
        <CampoTexto label="Valor Investido (R$)" obrigatorio placeholder="Ex: 5000" keyboardType="decimal-pad" value={form.valorInvestido} onChangeText={(v) => setForm({ ...form, valorInvestido: v })} />
        <CampoTexto label="Renda Recebida no Dia 1 (R$)" obrigatorio placeholder="Ex: 3.20" keyboardType="decimal-pad" value={form.rendaPorDia} onChangeText={(v) => setForm({ ...form, rendaPorDia: v })} />
        <CampoData label="Data de Início" obrigatorio valor={form.dataInicio} onValorChange={(v) => setForm({ ...form, dataInicio: v })} />
        <CampoTexto label="Anotações" placeholder="Opcional" value={form.observacoes} onChangeText={(v) => setForm({ ...form, observacoes: v })} />
      </FormularioModal>
    </>
  );
}
