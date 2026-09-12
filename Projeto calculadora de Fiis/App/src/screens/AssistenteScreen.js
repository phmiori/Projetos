import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { colors } from '../theme/colors';
import { buscarHistoricoAssistente, enviarMensagemAssistente, limparHistoricoAssistente } from '../api/assistente';

function Bolha({ papel, texto, erro, acao }) {
  const doUsuario = papel === 'usuario';
  return (
    <View style={[estilos.bolha, doUsuario ? estilos.bolhaUsuario : estilos.bolhaAssistente, erro && estilos.bolhaErro]}>
      <Text style={[estilos.bolhaTexto, doUsuario && { color: colors.accentText }]}>{texto}</Text>
      {acao && (
        <View style={estilos.tag}>
          <Text style={estilos.tagTexto}>{acao.tag}</Text>
        </View>
      )}
    </View>
  );
}

export default function AssistenteScreen() {
  const [mensagens, setMensagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const historico = await buscarHistoricoAssistente();
        setMensagens((historico || []).map((m) => ({ papel: m.papel, texto: m.conteudo })));
      } catch {
        // Sem histórico ainda (ou tabela pendente de migração no servidor) — chat começa vazio
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  function rolarParaFinal() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;

    setMensagens((atual) => [...atual, { papel: 'usuario', texto: mensagem }]);
    setTexto('');
    setEnviando(true);
    rolarParaFinal();

    try {
      const dados = await enviarMensagemAssistente(mensagem);
      setMensagens((atual) => [...atual, {
        papel: 'assistente',
        texto: dados.resposta,
        acao: dados.acao
      }]);
    } catch (err) {
      setMensagens((atual) => [...atual, { papel: 'assistente', texto: err.message || 'Não foi possível falar com o assistente agora.', erro: true }]);
    } finally {
      setEnviando(false);
      rolarParaFinal();
    }
  }

  function confirmarLimpar() {
    Alert.alert('Limpar Conversa', 'Tem certeza que deseja apagar toda a conversa com o assistente?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar',
        style: 'destructive',
        onPress: async () => {
          try {
            await limparHistoricoAssistente();
          } catch {
            // segue mesmo se falhar em apagar no servidor
          }
          setMensagens([]);
        }
      }
    ]);
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Assistente IA</Text>
        <TouchableOpacity onPress={confirmarLimpar}>
          <Text style={estilos.limparTexto}>Limpar</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {carregando ? (
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={estilos.listaMensagens} onContentSizeChange={rolarParaFinal}>
            {mensagens.length === 0 && (
              <View style={estilos.vazioBox}>
                <Text style={estilos.vazioTitulo}>Pergunte algo para começar:</Text>
                <Text style={estilos.vazioExemplo}>"Como está minha carteira de FIIs hoje?"</Text>
                <Text style={estilos.vazioExemplo}>"Onde eu poderia investir meu próximo aporte?"</Text>
                <Text style={estilos.vazioExemplo}>"Manda um resumo do meu patrimônio pro meu e-mail"</Text>
              </View>
            )}
            {mensagens.map((m, i) => <Bolha key={i} papel={m.papel} texto={m.texto} erro={m.erro} acao={m.acao} />)}
            {enviando && (
              <View style={[estilos.bolha, estilos.bolhaAssistente]}>
                <ActivityIndicator color={colors.textSub} size="small" />
              </View>
            )}
          </ScrollView>
        )}

        <View style={estilos.inputRow}>
          <TextInput
            style={estilos.input}
            placeholder="Digite sua pergunta..."
            placeholderTextColor={colors.textSub}
            value={texto}
            onChangeText={setTexto}
            multiline
          />
          <TouchableOpacity style={[estilos.botaoEnviar, (!texto.trim() || enviando) && { opacity: 0.5 }]} onPress={enviar} disabled={!texto.trim() || enviando}>
            <Text style={estilos.botaoEnviarTexto}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgMain },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12
  },
  titulo: { color: colors.textMain, fontSize: 20, fontWeight: '800' },
  limparTexto: { color: colors.textSub, fontSize: 13, fontWeight: '600' },
  listaMensagens: { padding: 16, flexGrow: 1 },
  vazioBox: { marginTop: 40, alignItems: 'center' },
  vazioTitulo: { color: colors.textMain, fontWeight: '700', marginBottom: 12 },
  vazioExemplo: {
    color: colors.textSub,
    fontSize: 12,
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6
  },
  bolha: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10
  },
  bolhaUsuario: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderBottomRightRadius: 2
  },
  bolhaAssistente: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderBottomLeftRadius: 2
  },
  bolhaErro: { borderColor: colors.expense },
  bolhaTexto: { color: colors.textMain, fontSize: 14, lineHeight: 20 },
  tag: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.bgMain,
    borderColor: colors.income,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  tagTexto: { color: colors.income, fontSize: 11 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopColor: colors.border,
    borderTopWidth: 1
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textMain,
    maxHeight: 100
  },
  botaoEnviar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  botaoEnviarTexto: { color: colors.accentText, fontSize: 18, fontWeight: '700' }
});
