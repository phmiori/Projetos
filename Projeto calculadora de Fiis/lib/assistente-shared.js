const prisma = require('./prisma');
const { mailTransporter } = require('./fii-alerts');

// Gemini (Google AI Studio) tem camada gratuita generosa — chave em https://aistudio.google.com/apikey
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const geminiConfigurado = !!process.env.GEMINI_API_KEY;

const FERRAMENTAS_DISPONIVEIS = {
    functionDeclarations: [
        {
            name: 'enviar_email',
            description: 'Envia um e-mail para o usuário. Use apenas quando ele pedir explicitamente para enviar/mandar algo por e-mail (ex.: um resumo da carteira).',
            parameters: {
                type: 'object',
                properties: {
                    destinatario: { type: 'string', description: 'E-mail de destino. Se o usuário não especificar outro endereço, use o e-mail cadastrado dele informado no contexto.' },
                    assunto: { type: 'string', description: 'Assunto do e-mail.' },
                    corpo: { type: 'string', description: 'Corpo do e-mail em texto simples, já pronto para envio.' }
                },
                required: ['assunto', 'corpo']
            }
        },
        {
            name: 'adicionar_fii',
            description: 'Registra uma compra de cotas de um Fundo Imobiliário (FII) na carteira do usuário. Se o ticker já existir na carteira, soma as cotas e recalcula o preço médio ponderado (mesmo cálculo do "Novo Aporte" do app); se não existir, cria uma posição nova. Use apenas quando o usuário pedir explicitamente para adicionar/registrar/comprar um FII.',
            parameters: {
                type: 'object',
                properties: {
                    ticker: { type: 'string', description: 'Código do FII, ex: SNAG11.' },
                    cotas: { type: 'number', description: 'Quantidade de cotas compradas nesta operação.' },
                    precoCompra: { type: 'number', description: 'Preço pago por cota nesta compra, em R$.' },
                    ultimoDividendo: { type: 'number', description: 'Último dividendo por cota recebido, em R$ (opcional).' },
                    segmento: { type: 'string', description: 'Segmento do fundo, ex: Papel / CRI, Tijolo, Fiagro (opcional, usado só se for uma posição nova).' }
                },
                required: ['ticker', 'cotas', 'precoCompra']
            }
        },
        {
            name: 'registrar_dividendo_fii',
            description: 'Registra um dividendo/rendimento que o usuário efetivamente RECEBEU de um FII que já está na carteira (diferente de adicionar_fii, que é uma compra de cotas). Atualiza o "Último Rendimento" do FII com o valor por cota e, se o usuário citar uma conta bancária, lança o valor como receita já paga nessa conta. Use apenas quando o usuário disser que recebeu/caiu um dividendo ou rendimento.',
            parameters: {
                type: 'object',
                properties: {
                    ticker: { type: 'string', description: 'Código do FII que já está na carteira do usuário, ex: SNAG11.' },
                    valorTotal: { type: 'number', description: 'Valor TOTAL recebido nesta data, em R$ (não é o valor por cota).' },
                    data: { type: 'string', description: 'Data do recebimento, formato AAAA-MM-DD. Se o usuário não disser, use a data de hoje.' },
                    contaNome: { type: 'string', description: 'Nome de uma das contas bancárias do usuário (ver lista no contexto), para lançar o valor como receita já paga. Opcional — se omitido, fica só registrado no histórico do FII, sem afetar nenhuma conta.' }
                },
                required: ['ticker', 'valorTotal']
            }
        },
        {
            name: 'adicionar_cripto',
            description: 'Registra uma compra de uma criptomoeda na carteira do usuário. Se o ticker já existir, soma a quantidade e recalcula o preço médio ponderado; se não existir, cria uma posição nova. Use apenas quando o usuário pedir explicitamente para adicionar/comprar uma criptomoeda.',
            parameters: {
                type: 'object',
                properties: {
                    ticker: { type: 'string', description: 'Símbolo de exibição da moeda, ex: BTC, ETH, SOL.' },
                    moedaId: { type: 'string', description: 'Slug da CoinGecko usado para buscar a cotação automaticamente, ex: bitcoin, ethereum, solana. Obrigatório apenas quando for uma posição nova (o ticker ainda não está na carteira).' },
                    nome: { type: 'string', description: 'Nome de exibição da moeda, ex: Bitcoin (opcional, usado só se for uma posição nova).' },
                    categoria: { type: 'string', description: 'Categoria: Layer 1, Layer 2, DeFi, Meme, Stablecoin ou Outro (opcional, usado só se for uma posição nova).' },
                    quantidade: { type: 'number', description: 'Quantidade comprada nesta operação.' },
                    precoCompra: { type: 'number', description: 'Preço pago por unidade nesta compra, em R$.' }
                },
                required: ['ticker', 'quantidade', 'precoCompra']
            }
        },
        {
            name: 'adicionar_cofrinho',
            description: 'Cria um novo Cofrinho de renda diária na carteira do usuário. Cada cofrinho é uma aplicação separada (não soma com um cofrinho existente de mesmo nome). Use apenas quando o usuário pedir para cadastrar/criar um cofrinho novo.',
            parameters: {
                type: 'object',
                properties: {
                    nome: { type: 'string', description: 'Nome do cofrinho, ex: PicPay, Nubank Caixinha.' },
                    valorInvestido: { type: 'number', description: 'Valor total investido neste cofrinho, em R$.' },
                    rendaPorDia: { type: 'number', description: 'Renda recebida no dia 1, em R$ — usada como base diária fixa (juros simples) para projetar o rendimento.' },
                    dataInicio: { type: 'string', description: 'Data de início do cofrinho, formato AAAA-MM-DD. Se o usuário não disser, use a data de hoje.' }
                },
                required: ['nome', 'valorInvestido', 'rendaPorDia']
            }
        },
        {
            name: 'adicionar_transacao_financas',
            description: 'Lança uma nova Receita ou Despesa no módulo Finanças, numa conta bancária existente do usuário (ver lista de contas no contexto). Não use esta ferramenta para dividendos de FII — nesse caso use registrar_dividendo_fii. Use apenas quando o usuário pedir para lançar/registrar/anotar uma receita, despesa ou gasto.',
            parameters: {
                type: 'object',
                properties: {
                    tipo: { type: 'string', description: 'Receita ou Despesa.' },
                    descricao: { type: 'string', description: 'Descrição curta do lançamento.' },
                    valor: { type: 'number', description: 'Valor em R$.' },
                    contaNome: { type: 'string', description: 'Nome de uma das contas bancárias do usuário (ver lista no contexto).' },
                    categoriaNome: { type: 'string', description: 'Nome de uma das categorias financeiras do usuário (opcional, ver lista no contexto).' },
                    data: { type: 'string', description: 'Data do lançamento, formato AAAA-MM-DD. Se o usuário não disser, use a data de hoje.' }
                },
                required: ['tipo', 'descricao', 'valor', 'contaNome']
            }
        }
    ]
};

