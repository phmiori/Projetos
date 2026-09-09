import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, Switch, StyleSheet, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import FormularioModal, { CampoTexto } from '../components/FormularioModal';
import { alterarSenha } from '../api/auth';
import AdminUsuariosTab from './configuracoes/AdminUsuariosTab';
import { exportarBackup } from '../api/backup';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

function Linha({ rotulo, valor }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor || '—'}</Text>
    </View>
  );
}

// Mesma lista/rótulos do site (JS/Global/auth.js, `MODULOS_HUB_FINANCEIRO`)
const NEGOCIOS_HUB = [
  { chave: 'fii', nome: 'Fundos Imobiliários' },
  { chave: 'cripto', nome: 'Cripto Moedas' },
  { chave: 'leilao', nome: 'Carros de Leilão' },
  { chave: 'casasleilao', nome: 'Casas de Leilão' },
  { chave: 'cofrinho', nome: 'Cofrinho' }
];

export default function ConfiguracoesScreen() {
  const { usuario, sair, atualizarPerfil, modulosOcultos, alternarModulo } = useAuth();
  const [alternandoModulo, setAlternandoModulo] = useState(null);
  const [baixando, setBaixando] = useState(false);

  async function baixarMeusDados() {
    setBaixando(true);
    try {
      const dados = await exportarBackup();
      const arquivo = new File(Paths.cache, `financehub-backup-${Date.now()}.json`);
      arquivo.create();
      arquivo.write(JSON.stringify(dados, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(arquivo.uri);
      } else {
        Alert.alert('Backup salvo', `Arquivo salvo em: ${arquivo.uri}`);
      }
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível gerar o backup.');
    } finally {
      setBaixando(false);
    }
  }

  async function aoAlternarNegocio(chave, visivelAtual) {
    setAlternandoModulo(chave);
    try {
      await alternarModulo(chave, visivelAtual);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar a preferência.');
    } finally {
      setAlternandoModulo(null);
    }
  }

  const [modalPerfilAberto, setModalPerfilAberto] = useState(false);
  const [formPerfil, setFormPerfil] = useState({ nome: usuario?.nome || '', email: usuario?.email || '' });
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [formSenha, setFormSenha] = useState({ senhaAtual: '', novaSenha: '', confirmarSenha: '' });
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  function abrirEdicaoPerfil() {
    setFormPerfil({ nome: usuario?.nome || '', email: usuario?.email || '' });
    setModalPerfilAberto(true);
  }

  async function salvarPerfil() {
    if (!formPerfil.nome.trim()) {
      Alert.alert('Campo obrigatório', 'O nome não pode ficar em branco.');
      return;
    }
    setSalvandoPerfil(true);
    try {
      await atualizarPerfil({ nome: formPerfil.nome.trim(), email: formPerfil.email.trim() || null });
      setModalPerfilAberto(false);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o perfil.');
    } finally {
      setSalvandoPerfil(false);
    }
  }

  function abrirTrocaSenha() {
    setFormSenha({ senhaAtual: '', novaSenha: '', confirmarSenha: '' });
    setModalSenhaAberto(true);
  }

  async function salvarSenha() {
    if (!formSenha.senhaAtual || !formSenha.novaSenha) {
      Alert.alert('Campos obrigatórios', 'Informe a senha atual e a nova senha.');
      return;
    }
    if (formSenha.novaSenha !== formSenha.confirmarSenha) {
      Alert.alert('Senhas diferentes', 'A confirmação não é igual à nova senha.');
      return;
    }
    setSalvandoSenha(true);
    try {
      await alterarSenha(formSenha.senhaAtual, formSenha.novaSenha);
      setModalSenhaAberto(false);
      Alert.alert('Sucesso', 'Senha alterada com sucesso.');
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível alterar a senha.');
    } finally {
      setSalvandoSenha(false);
    }
  }

  return (
    <SafeAreaView style={estilos.container}>
      <ScrollView>
        <Text style={estilos.titulo}>Configurações</Text>

        <View style={estilos.card}>
          <Linha rotulo="Nome" valor={usuario?.nome} />
          <Linha rotulo="Usuário" valor={`@${usuario?.username}`} />
          <Linha rotulo="E-mail" valor={usuario?.email} />
          <Linha rotulo="Cargo" valor={usuario?.role === 'admin' ? 'Administrador' : 'Usuário'} />
        </View>

        <Text style={estilos.secaoTitulo}>Negócios do Hub Financeiro</Text>
        <Text style={estilos.secaoSubtitulo}>Desative para esconder um negócio do menu lateral</Text>
        <View style={estilos.card}>
          {NEGOCIOS_HUB.map((negocio) => {
            const visivel = !modulosOcultos.includes(negocio.chave);
            return (
              <View key={negocio.chave} style={estilos.linha}>
                <Text style={estilos.rotulo}>{negocio.nome}</Text>
                <Switch
                  value={visivel}
                  disabled={alternandoModulo === negocio.chave}
                  onValueChange={() => aoAlternarNegocio(negocio.chave, visivel)}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={estilos.botaoSecundario} onPress={abrirEdicaoPerfil}>
          <Text style={estilos.botaoSecundarioTexto}>Editar Perfil</Text>
        </TouchableOpacity>

        <TouchableOpacity style={estilos.botaoSecundario} onPress={abrirTrocaSenha}>
          <Text style={estilos.botaoSecundarioTexto}>Alterar Senha</Text>
        </TouchableOpacity>

        <Text style={estilos.secaoTitulo}>Meus Dados</Text>
        <TouchableOpacity style={estilos.botaoSecundario} onPress={baixarMeusDados} disabled={baixando}>
          <Text style={estilos.botaoSecundarioTexto}>{baixando ? 'Gerando...' : 'Baixar Meus Dados'}</Text>
        </TouchableOpacity>

        {usuario?.role === 'admin' && (
          <>
            <Text style={estilos.secaoTitulo}>Administração de Usuários</Text>
            <AdminUsuariosTab />
          </>
        )}

        <TouchableOpacity style={estilos.botaoSair} onPress={sair}>
          <Text style={estilos.botaoSairTexto}>Sair do Sistema</Text>
        </TouchableOpacity>
      </ScrollView>

      <FormularioModal
        visivel={modalPerfilAberto}
        titulo="Editar Perfil"
        onFechar={() => setModalPerfilAberto(false)}
        onSalvar={salvarPerfil}
        salvando={salvandoPerfil}
      >
        <CampoTexto label="Nome" obrigatorio value={formPerfil.nome} onChangeText={(v) => setFormPerfil({ ...formPerfil, nome: v })} />
        <CampoTexto label="E-mail" placeholder="Opcional" keyboardType="email-address" autoCapitalize="none" value={formPerfil.email} onChangeText={(v) => setFormPerfil({ ...formPerfil, email: v })} />
      </FormularioModal>

      <FormularioModal
        visivel={modalSenhaAberto}
        titulo="Alterar Senha"
        onFechar={() => setModalSenhaAberto(false)}
        onSalvar={salvarSenha}
        salvando={salvandoSenha}
      >
        <CampoTexto label="Senha Atual" obrigatorio secureTextEntry value={formSenha.senhaAtual} onChangeText={(v) => setFormSenha({ ...formSenha, senhaAtual: v })} />
        <CampoTexto label="Nova Senha" obrigatorio secureTextEntry value={formSenha.novaSenha} onChangeText={(v) => setFormSenha({ ...formSenha, novaSenha: v })} />
        <CampoTexto label="Confirmar Nova Senha" obrigatorio secureTextEntry value={formSenha.confirmarSenha} onChangeText={(v) => setFormSenha({ ...formSenha, confirmarSenha: v })} />
      </FormularioModal>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain, padding: 16 },
  titulo: { color: colors.textMain, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  secaoTitulo: { color: colors.textMain, fontWeight: '700', fontSize: 15, marginBottom: 2 },
  secaoSubtitulo: { color: colors.textSub, fontSize: 12, marginBottom: 10 },
  card: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    marginBottom: 20
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  rotulo: { color: colors.textSub, fontSize: 14 },
  valor: { color: colors.textMain, fontSize: 14, fontWeight: '600' },
  botaoSecundario: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12
  },
  botaoSecundarioTexto: { color: colors.textMain, fontWeight: '600' },
  botaoSair: {
    borderColor: colors.expense,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8
  },
  botaoSairTexto: { color: colors.expense, fontWeight: '700' }
});
