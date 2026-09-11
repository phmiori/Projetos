import React, { useState } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoData, CampoSelect } from '../components/FormularioModal';
import { listarVeiculosGaragem, criarVeiculoGaragem, atualizarVeiculoGaragem, excluirVeiculoGaragem, criarManutencao, atualizarManutencao, excluirManutencao } from '../api/garagem';
import { formatarMoeda, formatarData } from '../utils/formatadores';
import { useLista } from '../hooks/useLista';

const FORM_VAZIO = { marca: '', modelo: '', ano: '', placa: '', cor: '', quilometragem: '', dataCompra: new Date().toISOString(), valorCompra: '', observacoes: '' };
const CATEGORIAS_MANUTENCAO = ['Troca de Óleo', 'Troca de Pneu', 'Revisão', 'Freios', 'Suspensão', 'Bateria', 'Elétrica', 'Funilaria/Pintura', 'Documentação/IPVA', 'Outros'];
const MANUTENCAO_VAZIA = { categoria: CATEGORIAS_MANUTENCAO[0], descricao: '', valor: '', oficina: '', quilometragem: '', data: new Date().toISOString() };

export default function GaragemScreen() {
  const { dados, carregando, erro, carregar } = useLista(listarVeiculosGaragem);
  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [modalManutencoesAberto, setModalManutencoesAberto] = useState(false);
  const [modalManutencaoFormAberto, setModalManutencaoFormAberto] = useState(false);
  const [manutencaoEditando, setManutencaoEditando] = useState(null);
  const [formManutencao, setFormManutencao] = useState(MANUTENCAO_VAZIA);
  const [salvandoManutencao, setSalvandoManutencao] = useState(false);

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
      placa: item.placa || '',
      cor: item.cor || '',
      quilometragem: item.quilometragem != null ? String(item.quilometragem) : '',
      dataCompra: item.dataCompra,
      valorCompra: String(item.valorCompra),
      observacoes: item.observacoes || ''
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.marca.trim() || !form.modelo.trim() || !form.dataCompra) {
      Alert.alert('Campos obrigatórios', 'Informe marca, modelo e data de compra.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        ano: Number(form.ano) || new Date().getFullYear(),
        placa: form.placa.trim() || null,
        cor: form.cor.trim() || null,
        quilometragem: form.quilometragem ? Number(form.quilometragem) : null,
        dataCompra: form.dataCompra,
        valorCompra: Number(form.valorCompra) || 0,
        observacoes: form.observacoes.trim() || null
      };
      if (itemEditando) {
        await atualizarVeiculoGaragem(itemEditando.id, dadosEnvio);
      } else {
        await criarVeiculoGaragem(dadosEnvio);
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
    Alert.alert('Excluir Veículo', `Remover ${itemEditando.marca} ${itemEditando.modelo} e todo o histórico de manutenções?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirVeiculoGaragem(itemEditando.id);
            setModalAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  function abrirNovaManutencao() {
    setManutencaoEditando(null);
    setFormManutencao(MANUTENCAO_VAZIA);
    setModalManutencaoFormAberto(true);
  }

  function abrirEdicaoManutencao(m) {
    setManutencaoEditando(m);
    setFormManutencao({
      categoria: m.categoria,
      descricao: m.descricao,
      valor: String(m.valor),
      oficina: m.oficina || '',
      quilometragem: m.quilometragem != null ? String(m.quilometragem) : '',
      data: m.data
    });
    setModalManutencaoFormAberto(true);
  }

  function aoAtualizarVeiculoManutencoes(veiculoAtualizado) {
    if (veiculoAtualizado) setItemEditando(veiculoAtualizado);
    carregar();
  }

  async function salvarManutencao() {
    if (!formManutencao.descricao.trim() || !formManutencao.valor) {
      Alert.alert('Campos obrigatórios', 'Informe descrição e valor.');
      return;
    }
    setSalvandoManutencao(true);
    try {
      const dadosEnvio = {
        categoria: formManutencao.categoria,
        descricao: formManutencao.descricao.trim(),
        valor: Number(formManutencao.valor),
        oficina: formManutencao.oficina.trim() || null,
        quilometragem: formManutencao.quilometragem ? Number(formManutencao.quilometragem) : null,
        data: formManutencao.data
      };
      if (manutencaoEditando) {
        await atualizarManutencao(manutencaoEditando.id, dadosEnvio);
        aoAtualizarVeiculoManutencoes({
          ...itemEditando,
          manutencoes: itemEditando.manutencoes.map((m) => (m.id === manutencaoEditando.id ? { ...m, ...dadosEnvio } : m))
        });
      } else {
        const resultado = await criarManutencao(itemEditando.id, dadosEnvio);
        aoAtualizarVeiculoManutencoes(resultado.veiculo);
      }
      setModalManutencaoFormAberto(false);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar a manutenção.');
    } finally {
      setSalvandoManutencao(false);
    }
  }

  function confirmarExclusaoManutencao() {
    Alert.alert('Excluir Manutenção', `Remover "${manutencaoEditando.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirManutencao(manutencaoEditando.id);
            aoAtualizarVeiculoManutencoes({
              ...itemEditando,
              manutencoes: itemEditando.manutencoes.filter((m) => m.id !== manutencaoEditando.id)
            });
            setModalManutencaoFormAberto(false);
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
        titulo="Garagem"
        buscar={listarVeiculosGaragem}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhum veículo cadastrado ainda. Toque no + para adicionar."
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => abrirEdicao(item)}>
            <CartaoItem
              titulo={`${item.marca} ${item.modelo} (${item.ano})`}
              tag={item.status}
              linhas={[item.placa || 'Sem placa cadastrada']}
              valor={formatarMoeda(item.valorCompra)}
            />
          </TouchableOpacity>
        )}
        fab={<BotaoFab onPress={abrirNovo} />}
      />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.marca} ${itemEditando.modelo}` : 'Novo Veículo'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Marca" obrigatorio placeholder="Ex: Toyota" value={form.marca} onChangeText={(v) => setForm({ ...form, marca: v })} />
        <CampoTexto label="Modelo" obrigatorio placeholder="Ex: Corolla" value={form.modelo} onChangeText={(v) => setForm({ ...form, modelo: v })} />
        <CampoTexto label="Ano" placeholder="Ex: 2022" keyboardType="numeric" value={form.ano} onChangeText={(v) => setForm({ ...form, ano: v })} />
        <CampoTexto label="Placa" placeholder="Opcional" autoCapitalize="characters" value={form.placa} onChangeText={(v) => setForm({ ...form, placa: v })} />
        <CampoTexto label="Cor" placeholder="Opcional" value={form.cor} onChangeText={(v) => setForm({ ...form, cor: v })} />
        <CampoTexto label="Quilometragem" placeholder="Opcional" keyboardType="numeric" value={form.quilometragem} onChangeText={(v) => setForm({ ...form, quilometragem: v })} />
        <CampoData label="Data de Compra" obrigatorio valor={form.dataCompra} onValorChange={(v) => setForm({ ...form, dataCompra: v })} />
        <CampoTexto label="Valor de Compra (R$)" placeholder="Ex: 85000" keyboardType="decimal-pad" value={form.valorCompra} onChangeText={(v) => setForm({ ...form, valorCompra: v })} />
        <CampoTexto label="Observações" placeholder="Opcional" value={form.observacoes} onChangeText={(v) => setForm({ ...form, observacoes: v })} />

        {itemEditando && (
          <TouchableOpacity onPress={() => setModalManutencoesAberto(true)}>
            <CartaoItem titulo="Ver Manutenções" linhas={[`${itemEditando.manutencoes?.length || 0} lançamento(s)`]} />
          </TouchableOpacity>
        )}
      </FormularioModal>

      {itemEditando && (
        <FormularioModal
          visivel={modalManutencoesAberto}
          titulo={`Manutenções: ${itemEditando.marca} ${itemEditando.modelo}`}
          onFechar={() => setModalManutencoesAberto(false)}
          onSalvar={abrirNovaManutencao}
          textoSalvar="+ Nova Manutenção"
        >
          {(itemEditando.manutencoes || []).length === 0 && <CartaoItem titulo="Nenhuma manutenção lançada ainda" />}
          {(itemEditando.manutencoes || []).map((m) => (
            <TouchableOpacity key={m.id} onPress={() => abrirEdicaoManutencao(m)}>
              <CartaoItem titulo={m.descricao} tag={m.categoria} linhas={[formatarData(m.data), m.oficina].filter(Boolean)} valor={formatarMoeda(m.valor)} />
            </TouchableOpacity>
          ))}
        </FormularioModal>
      )}

      <FormularioModal
        visivel={modalManutencaoFormAberto}
        titulo={manutencaoEditando ? 'Editar Manutenção' : 'Nova Manutenção'}
        onFechar={() => setModalManutencaoFormAberto(false)}
        onSalvar={salvarManutencao}
        onExcluir={manutencaoEditando ? confirmarExclusaoManutencao : undefined}
        salvando={salvandoManutencao}
      >
        <CampoTexto label="Descrição" obrigatorio placeholder="Ex: Troca de óleo 0W20" value={formManutencao.descricao} onChangeText={(v) => setFormManutencao({ ...formManutencao, descricao: v })} />
        <CampoSelect label="Categoria" valor={formManutencao.categoria} onValorChange={(v) => setFormManutencao({ ...formManutencao, categoria: v })} opcoes={CATEGORIAS_MANUTENCAO} />
        <CampoTexto label="Valor (R$)" obrigatorio placeholder="Ex: 250" keyboardType="decimal-pad" value={formManutencao.valor} onChangeText={(v) => setFormManutencao({ ...formManutencao, valor: v })} />
        <CampoTexto label="Oficina" placeholder="Opcional" value={formManutencao.oficina} onChangeText={(v) => setFormManutencao({ ...formManutencao, oficina: v })} />
        <CampoTexto label="Quilometragem" placeholder="Opcional" keyboardType="numeric" value={formManutencao.quilometragem} onChangeText={(v) => setFormManutencao({ ...formManutencao, quilometragem: v })} />
        <CampoData label="Data" valor={formManutencao.data} onValorChange={(v) => setFormManutencao({ ...formManutencao, data: v })} />
      </FormularioModal>
    </>
  );
}