const SYSTEM_INSTRUCTION_BASE = `Você é o Assistente do FinanceHub, um app pessoal de gestão financeira (Fundos Imobiliários, Cripto, Cofrinho e Finanças).
Responda sempre em português do Brasil, de forma direta e objetiva.
Use os dados em "SITUAÇÃO FINANCEIRA ATUAL DO USUÁRIO" abaixo para responder perguntas e sugerir alocações de investimento personalizadas — deixe sempre claro que são sugestões educativas, não uma recomendação profissional/regulada, e que a decisão final é do usuário.
Você pode executar ações de verdade quando o usuário pedir isso explicitamente, usando as ferramentas disponíveis: enviar e-mails (enviar_email), comprar cotas de um FII (adicionar_fii), registrar um dividendo recebido de um FII (registrar_dividendo_fii), comprar uma criptomoeda (adicionar_cripto), criar um cofrinho (adicionar_cofrinho) e lançar uma receita/despesa em Finanças (adicionar_transacao_financas). Ao usar uma ferramenta que precisa de conta bancária ou categoria, use exatamente um dos nomes já cadastrados listados no contexto. Nunca invente dados que não estejam no contexto fornecido.`;

/**
 * Executa a ferramenta adicionar_fii: soma às cotas existentes (recalculando o preço médio
 * ponderado, igual ao modal "Novo Aporte" de JS/FII/fii.js) se o ticker já estiver na carteira,
 * ou cria uma posição nova caso contrário.
 */
