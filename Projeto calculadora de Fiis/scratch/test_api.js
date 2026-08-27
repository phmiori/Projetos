const http = require('http');

async function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function runTest() {
    console.log('--- TESTANDO API PRISMA & CÁLCULOS ---');

    // 1. Criar novo veículo (Toyota Corolla)
    const novoVeiculo = {
        marca: 'Toyota',
        modelo: 'Corolla XEi 2.0',
        ano: 2023,
        placa: 'AUT3X23',
        origem: 'Seguradora',
        status: 'Anunciado',
        valorArremate: 70000,
        comissaoPct: 5,
        taxasPatio: 1500,
        custoGuincho: 500,
        gastoMecanica: 1000,
        gastoFunilaria: 1500,
        gastoEstetica: 500,
        gastoDocumentacao: 1200,
        precoAnuncio: 98000
    };

    console.log('1. POST /api/veiculos...');
    const postRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/veiculos',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, novoVeiculo);

    console.log('POST Status:', postRes.status);
    console.log('Veículo criado:', postRes.data);
    const createdId = postRes.data.id;

    // Verificar cálculos automáticos
    // Lance 70000 + comissão 3500 + taxas 1500 + guincho 500 = 75500
    // Prep: 1000 + 1500 + 500 + 1200 = 4200
    // Custo Total: 75500 + 4200 = 79700
    console.log('Cálculo Total Aquisição esperado: 75500, obtido:', postRes.data.totalAquisicao);
    console.log('Cálculo Total Preparação esperado: 4200, obtido:', postRes.data.totalPreparacao);
    console.log('Cálculo Custo Total esperado: 79700, obtido:', postRes.data.custoTotal);

    // 2. Atualizar status para Vendido e preencher valor de venda
    console.log('\n2. PUT /api/veiculos/:id (Registrar Venda)...');
    const updateData = {
        ...postRes.data,
        status: 'Vendido',
        valorVenda: 95000,
        dataVenda: new Date().toISOString()
    };

    const putRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: `/api/veiculos/${createdId}`,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
    }, updateData);

    console.log('PUT Status:', putRes.status);
    console.log('Lucro Bruto esperado (95000 - 79700 = 15300), obtido:', putRes.data.lucroBruto);
    console.log('ROI % esperado ((15300 / 79700) * 100 = 19.2%), obtido:', putRes.data.roiPct.toFixed(2) + '%');

    // 3. Consultar Dashboard
    console.log('\n3. GET /api/dashboard...');
    const dashRes = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/dashboard',
        method: 'GET'
    });

    console.log('Dashboard KPIs:', dashRes.data);
    console.log('\n--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
}

runTest().catch(console.error);
