const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcularMetricasImovel } = require('../lib/calc');

test('soma aquisição (lance + comissão % + custas + desocupação) e preparação', () => {
    const r = calcularMetricasImovel({
        endereco: 'Rua Teste, 123',
        valorArremate: 100000, comissaoPct: 5, custasProcessuais: 2000, custoDesocupacao: 3000,
        gastoReforma: 10000, gastoAcabamento: 5000, gastoLimpeza: 500, gastoDocumentacao: 1500
    });

    assert.equal(r.totalAquisicao, 100000 + 5000 + 2000 + 3000); // 110000
    assert.equal(r.totalPreparacao, 10000 + 5000 + 500 + 1500); // 17000
    assert.equal(r.custoTotal, r.totalAquisicao + r.totalPreparacao);
});

test('sem valorVenda: lucroBruto e roiPct ficam nulos', () => {
    const r = calcularMetricasImovel({ endereco: 'Rua Teste, 123', valorArremate: 100000 });

    assert.equal(r.lucroBruto, null);
    assert.equal(r.roiPct, null);
});

test('com valorVenda: lucroBruto e roiPct calculados sobre o custoTotal', () => {
    const r = calcularMetricasImovel({
        endereco: 'Rua Teste, 123',
        valorArremate: 100000, comissaoPct: 0, valorVenda: 150000
    });

    assert.equal(r.custoTotal, 100000);
    assert.equal(r.lucroBruto, 50000);
    assert.equal(r.roiPct, 50);
});

test('custoTotal igual a zero: roiPct cai para 0, não NaN/Infinity', () => {
    const r = calcularMetricasImovel({
        endereco: 'Rua Teste, 123',
        valorArremate: 0, comissaoPct: 0, valorVenda: 500
    });

    assert.equal(r.custoTotal, 0);
    assert.equal(r.roiPct, 0);
});
