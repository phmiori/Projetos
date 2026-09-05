const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

/**
 * Garante que as colunas novas do alerta de preço de FII existam no banco, mesmo que o
 * `prisma db push` não tenha sido rodado manualmente ainda. Idempotente (IF NOT EXISTS),
 * seguro de rodar toda vez que o servidor sobe.
 */
async function garantirColunasAlertaFII() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "email" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "InvestimentoFII" ADD COLUMN IF NOT EXISTS "alertaPrecoAbaixoDe" DOUBLE PRECISION`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "InvestimentoFII" ADD COLUMN IF NOT EXISTS "alertaDisparado" BOOLEAN NOT NULL DEFAULT false`);
        console.log('[Prisma] Colunas de alerta de preço de FII verificadas/criadas com sucesso.');
    } catch (e) {
        console.error('[Prisma] Falha ao garantir colunas de alerta de FII:', e.message);
    }
}

/**
 * Garante que as colunas novas do alerta de preço de Cripto existam no banco, mesmo que o
 * `prisma db push` não tenha sido rodado manualmente ainda. Idempotente (IF NOT EXISTS).
 */
async function garantirColunasAlertaCripto() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "InvestimentoCripto" ADD COLUMN IF NOT EXISTS "alertaPrecoAbaixoDe" DOUBLE PRECISION`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "InvestimentoCripto" ADD COLUMN IF NOT EXISTS "alertaDisparado" BOOLEAN NOT NULL DEFAULT false`);
        console.log('[Prisma] Colunas de alerta de preço de Cripto verificadas/criadas com sucesso.');
    } catch (e) {
        console.error('[Prisma] Falha ao garantir colunas de alerta de Cripto:', e.message);
    }
}

/**
 * Garante que a coluna "role" exista em Usuario e promove Davi_olp/PhMiori a administradores,
 * mesmo que o `prisma db push` não tenha sido rodado manualmente ainda. Idempotente.
 */
async function garantirColunaRole() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'usuario'`);
        await prisma.$executeRawUnsafe(`UPDATE "Usuario" SET "role" = 'admin' WHERE username IN ('Davi_olp', 'PhMiori') AND "role" <> 'admin'`);
        console.log('[Prisma] Coluna role verificada/criada e administradores promovidos com sucesso.');
    } catch (e) {
        console.error('[Prisma] Falha ao garantir coluna role:', e.message);
    }
}

/**
 * Função de Seed dos Usuários Administradores (fixos, cadastrados apenas uma vez)
 */
async function seedUsuarios() {
    try {
        const count = await prisma.usuario.count();
        if (count === 0) {
            console.log('[Prisma] Cadastrando usuários administradores...');

            const admins = [
                { username: 'Davi_olp', nome: 'Davi', senha: 'adm123' },
                { username: 'PhMiori', nome: 'Ph Miori', senha: 'adm123' }
            ];

            for (const admin of admins) {
                const senhaHash = await bcrypt.hash(admin.senha, 10);
                await prisma.usuario.create({
                    data: { username: admin.username, nome: admin.nome, senhaHash, role: 'admin' }
                });
            }

            console.log('[Prisma] Usuários administradores cadastrados com sucesso!');
        }
    } catch (e) {
        console.warn('[Prisma] Aviso na inicialização de usuários:', e.message);
    }
}

module.exports = { garantirColunasAlertaFII, garantirColunasAlertaCripto, garantirColunaRole, seedUsuarios };
