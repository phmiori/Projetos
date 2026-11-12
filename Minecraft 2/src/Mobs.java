import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * Cuida das criaturas: aparecimento (animais de dia na grama; monstros à noite e no escuro das
 * cavernas), atualização, ataque ao jogador e desenho.
 */
final class Mobs {
    final List<Mob> list = new ArrayList<>();
    private final Random rnd = new Random();
    private double spawnTimer;

    /** Ataques dos monstros neste quadro: {jogador atingido, dano, x, z de onde veio}. */
    final List<Object[]> hits = new ArrayList<>();

    void clear() {
        list.clear();
    }

    /** Dano total que o jogador p levou neste quadro (e de onde veio o último golpe). */
    double damageTo(Player p, double[] from) {
        double d = 0;
        for (Object[] h : hits)
            if (h[0] == p) { d += (Double) h[1]; from[0] = (Double) h[2]; from[1] = (Double) h[3]; }
        return d;
    }

    /**
     * Atualiza as criaturas. players: todos os jogadores do mundo (no multijogador, o anfitrião e os
     * amigos); listener é quem ouve os sons (o jogador desta tela). Cada monstro mira o mais próximo.
     */
    void update(double dt, World w, List<Player> players, Player listener, boolean survival) {
        hits.clear();
        if (players.isEmpty()) return;
        double daylight = w.daylight();
        for (Iterator<Mob> it = list.iterator(); it.hasNext(); ) {
            Mob m = it.next();
            Player p = nearest(players, m.x, m.z);
            m.update(dt, w, p, survival && p.health > 0, rnd);
            if (m.wantsAttack) {
                hits.add(new Object[] { p, m.attackDamage(), m.x, m.z });
                Sounds.playAt(Mob.SOUNDS[m.type], m.x, m.y + 1, m.z, listener, 0.9);
            }
            m.idleSound -= dt;
            if (m.idleSound <= 0 && Mob.SOUNDS[m.type] != null) {
                m.idleSound = 6 + rnd.nextDouble() * 10;
                Sounds.playAt(Mob.SOUNDS[m.type], m.x, m.y + 1, m.z, listener, 0.65);
            }
            double dx = m.x - p.x, dz = m.z - p.z;
            double dist = Math.sqrt(dx * dx + dz * dz);
            // monstros queimam/somem sob o sol
            if (m.hostile() && daylight > 0.75 && w.skyLight((int) Math.floor(m.x), (int) Math.floor(m.y + 1), (int) Math.floor(m.z)) >= 14) {
                m.burn += dt;
                if (m.burn > 4) { it.remove(); continue; }
            }
            if (m.health <= 0 || dist > 100 || m.y < -10) it.remove();
        }

        spawnTimer -= dt;
        if (spawnTimer > 0) return;
        spawnTimer = 0.8;
        int passive = 0, hostile = 0, fish = 0;
        for (Mob m : list) if (m.type == Mob.FISH) fish++; else if (m.hostile()) hostile++; else passive++;
        int n = players.size();
        Player p = players.get(rnd.nextInt(n)); // aparecem em volta de um jogador qualquer
        if (passive < 12 * n && rnd.nextDouble() < 0.45) spawnPassive(w, p);
        if (fish < 10 * n && rnd.nextDouble() < 0.5) spawnFish(w, p);
        if (hostile < 10 * n) spawnHostile(w, p, daylight);
    }

    private static Player nearest(List<Player> players, double x, double z) {
        Player best = players.get(0);
        double bd = 1e18;
        for (Player p : players) {
            double d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
            if (d < bd) { bd = d; best = p; }
        }
        return best;
    }

    Mob byId(int id) {
        for (Mob m : list) if (m.id == id) return m;
        return null;
    }

    private void spawnPassive(World w, Player p) {
        double a = rnd.nextDouble() * Math.PI * 2, r = 24 + rnd.nextDouble() * 30;
        int x = (int) (p.x + Math.sin(a) * r), z = (int) (p.z + Math.cos(a) * r);
        if (x < 2 || z < 2 || x >= World.SX - 2 || z >= World.SZ - 2) return;
        int top = w.grassTop(x, z);
        if (top < 0 || w.get(x, top, z) != Block.GRASS) return;
        int type = rnd.nextInt(3); // porco, ovelha ou galinha
        int n = 1 + rnd.nextInt(3);
        for (int i = 0; i < n; i++) {
            double mx = x + 0.5 + rnd.nextDouble() * 2 - 1, mz = z + 0.5 + rnd.nextDouble() * 2 - 1;
            Mob m = new Mob(type, mx, top + 1.01, mz);
            if (!m.collides(m.x, m.y, m.z, w)) list.add(m);
        }
    }