async function executarAdicionarFii(usuarioId, args) {
    const ticker = String(args?.ticker || '').trim().toUpperCase();
    const cotasNovas = Math.round(Number(args?.cotas));
    const precoCompra = Number(args?.precoCompra);

    if (!ticker || !Number.isFinite(cotasNovas) || cotasNovas <= 0 || !Number.isFinite(precoCompra) || precoCompra <= 0) {
        return { sucesso: false, motivo: 'Dados inválidos: informe ticker, quantidade de cotas e preço de compra válidos.' };
    }

    const ultimoDividendo = args?.ultimoDividendo != null ? Number(args.ultimoDividendo) : null;
    const existente = await prisma.investimentoFII.findFirst({ where: { usuarioId, ticker } });

    if (existente) {
        const custoAtual = existente.cotas * existente.precoMedio;
        const custoAporte = cotasNovas * precoCompra;
        const totalCotas = existente.cotas + cotasNovas;
        const novoPrecoMedio = totalCotas > 0 ? (custoAtual + custoAporte) / totalCotas : precoCompra;

        const atualizado = await prisma.investimentoFII.update({
            where: { id: existente.id },
            data: {
                cotas: totalCotas,
                precoMedio: novoPrecoMedio,
                ultimoDividendo: ultimoDividendo != null && Number.isFinite(ultimoDividendo) ? ultimoDividendo : existente.ultimoDividendo
            }
        });
        return { sucesso: true, tipo: 'aporte', ticker, cotas: atualizado.cotas, precoMedio: atualizado.precoMedio };
    }

    const criado = await prisma.investimentoFII.create({
        data: {
            usuarioId,
            ticker,
            segmento: args?.segmento ? String(args.segmento).trim() : 'Papel / CRI',
            cotas: cotasNovas,
            precoMedio: precoCompra,
            ultimoDividendo: ultimoDividendo != null && Number.isFinite(ultimoDividendo) ? ultimoDividendo : 0
        }
    });
    return { sucesso: true, tipo: 'novo', ticker, cotas: criado.cotas, precoMedio: criado.precoMedio };
}

/** Encontra uma conta bancária do usuário pelo nome (match exato, senão parcial, ambos sem diferenciar maiúsculas/minúsculas). */
async function encontrarContaPorNome(usuarioId, nomeBusca) {
    if (!nomeBusca) return null;
    const contas = await prisma.contaBancaria.findMany({ where: { usuarioId } });
    const alvo = String(nomeBusca).trim().toLowerCase();
    if (!alvo) return null;
    return contas.find(c => c.nome.toLowerCase() === alvo)
        || contas.find(c => c.nome.toLowerCase().includes(alvo) || alvo.includes(c.nome.toLowerCase()))
        || null;
}

/** Encontra uma categoria financeira do usuário pelo nome (mesma lógica de encontrarContaPorNome). */
async function encontrarCategoriaPorNome(usuarioId, nomeBusca) {
    if (!nomeBusca) return null;
    const categorias = await prisma.categoriaFinanceira.findMany({ where: { usuarioId } });
    const alvo = String(nomeBusca).trim().toLowerCase();
    if (!alvo) return null;
    return categorias.find(c => c.nome.toLowerCase() === alvo)
        || categorias.find(c => c.nome.toLowerCase().includes(alvo) || alvo.includes(c.nome.toLowerCase()))
        || null;
}

/**
 * Executa a ferramenta registrar_dividendo_fii: grava o recebimento no histórico do FII
 * (modelo DividendoFii), atualiza o "Último Rendimento" com o valor por cota e, se uma conta
 * bancária for identificada pelo nome, lança o valor como Receita já paga nela — mesmo
 * comportamento de POST /api/fii/:id/dividendos.
 */
