/**
 * src/utils/cofrinhoCalc.js
 * Espelha o cálculo de dias úteis/rendimento do Cofrinho (JS/Cofrinho/cofrinho.js e
 * JS/Index/index.js) — usado só para estimar o rendimento bruto acumulado no KPI da
 * Visão Geral. Calendário de feriados nacionais fixos + móveis (fórmula da Páscoa).
 */

const cacheFeriados = {};

function calcularPascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function formatarDataChave(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function obterFeriadosNacionais(ano) {
  if (cacheFeriados[ano]) return cacheFeriados[ano];
  const feriados = new Set();
  const somarDias = (data, dias) => { const n = new Date(data); n.setDate(n.getDate() + dias); return n; };
  const add = (data) => feriados.add(formatarDataChave(data));

  add(new Date(ano, 0, 1));
  add(new Date(ano, 3, 21));
  add(new Date(ano, 4, 1));
  add(new Date(ano, 8, 7));
  add(new Date(ano, 9, 12));
  add(new Date(ano, 10, 2));
  add(new Date(ano, 10, 15));
  add(new Date(ano, 10, 20));
  add(new Date(ano, 11, 25));

  const pascoa = calcularPascoa(ano);
  add(somarDias(pascoa, -48));
  add(somarDias(pascoa, -47));
  add(somarDias(pascoa, -2));
  add(somarDias(pascoa, 60));

  cacheFeriados[ano] = feriados;
  return feriados;
}

function ehDiaUtil(data) {
  const diaSemana = data.getDay();
  if (diaSemana === 0 || diaSemana === 6) return false;
  return !obterFeriadosNacionais(data.getFullYear()).has(formatarDataChave(data));
}

function parseDataLocal(valor) {
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, ano, mes, dia] = match;
    return new Date(Number(ano), Number(mes) - 1, Number(dia));
  }
  return new Date(valor);
}

function calcularDiasCorridos(dataInicio) {
  const inicio = parseDataLocal(dataInicio);
  inicio.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24)) + 1);
}

function contarDiasUteis(dataInicio, diasCorridos) {
  const inicio = parseDataLocal(dataInicio);
  inicio.setHours(0, 0, 0, 0);
  let uteis = 0;
  for (let i = 0; i < diasCorridos; i++) {
    const data = new Date(inicio);
    data.setDate(data.getDate() + i);
    if (ehDiaUtil(data)) uteis++;
  }
  return uteis;
}

/**
 * Rendimento bruto acumulado de um cofrinho até hoje (juros simples diários, só em dias úteis).
 */
export function calcularRendimentoBrutoCofrinho(item) {
  const valorInvestido = Number(item.valorInvestido) || 0;
  const rendaPorDia = Number(item.rendaPorDia) || 0;
  const taxaDiaria = valorInvestido > 0 ? rendaPorDia / valorInvestido : 0;
  const diasCorridos = calcularDiasCorridos(item.dataInicio);
  const diasUteis = contarDiasUteis(item.dataInicio, diasCorridos);
  const saldoBruto = valorInvestido * Math.pow(1 + taxaDiaria, diasUteis);
  return saldoBruto - valorInvestido;
}
