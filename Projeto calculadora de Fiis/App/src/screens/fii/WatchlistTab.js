import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import CartaoItem from '../../components/CartaoItem';
import BotaoFab from '../../components/BotaoFab';
import FormularioModal, { CampoTexto } from '../../components/FormularioModal';
import { listarWatchlistFii, criarWatchlistFii, atualizarWatchlistFii, excluirWatchlistFii } from '../../api/fii';
import { formatarMoeda } from '../../utils/formatadores';
import { useLista } from '../../hooks/useLista';

const FORM_VAZIO = { ticker: '', alertaPrecoAbaixoDe: '' };

export default function WatchlistTab() {
  const { dados, erro, carregar } = useLista(listarWatchlistFii);
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
    setForm({ ticker: item.ticker, alertaPrecoAbaixoDe: String(item.alertaPrecoAbaixoDe) });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.ticker.trim() || !form.alertaPrecoAbaixoDe) {
      Alert.alert('Campos obrigatórios', 'Informe o ticker e o preço de alerta.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = { ticker: form.ticker.trim().toUpperCase(), alertaPrecoAbaixoDe: Number(form.alertaPrecoAbaixoDe) };
      if (itemEditando) await atualizarWatchlistFii(itemEditando.id, dadosEnvio);
      else await criarWatchlistFii(dadosEnvio);
      setModalAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Remover Alerta', `Remover ${itemEditando.ticker} da lista de observação?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirWatchlistFii(itemEditando.id);
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
              titulo={item.ticker}
              tag={item.alertaDisparado ? 'Alerta disparado' : undefined}
              linhas={[`Avisar quando abaixo de ${formatarMoeda(item.alertaPrecoAbaixoDe)}`, item.precoAtual != null ? `Preço atual: ${formatarMoeda(item.precoAtual)}` : 'Preço ainda não atualizado']}
            />
          </TouchableOpacity>
        ))}
        {(dados || []).length === 0 && !erro && <CartaoItem titulo="Nenhum FII na lista de observação" linhas={['Toque no + para adicionar um ticker pra acompanhar']} />}
      </ScrollView>

      <BotaoFab onPress={abrirNovo} />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.ticker}` : 'Novo Alerta'}
        subtitulo="Recebe um e-mail quando o preço cair abaixo do valor definido"
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Ticker" obrigatorio placeholder="Ex: MXRF11" autoCapitalize="characters" value={form.ticker} onChangeText={(v) => setForm({ ...form, ticker: v })} />
        <CampoTexto label="Avisar quando o preço cair abaixo de (R$)" obrigatorio placeholder="Ex: 9.50" keyboardType="decimal-pad" value={form.alertaPrecoAbaixoDe} onChangeText={(v) => setForm({ ...form, alertaPrecoAbaixoDe: v })} />
      </FormularioModal>
    </View>
  );
}
