const prisma = require('./prisma');
const { mailTransporter } = require('./fii-alerts');

// Gemini (Google AI Studio) tem camada gratuita generosa — chave em https://aistudio.google.com/apikey
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const geminiConfigurado = !!process.env.GEMINI_API_KEY;

const FERRAMENTA_ENVIAR_EMAIL = {
    functionDeclarations: [{
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
    }]
};

const SYSTEM_INSTRUCTION_BASE = `Você é o Assistente do FinanceHub, um app pessoal de gestão financeira (Fundos Imobiliários, Cripto, Cofrinho e Finanças).
Responda sempre em português do Brasil, de forma direta e objetiva.
Use os dados em "SITUAÇÃO FINANCEIRA ATUAL DO USUÁRIO" abaixo para responder perguntas e sugerir alocações de investimento personalizadas — deixe sempre claro que são sugestões educativas, não uma recomendação profissional/regulada, e que a decisão final é do usuário.
Você pode enviar e-mails usando a ferramenta enviar_email quando o usuário pedir isso explicitamente. Nunca invente dados que não estejam no contexto fornecido.`;

/**
 * Reúne um resumo textual da situação financeira do usuário (FII, Cripto, Cofrinho e
 * Finanças/Patrimônio Líquido) para embasar as respostas do assistente — mesmas fontes e
 * fórmula de Patrimônio Líquido usadas no KPI da Visão Geral (JS/Index/index.js).
 */
async function montarContextoFinanceiro(usuarioId) {
    const [fiis, criptos, cofrinhos, contas, cartoes, transacoesPagas] = await Promise.all([
        prisma.investimentoFII.findMany({ where: { usuarioId } }),
        prisma.investimentoCripto.findMany({ where: { usuarioId } }),
        prisma.cofrinho.findMany({ where: { usuarioId } }),
        prisma.contaBancaria.findMany({ where: { usuarioId } }),
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

    const saldoContas = contas.reduce((total, conta) => {
        let saldo = conta.saldoInicial;
        transacoesPagas.forEach(t => {
            if (t.tipo === 'Transferencia') {
                if (t.contaId === conta.id) saldo -= t.valor;
                if (t.contaDestinoId === conta.id) saldo += t.valor;
            } else if (t.contaId === conta.id && t.formaPagamento !== 'Crédito') {
                saldo += t.tipo === 'Receita' ? t.valor : -t.valor;
            }
        });
        return total + saldo;
    }, 0);

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
${linhasCofrinho.length ? linhasCofrinho.join('\n') : '- Nenhum cofrinho cadastrado.'}`;
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
 * Conversa com o assistente de IA: monta o contexto financeiro do usuário, envia a mensagem
 * (com o histórico recente) para o Gemini e, se o modelo decidir usar a ferramenta de e-mail,
 * executa o envio de verdade (via o mesmo transportador SMTP dos alertas de preço) antes de
 * pedir a resposta final em texto.
 */
async function chamarAssistenteIA({ usuarioId, emailUsuario, historico, mensagemUsuario }) {
    if (!geminiConfigurado) {
        return {
            resposta: 'A IA do assistente ainda não foi configurada neste servidor. Peça para o administrador definir GEMINI_API_KEY no arquivo .env (chave gratuita em https://aistudio.google.com/apikey).',
            emailEnviado: null
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

    const primeiraResposta = await chamarGemini({ systemInstruction, contents, tools: [FERRAMENTA_ENVIAR_EMAIL] });
    const parts = primeiraResposta?.candidates?.[0]?.content?.parts || [];
    const chamadaFuncao = parts.find(p => p.functionCall)?.functionCall;

    if (chamadaFuncao?.name === 'enviar_email') {
        const { destinatario, assunto, corpo } = chamadaFuncao.args || {};
        const alvo = (typeof destinatario === 'string' && /\S+@\S+\.\S+/.test(destinatario)) ? destinatario : emailUsuario;

        let resultadoFuncao;
        let emailEnviado = null;

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
                emailEnviado = { destinatario: alvo, assunto: assunto || null };
            } catch (e) {
                resultadoFuncao = { sucesso: false, motivo: e.message };
            }
        }

        const segundaResposta = await chamarGemini({
            systemInstruction,
            contents: [
                ...contents,
                { role: 'model', parts: [{ functionCall: chamadaFuncao }] },
                { role: 'user', parts: [{ functionResponse: { name: 'enviar_email', response: resultadoFuncao } }] }
            ],
            tools: [FERRAMENTA_ENVIAR_EMAIL]
        });

        const textoFinal = segundaResposta?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        return {
            resposta: textoFinal || (resultadoFuncao.sucesso ? 'E-mail enviado com sucesso.' : `Não consegui enviar o e-mail: ${resultadoFuncao.motivo}`),
            emailEnviado
        };
    }

    const texto = parts.find(p => p.text)?.text;
    return { resposta: texto || 'Não consegui gerar uma resposta agora. Tente novamente em instantes.', emailEnviado: null };
}

module.exports = { montarContextoFinanceiro, chamarAssistenteIA, geminiConfigurado };
