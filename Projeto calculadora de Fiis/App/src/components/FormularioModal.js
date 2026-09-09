import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';
import { formatarData, formatarDataHora } from '../utils/formatadores';

/**
 * src/components/FormularioModal.js
 * Modal de cadastro/edição componentizado — usado por todos os módulos com CRUD (mesmo
 * padrão do site: "Adicionar/Editar X"). Botão "Excluir" só aparece em modo de edição
 * (quando `onExcluir` é passado).
 */
export default function FormularioModal({ visivel, titulo, subtitulo, onFechar, onSalvar, onExcluir, salvando, children }) {
  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={onFechar}>
      <KeyboardAvoidingView style={estilos.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={estilos.caixa}>
          <View style={estilos.cabecalho}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.titulo}>{titulo}</Text>
              {subtitulo ? <Text style={estilos.subtitulo}>{subtitulo}</Text> : null}
            </View>
            <TouchableOpacity onPress={onFechar} style={estilos.fecharBtn}>
              <Text style={estilos.fecharTexto}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={estilos.corpo} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>

          <View style={estilos.rodape}>
            {onExcluir ? (
              <TouchableOpacity style={estilos.btnExcluir} onPress={onExcluir}>
                <Text style={estilos.btnExcluirTexto}>Excluir</Text>
              </TouchableOpacity>
            ) : <View />}
            <TouchableOpacity style={[estilos.btnSalvar, salvando && { opacity: 0.6 }]} onPress={onSalvar} disabled={salvando}>
              <Text style={estilos.btnSalvarTexto}>{salvando ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function CampoTexto({ label, obrigatorio, ...props }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.label}>{label}{obrigatorio ? ' *' : ''}</Text>
      <TextInput style={estilos.input} placeholderTextColor={colors.textSub} {...props} />
    </View>
  );
}

export function CampoSelect({ label, valor, onValorChange, opcoes }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.label}>{label}</Text>
      <View style={estilos.selectBox}>
        <Picker selectedValue={valor} onValueChange={onValorChange} style={{ color: colors.textMain }} dropdownIconColor={colors.textMain}>
          {opcoes.map((op) => (
            <Picker.Item key={op} label={op} value={op} color={Platform.OS === 'android' ? colors.textMain : undefined} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

export function CampoSwitch({ label, valor, onValorChange }) {
  return (
    <View style={[estilos.campo, estilos.linhaSwitch]}>
      <Text style={estilos.label}>{label}</Text>
      <Switch value={valor} onValueChange={onValorChange} trackColor={{ false: colors.border, true: colors.accent }} />
    </View>
  );
}

export function CampoData({ label, valor, onValorChange, obrigatorio, modo = 'date' }) {
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const data = valor ? new Date(valor) : new Date();
  const formatar = modo === 'datetime' ? formatarDataHora : formatarData;

  return (
    <View style={estilos.campo}>
      <Text style={estilos.label}>{label}{obrigatorio ? ' *' : ''}</Text>
      <TouchableOpacity style={estilos.input} onPress={() => setMostrarPicker(true)}>
        <Text style={{ color: colors.textMain }}>{formatar(data)}</Text>
      </TouchableOpacity>
      {mostrarPicker && (
        <DateTimePicker
          value={data}
          mode={modo}
          display={Platform.OS === 'android' ? 'default' : 'inline'}
          onChange={(evento, novaData) => {
            setMostrarPicker(Platform.OS === 'ios');
            if (novaData) onValorChange(novaData.toISOString());
          }}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end'
  },
  caixa: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%',
    paddingBottom: 8
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 18,
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  titulo: { color: colors.textMain, fontSize: 18, fontWeight: '800' },
  subtitulo: { color: colors.textSub, fontSize: 12, marginTop: 2 },
  fecharBtn: { padding: 4 },
  fecharTexto: { color: colors.textSub, fontSize: 18 },
  corpo: { padding: 18 },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderTopColor: colors.border,
    borderTopWidth: 1
  },
  btnSalvar: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  btnSalvarTexto: { color: colors.accentText, fontWeight: '700' },
  btnExcluir: { borderColor: colors.expense, borderWidth: 1, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18 },
  btnExcluirTexto: { color: colors.expense, fontWeight: '700' },
  campo: { marginBottom: 16 },
  label: { color: colors.textSub, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: colors.bgMain,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: colors.textMain
  },
  selectBox: {
    backgroundColor: colors.bgMain,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden'
  },
  linhaSwitch: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }
});