async function executarRegistrarDividendoFii(usuarioId, args) {
    const ticker = String(args?.ticker || '').trim().toUpperCase();
    const valorTotal = Number(args?.valorTotal);

    if (!ticker || !Number.isFinite(valorTotal) || valorTotal <= 0) {
        return { sucesso: false, motivo: 'Dados inválidos: informe o ticker do FII e um valor recebido válido.' };
    }

    const investimento = await prisma.investimentoFII.findFirst({ where: { usuarioId, ticker } });
    if (!investimento) {
        return { sucesso: false, motivo: `${ticker} não está na carteira. Adicione-o primeiro com a ferramenta de compra de FII.` };
    }

    const data = args?.data ? new Date(args.data) : new Date();
    const valorPorCota = investimento.cotas > 0 ? valorTotal / investimento.cotas : 0;

    let contaId = null;
    let contaNomeEncontrada = null;
    if (args?.contaNome) {
        const conta = await encontrarContaPorNome(usuarioId, args.contaNome);
        if (conta) {
            contaId = conta.id;
            contaNomeEncontrada = conta.nome;
        }
    }

    let transacaoId = null;
    if (contaId) {
        const transacao = await prisma.transacao.create({
            data: {
                usuarioId,
                tipo: 'Receita',
                descricao: `Dividendos ${ticker}`,
                valor: valorTotal,
                data,
                status: 'Pago',
                contaId
            }
        });
        transacaoId = transacao.id;
    }

    await Promise.all([
        prisma.dividendoFii.create({
            data: { investimentoId: investimento.id, data, valorTotal, valorPorCota, transacaoId }
        }),
        prisma.investimentoFII.update({ where: { id: investimento.id }, data: { ultimoDividendo: valorPorCota } })
    ]);

    return { sucesso: true, ticker, valorTotal, valorPorCota, lancado: !!contaId, contaNome: contaNomeEncontrada };
}

/**
 * Executa a ferramenta adicionar_cripto: mesmo esquema de aporte com preço médio ponderado do
 * adicionar_fii, mas para o modelo InvestimentoCripto.
 */
async function executarAdicionarCripto(usuarioId, args) {
    const ticker = String(args?.ticker || '').trim().toUpperCase();
    const quantidade = Number(args?.quantidade);
    const precoCompra = Number(args?.precoCompra);

    if (!ticker || !Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(precoCompra) || precoCompra <= 0) {
        return { sucesso: false, motivo: 'Dados inválidos: informe ticker, quantidade e preço de compra válidos.' };
    }

    const existente = await prisma.investimentoCripto.findFirst({ where: { usuarioId, ticker } });

    if (existente) {
        const custoAtual = existente.quantidade * existente.precoMedio;
        const custoAporte = quantidade * precoCompra;
        const totalQuantidade = existente.quantidade + quantidade;
        const novoPrecoMedio = totalQuantidade > 0 ? (custoAtual + custoAporte) / totalQuantidade : precoCompra;

        const atualizado = await prisma.investimentoCripto.update({
            where: { id: existente.id },
            data: { quantidade: totalQuantidade, precoMedio: novoPrecoMedio }
        });
        return { sucesso: true, tipo: 'aporte', ticker, quantidade: atualizado.quantidade, precoMedio: atualizado.precoMedio };
    }

    const moedaId = args?.moedaId ? String(args.moedaId).trim().toLowerCase() : ticker.toLowerCase();
    const criado = await prisma.investimentoCripto.create({
        data: {
            usuarioId,
            moedaId,
            ticker,
            nome: args?.nome ? String(args.nome).trim() : ticker,
            categoria: args?.categoria ? String(args.categoria).trim() : 'Layer 1',
            quantidade,
            precoMedio: precoCompra
        }
    });
    return { sucesso: true, tipo: 'novo', ticker, quantidade: criado.quantidade, precoMedio: criado.precoMedio };
}

/** Executa a ferramenta adicionar_cofrinho: sempre cria uma aplicação nova. */
async function executarAdicionarCofrinho(usuarioId, args) {
    const nome = String(args?.nome || '').trim();
    const valorInvestido = Number(args?.valorInvestido);
    const rendaPorDia = Number(args?.rendaPorDia);

    if (!nome || !Number.isFinite(valorInvestido) || valorInvestido <= 0 || !Number.isFinite(rendaPorDia) || rendaPorDia < 0) {
        return { sucesso: false, motivo: 'Dados inválidos: informe nome, valor investido e renda do dia 1 válidos.' };
    }

    const criado = await prisma.cofrinho.create({
        data: {
            usuarioId,
            nome,
            valorInvestido,
            rendaPorDia,
            dataInicio: args?.dataInicio ? new Date(args.dataInicio) : new Date()
        }
    });
    return { sucesso: true, nome: criado.nome, valorInvestido: criado.valorInvestido, rendaPorDia: criado.rendaPorDia };
}

