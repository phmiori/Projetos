import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Flechas: projéteis com gravidade, disparados pelo arco do jogador e pelos esqueletos. Voam, acertam
 * criaturas e jogadores, ficam presas nos blocos (de onde podem ser recolhidas) e somem depois de um tempo.
 *
 * No multijogador quem decide tudo (acertos, dano, coleta, sumiço) é o anfitrião; os amigos só simulam o
 * voo para desenhar, e recebem do anfitrião onde cada flecha nasceu, onde prendeu e quando sumiu.
 */
final class Arrows {
    static final double GRAVITY = 20;
    private static final double LIFE_FLYING = 30, LIFE_STUCK = 60;
    /** Dono de uma flecha que não é de jogador (esqueleto). O anfitrião é o jogador 0. */
    static final int OWNER_MOB = -1;

    static final class Arrow extends Entity {
        int id;
        final int owner;        // id do jogador que atirou, ou OWNER_MOB
        final int shooterMob;   // id da criatura que atirou (para ela não se acertar), ou -1
        final double damage;
        final boolean pickup;   // pode ser recolhida depois de presa (flechas de jogador na sobrevivência)
        boolean stuck;
        double age, stuckAge;
        double dx, dy = -1, dz; // para onde aponta
        int bx, by = Integer.MIN_VALUE, bz; // bloco em que está presa

        Arrow(int owner, int shooterMob, double damage, boolean pickup) {
            super(0.03, 0.06);
            this.owner = owner;
            this.shooterMob = shooterMob;
            this.damage = damage;
            this.pickup = pickup;
        }
    }

    /** Quem usa as flechas (o jogo): decide os acertos e toca os efeitos. */
    interface Listener {
        /** A flecha vai andar len na direção (ux,uy,uz): acertou alguém nesse trecho? true = a flecha some. */
        boolean hitEntity(Arrow a, double ux, double uy, double uz, double len);
        /** A flecha prendeu num bloco. */
        void stuck(Arrow a, int block);
        /** A flecha sumiu por tempo ou caiu do mundo. */
        void expired(Arrow a);
    }

    final List<Arrow> list = new ArrayList<>();
    private int nextId = 1;

    void clear() {
        list.clear();
    }

    /** Cria uma flecha nova (anfitrião ou jogo sozinho), com um id próprio. */
    Arrow spawn(int owner, int shooterMob, double x, double y, double z, double vx, double vy, double vz, double damage, boolean pickup) {
        Arrow a = new Arrow(owner, shooterMob, damage, pickup);
        a.id = nextId++;
        place(a, x, y, z, vx, vy, vz);
        if (list.size() > 400) list.remove(0);
        list.add(a);
        return a;
    }

    /** Cópia de uma flecha do anfitrião (no jogo de um amigo): só para desenhar. */
    Arrow mirror(int id, int owner, double x, double y, double z, double vx, double vy, double vz) {
        Arrow a = byId(id);
        if (a == null) {
            a = new Arrow(owner, -1, 0, false);
            a.id = id;
            list.add(a);
        }
        a.stuck = false;
        place(a, x, y, z, vx, vy, vz);
        return a;
    }

    private static void place(Arrow a, double x, double y, double z, double vx, double vy, double vz) {
        a.x = x; a.y = y; a.z = z;
        a.vx = vx; a.vy = vy; a.vz = vz;
        aim(a);
    }

