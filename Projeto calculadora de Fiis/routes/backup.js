const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

/**
 * ROTA: Exportar Todos os Dados do Usuário Logado em um único JSON (backup pessoal)
 * Sempre filtrado por usuarioId da sessão — nunca dados de outro usuário, nem para admins.
 * GET /api/backup/export
 */
router.get('/export', async (req, res) => {
    try {
        const usuarioId = req.session.userId;

        const [
            usuario,
            veiculos,
            imoveis,
            investimentosFII,
            fiiWatchlist,
            investimentosCripto,
            cofrinhos,
            eventos,
            gastosCasa,
            itensDespensa,
            tarefasCasa,
            blocosTreino,
            registrosSaude,
            veiculosGaragem,
            locaisClimaSalvos
        ] = await Promise.all([
            prisma.usuario.findUnique({ where: { id: usuarioId }, select: { nome: true, username: true, email: true } }),
            prisma.veiculo.findMany({ where: { usuarioId }, include: { gastos: true } }),
            prisma.imovelLeilao.findMany({ where: { usuarioId }, include: { gastos: true } }),
            prisma.investimentoFII.findMany({ where: { usuarioId } }),
            prisma.fiiWatchlist.findMany({ where: { usuarioId } }).catch(() => []),
            prisma.investimentoCripto.findMany({ where: { usuarioId } }),
            prisma.cofrinho.findMany({ where: { usuarioId } }),
            prisma.evento.findMany({ where: { usuarioId } }),
            prisma.gastoCasa.findMany({ where: { usuarioId } }),
            prisma.itemDespensa.findMany({ where: { usuarioId } }),
            prisma.tarefaCasa.findMany({ where: { usuarioId } }),
            prisma.blocoTreino.findMany({ where: { usuarioId }, include: { exercicios: true } }),
            prisma.registroSaude.findMany({ where: { usuarioId } }),
            prisma.veiculoGaragem.findMany({ where: { usuarioId }, include: { manutencoes: true } }),
            prisma.localClimaSalvo.findMany({ where: { usuarioId } })
        ]);

        const backup = {
            exportadoEm: new Date().toISOString(),
            usuario,
            veiculos,
            imoveis,
            investimentosFII,
            fiiWatchlist,
            investimentosCripto,
            cofrinhos,
            eventos,
            gastosCasa,
            itensDespensa,
            tarefasCasa,
            blocosTreino,
            registrosSaude,
            veiculosGaragem,
            locaisClimaSalvos
        };

        const dataHoje = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Disposition', `attachment; filename="financehub-backup-${dataHoje}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(backup, null, 2));
    } catch (err) {
        console.error('Erro ao gerar backup de dados:', err);
        res.status(500).json({ error: 'Erro ao gerar o backup dos seus dados' });
    }
});

module.exports = router;
