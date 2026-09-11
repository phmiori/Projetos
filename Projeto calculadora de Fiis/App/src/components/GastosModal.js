import React, { useState, useEffect, useCallback } from 'react';
import { TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import FormularioModal, { CampoTexto, CampoSelect, CampoData } from './FormularioModal';
import CartaoItem from './CartaoItem';
import { formatarMoeda } from '../utils/formatadores';
import { colors } from '../theme/colors';

/**
 * src/components/GastosModal.js
 * Lista + cadastro de gastos/manutenções lançados linha a linha dentro de um item (Carro/Casa
 * de Leilão, Veículo da Garagem) — reaproveitado pelos três, já que o backend não permite
 * editar um lançamento (só criar/excluir), igual ao site.
 */
export default function GastosModal({ visivel, onFechar, titulo, categorias, labelFornecedor, buscar, criar, excluir, aoSalvar }) {
  const [gastos, setGastos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [form, setForm] = useState({ categoria: categorias[0], descricao: '', valor: '', fornecedor: '', data: new Date().toISOString() });
  const [salvando, setSalvando] = useState(false);

  const carregarGastos = useCallback(async () => {
    if (!visivel) return;
    setCarregando(true);
    try {
      setGastos(await buscar());
    } catch {
      setGastos([]);
    } finally {
      setCarregando(false);
    }
  }, [visivel, buscar]);

  useEffect(() => { carregarGastos(); }, [carregarGastos]);

  function abrirNovo() {
    setForm({ categoria: categorias[0], descricao: '', valor: '', fornecedor: '', data: new Date().toISOString() });
    setModalNovoAberto(true);
  }

  async function salvarGasto() {
    if (!form.descricao.trim() || !form.valor) {
      Alert.alert('Campos obrigatórios', 'Informe descrição e valor.');
      return;
    }
    setSalvando(true);
    try {
      const resultado = await criar({
        categoria: form.categoria,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        fornecedor: form.fornecedor.trim() || null,
        data: form.data
      });
      setModalNovoAberto(false);
      await carregarGastos();
      if (aoSalvar) aoSalvar(resultado);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o gasto.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao(gasto) {
    Alert.alert('Excluir Gasto', `Remover "${gasto.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const resultado = await excluir(gasto.id);
            await carregarGastos();
            if (aoSalvar) aoSalvar(resultado);
          } catch (err) {
            Alert.alert('Erro', err.message || 'Não foi possível excluir.');
          }
        }
      }
    ]);
  }

  return (
    <>
      <FormularioModal visivel={visivel} titulo={titulo} onFechar={onFechar} onSalvar={abrirNovo} textoSalvar="+ Lançar Gasto">
        {carregando ? (
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 20 }} />
        ) : (
          <>
            {gastos.length === 0 && <CartaoItem titulo="Nenhum gasto lançado ainda" />}
            {gastos.map((g) => (
              <TouchableOpacity key={g.id} onLongPress={() => confirmarExclusao(g)}>
                <CartaoItem
                  titulo={g.descricao}
                  tag={g.categoria}
                  linhas={[g.oficina || g.fornecedor].filter(Boolean)}
                  valor={formatarMoeda(g.valor)}
                />
              </TouchableOpacity>
            ))}
            {gastos.length > 0 && <CartaoItem titulo="Toque e segure num gasto para excluir" />}
          </>
        )}
      </FormularioModal>

      <FormularioModal
        visivel={modalNovoAberto}
        titulo="Lançar Gasto"
        onFechar={() => setModalNovoAberto(false)}
        onSalvar={salvarGasto}
        salvando={salvando}
      >
        <CampoTexto label="Descrição" obrigatorio placeholder="Ex: Troca de óleo" value={form.descricao} onChangeText={(v) => setForm({ ...form, descricao: v })} />
        <CampoSelect label="Categoria" valor={form.categoria} onValorChange={(v) => setForm({ ...form, categoria: v })} opcoes={categorias} />
        <CampoTexto label="Valor (R$)" obrigatorio placeholder="Ex: 150" keyboardType="decimal-pad" value={form.valor} onChangeText={(v) => setForm({ ...form, valor: v })} />
        <CampoTexto label={labelFornecedor} placeholder="Opcional" value={form.fornecedor} onChangeText={(v) => setForm({ ...form, fornecedor: v })} />
        <CampoData label="Data" valor={form.data} onValorChange={(v) => setForm({ ...form, data: v })} />
      </FormularioModal>
    </>
  );
}