/** Executa a ferramenta adicionar_transacao_financas: lança uma Receita ou Despesa "Pago". */
async function executarAdicionarTransacaoFinancas(usuarioId, args) {
    const tipo = String(args?.tipo || '').trim().toLowerCase() === 'receita' ? 'Receita' : 'Despesa';
    const descricao = String(args?.descricao || '').trim();
    const valor = Number(args?.valor);

    if (!descricao || !Number.isFinite(valor) || valor <= 0) {
        return { sucesso: false, motivo: 'Dados inválidos: informe descrição e valor válidos.' };
    }

    const conta = await encontrarContaPorNome(usuarioId, args?.contaNome);
    if (!conta) {
        const contas = await prisma.contaBancaria.findMany({ where: { usuarioId } });
        const disponiveis = contas.map(c => c.nome).join(', ') || 'nenhuma conta cadastrada';
        return { sucesso: false, motivo: `Conta "${args?.contaNome || ''}" não encontrada. Contas disponíveis: ${disponiveis}.` };
    }

    const categoria = await encontrarCategoriaPorNome(usuarioId, args?.categoriaNome);

    const transacao = await prisma.transacao.create({
        data: {
            usuarioId,
            tipo,
            descricao,
            valor,
            data: args?.data ? new Date(args.data) : new Date(),
            status: 'Pago',
            contaId: conta.id,
            categoriaId: categoria ? categoria.id : null
        }
    });

    return { sucesso: true, tipo: transacao.tipo, descricao: transacao.descricao, valor: transacao.valor, contaNome: conta.nome };
}

/**
 * Reúne um resumo textual da situação financeira do usuário (FII, Cripto, Cofrinho e
 * Finanças/Patrimônio Líquido) para embasar as respostas do assistente — mesmas fontes e
 * fórmula de Patrimônio Líquido usadas no KPI da Visão Geral (JS/Index/index.js). Também lista
 * os nomes de contas bancárias e categorias financeiras, para as ferramentas que precisam
 * identificar uma conta/categoria existente pelo nome.
 */
