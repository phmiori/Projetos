/**
 * server.js
 * Servidor API REST com Express e Prisma ORM para Gestão de Carros de Leilão
 */

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const cron = require('node-cron');

const { requireAuth } = require('./lib/auth-middleware');
const { mailTransporter, verificarAlertasPrecoFII, snapshotHistoricoTodosFiis } = require('./lib/fii-alerts');
const { verificarAlertasPrecoCripto } = require('./lib/cripto-alerts');
const { gerarTransacoesRecorrentesPendentes } = require('./lib/financas-shared');
const { pushConfigurado, enviarPushNotificacoesPendentes } = require('./lib/push-shared');
const { geminiConfigurado } = require('./lib/assistente-shared');
const { garantirColunasAlertaFII, garantirColunasAlertaCripto, garantirColunaRole, seedUsuarios } = require('./lib/bootstrap');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            // Chart.js é carregado via CDN nos módulos Index, FII e Cripto
            'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
            // Todos os módulos renderizam botões com onclick="..." via innerHTML (padrão já
            // existente em todo o app). O default do Helmet ('none') bloqueia esses handlers.
            'script-src-attr': ["'unsafe-inline'"]
        }
    }
}));
// Sem allowlist de origem: app de uso doméstico, sem consumidores de API cross-origin.
app.use(cors());
app.use(express.json({ limit: '3mb' })); // limite maior para acomodar foto de perfil em Base64

if (process.env.NODE_ENV === 'production') {
    // Necessário para cookies "secure" funcionarem atrás de proxy reverso com TLS (Heroku/Render/etc.)
    app.set('trust proxy', 1);
}

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.warn('AVISO: SESSION_SECRET não definido em produção. Defina-o no .env.');
}

/**
 * Sessões persistidas no próprio Postgres (Neon), em vez do MemoryStore padrão do
 * express-session: o MemoryStore perde todas as sessões (derruba todo mundo logado) sempre
 * que o processo Node reinicia — o que acontece a cada deploy e, no plano gratuito do Render,
 * também quando o serviço hiberna por inatividade e "acorda" de novo. `createTableIfMissing`
 * cria a tabela de sessões sozinho, sem precisar de `prisma db push` (não faz parte do schema
 * do Prisma, é uma tabela própria do connect-pg-simple).
 */
app.use(session({
    store: new pgSession({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        tableName: 'sessao_usuario'
    }),
    secret: process.env.SESSION_SECRET || 'autoleilao-hub-chave-local-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dias — antes eram 8h, agora seguro por ficar persistido no banco
    }
}));

// Servir arquivos estáticos do frontend
app.use(express.static(__dirname));

// Rotas de autenticação (login/logout/perfil/usuários) — protegidas rota a rota (login e logout são públicas)
app.use('/api/auth', require('./routes/auth'));

// Demais módulos: todos exigem sessão autenticada
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api/veiculos', requireAuth, require('./routes/veiculos'));
app.use('/api/imoveis', requireAuth, require('./routes/imoveis'));
app.use('/api/fii', requireAuth, require('./routes/fii'));
app.use('/api/cripto', requireAuth, require('./routes/cripto'));
app.use('/api/cofrinhos', requireAuth, require('./routes/cofrinhos'));
app.use('/api/eventos', requireAuth, require('./routes/eventos'));
app.use('/api/notificacoes', requireAuth, require('./routes/notificacoes'));
app.use('/api/clima', requireAuth, require('./routes/clima'));
app.use('/api/financas', requireAuth, require('./routes/financas'));
app.use('/api/treinos', requireAuth, require('./routes/treinos'));
app.use('/api/saude', requireAuth, require('./routes/saude'));
app.use('/api/garagem', requireAuth, require('./routes/garagem'));
app.use('/api/backup', requireAuth, require('./routes/backup'));
app.use('/api/assistente', requireAuth, require('./routes/assistente'));

// Redirecionamento da raiz para a página inicial
app.get('/', (req, res) => {
    res.redirect('/HTML/Index/index.html');
});

/**
 * Jobs agendados: a cada 5 minutos, atualizam a cotação de todo FII/Cripto que tenha um alerta
 * de preço configurado e disparam e-mail para o dono quando o preço cruzar abaixo do limite.
 * Rodam no servidor, independente de alguém estar com o site aberto. Timers separados (FII usa
 * Yahoo Finance, Cripto usa CoinGecko) para que uma falha em uma API não trave a outra.
 */
cron.schedule('*/5 * * * *', verificarAlertasPrecoFII);
cron.schedule('*/5 * * * *', verificarAlertasPrecoCripto);

/**
 * Gera a próxima ocorrência de cada transação recorrente (Finanças) cujo mês já venceu.
 * Roda 1x por dia (não precisa de mais frequência: recorrência é sempre mensal) e também
 * uma vez ao iniciar o servidor, para não depender de o processo ficar de pé à meia-noite.
 */
cron.schedule('0 3 * * *', () => {
    gerarTransacoesRecorrentesPendentes().catch((err) => console.error('Erro no cron de recorrência de transações:', err));
});

/**
 * Snapshot diário do preço de todos os FIIs da carteira (independente de alerta configurado),
 * usado pelo gráfico de "Histórico de Preço" no módulo FII. Roda após o fechamento do mercado.
 */
cron.schedule('0 19 * * *', () => {
    snapshotHistoricoTodosFiis().catch((err) => console.error('Erro no cron de histórico de preço de FII:', err));
});

/**
 * Envia notificações Web Push (lembrete de evento, fatura vencendo) aos dispositivos inscritos,
 * na mesma cadência dos demais alertas. Sem efeito se VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não
 * estiverem configuradas no .env.
 */
cron.schedule('*/5 * * * *', () => {
    enviarPushNotificacoesPendentes().catch((err) => console.error('Erro no cron de notificações push:', err));
});

// Iniciar servidor
app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(` AutoLeilão Hub (FinanceHub) rodando na porta ${PORT}`);
    console.log(` Acesso web: http://localhost:${PORT}/HTML/Index/index.html`);
    console.log(`====================================================`);
    console.log(mailTransporter ? ' Alertas de preço por e-mail: ativos (SMTP configurado)' : ' Alertas de preço por e-mail: DESATIVADOS (defina SMTP_USER e SMTP_PASS no .env)');
    console.log(pushConfigurado ? ' Notificações push: ativas (VAPID configurado)' : ' Notificações push: DESATIVADAS (defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env)');
    console.log(geminiConfigurado ? ' Assistente de IA: ativo (GEMINI_API_KEY configurado)' : ' Assistente de IA: DESATIVADO (defina GEMINI_API_KEY no .env)');
    console.log(`====================================================`);
    await garantirColunasAlertaFII();
    await garantirColunasAlertaCripto();
    await garantirColunaRole();
    await seedUsuarios();
    gerarTransacoesRecorrentesPendentes().catch((err) => console.error('Erro ao gerar transações recorrentes pendentes na inicialização:', err));
});
