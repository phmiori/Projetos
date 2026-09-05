const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcularMetricas } = require('../lib/calc');

test('à vista: soma aquisição + preparação e não parcela nada', () => {
    const r = calcularMetricas({
        marca: 'Fiat', modelo: 'Uno',
        valorArremate: 10000, comissaoPct: 5, taxasPatio: 200, custoGuincho: 100,
        gastoMecanica: 500, gastoFunilaria: 300, gastoEstetica: 100, gastoDocumentacao: 150
    });

    assert.equal(r.totalAquisicao, 10000 + 500 + 200 + 100); // 10800
    assert.equal(r.totalPreparacao, 500 + 300 + 100 + 150); // 1050
    assert.equal(r.custoTotal, r.totalAquisicao + r.totalPreparacao);
    assert.equal(r.metodoPagamento, 'À Vista');
    assert.equal(r.valorEntrada, 0);
    assert.equal(r.valorParcela, 0);
});

test('parcelado: entrada de 25% do lance (sem comissão) e parcela = 75%/qtdParcelas', () => {
    const r = calcularMetricas({
        marca: 'Fiat', modelo: 'Uno',
        valorArremate: 10000, comissaoPct: 5, metodoPagamento: 'Parcelado', qtdParcelas: 4
    });

    assert.equal(r.valorEntrada, 2500); // 25% de 10000
    assert.equal(r.valorParcelado, 7500); // 75% de 10000
    assert.equal(r.valorParcela, 1875); // 7500 / 4
});

test('parcelado sem quantidade de parcelas: valorParcela fica em 0 (evita divisão por zero)', () => {
    const r = calcularMetricas({
        marca: 'Fiat', modelo: 'Uno',
        valorArremate: 10000, metodoPagamento: 'Parcelado', qtdParcelas: 0
    });

    assert.equal(r.valorParcela, 0);
});

test('sem valorVenda: lucroBruto e roiPct ficam nulos', () => {
    const r = calcularMetricas({ marca: 'Fiat', modelo: 'Uno', valorArremate: 10000 });

    assert.equal(r.lucroBruto, null);
    assert.equal(r.roiPct, null);
});

test('com valorVenda: lucroBruto e roiPct calculados sobre o custoTotal', () => {
    const r = calcularMetricas({
        marca: 'Fiat', modelo: 'Uno',
        valorArremate: 10000, comissaoPct: 0, valorVenda: 12000
    });

    assert.equal(r.custoTotal, 10000);
    assert.equal(r.lucroBruto, 2000);
    assert.equal(r.roiPct, 20);
});

test('custoTotal igual a zero: roiPct cai para 0, não NaN/Infinity', () => {
    const r = calcularMetricas({
        marca: 'Fiat', modelo: 'Uno',
        valorArremate: 0, comissaoPct: 0, valorVenda: 500
    });

    assert.equal(r.custoTotal, 0);
    assert.equal(r.roiPct, 0);
});
