const express = require('express');
const radar = require('../lib/radar-shared');

const router = express.Router();

/**
 * ROTA: Estado da análise do Radar (progresso, log, se o login do BuscaAii está configurado)
 * GET /api/radar/estado
 */
router.get('/estado', (req, res) => {
    const { log, ...resto } = radar.estado;
    res.json({ ...resto, log: log.slice(-60), buscaaiiConfigurado: radar.buscaaiiConfigurado(), fipeToken: Boolean(process.env.FIPE_TOKEN) });
});

/**
 * ROTA: Última análise salva + parâmetros do cálculo
 * GET /api/radar/resultados
 */
router.get('/resultados', async (req, res) => {
    try {
        const [dados, config] = await Promise.all([radar.lerChave('resultado'), radar.carregarConfig()]);
        res.json({ geradoEm: dados?.geradoEm || null, resultados: dados?.resultados || [], config });
    } catch (err) {
        console.error('Erro ao carregar resultados do Radar:', err);
        res.status(500).json({ error: 'Erro ao carregar o Radar de Oportunidades' });
    }
});

/**
 * ROTA: Inicia uma nova análise em segundo plano
 * POST /api/radar/analisar { editais }
 */
router.post('/analisar', (req, res) => {
    if (!radar.buscaaiiConfigurado()) {
        return res.status(400).json({ error: 'Defina BUSCAAII_EMAIL e BUSCAAII_SENHA no .env do servidor.' });
    }
    const editais = Math.min(Math.max(parseInt(req.body?.editais, 10) || 0, 0), 150);
    if (!radar.iniciarAnalise({ editais })) {
        return res.status(409).json({ error: 'Já existe uma análise em andamento.' });
    }
    res.json({ ok: true });
});

/**
 * ROTA: Salva parâmetros do cálculo e recalcula os vereditos na hora (sem baixar de novo)
 * PUT /api/radar/config
 */
const CAMPOS_NUMERICOS = ['comissaoLeiloeiro', 'custoDocumentacao', 'custoRemocao', 'desagioRevenda', 'margemMinima',
    'reparoExtraNaoFunciona', 'lanceSuspeitoPctFipe'];
const TIPOS_VALIDOS = ['CAR', 'PICKUP_TRUCK', 'VAN', 'MOTORCYCLE', 'TRUCK'];

router.put('/config', async (req, res) => {
    try {
        const corpo = req.body || {};
        const atual = await radar.carregarConfig();
        for (const k of CAMPOS_NUMERICOS) {
            if (corpo[k] !== undefined && Number.isFinite(Number(corpo[k]))) atual[k] = Number(corpo[k]);
        }
        for (const k of ['descartarSemFoto', 'descartarSinistro']) {
            if (corpo[k] !== undefined) atual[k] = Boolean(corpo[k]);
        }
        if (corpo.reparoPorCondicao && typeof corpo.reparoPorCondicao === 'object') {
            for (const k of Object.keys(atual.reparoPorCondicao)) {
                if (Number.isFinite(Number(corpo.reparoPorCondicao[k]))) atual.reparoPorCondicao[k] = Number(corpo.reparoPorCondicao[k]);
            }
        }
        if (Array.isArray(corpo.tiposProduto)) {
            const tipos = corpo.tiposProduto.filter(t => TIPOS_VALIDOS.includes(t));
            if (tipos.length) atual.tiposProduto = tipos;
        }
        await radar.gravarChave('config', atual);
        if (!radar.estado.rodando) await radar.reavaliarResultado();
        res.json({ ok: true, config: atual });
    } catch (err) {
        console.error('Erro ao salvar parâmetros do Radar:', err);
        res.status(500).json({ error: 'Erro ao salvar parâmetros do Radar' });
    }
});

module.exports = router;