async function montarContextoFinanceiro(usuarioId) {
    const [fiis, criptos, cofrinhos, contas, categorias, cartoes, transacoesPagas] = await Promise.all([
        prisma.investimentoFII.findMany({ where: { usuarioId } }),
        prisma.investimentoCripto.findMany({ where: { usuarioId } }),
        prisma.cofrinho.findMany({ where: { usuarioId } }),
        prisma.contaBancaria.findMany({ where: { usuarioId } }),
        prisma.categoriaFinanceira.findMany({ where: { usuarioId } }),
        prisma.cartaoCredito.findMany({
            where: { usuarioId },
            include: { faturas: { where: { status: { not: 'Paga' } }, include: { transacoes: true } } }
        }),
        prisma.transacao.findMany({ where: { usuarioId, status: 'Pago' } })
    ]);

    let fiiPatrimonio = 0, fiiInvestido = 0, fiiRendaMensal = 0;
    const linhasFii = fiis.map(f => {
        const precoRef = f.precoAtual != null ? f.precoAtual : f.precoMedio;
        fiiPatrimonio += f.cotas * (precoRef || 0);
        fiiInvestido += f.cotas * (f.precoMedio || 0);
        fiiRendaMensal += f.cotas * (f.ultimoDividendo || 0);
        return `- ${f.ticker} (${f.segmento}): ${f.cotas} cotas, preço médio R$ ${f.precoMedio.toFixed(2)}, preço atual R$ ${precoRef.toFixed(2)}, último dividendo/cota R$ ${f.ultimoDividendo.toFixed(2)}`;
    });

    let criptoPatrimonio = 0, criptoInvestido = 0;
    const linhasCripto = criptos.map(c => {
        const precoRef = c.precoAtual != null ? c.precoAtual : c.precoMedio;
        criptoInvestido += c.quantidade * (c.precoMedio || 0);
        criptoPatrimonio += c.quantidade * (precoRef || 0);
        return `- ${c.ticker} (${c.nome}, ${c.categoria}): ${c.quantidade} unid., preço médio R$ ${c.precoMedio.toFixed(2)}, preço atual R$ ${precoRef.toFixed(2)}`;
    });

    let cofrinhoInvestido = 0;
    const linhasCofrinho = cofrinhos.map(c => {
        cofrinhoInvestido += c.valorInvestido;
        return `- ${c.nome}: R$ ${c.valorInvestido.toFixed(2)} investidos, renda diária base R$ ${c.rendaPorDia.toFixed(2)}`;
    });

    const saldoPorConta = new Map();
    contas.forEach(conta => {
        let saldo = conta.saldoInicial;
        transacoesPagas.forEach(t => {
            if (t.tipo === 'Transferencia') {
                if (t.contaId === conta.id) saldo -= t.valor;
                if (t.contaDestinoId === conta.id) saldo += t.valor;
            } else if (t.contaId === conta.id && t.formaPagamento !== 'Crédito') {
                saldo += t.tipo === 'Receita' ? t.valor : -t.valor;
            }
        });
        saldoPorConta.set(conta.id, saldo);
    });
    const saldoContas = [...saldoPorConta.values()].reduce((s, v) => s + v, 0);
    const linhasContas = contas.map(c => `- ${c.nome}: saldo atual R$ ${saldoPorConta.get(c.id).toFixed(2)}`);

    const faturasEmAberto = cartoes.reduce((soma, cartao) => {
        const valorFaturas = cartao.faturas.reduce((s, fat) => s + fat.transacoes.reduce((s2, t) => s2 + t.valor, 0), 0);
        return soma + valorFaturas;
    }, 0);

    const capitalAlocado = fiiPatrimonio + criptoPatrimonio + cofrinhoInvestido;
    const patrimonioLiquidoTotal = capitalAlocado + saldoContas - faturasEmAberto;

    return `=== SITUAÇÃO FINANCEIRA ATUAL DO USUÁRIO (FinanceHub) ===
Patrimônio Líquido Total: R$ ${patrimonioLiquidoTotal.toFixed(2)} (FIIs + Cripto + Cofrinho + saldo em conta, menos faturas de cartão em aberto)
Saldo em Contas Bancárias: R$ ${saldoContas.toFixed(2)}
Faturas de Cartão em Aberto: R$ ${faturasEmAberto.toFixed(2)}

Carteira de FIIs (patrimônio de mercado R$ ${fiiPatrimonio.toFixed(2)}, custo de aquisição R$ ${fiiInvestido.toFixed(2)}, renda mensal estimada R$ ${fiiRendaMensal.toFixed(2)}):
${linhasFii.length ? linhasFii.join('\n') : '- Nenhum FII cadastrado.'}

Carteira de Criptomoedas (patrimônio de mercado R$ ${criptoPatrimonio.toFixed(2)}, custo de aquisição R$ ${criptoInvestido.toFixed(2)}):
${linhasCripto.length ? linhasCripto.join('\n') : '- Nenhuma criptomoeda cadastrada.'}

Cofrinhos de Renda Diária (total investido R$ ${cofrinhoInvestido.toFixed(2)}):
${linhasCofrinho.length ? linhasCofrinho.join('\n') : '- Nenhum cofrinho cadastrado.'}

Contas Bancárias cadastradas (use exatamente um destes nomes ao lançar algo numa conta):
${linhasContas.length ? linhasContas.join('\n') : '- Nenhuma conta cadastrada.'}

Categorias Financeiras cadastradas: ${categorias.length ? categorias.map(c => c.nome).join(', ') : 'nenhuma'}`;
}

async function chamarGemini({ systemInstruction, contents, tools }) {
    const resp = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction, contents, tools })
    });

    if (!resp.ok) {
        const corpoErro = await resp.text().catch(() => '');
        throw new Error(`Falha na API Gemini (${resp.status}): ${corpoErro}`);
    }

    return resp.json();
}

/**
 * Executa a ferramenta chamada pelo Gemini e monta { resultadoFuncao, respostaPadrao, acao }.
 * `acao` é o que a rota/frontend usa pra exibir uma tag de confirmação (e, no caso de FII,
 * disparar o recarregamento automático da tabela) — null quando a ferramenta falhou.
 */
