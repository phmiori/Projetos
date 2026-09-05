/**
 * lib/push-shared.js
 * Envio de notificações Web Push (evento com lembrete e fatura vencendo) para os dispositivos
 * inscritos de cada usuário. Requer VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no .env (gere com
 * `npx web-push generate-vapid-keys`) — sem elas, o recurso fica desativado sem quebrar o resto
 * do sistema (mesmo padrão do e-mail de alerta de preço em lib/fii-alerts.js).
 */

const webpush = require('web-push');
const prisma = require('./prisma');
const { buscarEventosComNotificacaoAtiva, buscarFaturasVencendoAtivas } = require('./notificacoes-shared');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const pushConfigurado = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushConfigurado) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:contato@financehub.local',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

/**
 * Envia um push para todos os dispositivos inscritos de um usuário. Remove automaticamente
 * inscrições que o navegador reporta como expiradas/inválidas (404/410).
 */
async function enviarPushParaUsuario(usuarioId, payload) {
    if (!pushConfigurado) return;

    const inscricoes = await prisma.pushSubscription.findMany({ where: { usuarioId } });
    await Promise.all(inscricoes.map(async (sub) => {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify(payload)
            );
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            } else {
                console.error(`[Push] Falha ao enviar para inscrição ${sub.id}:`, err.message);
            }
        }
    }));
}

/**
 * Job agendado: para cada usuário com ao menos um dispositivo inscrito, verifica lembretes de
 * evento e faturas vencendo (mesmas fontes do sino de notificações) e envia push só das que
 * ainda não foram enviadas (controlado por PushNotificacaoEnviada), evitando reenvio repetido.
 */
async function enviarPushNotificacoesPendentes() {
    if (!pushConfigurado) return;

    try {
        const usuariosComPush = await prisma.pushSubscription.findMany({
            select: { usuarioId: true },
            distinct: ['usuarioId']
        });

        for (const { usuarioId } of usuariosComPush) {
            try {
                const [eventos, faturas] = await Promise.all([
                    buscarEventosComNotificacaoAtiva(usuarioId),
                    buscarFaturasVencendoAtivas(usuarioId).catch(() => [])
                ]);

                const candidatos = [
                    ...eventos.map(ev => ({
                        tipo: 'evento',
                        entidadeId: ev.id,
                        title: `📅 ${ev.titulo}`,
                        body: ev.local || 'Lembrete de evento no seu Calendário',
                        url: '/HTML/Calendario/calendario.html'
                    })),
                    ...faturas.map(f => ({
                        tipo: 'fatura',
                        entidadeId: f.id,
                        title: '💳 Fatura de cartão vencendo',
                        body: `${f.cartao.nome} vence em ${new Date(f.dataVencimento).toLocaleDateString('pt-BR')}`,
                        url: '/HTML/Financas/financas.html'
                    }))
                ];
                if (!candidatos.length) continue;

                const jaEnviadas = await prisma.pushNotificacaoEnviada.findMany({
                    where: { usuarioId, OR: candidatos.map(c => ({ tipo: c.tipo, entidadeId: c.entidadeId })) }
                });
                const enviadasSet = new Set(jaEnviadas.map(e => `${e.tipo}-${e.entidadeId}`));

                for (const c of candidatos) {
                    if (enviadasSet.has(`${c.tipo}-${c.entidadeId}`)) continue;
                    await enviarPushParaUsuario(usuarioId, { title: c.title, body: c.body, url: c.url });
                    await prisma.pushNotificacaoEnviada.create({
                        data: { usuarioId, tipo: c.tipo, entidadeId: c.entidadeId }
                    }).catch(() => {});
                }
            } catch (err) {
                console.error(`[Push] Falha ao processar usuário ${usuarioId}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Push] Falha no job de notificações pendentes:', err.message);
    }
}

module.exports = {
    pushConfigurado,
    VAPID_PUBLIC_KEY,
    enviarPushParaUsuario,
    enviarPushNotificacoesPendentes
};
