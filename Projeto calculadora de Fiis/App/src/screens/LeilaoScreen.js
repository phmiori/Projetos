import React, { useState } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../components/FormularioModal';
import { listarCarrosLeilao, criarCarroLeilao, atualizarCarroLeilao, excluirCarroLeilao } from '../api/leilao';
import { formatarMoeda } from '../utils/formatadores';
import { colors } from '../theme/colors';
import { useLista } from '../hooks/useLista';

const STATUS = ['Em Trânsito', 'Em Preparação', 'Regularização', 'Anunciado', 'Vendido'];
const FORM_VAZIO = { marca: '', modelo: '', ano: '', status: 'Em Trânsito', valorArremate: '', comissaoPct: '5', taxasPatio: '', custoGuincho: '', valorVenda: '', observacoes: '' };

export default function LeilaoScreen() {
  const { dados, carregando, erro, carregar } = useLista(listarCarrosLeilao);
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
      status: item.status,
      valorArremate: String(item.valorArremate),
      comissaoPct: String(item.comissaoPct),
      taxasPatio: String(item.taxasPatio),
      custoGuincho: String(item.custoGuincho),
      valorVenda: item.valorVenda != null ? String(item.valorVenda) : '',
      observacoes: item.observacoes || ''
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.marca.trim() || !form.modelo.trim()) {
      Alert.alert('Campos obrigatórios', 'Informe marca e modelo.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        ano: Number(form.ano) || new Date().getFullYear(),
        status: form.status,
        dataCompra: itemEditando ? itemEditando.dataCompra : new Date().toISOString(),
        valorArremate: Number(form.valorArremate) || 0,
        comissaoPct: Number(form.comissaoPct) || 0,
        taxasPatio: Number(form.taxasPatio) || 0,
        custoGuincho: Number(form.custoGuincho) || 0,
        valorVenda: form.valorVenda ? Number(form.valorVenda) : null,
        observacoes: form.observacoes.trim() || null
      };
      if (itemEditando) {
        await atualizarCarroLeilao(itemEditando.id, dadosEnvio);
      } else {
        await criarCarroLeilao(dadosEnvio);
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
    Alert.alert('Excluir Veículo', `Remover ${itemEditando.marca} ${itemEditando.modelo}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirCarroLeilao(itemEditando.id);
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
        titulo="Carros de Leilão"
        buscar={listarCarrosLeilao}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhum veículo cadastrado ainda. Toque no + para adicionar."
        renderItem={({ item }) => {
          const vendido = item.status === 'Vendido';
          return (
            <TouchableOpacity onPress={() => abrirEdicao(item)}>
              <CartaoItem
                titulo={`${item.marca} ${item.modelo} (${item.ano})`}
                tag={item.status}
                linhas={[`Custo total: ${formatarMoeda(item.custoTotal)}`]}
                valor={vendido ? `Lucro: ${formatarMoeda(item.lucroBruto)}` : null}
                valorCor={vendido ? (item.lucroBruto >= 0 ? colors.income : colors.expense) : undefined}
              />
            </TouchableOpacity>
          );
        }}
        fab={<BotaoFab onPress={abrirNovo} />}
      />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.marca} ${itemEditando.modelo}` : 'Novo Veículo'}
        subtitulo="Total de aquisição, custo total, lucro e ROI são calculados automaticamente"
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Marca" obrigatorio placeholder="Ex: Toyota" value={form.marca} onChangeText={(v) => setForm({ ...form, marca: v })} />
        <CampoTexto label="Modelo" obrigatorio placeholder="Ex: Corolla" value={form.modelo} onChangeText={(v) => setForm({ ...form, modelo: v })} />
        <CampoTexto label="Ano" placeholder="Ex: 2020" keyboardType="numeric" value={form.ano} onChangeText={(v) => setForm({ ...form, ano: v })} />
        <CampoSelect label="Status" valor={form.status} onValorChange={(v) => setForm({ ...form, status: v })} opcoes={STATUS} />
        <CampoTexto label="Valor do Arremate (R$)" placeholder="Ex: 30000" keyboardType="decimal-pad" value={form.valorArremate} onChangeText={(v) => setForm({ ...form, valorArremate: v })} />
        <CampoTexto label="Comissão do Leiloeiro (%)" placeholder="Ex: 5" keyboardType="decimal-pad" value={form.comissaoPct} onChangeText={(v) => setForm({ ...form, comissaoPct: v })} />
        <CampoTexto label="Taxas de Pátio (R$)" placeholder="Opcional" keyboardType="decimal-pad" value={form.taxasPatio} onChangeText={(v) => setForm({ ...form, taxasPatio: v })} />
        <CampoTexto label="Custo de Guincho (R$)" placeholder="Opcional" keyboardType="decimal-pad" value={form.custoGuincho} onChangeText={(v) => setForm({ ...form, custoGuincho: v })} />
        <CampoTexto label="Valor de Venda (R$)" placeholder="Preencha se já vendeu" keyboardType="decimal-pad" value={form.valorVenda} onChangeText={(v) => setForm({ ...form, valorVenda: v })} />
        <CampoTexto label="Observações" placeholder="Opcional" value={form.observacoes} onChangeText={(v) => setForm({ ...form, observacoes: v })} />
      </FormularioModal>
    </>
  );
}