async function executarFerramenta(usuarioId, emailUsuario, chamadaFuncao) {
    const args = chamadaFuncao.args || {};

    if (chamadaFuncao.name === 'enviar_email') {
        const { destinatario, assunto, corpo } = args;
        const alvo = (typeof destinatario === 'string' && /\S+@\S+\.\S+/.test(destinatario)) ? destinatario : emailUsuario;

        let resultadoFuncao;
        if (!alvo) {
            resultadoFuncao = { sucesso: false, motivo: 'O usuário não tem e-mail cadastrado em Configurações.' };
        } else if (!mailTransporter) {
            resultadoFuncao = { sucesso: false, motivo: 'Envio de e-mail não está configurado no servidor (SMTP_USER/SMTP_PASS ausentes no .env).' };
        } else {
            try {
                await mailTransporter.sendMail({
                    from: `"FinanceHub" <${process.env.SMTP_USER}>`,
                    to: alvo,
                    subject: assunto || 'Mensagem do Assistente FinanceHub',
                    text: corpo || ''
                });
                resultadoFuncao = { sucesso: true };
            } catch (e) {
                resultadoFuncao = { sucesso: false, motivo: e.message };
            }
        }
        const respostaPadrao = resultadoFuncao.sucesso
            ? `E-mail enviado para ${alvo}.`
            : `Não consegui enviar o e-mail: ${resultadoFuncao.motivo}`;
        const acao = resultadoFuncao.sucesso ? { tipo: 'email', tag: `✓ E-mail enviado para ${alvo}` } : null;
        return { resultadoFuncao, respostaPadrao, acao };
    }

    if (chamadaFuncao.name === 'adicionar_fii') {
        const resultadoFuncao = await executarAdicionarFii(usuarioId, args);
        if (!resultadoFuncao.sucesso) {
            return { resultadoFuncao, respostaPadrao: `Não consegui concluir: ${resultadoFuncao.motivo}`, acao: null };
        }
        const acaoTexto = resultadoFuncao.tipo === 'aporte' ? 'atualizado' : 'adicionado';
        const respostaPadrao = `${resultadoFuncao.ticker} ${acaoTexto}: ${resultadoFuncao.cotas} cotas, preço médio R$ ${resultadoFuncao.precoMedio.toFixed(2)}.`;
        return { resultadoFuncao, respostaPadrao, acao: { tipo: 'fii', tag: `✓ ${respostaPadrao.slice(0, -1)}` } };
    }

    if (chamadaFuncao.name === 'registrar_dividendo_fii') {
        const resultadoFuncao = await executarRegistrarDividendoFii(usuarioId, args);
        if (!resultadoFuncao.sucesso) {
            return { resultadoFuncao, respostaPadrao: `Não consegui concluir: ${resultadoFuncao.motivo}`, acao: null };
        }
        const complemento = resultadoFuncao.lancado
            ? ` e lançado como receita em ${resultadoFuncao.contaNome}`
            : '';
        const respostaPadrao = `Dividendo de R$ ${resultadoFuncao.valorTotal.toFixed(2)} de ${resultadoFuncao.ticker} registrado${complemento}.`;
        return { resultadoFuncao, respostaPadrao, acao: { tipo: 'dividendo_fii', tag: `✓ ${respostaPadrao.slice(0, -1)}` } };
    }

    if (chamadaFuncao.name === 'adicionar_cripto') {
        const resultadoFuncao = await executarAdicionarCripto(usuarioId, args);
        if (!resultadoFuncao.sucesso) {
            return { resultadoFuncao, respostaPadrao: `Não consegui concluir: ${resultadoFuncao.motivo}`, acao: null };
        }
        const acaoTexto = resultadoFuncao.tipo === 'aporte' ? 'atualizado' : 'adicionado';
        const respostaPadrao = `${resultadoFuncao.ticker} ${acaoTexto}: ${resultadoFuncao.quantidade} unid., preço médio R$ ${resultadoFuncao.precoMedio.toFixed(2)}.`;
        return { resultadoFuncao, respostaPadrao, acao: { tipo: 'cripto', tag: `✓ ${respostaPadrao.slice(0, -1)}` } };
    }

    if (chamadaFuncao.name === 'adicionar_cofrinho') {
        const resultadoFuncao = await executarAdicionarCofrinho(usuarioId, args);
        if (!resultadoFuncao.sucesso) {
            return { resultadoFuncao, respostaPadrao: `Não consegui concluir: ${resultadoFuncao.motivo}`, acao: null };
        }
        const respostaPadrao = `Cofrinho "${resultadoFuncao.nome}" criado: R$ ${resultadoFuncao.valorInvestido.toFixed(2)} investidos, renda diária base R$ ${resultadoFuncao.rendaPorDia.toFixed(2)}.`;
        return { resultadoFuncao, respostaPadrao, acao: { tipo: 'cofrinho', tag: `✓ ${respostaPadrao.slice(0, -1)}` } };
    }

    if (chamadaFuncao.name === 'adicionar_transacao_financas') {
        const resultadoFuncao = await executarAdicionarTransacaoFinancas(usuarioId, args);
        if (!resultadoFuncao.sucesso) {
            return { resultadoFuncao, respostaPadrao: `Não consegui concluir: ${resultadoFuncao.motivo}`, acao: null };
        }
        const respostaPadrao = `${resultadoFuncao.tipo} de R$ ${resultadoFuncao.valor.toFixed(2)} ("${resultadoFuncao.descricao}") lançada em ${resultadoFuncao.contaNome}.`;
        return { resultadoFuncao, respostaPadrao, acao: { tipo: 'transacao', tag: `✓ ${respostaPadrao.slice(0, -1)}` } };
    }

    return { resultadoFuncao: { sucesso: false, motivo: 'Ferramenta desconhecida.' }, respostaPadrao: 'Não reconheci essa ação.', acao: null };
}

