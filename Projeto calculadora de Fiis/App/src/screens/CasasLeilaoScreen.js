import React, { useState } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../components/FormularioModal';
import { listarCasasLeilao, criarCasaLeilao, atualizarCasaLeilao, excluirCasaLeilao } from '../api/leilao';
import { formatarMoeda } from '../utils/formatadores';
import { colors } from '../theme/colors';
import { useLista } from '../hooks/useLista';

const STATUS = ['Em Desocupação', 'Em Regularização', 'Em Reforma', 'Anunciado', 'Vendido'];
const TIPOS = ['Casa', 'Apartamento', 'Terreno', 'Comercial', 'Rural', 'Outro'];
const FORM_VAZIO = { endereco: '', cidade: '', uf: '', tipoImovel: 'Casa', status: 'Em Desocupação', valorArremate: '', comissaoPct: '5', custasProcessuais: '', custoDesocupacao: '', valorVenda: '', observacoes: '' };

export default function CasasLeilaoScreen() {
  const { dados, carregando, erro, carregar } = useLista(listarCasasLeilao);
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
      endereco: item.endereco,
      cidade: item.cidade || '',
      uf: item.uf || '',
      tipoImovel: item.tipoImovel,
      status: item.status,
      valorArremate: String(item.valorArremate),
      comissaoPct: String(item.comissaoPct),
      custasProcessuais: String(item.custasProcessuais),
      custoDesocupacao: String(item.custoDesocupacao),
      valorVenda: item.valorVenda != null ? String(item.valorVenda) : '',
      observacoes: item.observacoes || ''
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.endereco.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o endereço do imóvel.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        endereco: form.endereco.trim(),
        cidade: form.cidade.trim() || null,
        uf: form.uf.trim() || null,
        tipoImovel: form.tipoImovel,
        status: form.status,
        dataCompra: itemEditando ? itemEditando.dataCompra : new Date().toISOString(),
        valorArremate: Number(form.valorArremate) || 0,
        comissaoPct: Number(form.comissaoPct) || 0,
        custasProcessuais: Number(form.custasProcessuais) || 0,
        custoDesocupacao: Number(form.custoDesocupacao) || 0,
        valorVenda: form.valorVenda ? Number(form.valorVenda) : null,
        observacoes: form.observacoes.trim() || null
      };
      if (itemEditando) {
        await atualizarCasaLeilao(itemEditando.id, dadosEnvio);
      } else {
        await criarCasaLeilao(dadosEnvio);
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
    Alert.alert('Excluir Imóvel', `Remover o imóvel "${itemEditando.endereco}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirCasaLeilao(itemEditando.id);
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
        titulo="Casas de Leilão"
        buscar={listarCasasLeilao}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhum imóvel cadastrado ainda. Toque no + para adicionar."
        renderItem={({ item }) => {
          const vendido = item.status === 'Vendido';
          return (
            <TouchableOpacity onPress={() => abrirEdicao(item)}>
              <CartaoItem
                titulo={item.endereco}
                tag={item.status}
                linhas={[`${item.tipoImovel} · custo total: ${formatarMoeda(item.custoTotal)}`]}
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
        titulo={itemEditando ? 'Editar Imóvel' : 'Novo Imóvel'}
        subtitulo="Total de aquisição, custo total, lucro e ROI são calculados automaticamente"
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Endereço" obrigatorio placeholder="Ex: Rua das Flores, 123" value={form.endereco} onChangeText={(v) => setForm({ ...form, endereco: v })} />
        <CampoTexto label="Cidade" placeholder="Opcional" value={form.cidade} onChangeText={(v) => setForm({ ...form, cidade: v })} />
        <CampoTexto label="UF" placeholder="Ex: SP" autoCapitalize="characters" maxLength={2} value={form.uf} onChangeText={(v) => setForm({ ...form, uf: v })} />
        <CampoSelect label="Tipo de Imóvel" valor={form.tipoImovel} onValorChange={(v) => setForm({ ...form, tipoImovel: v })} opcoes={TIPOS} />
        <CampoSelect label="Status" valor={form.status} onValorChange={(v) => setForm({ ...form, status: v })} opcoes={STATUS} />
        <CampoTexto label="Valor do Arremate (R$)" placeholder="Ex: 150000" keyboardType="decimal-pad" value={form.valorArremate} onChangeText={(v) => setForm({ ...form, valorArremate: v })} />
        <CampoTexto label="Comissão do Leiloeiro (%)" placeholder="Ex: 5" keyboardType="decimal-pad" value={form.comissaoPct} onChangeText={(v) => setForm({ ...form, comissaoPct: v })} />
        <CampoTexto label="Custas Processuais (R$)" placeholder="Opcional" keyboardType="decimal-pad" value={form.custasProcessuais} onChangeText={(v) => setForm({ ...form, custasProcessuais: v })} />
        <CampoTexto label="Custo de Desocupação (R$)" placeholder="Opcional" keyboardType="decimal-pad" value={form.custoDesocupacao} onChangeText={(v) => setForm({ ...form, custoDesocupacao: v })} />
        <CampoTexto label="Valor de Venda (R$)" placeholder="Preencha se já vendeu" keyboardType="decimal-pad" value={form.valorVenda} onChangeText={(v) => setForm({ ...form, valorVenda: v })} />
        <CampoTexto label="Observações" placeholder="Opcional" value={form.observacoes} onChangeText={(v) => setForm({ ...form, observacoes: v })} />
      </FormularioModal>
    </>
  );
}
