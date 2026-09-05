/**
 * Funções puras de cálculo financeiro (sem I/O), extraídas do server.js para
 * poderem ser reaproveitadas pelas rotas e testadas isoladamente (node:test).
 */

/**
 * Função utilitária para cálculo automático de totais, lucro e ROI (Veículo de Leilão)
 */
function calcularMetricas(data) {
    const valorArremate = Number(data.valorArremate) || 0;
    const comissaoPct = Number(data.comissaoPct) || 0;
    const taxasPatio = Number(data.taxasPatio) || 0;
    const custoGuincho = Number(data.custoGuincho) || 0;

    // Total de Aquisição: Lance + Comissão R$ + Taxas + Guincho
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + taxasPatio + custoGuincho;

    // Método de Arrematação: À Vista ou Parcelado (25% de entrada sobre o lance, desconsiderando a comissão do leiloeiro)
    const metodoPagamento = data.metodoPagamento === 'Parcelado' ? 'Parcelado' : 'À Vista';
    const valorEntrada = metodoPagamento === 'Parcelado' ? valorArremate * 0.25 : 0;
    const valorParcelado = metodoPagamento === 'Parcelado' ? valorArremate - valorEntrada : 0;
    const qtdParcelas = metodoPagamento === 'Parcelado' ? (parseInt(data.qtdParcelas, 10) || 0) : 0;
    const valorParcela = qtdParcelas > 0 ? valorParcelado / qtdParcelas : 0;

    const gastoMecanica = Number(data.gastoMecanica) || 0;
    const gastoFunilaria = Number(data.gastoFunilaria) || 0;
    const gastoEstetica = Number(data.gastoEstetica) || 0;
    const gastoDocumentacao = Number(data.gastoDocumentacao) || 0;

    // Total de Preparação
    const totalPreparacao = gastoMecanica + gastoFunilaria + gastoEstetica + gastoDocumentacao;

    // Custo Total Acumulado
    const custoTotal = totalAquisicao + totalPreparacao;

    const precoAnuncio = data.precoAnuncio !== undefined && data.precoAnuncio !== '' && data.precoAnuncio !== null
        ? Number(data.precoAnuncio) : null;
    const valorVenda = data.valorVenda !== undefined && data.valorVenda !== '' && data.valorVenda !== null
        ? Number(data.valorVenda) : null;

    let lucroBruto = null;
    let roiPct = null;

    if (valorVenda !== null && valorVenda > 0) {
        lucroBruto = valorVenda - custoTotal;
        roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
    }

    let dataVenda = null;
    if (data.dataVenda) {
        dataVenda = new Date(data.dataVenda);
    } else if (data.status === 'Vendido' && !data.dataVenda) {
        dataVenda = new Date();
    }

    let dataCompra = null;
    if (data.dataCompra) {
        dataCompra = new Date(data.dataCompra);
    }

    return {
        marca: data.marca ? String(data.marca).trim() : '',
        modelo: data.modelo ? String(data.modelo).trim() : '',
        ano: parseInt(data.ano, 10) || new Date().getFullYear(),
        placa: data.placa ? String(data.placa).trim().toUpperCase() : null,
        chassi: data.chassi ? String(data.chassi).trim().toUpperCase() : null,
        origem: data.origem ? String(data.origem).trim() : 'Seguradora',
        leiloeiro: data.leiloeiro ? String(data.leiloeiro).trim() : null,
        dataCompra,
        status: data.status ? String(data.status).trim() : 'Em Trânsito',
        observacoes: data.observacoes ? String(data.observacoes).trim() : null,
        valorArremate,
        comissaoPct,
        taxasPatio,
        custoGuincho,
        totalAquisicao,
        metodoPagamento,
        valorEntrada,
        valorParcelado,
        qtdParcelas,
        valorParcela,
        gastoMecanica,
        gastoFunilaria,
        gastoEstetica,
        gastoDocumentacao,
        totalPreparacao,
        custoTotal,
        precoAnuncio,
        valorVenda,
        dataVenda,
        lucroBruto,
        roiPct
    };
}