    private static void aim(Arrow a) {
        double l = Math.sqrt(a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
        if (l > 0.5) { a.dx = a.vx / l; a.dy = a.vy / l; a.dz = a.vz / l; }
    }

    Arrow byId(int id) {
        for (Arrow a : list) if (a.id == id) return a;
        return null;
    }

    /** Prende a flecha num ponto (o amigo recebe isso do anfitrião). */
    static void stick(Arrow a, double x, double y, double z, double dx, double dy, double dz, int bx, int by, int bz) {
        a.x = x; a.y = y; a.z = z;
        a.dx = dx; a.dy = dy; a.dz = dz;
        a.bx = bx; a.by = by; a.bz = bz;
        a.vx = a.vy = a.vz = 0;
        a.stuck = true;
        a.stuckAge = 0;
    }

    /**
     * Avança todas as flechas. authority: este jogo decide acertos e sumiço (anfitrião ou jogo sozinho);
     * sem ela, só o voo e o encaixe nos blocos são simulados, para o desenho.
     */
    void update(double dt, World w, boolean authority, Listener l) {
        for (Iterator<Arrow> it = list.iterator(); it.hasNext(); ) {
            Arrow a = it.next();
            a.age += dt;
            if (a.stuck) {
                a.stuckAge += dt;
                if (a.by != Integer.MIN_VALUE && !Block.solid(w.get(a.bx, a.by, a.bz))) {
                    a.stuck = false; // o bloco sumiu: a flecha cai de novo
                    a.vx = a.vy = a.vz = 0;
                } else {
                    if (authority && a.stuckAge > LIFE_STUCK) { it.remove(); l.expired(a); }
                    continue;
                }
            }
            if (a.age > LIFE_FLYING + LIFE_STUCK || a.y < -20) {
                it.remove();
                if (authority) l.expired(a);
                continue;
            }
            boolean water = Block.isWater(w.get((int) Math.floor(a.x), (int) Math.floor(a.y), (int) Math.floor(a.z)));
            a.vy -= GRAVITY * dt;
            double drag = Math.max(0, 1 - (water ? 3.0 : 0.25) * dt);
            a.vx *= drag; a.vy *= drag; a.vz *= drag;
            double mx = a.vx * dt, my = a.vy * dt, mz = a.vz * dt;
            double len = Math.sqrt(mx * mx + my * my + mz * mz);
            if (len < 1e-7) continue;
            double ux = mx / len, uy = my / len, uz = mz / len;
            int steps = Math.max(1, (int) Math.ceil(len / 0.2));
            double sl = len / steps;
            boolean gone = false;
            for (int s = 0; s < steps && !a.stuck; s++) {
                if (authority && l.hitEntity(a, ux, uy, uz, sl)) { gone = true; break; }
                double nx = a.x + ux * sl, ny = a.y + uy * sl, nz = a.z + uz * sl;
                if (a.collides(nx, ny, nz, w)) {
                    aim(a);
                    a.vx = a.vy = a.vz = 0;
                    a.stuck = true;
                    a.stuckAge = 0;
                    findBlock(a, nx, ny, nz, w);
                    l.stuck(a, a.by == Integer.MIN_VALUE ? Block.STONE : w.get(a.bx, a.by, a.bz));
                } else {
                    a.x = nx; a.y = ny; a.z = nz;
                }
            }
            if (gone) { it.remove(); continue; }
            if (!a.stuck) aim(a);
        }
    }

    /** Descobre em que bloco a flecha bateu (o do ponto de impacto, ou o de baixo: cercas têm 1,5 de altura). */
    private static void findBlock(Arrow a, double nx, double ny, double nz, World w) {
        int x = (int) Math.floor(nx), y = (int) Math.floor(ny + 0.03), z = (int) Math.floor(nz);
        a.by = Integer.MIN_VALUE;
        for (int k = 0; k < 2; k++)
            if (Block.solid(w.get(x, y - k, z))) { a.bx = x; a.by = y - k; a.bz = z; return; }
    }

    // ------------------------------------------------------------------ desenho

    private static final int FLOATS = 4 * 36 * 6;
    private static final int[][] FACES = { { 1, 3, 7, 7, 5, 1 }, { 0, 4, 6, 6, 2, 0 }, { 2, 6, 7, 7, 3, 2 },
            { 0, 1, 5, 5, 4, 0 }, { 4, 5, 7, 7, 6, 4 }, { 0, 2, 3, 3, 1, 0 } };
    private static final double[] SHADE = { 0.8, 0.8, 1.0, 0.6, 0.72, 0.72 };
    private static final double[][] C = new double[8][3];

    /** Acrescenta as flechas (haste, ponta e penas) aos triângulos de criaturas já montados em r. */
    void buildMesh(GLRenderer r, World w, double camX, double camZ, double viewDist) {
        if (list.isEmpty()) return;
        int o = r.entityVertCount * 6, need = o + list.size() * FLOATS;
        if (r.entityVerts.length < need) r.entityVerts = java.util.Arrays.copyOf(r.entityVerts, need + 4096);
        float[] out = r.entityVerts;
        double max = Math.min(viewDist, 80), daylight = w.daylight();
        for (Arrow a : list) {
            double ddx = a.x - camX, ddz = a.z - camZ;
            if (ddx * ddx + ddz * ddz > max * max) continue;
            // de onde vem a luz: a célula um pouco atrás da ponta (a ponta pode estar dentro do bloco)
            int bx = (int) Math.floor(a.x - a.dx * 0.3), by = (int) Math.floor(a.y - a.dy * 0.3), bz = (int) Math.floor(a.z - a.dz * 0.3);
            double sky = w.skyLight(bx, by, bz) / 15.0 * (0.13 + 0.87 * daylight);
            double blk = Math.pow(w.blockLightAt(bx, by, bz) / 15.0, 1.5);
            double light = Math.min(1.0, Math.max(sky, blk) * 0.95 + 0.05);
            // base: f = para onde aponta, rt e up = perpendiculares
            double fx = a.dx, fy = a.dy, fz = a.dz;
            double rx = fz, rz = -fx, rl = Math.sqrt(rx * rx + rz * rz), ry = 0;
            if (rl < 1e-4) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
            double ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
            double[] b = { a.x, a.y + 0.03, a.z, fx, fy, fz, rx, ry, rz, ux, uy, uz };
            o = box(out, o, b, -0.62, 0.06, 0.018, 0.018, 0x8A6236, light);  // haste
            o = box(out, o, b, 0.06, 0.18, 0.034, 0.034, 0x55555C, light);   // ponta
            o = box(out, o, b, -0.66, -0.5, 0.06, 0.008, 0xEDEDE4, light);   // penas
            o = box(out, o, b, -0.66, -0.5, 0.008, 0.06, 0xEDEDE4, light);
        }
        r.entityVertCount = o / 6;
    }

    /** Caixa ao longo da flecha: de f0 a f1 no eixo dela, com meia largura hr e meia altura hu. */
    private static int box(float[] out, int o, double[] b, double f0, double f1, double hr, double hu, int color, double light) {
        for (int i = 0; i < 8; i++) {
            double r = (i & 1) == 0 ? -hr : hr, u = (i & 2) == 0 ? -hu : hu, f = (i & 4) == 0 ? f0 : f1;
            C[i][0] = b[0] + b[3] * f + b[6] * r + b[9] * u;
            C[i][1] = b[1] + b[4] * f + b[7] * r + b[10] * u;
            C[i][2] = b[2] + b[5] * f + b[8] * r + b[11] * u;
        }
        for (int face = 0; face < 6; face++) {
            double l = SHADE[face] * light;
            float cr = (float) (((color >> 16) & 255) / 255.0 * l), cg = (float) (((color >> 8) & 255) / 255.0 * l), cb = (float) ((color & 255) / 255.0 * l);
            for (int t : FACES[face]) {
                out[o++] = (float) C[t][0]; out[o++] = (float) C[t][1]; out[o++] = (float) C[t][2];
                out[o++] = cr; out[o++] = cg; out[o++] = cb;
            }
        }
        return o;
    }
}
