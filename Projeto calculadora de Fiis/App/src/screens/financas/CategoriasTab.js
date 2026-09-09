import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import CartaoItem from '../../components/CartaoItem';
import BotaoFab from '../../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../../components/FormularioModal';
import { listarCategorias, criarCategoria, atualizarCategoria, excluirCategoria } from '../../api/financas';
import { formatarMoeda } from '../../utils/formatadores';
import { colors } from '../../theme/colors';
import { useLista } from '../../hooks/useLista';

const TIPOS = ['Despesa', 'Receita'];
const FORM_VAZIO = { nome: '', tipo: 'Despesa', orcamentoMensal: '' };

export default function CategoriasTab() {
  const { dados, erro, carregar } = useLista(listarCategorias);
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
    setForm({ nome: item.nome, tipo: item.tipo, orcamentoMensal: item.orcamentoMensal != null ? String(item.orcamentoMensal) : '' });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome da categoria.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = { nome: form.nome.trim(), tipo: form.tipo, orcamentoMensal: form.orcamentoMensal ? Number(form.orcamentoMensal) : null };
      if (itemEditando) await atualizarCategoria(itemEditando.id, dadosEnvio);
      else await criarCategoria(dadosEnvio);
      setModalAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir Categoria', `Remover a categoria "${itemEditando.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirCategoria(itemEditando.id);
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
              tagCor={item.tipo === 'Receita' ? colors.income : colors.expense}
              linhas={item.orcamentoMensal ? [`Orçamento mensal: ${formatarMoeda(item.orcamentoMensal)}`] : []}
            />
          </TouchableOpacity>
        ))}
        {(dados || []).length === 0 && !erro && <CartaoItem titulo="Nenhuma categoria cadastrada ainda" linhas={['Toque no + para adicionar']} />}
      </ScrollView>

      <BotaoFab onPress={abrirNovo} />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.nome}` : 'Nova Categoria'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Nome" obrigatorio placeholder="Ex: Alimentação" value={form.nome} onChangeText={(v) => setForm({ ...form, nome: v })} />
        <CampoSelect label="Tipo" valor={form.tipo} onValorChange={(v) => setForm({ ...form, tipo: v })} opcoes={TIPOS} />
        <CampoTexto label="Orçamento Mensal (R$)" placeholder="Opcional" keyboardType="decimal-pad" value={form.orcamentoMensal} onChangeText={(v) => setForm({ ...form, orcamentoMensal: v })} />
      </FormularioModal>
    </View>
  );
}