/**
 * Função utilitária para cálculo automático de totais, lucro e ROI de imóveis de leilão
 */
function calcularMetricasImovel(data) {
    const valorArremate = Number(data.valorArremate) || 0;
    const comissaoPct = Number(data.comissaoPct) || 0;
    const custasProcessuais = Number(data.custasProcessuais) || 0;
    const custoDesocupacao = Number(data.custoDesocupacao) || 0;

    // Total de Aquisição: Lance + Comissão % + Custas Processuais + Desocupação
    const totalAquisicao = valorArremate + (valorArremate * (comissaoPct / 100)) + custasProcessuais + custoDesocupacao;

    const gastoReforma = Number(data.gastoReforma) || 0;
    const gastoAcabamento = Number(data.gastoAcabamento) || 0;
    const gastoLimpeza = Number(data.gastoLimpeza) || 0;
    const gastoDocumentacao = Number(data.gastoDocumentacao) || 0;

    // Total de Preparação
    const totalPreparacao = gastoReforma + gastoAcabamento + gastoLimpeza + gastoDocumentacao;

    // Custo Total Acumulado
    const custoTotal = totalAquisicao + totalPreparacao;

    const precoAnuncio = data.precoAnuncio !== undefined && data.precoAnuncio !== '' && data.precoAnuncio !== null
        ? Number(data.precoAnuncio) : null;
    const valorVenda = data.valorVenda !== undefined && data.valorVenda !== '' && data.valorVenda !== null
        ? Number(data.valorVenda) : null;

    let lucroBruto = null;
    let roiPct = null;

    if (valorVenda !== null && valorVenda > 0) {
        lucroBruto = valorVenda - custoTotal;
        roiPct = custoTotal > 0 ? (lucroBruto / custoTotal) * 100 : 0;
    }

    let dataVenda = null;
    if (data.dataVenda) {
        dataVenda = new Date(data.dataVenda);
    } else if (data.status === 'Vendido' && !data.dataVenda) {
        dataVenda = new Date();
    }

    let dataCompra = null;
    if (data.dataCompra) {
        dataCompra = new Date(data.dataCompra);
    }

    return {
        endereco: data.endereco ? String(data.endereco).trim() : '',
        cidade: data.cidade ? String(data.cidade).trim() : null,
        uf: data.uf ? String(data.uf).trim().toUpperCase() : null,
        tipoImovel: data.tipoImovel ? String(data.tipoImovel).trim() : 'Casa',
        areaM2: data.areaM2 !== undefined && data.areaM2 !== '' && data.areaM2 !== null ? Number(data.areaM2) : null,
        quartos: data.quartos !== undefined && data.quartos !== '' && data.quartos !== null ? parseInt(data.quartos, 10) : null,
        banheiros: data.banheiros !== undefined && data.banheiros !== '' && data.banheiros !== null ? parseInt(data.banheiros, 10) : null,
        matricula: data.matricula ? String(data.matricula).trim() : null,
        origem: data.origem ? String(data.origem).trim() : 'Banco',
        leiloeiro: data.leiloeiro ? String(data.leiloeiro).trim() : null,
        dataCompra,
        status: data.status ? String(data.status).trim() : 'Em Desocupação',
        observacoes: data.observacoes ? String(data.observacoes).trim() : null,
        valorArremate,
        comissaoPct,
        custasProcessuais,
        custoDesocupacao,
        totalAquisicao,
        gastoReforma,
        gastoAcabamento,
        gastoLimpeza,
        gastoDocumentacao,
        totalPreparacao,
        custoTotal,
        precoAnuncio,
        valorVenda,
        dataVenda,
        lucroBruto,
        roiPct
    };
}

module.exports = { calcularMetricas, calcularMetricasImovel };