/**
 * Conversa com o assistente de IA: monta o contexto financeiro do usuário, envia a mensagem
 * (com o histórico recente) para o Gemini e, se o modelo decidir usar uma das ferramentas,
 * executa a ação de verdade antes de pedir a resposta final em texto.
 */
async function chamarAssistenteIA({ usuarioId, emailUsuario, historico, mensagemUsuario }) {
    if (!geminiConfigurado) {
        return {
            resposta: 'A IA do assistente ainda não foi configurada neste servidor. Peça para o administrador definir GEMINI_API_KEY no arquivo .env (chave gratuita em https://aistudio.google.com/apikey).',
            acao: null
        };
    }

    const contexto = await montarContextoFinanceiro(usuarioId);
    const systemInstruction = {
        parts: [{
            text: `${SYSTEM_INSTRUCTION_BASE}\n\nE-mail cadastrado do usuário: ${emailUsuario || 'não cadastrado (oriente o usuário a configurar um e-mail em Configurações antes de enviar e-mails)'}\n\n${contexto}`
        }]
    };

    const contents = [
        ...historico.map(m => ({ role: m.papel === 'assistente' ? 'model' : 'user', parts: [{ text: m.conteudo }] })),
        { role: 'user', parts: [{ text: mensagemUsuario }] }
    ];

    const primeiraResposta = await chamarGemini({ systemInstruction, contents, tools: [FERRAMENTAS_DISPONIVEIS] });
    const parts = primeiraResposta?.candidates?.[0]?.content?.parts || [];
    const chamadaFuncao = parts.find(p => p.functionCall)?.functionCall;

    if (chamadaFuncao) {
        const { resultadoFuncao, respostaPadrao, acao } = await executarFerramenta(usuarioId, emailUsuario, chamadaFuncao);

        // A ação (e-mail enviado, item cadastrado, etc.) já foi executada acima — se esta
        // segunda chamada (só para gerar o texto de confirmação em linguagem natural) falhar,
        // a resposta cai para o texto padrão em vez de esconder o resultado real por trás de
        // um erro genérico.
        let textoFinal = null;
        try {
            const segundaResposta = await chamarGemini({
                systemInstruction,
                contents: [
                    ...contents,
                    { role: 'model', parts: [{ functionCall: chamadaFuncao }] },
                    { role: 'user', parts: [{ functionResponse: { name: chamadaFuncao.name, response: resultadoFuncao } }] }
                ],
                tools: [FERRAMENTAS_DISPONIVEIS]
            });
            textoFinal = segundaResposta?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        } catch (e) {
            console.error('[Assistente] Falha na segunda chamada ao Gemini (texto de confirmação), usando resposta padrão:', e.message);
        }

        return { resposta: textoFinal || respostaPadrao, acao };
    }

    const texto = parts.find(p => p.text)?.text;
    return { resposta: texto || 'Não consegui gerar uma resposta agora. Tente novamente em instantes.', acao: null };
}

module.exports = { montarContextoFinanceiro, chamarAssistenteIA, geminiConfigurado };
