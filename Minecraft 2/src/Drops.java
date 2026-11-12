import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * Itens soltos no chão: o que sobra de um bloco quebrado, o que as criaturas deixam, o que o jogador
 * joga fora (tecla Q) e o inventário de quem morre. Cada um é uma miniatura que cai, fica flutuando
 * e girando, e é coletada sozinha quando o jogador chega perto.
 */
final class Drops {
    private static final double PICKUP_DELAY = 0.5;   // não pega na hora em que cai
    private static final double PICKUP_RADIUS = 1.3;  // distância horizontal para coletar
    private static final double MAGNET_RADIUS = 2.4;  // de perto, o item é puxado para o jogador
    private static final double LIFETIME = 300;       // some depois de 5 minutos

    private static final class Drop extends Entity {
        final int item;
        final double phase;
        int count, wear;
        double age, delay = PICKUP_DELAY;

        Drop(int item, int count, int wear, double x, double y, double z, double phase) {
            super(0.14, 0.28);
            this.item = item;
            this.count = count;
            this.wear = wear;
            this.x = x; this.y = y; this.z = z;
            this.phase = phase;
        }
    }

    private final List<Drop> list = new ArrayList<>();
    private final Random rnd = new Random();

    void clear() {
        list.clear();
    }

    /** Solta uma miniatura de item no meio do bloco que foi quebrado. */
    void spawn(int item, int bx, int by, int bz) {
        spawn(item, 1, 0, bx + 0.5, by + 0.2, bz + 0.5,
                (rnd.nextDouble() - 0.5) * 2.4, 3.2, (rnd.nextDouble() - 0.5) * 2.4, PICKUP_DELAY);
    }

    /** Solta uma pilha de itens num ponto, com velocidade inicial; delay = tempo até poder ser coletada. */
    void spawn(int item, int count, int wear, double x, double y, double z, double vx, double vy, double vz, double delay) {
        if (item <= 0 || count <= 0 || !Items.exists(item)) return;
        if (list.size() > 600) list.remove(0);
        Drop d = new Drop(item, count, wear, x, y, z, rnd.nextDouble() * Math.PI * 2);
        d.vx = vx; d.vy = vy; d.vz = vz;
        d.delay = delay;
        list.add(d);
    }

    /** Espalha em volta de um ponto (criatura morta, explosão, morte do jogador). */
    void scatter(int item, int count, int wear, double x, double y, double z) {
        spawn(item, count, wear, x, y, z, (rnd.nextDouble() - 0.5) * 3.2, 2.5 + rnd.nextDouble() * 2, (rnd.nextDouble() - 0.5) * 3.2, 1.0);
    }

    /** Uma explosão joga os itens soltos para longe. */
    void blast(double x, double y, double z, double power) {
        for (Drop d : list) {
            double dx = d.x - x, dy = d.y - y, dz = d.z - z;
            double dist = Math.max(0.4, Math.sqrt(dx * dx + dy * dy + dz * dz));
            if (dist > power * 2) continue;
            double k = (1 - dist / (power * 2)) * 9;
            d.vx += dx / dist * k; d.vy += 3 + dy / dist * k; d.vz += dz / dist * k;
        }
    }

    /** Física dos itens e coleta pelo jogador (o que não couber no inventário fica no chão). */
    void update(double dt, World w, Player p, Inventory inv) {
        boolean alive = p.health > 0;
        for (Iterator<Drop> it = list.iterator(); it.hasNext(); ) {
            Drop d = it.next();
            d.age += dt;
            if (d.age > LIFETIME) { it.remove(); continue; }

            double dx = p.x - d.x, dz = p.z - d.z, dy = p.y + 0.9 - (d.y + 0.15);
            double flat = Math.sqrt(dx * dx + dz * dz);
            boolean canPick = alive && d.age >= d.delay && Math.abs(dy) < 1.5;

            d.updateFluids(w);
            if (d.inLava) { it.remove(); continue; }
            if (d.inWater) {
                d.vy = Math.max(-1.2, d.vy - 6 * dt);
                d.vx *= 0.9; d.vz *= 0.9;
            } else {
                d.vy = Math.max(-40, d.vy - 28 * dt);
            }
            // perto do jogador, o item desliza na direção dele
            if (canPick && flat < MAGNET_RADIUS && flat > 0.05 && fits(inv, d)) {
                double pull = 14 * dt * (1 - flat / MAGNET_RADIUS + 0.2);
                d.vx += dx / flat * pull * 4; d.vz += dz / flat * pull * 4;
            }
            d.move(dt, w, false);
            if (d.onGround) { d.vx *= 0.6; d.vz *= 0.6; if (d.vy < 0) d.vy = 0; }
            if (d.y < -20) { it.remove(); continue; }

            if (!canPick || flat > PICKUP_RADIUS) continue;
            int before = d.count;
            if (Items.isDurable(d.item)) {
                if (inv.addTool(d.item, d.wear)) d.count = 0;
            } else {
                d.count = inv.add(d.item, d.count);
            }
            if (d.count < before) Sounds.play("coletar", 0.7);
            if (d.count <= 0) it.remove();
        }
    }

