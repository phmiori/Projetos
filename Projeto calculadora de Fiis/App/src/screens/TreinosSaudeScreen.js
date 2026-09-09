import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { colors } from '../theme/colors';
import BotaoFab from '../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect, CampoData } from '../components/FormularioModal';
import {
  listarBlocosTreino, criarBlocoTreino, atualizarBlocoTreino, excluirBlocoTreino,
  criarExercicio, atualizarExercicio, excluirExercicio,
  listarRegistrosSaude, criarRegistroSaude, atualizarRegistroSaude, excluirRegistroSaude
} from '../api/treinosSaude';
import { formatarData } from '../utils/formatadores';

const DIAS = ['Sem dia definido', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const BLOCO_VAZIO = { nome: '', diaSemana: 'Sem dia definido', observacoes: '' };
const EXERCICIO_VAZIO = { nome: '', series: '', repeticoes: '', carga: '', observacoes: '' };
const SAUDE_VAZIO = { data: new Date().toISOString(), peso: '', cintura: '', aguaMl: '', sonoHoras: '', observacoes: '' };

export default function TreinosSaudeScreen() {
  const [blocos, setBlocos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');

  const [modalBlocoAberto, setModalBlocoAberto] = useState(false);
  const [blocoEditando, setBlocoEditando] = useState(null);
  const [formBloco, setFormBloco] = useState(BLOCO_VAZIO);
  const [salvandoBloco, setSalvandoBloco] = useState(false);

  const [modalExerciciosAberto, setModalExerciciosAberto] = useState(false);
  const [blocoSelecionado, setBlocoSelecionado] = useState(null);
  const [modalExercicioAberto, setModalExercicioAberto] = useState(false);
  const [exercicioEditando, setExercicioEditando] = useState(null);
  const [formExercicio, setFormExercicio] = useState(EXERCICIO_VAZIO);
  const [salvandoExercicio, setSalvandoExercicio] = useState(false);

  const [modalSaudeAberto, setModalSaudeAberto] = useState(false);
  const [registroEditando, setRegistroEditando] = useState(null);
  const [formSaude, setFormSaude] = useState(SAUDE_VAZIO);
  const [salvandoSaude, setSalvandoSaude] = useState(false);

  async function carregar() {
    try {
      setErro('');
      const [bl, reg] = await Promise.all([listarBlocosTreino(), listarRegistrosSaude()]);
      setBlocos(bl);
      setRegistros(reg);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar treinos & saúde.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  React.useEffect(() => { carregar(); }, []);

  // ---------- Bloco de Treino ----------
  function abrirNovoBloco() {
    setBlocoEditando(null);
    setFormBloco(BLOCO_VAZIO);
    setModalBlocoAberto(true);
  }

  function abrirEdicaoBloco(bloco) {
    setBlocoEditando(bloco);
    setFormBloco({ nome: bloco.nome, diaSemana: bloco.diaSemana || 'Sem dia definido', observacoes: bloco.observacoes || '' });
    setModalBlocoAberto(true);
  }

  async function salvarBloco() {
    if (!formBloco.nome.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome do bloco.');
      return;
    }
    setSalvandoBloco(true);
    try {
      const dados = {
        nome: formBloco.nome.trim(),
        diaSemana: formBloco.diaSemana === 'Sem dia definido' ? null : formBloco.diaSemana,
        observacoes: formBloco.observacoes.trim() || null
      };
      if (blocoEditando) {
        await atualizarBlocoTreino(blocoEditando.id, dados);
      } else {
        await criarBlocoTreino(dados);
      }
      setModalBlocoAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o bloco.');
    } finally {
      setSalvandoBloco(false);
    }
  }

  function confirmarExclusaoBloco() {
    Alert.alert('Excluir Bloco', `Remover "${blocoEditando.nome}" e todos os seus exercícios?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirBlocoTreino(blocoEditando.id);
            setModalBlocoAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  // ---------- Exercícios (dentro de um bloco) ----------
  function abrirExerciciosDoBloco(bloco) {
    setBlocoSelecionado(bloco);
    setModalExerciciosAberto(true);
  }

  function abrirNovoExercicio() {
    setExercicioEditando(null);
    setFormExercicio(EXERCICIO_VAZIO);
    setModalExercicioAberto(true);
  }

  function abrirEdicaoExercicio(exercicio) {
    setExercicioEditando(exercicio);
    setFormExercicio({
      nome: exercicio.nome,
      series: exercicio.series != null ? String(exercicio.series) : '',
      repeticoes: exercicio.repeticoes || '',
      carga: exercicio.carga || '',
      observacoes: exercicio.observacoes || ''
    });
    setModalExercicioAberto(true);
  }

  async function salvarExercicio() {
    if (!formExercicio.nome.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o nome do exercício.');
      return;
    }
    setSalvandoExercicio(true);
    try {
      const dados = {
        nome: formExercicio.nome.trim(),
        series: formExercicio.series ? Number(formExercicio.series) : null,
        repeticoes: formExercicio.repeticoes.trim() || null,
        carga: formExercicio.carga.trim() || null,
        observacoes: formExercicio.observacoes.trim() || null
      };
      if (exercicioEditando) {
        await atualizarExercicio(exercicioEditando.id, dados);
      } else {
        await criarExercicio(blocoSelecionado.id, dados);
      }
      setModalExercicioAberto(false);
      await carregar();
      const atualizado = (await listarBlocosTreino()).find((b) => b.id === blocoSelecionado.id);
      if (atualizado) setBlocoSelecionado(atualizado);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o exercício.');
    } finally {
      setSalvandoExercicio(false);
    }
  }

  function confirmarExclusaoExercicio() {
    Alert.alert('Excluir Exercício', `Remover "${exercicioEditando.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirExercicio(exercicioEditando.id);
            setModalExercicioAberto(false);
            await carregar();
            const atualizado = (await listarBlocosTreino()).find((b) => b.id === blocoSelecionado.id);
            if (atualizado) setBlocoSelecionado(atualizado);
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  // ---------- Registro de Saúde ----------
  function abrirNovoRegistro() {
    setRegistroEditando(null);
    setFormSaude(SAUDE_VAZIO);
    setModalSaudeAberto(true);
  }

  function abrirEdicaoRegistro(registro) {
    setRegistroEditando(registro);
    setFormSaude({
      data: registro.data,
      peso: registro.peso != null ? String(registro.peso) : '',
      cintura: registro.cintura != null ? String(registro.cintura) : '',
      aguaMl: registro.aguaMl != null ? String(registro.aguaMl) : '',
      sonoHoras: registro.sonoHoras != null ? String(registro.sonoHoras) : '',
      observacoes: registro.observacoes || ''
    });
    setModalSaudeAberto(true);
  }

  async function salvarRegistro() {
    setSalvandoSaude(true);
    try {
      const dados = {
        data: formSaude.data,
        peso: formSaude.peso ? Number(formSaude.peso) : null,
        cintura: formSaude.cintura ? Number(formSaude.cintura) : null,
        aguaMl: formSaude.aguaMl ? Number(formSaude.aguaMl) : null,
        sonoHoras: formSaude.sonoHoras ? Number(formSaude.sonoHoras) : null,
        observacoes: formSaude.observacoes.trim() || null
      };
      if (registroEditando) {
        await atualizarRegistroSaude(registroEditando.id, dados);
      } else {
        await criarRegistroSaude(dados);
      }
      setModalSaudeAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o registro.');
    } finally {
      setSalvandoSaude(false);
    }
  }

  function confirmarExclusaoRegistro() {
    Alert.alert('Excluir Registro', 'Remover este registro de saúde?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirRegistroSaude(registroEditando.id);
            setModalSaudeAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  if (carregando) {
    return (
      <SafeAreaView style={[estilos.container, estilos.centralizado]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  const ultimoRegistro = registros[0];

  return (
    <SafeAreaView style={estilos.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} tintColor={colors.accent} />}>
        <Text style={estilos.titulo}>Treinos & Saúde</Text>
        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}

        <View style={estilos.secaoCabecalho}>
          <Text style={estilos.secaoTitulo}>Blocos de Treino</Text>
          <TouchableOpacity onPress={abrirNovoBloco}><Text style={estilos.addTexto}>+ Novo</Text></TouchableOpacity>
        </View>
        {blocos.length === 0 ? (
          <Text style={estilos.vazio}>Nenhum bloco cadastrado ainda.</Text>
        ) : (
          blocos.map((b) => (
            <TouchableOpacity key={b.id} style={estilos.card} onPress={() => abrirEdicaoBloco(b)}>
              <Text style={estilos.cardTitulo}>{b.nome}</Text>
              <Text style={estilos.cardLinha}>
                {b.diaSemana || 'Sem dia definido'} · {b.exercicios.length} exercício{b.exercicios.length === 1 ? '' : 's'}
              </Text>
              <TouchableOpacity onPress={() => abrirExerciciosDoBloco(b)}>
                <Text style={estilos.linkExercicios}>Ver / gerenciar exercícios →</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}

        <View style={[estilos.secaoCabecalho, { marginTop: 20 }]}>
          <Text style={estilos.secaoTitulo}>Registros de Saúde</Text>
          <TouchableOpacity onPress={abrirNovoRegistro}><Text style={estilos.addTexto}>+ Novo</Text></TouchableOpacity>
        </View>
        {!ultimoRegistro ? (
          <Text style={estilos.vazio}>Nenhum registro cadastrado ainda.</Text>
        ) : (
          registros.slice(0, 10).map((r) => (
            <TouchableOpacity key={r.id} style={estilos.card} onPress={() => abrirEdicaoRegistro(r)}>
              <Text style={estilos.cardLinha}>{formatarData(r.data)}</Text>
              {r.peso != null && <Text style={estilos.cardLinha}>Peso: {r.peso} kg</Text>}
              {r.aguaMl != null && <Text style={estilos.cardLinha}>Água: {r.aguaMl} ml</Text>}
              {r.sonoHoras != null && <Text style={estilos.cardLinha}>Sono: {r.sonoHoras}h</Text>}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Modal: Bloco de Treino */}
      <FormularioModal
        visivel={modalBlocoAberto}
        titulo={blocoEditando ? `Editar ${blocoEditando.nome}` : 'Novo Bloco de Treino'}
        onFechar={() => setModalBlocoAberto(false)}
        onSalvar={salvarBloco}
        onExcluir={blocoEditando ? confirmarExclusaoBloco : undefined}
        salvando={salvandoBloco}
      >
        <CampoTexto label="Nome do Bloco" obrigatorio placeholder="Ex: Treino A - Peito e Tríceps" value={formBloco.nome} onChangeText={(v) => setFormBloco({ ...formBloco, nome: v })} />
        <CampoSelect label="Dia da Semana" valor={formBloco.diaSemana} onValorChange={(v) => setFormBloco({ ...formBloco, diaSemana: v })} opcoes={DIAS} />
        <CampoTexto label="Observações" placeholder="Opcional" value={formBloco.observacoes} onChangeText={(v) => setFormBloco({ ...formBloco, observacoes: v })} />
      </FormularioModal>

      {/* Modal: Lista de Exercícios de um Bloco */}
      <FormularioModal
        visivel={modalExerciciosAberto}
        titulo={blocoSelecionado ? `Exercícios: ${blocoSelecionado.nome}` : 'Exercícios'}
        onFechar={() => setModalExerciciosAberto(false)}
        onSalvar={abrirNovoExercicio}
        textoSalvar="+ Adicionar Exercício"
      >
        {blocoSelecionado?.exercicios?.length === 0 && <Text style={estilos.vazio}>Nenhum exercício ainda.</Text>}
        {blocoSelecionado?.exercicios?.map((ex) => (
          <TouchableOpacity key={ex.id} style={estilos.card} onPress={() => abrirEdicaoExercicio(ex)}>
            <Text style={estilos.cardTitulo}>{ex.nome}</Text>
            <Text style={estilos.cardLinha}>{[ex.series ? `${ex.series} séries` : null, ex.repeticoes, ex.carga].filter(Boolean).join(' · ')}</Text>
          </TouchableOpacity>
        ))}
      </FormularioModal>

      {/* Modal: Formulário de Exercício (criar/editar) */}
      <FormularioModal
        visivel={modalExercicioAberto}
        titulo={exercicioEditando ? `Editar ${exercicioEditando.nome}` : 'Novo Exercício'}
        onFechar={() => setModalExercicioAberto(false)}
        onSalvar={salvarExercicio}
        onExcluir={exercicioEditando ? confirmarExclusaoExercicio : undefined}
        salvando={salvandoExercicio}
      >
        <CampoTexto label="Nome do Exercício" obrigatorio placeholder="Ex: Supino Reto" value={formExercicio.nome} onChangeText={(v) => setFormExercicio({ ...formExercicio, nome: v })} />
        <CampoTexto label="Séries" placeholder="Ex: 4" keyboardType="numeric" value={formExercicio.series} onChangeText={(v) => setFormExercicio({ ...formExercicio, series: v })} />
        <CampoTexto label="Repetições" placeholder="Ex: 10-12" value={formExercicio.repeticoes} onChangeText={(v) => setFormExercicio({ ...formExercicio, repeticoes: v })} />
        <CampoTexto label="Carga" placeholder="Ex: 40kg" value={formExercicio.carga} onChangeText={(v) => setFormExercicio({ ...formExercicio, carga: v })} />
        <CampoTexto label="Observações" placeholder="Opcional" value={formExercicio.observacoes} onChangeText={(v) => setFormExercicio({ ...formExercicio, observacoes: v })} />
      </FormularioModal>

      {/* Modal: Registro de Saúde */}
      <FormularioModal
        visivel={modalSaudeAberto}
        titulo={registroEditando ? 'Editar Registro' : 'Novo Registro de Saúde'}
        onFechar={() => setModalSaudeAberto(false)}
        onSalvar={salvarRegistro}
        onExcluir={registroEditando ? confirmarExclusaoRegistro : undefined}
        salvando={salvandoSaude}
      >
        <CampoData label="Data" obrigatorio valor={formSaude.data} onValorChange={(v) => setFormSaude({ ...formSaude, data: v })} />
        <CampoTexto label="Peso (kg)" placeholder="Opcional" keyboardType="decimal-pad" value={formSaude.peso} onChangeText={(v) => setFormSaude({ ...formSaude, peso: v })} />
        <CampoTexto label="Cintura (cm)" placeholder="Opcional" keyboardType="decimal-pad" value={formSaude.cintura} onChangeText={(v) => setFormSaude({ ...formSaude, cintura: v })} />
        <CampoTexto label="Água (ml)" placeholder="Opcional" keyboardType="numeric" value={formSaude.aguaMl} onChangeText={(v) => setFormSaude({ ...formSaude, aguaMl: v })} />
        <CampoTexto label="Sono (horas)" placeholder="Opcional" keyboardType="decimal-pad" value={formSaude.sonoHoras} onChangeText={(v) => setFormSaude({ ...formSaude, sonoHoras: v })} />
        <CampoTexto label="Observações" placeholder="Opcional" value={formSaude.observacoes} onChangeText={(v) => setFormSaude({ ...formSaude, observacoes: v })} />
      </FormularioModal>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain, paddingHorizontal: 16, paddingTop: 16 },
  centralizado: { justifyContent: 'center' },
  titulo: { color: colors.textMain, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  erro: { color: colors.expense, marginBottom: 12 },
  vazio: { color: colors.textSub, marginBottom: 10 },
  secaoCabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  secaoTitulo: { color: colors.textMain, fontWeight: '700', fontSize: 16 },
  addTexto: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10
  },
  cardTitulo: { color: colors.accent, fontWeight: '800', fontSize: 15, marginBottom: 4 },
  cardLinha: { color: colors.textSub, fontSize: 13, marginBottom: 2 },
  linkExercicios: { color: colors.accent, fontSize: 12, marginTop: 6, fontWeight: '600' }
});
