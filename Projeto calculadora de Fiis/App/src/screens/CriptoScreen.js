import React, { useState } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../components/FormularioModal';
import { listarCarteiraCripto, criarCripto, atualizarCripto, excluirCripto } from '../api/cripto';
import { formatarMoeda } from '../utils/formatadores';
import { useLista } from '../hooks/useLista';

const CATEGORIAS = ['Layer 1', 'Layer 2', 'DeFi', 'Meme', 'Stablecoin', 'Outro'];
const FORM_VAZIO = { ticker: '', nome: '', moedaId: '', categoria: 'Layer 1', quantidade: '', precoMedio: '', observacoes: '' };

export default function CriptoScreen() {
  const { dados, carregando, erro, carregar } = useLista(listarCarteiraCripto);
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
      ticker: item.ticker,
      nome: item.nome,
      moedaId: item.moedaId,
      categoria: item.categoria,
      quantidade: String(item.quantidade),
      precoMedio: String(item.precoMedio),
      observacoes: item.observacoes || ''
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.ticker.trim() || !form.nome.trim() || !form.moedaId.trim() || !form.quantidade || !form.precoMedio) {
      Alert.alert('Campos obrigatórios', 'Informe ticker, nome, ID CoinGecko, quantidade e preço médio.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        ticker: form.ticker.trim().toUpperCase(),
        nome: form.nome.trim(),
        moedaId: form.moedaId.trim().toLowerCase(),
        categoria: form.categoria,
        quantidade: Number(form.quantidade),
        precoMedio: Number(form.precoMedio),
        observacoes: form.observacoes.trim() || null
      };
      if (itemEditando) {
        await atualizarCripto(itemEditando.id, dadosEnvio);
      } else {
        await criarCripto(dadosEnvio);
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
    Alert.alert('Excluir Cripto', `Remover ${itemEditando.ticker} da carteira?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirCripto(itemEditando.id);
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
        titulo="Criptomoedas"
        buscar={listarCarteiraCripto}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhuma criptomoeda cadastrada ainda. Toque no + para adicionar."
        renderItem={({ item }) => {
          const precoRef = item.precoAtual != null ? item.precoAtual : item.precoMedio;
          return (
            <TouchableOpacity onPress={() => abrirEdicao(item)}>
              <CartaoItem
                titulo={`${item.ticker} · ${item.nome}`}
                tag={item.categoria}
                linhas={[`${item.quantidade} unid. · preço médio ${formatarMoeda(item.precoMedio)}`]}
                valor={formatarMoeda(item.quantidade * (precoRef || 0))}
              />
            </TouchableOpacity>
          );
        }}
        fab={<BotaoFab onPress={abrirNovo} />}
      />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.ticker}` : 'Nova Criptomoeda'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Ticker" obrigatorio placeholder="Ex: BTC" autoCapitalize="characters" value={form.ticker} onChangeText={(v) => setForm({ ...form, ticker: v })} />
        <CampoTexto label="Nome da Moeda" obrigatorio placeholder="Ex: Bitcoin" value={form.nome} onChangeText={(v) => setForm({ ...form, nome: v })} />
        <CampoTexto label="ID CoinGecko" obrigatorio placeholder="Ex: bitcoin" autoCapitalize="none" value={form.moedaId} onChangeText={(v) => setForm({ ...form, moedaId: v })} />
        <CampoSelect label="Categoria" valor={form.categoria} onValorChange={(v) => setForm({ ...form, categoria: v })} opcoes={CATEGORIAS} />
        <CampoTexto label="Quantidade" obrigatorio placeholder="Ex: 0.5" keyboardType="decimal-pad" value={form.quantidade} onChangeText={(v) => setForm({ ...form, quantidade: v })} />
        <CampoTexto label="Preço Médio (R$)" obrigatorio placeholder="Ex: 350000" keyboardType="decimal-pad" value={form.precoMedio} onChangeText={(v) => setForm({ ...form, precoMedio: v })} />
        <CampoTexto label="Anotações" placeholder="Opcional" value={form.observacoes} onChangeText={(v) => setForm({ ...form, observacoes: v })} />
      </FormularioModal>
    </>
  );
}