    /** Peixes: num ponto de água com pelo menos 2 blocos de fundo, perto do jogador. */
    private void spawnFish(World w, Player p) {
        for (int attempt = 0; attempt < 6; attempt++) {
            double a = rnd.nextDouble() * Math.PI * 2, r = 8 + rnd.nextDouble() * 26;
            int x = (int) (p.x + Math.sin(a) * r), z = (int) (p.z + Math.cos(a) * r);
            if (x < 2 || z < 2 || x >= World.SX - 2 || z >= World.SZ - 2) continue;
            for (int y = World.SEA - 1; y > 2; y--) {
                if (!Block.isWater(w.get(x, y, z))) continue;
                if (!Block.isWater(w.get(x, y - 1, z))) break; // raso demais
                int n = 1 + rnd.nextInt(3);
                for (int i = 0; i < n; i++) {
                    double fx = x + 0.5 + (rnd.nextDouble() - 0.5), fz = z + 0.5 + (rnd.nextDouble() - 0.5);
                    if (!Block.isWater(w.get((int) Math.floor(fx), y - 1, (int) Math.floor(fz)))) continue;
                    list.add(new Mob(Mob.FISH, fx, y - 0.7, fz));
                }
                return;
            }
        }
    }

    private void spawnHostile(World w, Player p, double daylight) {
        for (int attempt = 0; attempt < 4; attempt++) {
            double a = rnd.nextDouble() * Math.PI * 2, r = 18 + rnd.nextDouble() * 24;
            int x = (int) (p.x + Math.sin(a) * r), z = (int) (p.z + Math.cos(a) * r);
            if (x < 2 || z < 2 || x >= World.SX - 2 || z >= World.SZ - 2) continue;
            // procura um lugar com chão firme, duas células livres e escuro
            int y = 2 + rnd.nextInt(World.SY - 4);
            for (int k = 0; k < 12 && y > 1; k++, y--) {
                if (!Block.solid(w.get(x, y - 1, z)) || Block.solid(w.get(x, y, z)) || Block.solid(w.get(x, y + 1, z))) continue;
                if (Block.isWater(w.get(x, y, z)) || w.get(x, y, z) == Block.LAVA) continue;
                int sky = w.skyLight(x, y, z), blk = w.blockLightAt(x, y, z);
                double light = Math.max(sky / 15.0 * daylight, blk / 15.0);
                if (light > 0.3) continue;
                Mob m = new Mob(rnd.nextDouble() < 0.65 ? Mob.ZOMBIE : Mob.SPIDER, x + 0.5, y + 0.01, z + 0.5);
                if (m.collides(m.x, m.y, m.z, w)) continue;
                list.add(m);
                return;
            }
        }
    }

    /** Criatura mais próxima atingida pelo raio de visão, ou null. */
    Mob raycast(double ox, double oy, double oz, double dx, double dy, double dz, double reach) {
        Mob best = null;
        double bestT = reach;
        for (Mob m : list) {
            double t = m.rayHit(ox, oy, oz, dx, dy, dz);
            if (t >= 0 && t < bestT) { bestT = t; best = m; }
        }
        return best;
    }

    double rayDistance(Mob m, double ox, double oy, double oz, double dx, double dy, double dz) {
        return m.rayHit(ox, oy, oz, dx, dy, dz);
    }

    /** Monta os triângulos de todas as criaturas perto da câmera no renderizador. */
    void buildMesh(GLRenderer r, World w, double camX, double camZ, double viewDist) {
        int floats = 0;
        for (Mob m : list) floats += m.modelFloats();
        if (r.entityVerts.length < floats) r.entityVerts = new float[floats + 4096];
        int o = 0;
        double daylight = w.daylight();
        for (Mob m : list) {
            double dx = m.x - camX, dz = m.z - camZ;
            if (dx * dx + dz * dz > viewDist * viewDist) continue;
            int bx = (int) Math.floor(m.x), by = (int) Math.floor(m.y + 0.5), bz = (int) Math.floor(m.z);
            double sky = w.skyLight(bx, by, bz) / 15.0 * (0.13 + 0.87 * daylight);
            double blk = Math.pow(w.blockLightAt(bx, by, bz) / 15.0, 1.5);
            double light = Math.min(1.0, Math.max(sky, blk) * 0.95 + 0.05);
            o = m.writeModel(r.entityVerts, o, light);
        }
        r.entityVertCount = o / 6;
    }
}
