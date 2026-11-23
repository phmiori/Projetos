const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/radar-analise');

const cfg = { ...A.CONFIG_PADRAO, reparoPorCondicao: { ...A.CONFIG_PADRAO.reparoPorCondicao } };

test('sinistro: detecta menções reais e ignora frases negativas', () => {
    assert.ok(A.analisarTexto('O veículo possui averbação de ocorrência de rec/sinistro').sinistro);
    assert.ok(A.analisarTexto('Avarias de média monta na dianteira').sinistro);
    assert.ok(A.analisarTexto('Veículo recuperado de furto').sinistro);
    assert.equal(A.analisarTexto('Não consta registro de sinistro.').sinistro, '');
    assert.equal(A.analisarTexto('Sem sinistro, em bom estado').sinistro, '');
    assert.equal(A.analisarTexto('Para-choque traseiro batido').sinistro, '');
});

test('edital: bloqueios, estado, funcionamento, débitos e sub-rogação', () => {
    const sucata = A.analisarTexto('O motor não funciona. O veículo encontra-se em ESTADO DE SUCATA.');
    assert.deepEqual(sucata.bloqueios, ['Veículo declarado SUCATA']);
    assert.equal(sucata.funciona, 'NÃO');
    assert.equal(sucata.condicao, 'ruim');

    assert.deepEqual(A.analisarTexto('partes intimadas, caso não localizadas, art. 889').bloqueios, []);
    assert.deepEqual(A.analisarTexto('O veículo não foi localizado pelo oficial').bloqueios, ['Veículo NÃO LOCALIZADO']);

    const civic = A.analisarTexto('Ano/Modelo: 2010/2011. FUNCIONANDO. Débito de IPVA de R$ 2.345,10. Os débitos se sub-rogam no preço.');
    assert.equal(civic.anoModelo, 2011);
    assert.equal(civic.funciona, 'sim');
    assert.equal(civic.debitos, 2345.10);
    assert.equal(civic.subrogacao, true);

    const taxa = A.analisarTexto('o arrematante devera pagar a quantia de R$ 1.000,00 referente as despesas');
    assert.equal(taxa.taxas, 1000);
});

test('foto: imagens genéricas, vazias e repetidas em carros diferentes', () => {
    const vazio = new Set();
    assert.equal(A.classificarFoto({ imagem: 'https://x.com/public/fotos/nao-disponivel.jpg' }, vazio), 'sem foto');
    assert.equal(A.classificarFoto({ imagem: '/build/images/nopicture.png' }, vazio), 'sem foto');
    assert.equal(A.classificarFoto({ imagem: 'https://static.x.com.br/tribunais/tjmg.png' }, vazio), 'sem foto');
    assert.equal(A.classificarFoto({ imagem: '' }, vazio), 'sem foto');
    assert.equal(A.classificarFoto({ imagem: 'https://cdn.x.com/uploads/media/default/0001/28/abc.jpg' }, vazio), 'real');

    const L = (imagem, marca, modelo) => ({ imagem, marca_veiculo: marca, modelo_veiculo: modelo });
    const rep = A.imagensRepetidas([L('a', 'Fiat', 'Fiat Uno'), L('a', 'Fiat', 'Fiat Uno Mille Fire'),
        L('b', 'Volkswagen', 'Volkswagen Gol'), L('b', 'Chevrolet', 'Chevrolet Celta')]);
    assert.deepEqual([...rep], ['b']);
});

test('veredito: margem, lance suspeito e descarte por foto', () => {
    const lote = { lance_inicial: 40000, lance_inicial_segunto_lote: 20000, imagem: 'x.jpg' };
    const r = { lote, analise: A.analisarTexto('funcionando'), fipe: 54000, foto: 'real' };
    A.avaliar(r, cfg);
    assert.equal(r.calc.praca, '2ª praça');
    assert.equal(r.calc.lance, 20000);
    assert.equal(r.veredito, 'VALE A PENA');

    const pregao = { lote: { lance_inicial: 4000 }, analise: A.analisarTexto(''), fipe: 48000, foto: 'real' };
    A.avaliar(pregao, cfg);
    assert.equal(pregao.veredito, 'TALVEZ');
    assert.match(pregao.analise.alertas.at(-1), /Lance muito baixo/);

    const semFoto = { lote, analise: A.analisarTexto(''), fipe: 54000, foto: 'sem foto' };
    A.avaliar(semFoto, cfg);
    assert.equal(semFoto.veredito, 'DESCARTAR');
    A.avaliar(semFoto, { ...cfg, descartarSemFoto: false });
    assert.notEqual(semFoto.veredito, 'DESCARTAR');
    assert.ok(semFoto.analise.alertas.includes('Sem foto do veículo'));
});
