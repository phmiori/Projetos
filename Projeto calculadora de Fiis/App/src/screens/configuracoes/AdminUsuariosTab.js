import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import CartaoItem from '../../components/CartaoItem';
import BotaoFab from '../../components/BotaoFab';
import FormularioModal, { CampoTexto, CampoSelect } from '../../components/FormularioModal';
import { listarUsuarios, criarUsuario, atualizarUsuario, redefinirSenhaUsuario, excluirUsuario } from '../../api/auth';
import { useLista } from '../../hooks/useLista';
import { useAuth } from '../../context/AuthContext';

const CARGOS = [{ label: 'Usuário Comum', value: 'usuario' }, { label: 'Administrador', value: 'admin' }];
const FORM_VAZIO = { username: '', nome: '', senha: '', role: 'usuario' };

export default function AdminUsuariosTab() {
  const { usuario: usuarioLogado } = useAuth();
  const { dados, erro, carregar } = useLista(listarUsuarios);

  const [modalAberto, setModalAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  function abrirNovo() {
    setItemEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setItemEditando(item);
    setForm({ username: item.username, nome: item.nome, senha: '', role: item.role });
    setModalAberto(true);
  }

  async function salvar() {
    if (!form.username.trim() || !form.nome.trim() || (!itemEditando && !form.senha)) {
      Alert.alert('Campos obrigatórios', 'Informe usuário, nome' + (itemEditando ? '' : ' e senha') + '.');
      return;
    }
    setSalvando(true);
    try {
      if (itemEditando) {
        await atualizarUsuario(itemEditando.id, { username: form.username.trim(), nome: form.nome.trim(), role: form.role });
      } else {
        await criarUsuario({ username: form.username.trim(), nome: form.nome.trim(), senha: form.senha, role: form.role });
      }
      setModalAberto(false);
      carregar();
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirRedefinirSenha() {
    setNovaSenha('');
    setModalSenhaAberto(true);
  }

  async function salvarNovaSenha() {
    if (!novaSenha || novaSenha.length < 4) {
      Alert.alert('Senha inválida', 'A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }
    setSalvandoSenha(true);
    try {
      await redefinirSenhaUsuario(itemEditando.id, novaSenha);
      setModalSenhaAberto(false);
      Alert.alert('Sucesso', `Senha de ${itemEditando.nome} redefinida.`);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível redefinir a senha.');
    } finally {
      setSalvandoSenha(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir Usuário', `Excluir "${itemEditando.nome}"? Todos os dados cadastrados por ele serão apagados permanentemente.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirUsuario(itemEditando.id);
            setModalAberto(false);
            carregar();
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  const podeExcluir = itemEditando && itemEditando.id !== usuarioLogado?.id;

  return (
    <View style={{ marginTop: 8 }}>
      {(dados || []).map((item) => (
        <TouchableOpacity key={item.id} onPress={() => abrirEdicao(item)}>
          <CartaoItem titulo={item.nome} tag={item.role === 'admin' ? 'Administrador' : 'Usuário'} linhas={[`@${item.username}`]} />
        </TouchableOpacity>
      ))}
      {(dados || []).length === 0 && !erro && <CartaoItem titulo="Nenhum usuário encontrado" />}

      <TouchableOpacity onPress={abrirNovo} style={{ marginTop: 4 }}>
        <CartaoItem titulo="+ Novo Usuário" />
      </TouchableOpacity>

      <FormularioModal
        visivel={modalAberto}
        titulo={itemEditando ? `Editar ${itemEditando.nome}` : 'Novo Usuário'}
        onFechar={() => setModalAberto(false)}
        onSalvar={salvar}
        onExcluir={podeExcluir ? confirmarExclusao : undefined}
        salvando={salvando}
      >
        <CampoTexto label="Nome" obrigatorio value={form.nome} onChangeText={(v) => setForm({ ...form, nome: v })} />
        <CampoTexto label="Usuário (login)" obrigatorio autoCapitalize="none" value={form.username} onChangeText={(v) => setForm({ ...form, username: v })} />
        {!itemEditando && (
          <CampoTexto label="Senha" obrigatorio secureTextEntry value={form.senha} onChangeText={(v) => setForm({ ...form, senha: v })} />
        )}
        <CampoSelect label="Cargo" valor={form.role} onValorChange={(v) => setForm({ ...form, role: v })} opcoes={CARGOS} />
        {itemEditando && (
          <TouchableOpacity onPress={abrirRedefinirSenha} style={{ marginTop: 4 }}>
            <CartaoItem titulo="Redefinir Senha" />
          </TouchableOpacity>
        )}
      </FormularioModal>

      <FormularioModal
        visivel={modalSenhaAberto}
        titulo={`Redefinir Senha de ${itemEditando?.nome || ''}`}
        onFechar={() => setModalSenhaAberto(false)}
        onSalvar={salvarNovaSenha}
        salvando={salvandoSenha}
      >
        <CampoTexto label="Nova Senha" obrigatorio secureTextEntry value={novaSenha} onChangeText={setNovaSenha} />
      </FormularioModal>
    </View>
  );
}
