import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import CartaoItem from '../../components/CartaoItem';
import BotaoFab from '../../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect, CampoData } from '../../components/FormularioModal';
import { listarTransacoes, criarTransacao, atualizarTransacao, excluirTransacao, listarContas, listarCategorias } from '../../api/financas';
import { formatarMoeda, formatarData } from '../../utils/formatadores';
import { colors } from '../../theme/colors';

const TIPOS = ['Despesa', 'Receita', 'Transferencia'];
const FORMAS_PAGAMENTO = ['Débito', 'Pix', 'Dinheiro', 'Boleto'];
const STATUS = ['Pago', 'Pendente', 'Agendado'];

function formVazio() {
  return { tipo: 'Despesa', descricao: '', valor: '', data: new Date().toISOString(), formaPagamento: 'Débito', status: 'Pago', categoriaId: null, contaId: null, contaDestinoId: null };
}

export default function TransacoesTab() {
  const [transacoes, setTransacoes] = useState([]);
  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [form, setForm] = useState(formVazio());
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const [t, c, cat] = await Promise.all([listarTransacoes(), listarContas(), listarCategorias()]);
      setTransacoes(t);
      setContas(c);
      setCategorias(cat);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar as transações.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovo() {
    setItemEditando(null);
    setForm(formVazio());
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setItemEditando(item);
    setForm({
      tipo: item.tipo,
      descricao: item.descricao,
      valor: String(item.valor),
      data: item.data,
      formaPagamento: item.formaPagamento === 'Crédito' ? 'Débito' : item.formaPagamento,
      status: item.status,
      categoriaId: item.categoriaId,
      contaId: item.contaId,
      contaDestinoId: item.contaDestinoId
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.descricao.trim() || !form.valor) {
      Alert.alert('Campos obrigatórios', 'Informe descrição e valor.');
      return;
    }
    if (form.tipo === 'Transferencia' && (!form.contaId || !form.contaDestinoId)) {
      Alert.alert('Campos obrigatórios', 'Transferência exige conta de origem e de destino.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data: form.data,
        formaPagamento: form.tipo === 'Transferencia' ? undefined : form.formaPagamento,
        status: form.status,
        categoriaId: form.tipo === 'Transferencia' ? null : form.categoriaId,
        contaId: form.contaId,
        contaDestinoId: form.tipo === 'Transferencia' ? form.contaDestinoId : null
      };
      if (itemEditando) await atualizarTransacao(itemEditando.id, dadosEnvio);
      else await criarTransacao(dadosEnvio);
      setModalAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir Lançamento', `Remover "${itemEditando.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirTransacao(itemEditando.id);
            setModalAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  const opcoesContas = contas.map((c) => ({ label: c.nome, value: c.id }));
  const opcoesCategorias = categorias.filter((c) => c.tipo === form.tipo).map((c) => ({ label: c.nome, value: c.id }));

  if (carregando) {
    return <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 90 }}>
        {transacoes.map((item) => (
          <TouchableOpacity key={item.id} onPress={() => abrirEdicao(item)}>
            <CartaoItem
              titulo={item.descricao}
              tag={item.status !== 'Pago' ? item.status : undefined}
              linhas={[formatarData(item.data), [item.categoria?.nome, item.conta?.nome].filter(Boolean).join(' · ')]}
              valor={`${item.tipo === 'Despesa' ? '-' : item.tipo === 'Receita' ? '+' : ''} ${formatarMoeda(item.valor)}`}
              valorCor={item.tipo === 'Receita' ? colors.income : item.tipo === 'Despesa' ? colors.expense : colors.textMain}
            />
          </TouchableOpacity>
        ))}
        {transacoes.length === 0 && !erro && <CartaoItem titulo="Nenhum lançamento cadastrado ainda" linhas={['Toque no + para adicionar']} />}
      </ScrollView>

      <BotaoFab onPress={abrirNovo} />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? 'Editar Lançamento' : 'Novo Lançamento'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoSelect label="Tipo" valor={form.tipo} onValorChange={(v) => setForm({ ...form, tipo: v, categoriaId: null })} opcoes={TIPOS} />
        <CampoTexto label="Descrição" obrigatorio placeholder="Ex: Supermercado" value={form.descricao} onChangeText={(v) => setForm({ ...form, descricao: v })} />
        <CampoTexto label="Valor (R$)" obrigatorio placeholder="Ex: 150" keyboardType="decimal-pad" value={form.valor} onChangeText={(v) => setForm({ ...form, valor: v })} />
        <CampoData label="Data" obrigatorio valor={form.data} onValorChange={(v) => setForm({ ...form, data: v })} />

        {form.tipo === 'Transferencia' ? (
          <>
            <CampoSelect label="Conta de Origem" valor={form.contaId} onValorChange={(v) => setForm({ ...form, contaId: v })} opcoes={[{ label: 'Selecione...', value: null }, ...opcoesContas]} />
            <CampoSelect label="Conta de Destino" valor={form.contaDestinoId} onValorChange={(v) => setForm({ ...form, contaDestinoId: v })} opcoes={[{ label: 'Selecione...', value: null }, ...opcoesContas]} />
          </>
        ) : (
          <>
            <CampoSelect label="Forma de Pagamento" valor={form.formaPagamento} onValorChange={(v) => setForm({ ...form, formaPagamento: v })} opcoes={FORMAS_PAGAMENTO} />
            <CampoSelect label="Categoria" valor={form.categoriaId} onValorChange={(v) => setForm({ ...form, categoriaId: v })} opcoes={[{ label: 'Sem categoria', value: null }, ...opcoesCategorias]} />
            <CampoSelect label="Conta" valor={form.contaId} onValorChange={(v) => setForm({ ...form, contaId: v })} opcoes={[{ label: 'Sem conta', value: null }, ...opcoesContas]} />
          </>
        )}

        <CampoSelect label="Status" valor={form.status} onValorChange={(v) => setForm({ ...form, status: v })} opcoes={STATUS} />
      </FormularioModal>
    </View>
  );
}
