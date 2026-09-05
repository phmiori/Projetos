const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    obterPercentualIOF,
    obterPercentualIR,
    calcularMetricasCofrinho
} = require('../JS/Cofrinho/cofrinho.js');

test('obterPercentualIOF: fronteiras da tabela regressiva (Decreto 6.306/2007)', () => {
    assert.equal(obterPercentualIOF(1), 96);
    assert.equal(obterPercentualIOF(29), 3);
    assert.equal(obterPercentualIOF(30), 0);
    assert.equal(obterPercentualIOF(31), 0);
    assert.equal(obterPercentualIOF(0), 96); // clampado para o dia 1
    assert.equal(obterPercentualIOF(-5), 96); // clampado para o dia 1
});

test('obterPercentualIR: fronteiras das faixas regressivas', () => {
    assert.equal(obterPercentualIR(180), 22.5);
    assert.equal(obterPercentualIR(181), 20);
    assert.equal(obterPercentualIR(360), 20);
    assert.equal(obterPercentualIR(361), 17.5);
    assert.equal(obterPercentualIR(720), 17.5);
    assert.equal(obterPercentualIR(721), 15);
});

test('calcularMetricasCofrinho: IOF é descontado antes do IR (IR incide sobre o rendimento já líquido de IOF, não sobre o bruto)', (t) => {
    // 01/01/2024 (segunda-feira, feriado de Confraternização Universal) até 10/01/2024 (quarta-feira)
    const agoraMs = new Date(2024, 0, 10).getTime();
    t.mock.timers.enable({ apis: ['Date'], now: agoraMs });

    const item = { valorInvestido: 1000, rendaPorDia: 1, dataInicio: '2024-01-01' };
    const r = calcularMetricasCofrinho(item);

    assert.equal(r.diasCorridos, 10);
    // Dos 10 dias corridos, exclui 01/01 (feriado) e o fim de semana 06-07/01 = 7 dias úteis
    assert.equal(r.diasUteis, 7);

    const taxaDiaria = item.rendaPorDia / item.valorInvestido;
    const saldoBrutoEsperado = item.valorInvestido * Math.pow(1 + taxaDiaria, r.diasUteis);
    const rendimentoBrutoEsperado = saldoBrutoEsperado - item.valorInvestido;
    const iofEsperado = rendimentoBrutoEsperado * (obterPercentualIOF(10) / 100);
    const rendimentoAposIOFEsperado = rendimentoBrutoEsperado - iofEsperado;
    const irEsperado = rendimentoAposIOFEsperado * (obterPercentualIR(10) / 100);
    const saldoLiquidoEsperado = saldoBrutoEsperado - iofEsperado - irEsperado;

    assert.ok(Math.abs(r.rendimentoBruto - rendimentoBrutoEsperado) < 1e-9);
    assert.ok(Math.abs(r.iofValor - iofEsperado) < 1e-9);
    assert.ok(Math.abs(r.irValor - irEsperado) < 1e-9);
    assert.ok(Math.abs(r.saldoLiquido - saldoLiquidoEsperado) < 1e-9);

    // Trava explicitamente a ordem correta: o IR não pode ter sido calculado sobre o rendimento BRUTO
    const irSeFosseSobreOBruto = rendimentoBrutoEsperado * (obterPercentualIR(10) / 100);
    assert.notEqual(r.irValor, irSeFosseSobreOBruto);
});
