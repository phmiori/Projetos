import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import CartaoItem from '../../components/CartaoItem';
import BotaoFab from '../../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../../components/FormularioModal';
import { listarCartoes, criarCartao, atualizarCartao, excluirCartao, pagarFatura, buscarResumoFinancas, listarContas } from '../../api/financas';
import { formatarMoeda, formatarData } from '../../utils/formatadores';
import { colors } from '../../theme/colors';

const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Outro'];
const FORM_VAZIO = { nome: '', banco: '', bandeira: 'Visa', limite: '', diaFechamento: '', diaVencimento: '', contaVinculadaId: null };

export default function CartoesTab() {
  const [cartoes, setCartoes] = useState([]);
  const [faturasPorCartao, setFaturasPorCartao] = useState({});
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro('');
      const [c, resumo, ctas] = await Promise.all([listarCartoes(), buscarResumoFinancas().catch(() => null), listarContas()]);
      setCartoes(c);
      setContas(ctas);
      const mapa = {};
      (resumo?.faturasAbertas || []).forEach((item) => { if (item.fatura) mapa[item.cartaoId] = item.fatura; });
      setFaturasPorCartao(mapa);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar os cartões.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovo() {
    setItemEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setItemEditando(item);
    setForm({
      nome: item.nome,
      banco: item.banco,
      bandeira: item.bandeira,
      limite: String(item.limite),
      diaFechamento: String(item.diaFechamento),
      diaVencimento: String(item.diaVencimento),
      contaVinculadaId: item.contaVinculadaId
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim() || !form.banco.trim() || !form.diaFechamento || !form.diaVencimento) {
      Alert.alert('Campos obrigatórios', 'Informe nome, banco, dia de fechamento e dia de vencimento.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        nome: form.nome.trim(),
        banco: form.banco.trim(),
        bandeira: form.bandeira,
        limite: Number(form.limite) || 0,
        diaFechamento: Number(form.diaFechamento),
        diaVencimento: Number(form.diaVencimento),
        contaVinculadaId: form.contaVinculadaId
      };
      if (itemEditando) await atualizarCartao(itemEditando.id, dadosEnvio);
      else await criarCartao(dadosEnvio);
      setModalAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir Cartão', `Remover "${itemEditando.nome}" e todas as suas faturas?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirCartao(itemEditando.id);
            setModalAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  function confirmarPagamento(fatura) {
    Alert.alert('Marcar Fatura como Paga', 'Deseja lançar automaticamente uma despesa em débito na conta vinculada ao cartão?', [
      { text: 'Não lançar', onPress: () => pagar(fatura.id, false) },
      { text: 'Sim, lançar despesa', onPress: () => pagar(fatura.id, true) }
    ]);
  }

  async function pagar(faturaId, debitar) {
    try {
      await pagarFatura(faturaId, debitar);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível registrar o pagamento.');
    }
  }

  if (carregando) {
    return <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />;
  }

  const opcoesContas = [{ label: 'Sem conta vinculada', value: null }, ...contas.map((c) => ({ label: c.nome, value: c.id }))];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 90 }}>
        {cartoes.map((item) => {
          const fatura = faturasPorCartao[item.id];
          return (
            <View key={item.id}>
              <TouchableOpacity onPress={() => abrirEdicao(item)}>
                <CartaoItem
                  titulo={item.nome}
                  tag={item.bandeira}
                  linhas={[`Limite disponível: ${formatarMoeda(item.limiteDisponivel)} de ${formatarMoeda(item.limite)}`]}
                  valor={`Usado: ${formatarMoeda(item.limiteUsado)}`}
                />
              </TouchableOpacity>
              {fatura && (
                <TouchableOpacity style={{ marginTop: -6, marginBottom: 10, paddingHorizontal: 6 }} onPress={() => confirmarPagamento(fatura)}>
                  <CartaoItem
                    titulo={`Fatura vence em ${formatarData(fatura.dataVencimento)}`}
                    tag="Pagar"
                    tagCor={colors.accent}
                    valor={formatarMoeda(fatura.valorTotal)}
                  />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        {cartoes.length === 0 && !erro && <CartaoItem titulo="Nenhum cartão cadastrado ainda" linhas={['Toque no + para adicionar']} />}
      </ScrollView>

      <BotaoFab onPress={abrirNovo} />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.nome}` : 'Novo Cartão'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Nome" obrigatorio placeholder="Ex: Nubank" value={form.nome} onChangeText={(v) => setForm({ ...form, nome: v })} />
        <CampoTexto label="Banco" obrigatorio placeholder="Ex: Nu Pagamentos" value={form.banco} onChangeText={(v) => setForm({ ...form, banco: v })} />
        <CampoSelect label="Bandeira" valor={form.bandeira} onValorChange={(v) => setForm({ ...form, bandeira: v })} opcoes={BANDEIRAS} />
        <CampoTexto label="Limite (R$)" placeholder="Ex: 5000" keyboardType="decimal-pad" value={form.limite} onChangeText={(v) => setForm({ ...form, limite: v })} />
        <CampoTexto label="Dia de Fechamento" obrigatorio placeholder="Ex: 20" keyboardType="numeric" value={form.diaFechamento} onChangeText={(v) => setForm({ ...form, diaFechamento: v })} />
        <CampoTexto label="Dia de Vencimento" obrigatorio placeholder="Ex: 27" keyboardType="numeric" value={form.diaVencimento} onChangeText={(v) => setForm({ ...form, diaVencimento: v })} />
        <CampoSelect label="Conta Vinculada" valor={form.contaVinculadaId} onValorChange={(v) => setForm({ ...form, contaVinculadaId: v })} opcoes={opcoesContas} />
      </FormularioModal>
    </View>
  );
}
