import React, { useState } from 'react';
import { TouchableOpacity, Alert } from 'react-native';
import ListaTela from '../components/ListaTela';
import CartaoItem from '../components/CartaoItem';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoData, CampoSwitch } from '../components/FormularioModal';
import { listarEventos, criarEvento, atualizarEvento, excluirEvento } from '../api/eventos';
import { formatarDataHora, formatarData } from '../utils/formatadores';
import { useLista } from '../hooks/useLista';

function novoHorarioPadrao() {
  const agora = new Date();
  agora.setMinutes(0, 0, 0);
  agora.setHours(agora.getHours() + 1);
  const fim = new Date(agora.getTime() + 60 * 60 * 1000);
  return { inicio: agora.toISOString(), fim: fim.toISOString() };
}

function formVazio() {
  const { inicio, fim } = novoHorarioPadrao();
  return { titulo: '', descricao: '', local: '', inicio, fim, diaTodo: false };
}

export default function CalendarioScreen() {
  const { dados, carregando, erro, carregar } = useLista(listarEventos);
  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [form, setForm] = useState(formVazio());
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setItemEditando(null);
    setForm(formVazio());
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setItemEditando(item);
    setForm({
      titulo: item.titulo,
      descricao: item.descricao || '',
      local: item.local || '',
      inicio: item.inicio,
      fim: item.fim,
      diaTodo: item.diaTodo
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o título do evento.');
      return;
    }
    if (new Date(form.fim) < new Date(form.inicio)) {
      Alert.alert('Datas inválidas', 'O fim não pode ser antes do início.');
      return;
    }
    setSalvando(true);
    try {
      const dadosEnvio = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        local: form.local.trim() || null,
        inicio: form.inicio,
        fim: form.fim,
        diaTodo: form.diaTodo
      };
      if (itemEditando) {
        await atualizarEvento(itemEditando.id, dadosEnvio);
      } else {
        await criarEvento(dadosEnvio);
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
    Alert.alert('Excluir Evento', `Remover o evento "${itemEditando.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirEvento(itemEditando.id);
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
        titulo="Calendário"
        buscar={listarEventos}
        keyExtractor={(item) => String(item.id)}
        vazio="Nenhum evento cadastrado ainda. Toque no + para adicionar."
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => abrirEdicao(item)}>
            <CartaoItem
              titulo={item.titulo}
              linhas={[item.diaTodo ? formatarData(item.inicio) : formatarDataHora(item.inicio), item.local].filter(Boolean)}
            />
          </TouchableOpacity>
        )}
        fab={<BotaoFab onPress={abrirNovo} />}
      />

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? 'Editar Evento' : 'Novo Evento'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={itemEditando ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Título" obrigatorio placeholder="Ex: Reunião" value={form.titulo} onChangeText={(v) => setForm({ ...form, titulo: v })} />
        <CampoSwitch label="Dia todo" valor={form.diaTodo} onValorChange={(v) => setForm({ ...form, diaTodo: v })} />
        <CampoData label="Início" obrigatorio modo={form.diaTodo ? 'date' : 'datetime'} valor={form.inicio} onValorChange={(v) => setForm({ ...form, inicio: v })} />
        <CampoData label="Fim" obrigatorio modo={form.diaTodo ? 'date' : 'datetime'} valor={form.fim} onValorChange={(v) => setForm({ ...form, fim: v })} />
        <CampoTexto label="Local" placeholder="Opcional" value={form.local} onChangeText={(v) => setForm({ ...form, local: v })} />
        <CampoTexto label="Descrição" placeholder="Opcional" multiline value={form.descricao} onChangeText={(v) => setForm({ ...form, descricao: v })} />
      </FormularioModal>
    </>
  );
}