    private static boolean fits(Inventory inv, Drop d) {
        for (int i = 0; i < Inventory.SIZE; i++) {
            if (inv.empty(i)) return true;
            if (inv.id[i] == d.item && inv.count[i] < Items.maxStack(d.item)) return true;
        }
        return false;
    }

    /** Acrescenta as miniaturas (girando e balançando) aos triângulos de criaturas já montados em r. */
    void buildMesh(GLRenderer r, World w, double camX, double camZ, double viewDist, double time) {
        if (list.isEmpty()) return;
        double maxDist = Math.min(viewDist, 48); // de longe uma miniatura nem aparece
        int need = r.entityVertCount * 6;
        for (Drop d : list) need += Hand.dropModel(d.item).length * (d.count > 1 ? 2 : 1);
        if (r.entityVerts.length < need) r.entityVerts = java.util.Arrays.copyOf(r.entityVerts, need + 4096);
        int o = r.entityVertCount * 6;
        double daylight = w.daylight();
        for (Drop d : list) {
            double dx = d.x - camX, dz = d.z - camZ;
            if (dx * dx + dz * dz > maxDist * maxDist) continue;
            int bx = (int) Math.floor(d.x), by = (int) Math.floor(d.y + 0.5), bz = (int) Math.floor(d.z);
            double sky = w.skyLight(bx, by, bz) / 15.0 * (0.13 + 0.87 * daylight);
            double blk = Math.pow(w.blockLightAt(bx, by, bz) / 15.0, 1.5);
            double light = Math.min(1.0, Math.max(sky, blk) * 0.95 + 0.05);
            if (Items.isBlock(d.item) && Block.light(d.item) > 0) light = 1;

            boolean cube = Hand.isCubeItem(d.item);
            double size = cube ? 0.3 : 0.45;
            double bob = Math.sin(time * 2.2 + d.phase) * 0.06;
            float[] m = Hand.dropModel(d.item);
            // uma pilha (mais de um item) mostra duas miniaturas, uma um pouco deslocada
            for (int copy = 0; copy < (d.count > 1 ? 2 : 1); copy++) {
                double[] t = Hand.Tf.translate(d.x, d.y + size / 2 + 0.12 + bob + copy * 0.07, d.z);
                t = Hand.Tf.mul(t, Hand.Tf.rotY(time * 1.8 + d.phase));
                if (copy > 0) t = Hand.Tf.mul(t, Hand.Tf.translate(0.1, 0, 0.08));
                t = Hand.Tf.mul(t, Hand.Tf.scale(size));
                float[] out = r.entityVerts;
                for (int i = 0; i < m.length; i += 6) {
                    double x = m[i], y = m[i + 1], z = m[i + 2];
                    out[o++] = (float) (t[0] * x + t[1] * y + t[2] * z + t[3]);
                    out[o++] = (float) (t[4] * x + t[5] * y + t[6] * z + t[7]);
                    out[o++] = (float) (t[8] * x + t[9] * y + t[10] * z + t[11]);
                    out[o++] = (float) (m[i + 3] * light);
                    out[o++] = (float) (m[i + 4] * light);
                    out[o++] = (float) (m[i + 5] * light);
                }
            }
        }
        r.entityVertCount = o / 6;
    }
}
