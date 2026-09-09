import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../components/FormularioModal';
import { listarCarteiraFii, criarFii, atualizarFii, excluirFii, atualizarCotacoesFii } from '../api/fii';
import { formatarMoeda } from '../utils/formatadores';
import { colors } from '../theme/colors';
import { useLista } from '../hooks/useLista';

const SEGMENTOS = ['Papel / CRI', 'Fiagro', 'Logística', 'Shoppings', 'Lajes Corporativas', 'Híbrido', 'FoF', 'Outro'];

const FORM_VAZIO = { ticker: '', segmento: 'Papel / CRI', cotas: '', precoMedio: '', ultimoDividendo: '', observacoes: '' };

export default function FiiScreen() {
  const { dados, carregando, atualizando, erro, carregar, aoAtualizar } = useLista(listarCarteiraFii);
  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [atualizandoCotacoes, setAtualizandoCotacoes] = useState(false);

  function abrirNovo() {
    setItemEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setItemEditando(item);
    setForm({
      ticker: item.ticker,
      segmento: item.segmento,
      cotas: String(item.cotas),
      precoMedio: String(item.precoMedio),
      ultimoDividendo: String(item.ultimoDividendo || ''),
      observacoes: item.observacoes || ''
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.ticker.trim() || !form.cotas || !form.precoMedio) {
      Alert.alert('Campos obrigatórios', 'Informe ticker, cotas e preço médio.');
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        ticker: form.ticker.trim().toUpperCase(),
        segmento: form.segmento,
        cotas: Number(form.cotas),
        precoMedio: Number(form.precoMedio),
        ultimoDividendo: Number(form.ultimoDividendo) || 0,
        observacoes: form.observacoes.trim() || null
      };
      if (itemEditando) {
        await atualizarFii(itemEditando.id, dados);
      } else {
        await criarFii(dados);
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
    Alert.alert('Excluir FII', `Remover ${itemEditando.ticker} da carteira?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirFii(itemEditando.id);
            setModalAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  async function aoAtualizarCotacoes() {
    setAtualizandoCotacoes(true);
    try {
      await atualizarCotacoesFii();
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível atualizar as cotações.');
    } finally {
      setAtualizandoCotacoes(false);
    }
  }

  return (
    <>
      <ListaTela
        titulo="Fundos Imobiliários"
        buscar={listarCarteiraFii}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhum FII cadastrado ainda. Toque no + para adicionar."
        cabecalho={
          <TouchableOpacity style={estilos.btnCotacoes} onPress={aoAtualizarCotacoes} disabled={atualizandoCotacoes}>
            <Text style={estilos.btnCotacoesTexto}>{atualizandoCotacoes ? 'Atualizando...' : 'Atualizar Cotações'}</Text>
          </TouchableOpacity>
        }
        renderItem={({ item }) => {
          const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
          return (
            <TouchableOpacity onPress={() => abrirEdicao(item)}>
              <CartaoItem
                titulo={item.ticker}
                tag={item.segmento}
                linhas={[`${item.cotas} cotas · preço médio ${formatarMoeda(item.precoMedio)}`]}
                valor={formatarMoeda(item.cotas * (precoRef || 0))}
              />
            </TouchableOpacity>
          );
        }}
        fab={<BotaoFab onPress={abrirNovo} />}
      />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.ticker}` : 'Novo FII'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Ticker" obrigatorio placeholder="Ex: SNAG11" autoCapitalize="characters" value={form.ticker} onChangeText={(v) => setForm({ ...form, ticker: v })} />
        <CampoSelect label="Segmento" valor={form.segmento} onValorChange={(v) => setForm({ ...form, segmento: v })} opcoes={SEGMENTOS} />
        <CampoTexto label="Cotas" obrigatorio placeholder="Ex: 1234" keyboardType="numeric" value={form.cotas} onChangeText={(v) => setForm({ ...form, cotas: v })} />
        <CampoTexto label="Preço Médio (R$)" obrigatorio placeholder="Ex: 9.87" keyboardType="decimal-pad" value={form.precoMedio} onChangeText={(v) => setForm({ ...form, precoMedio: v })} />
        <CampoTexto label="Último Dividendo por Cota (R$)" placeholder="Ex: 0.12" keyboardType="decimal-pad" value={form.ultimoDividendo} onChangeText={(v) => setForm({ ...form, ultimoDividendo: v })} />
        <CampoTexto label="Anotações" placeholder="Opcional" value={form.observacoes} onChangeText={(v) => setForm({ ...form, observacoes: v })} />
      </FormularioModal>
    </>
  );
}

const estilos = StyleSheet.create({
  btnCotacoes: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 14
  },
  btnCotacoesTexto: { color: colors.accent, fontWeight: '700', fontSize: 13 }
});
