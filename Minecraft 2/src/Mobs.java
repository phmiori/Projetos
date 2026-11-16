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

    /** Creepers que explodiram neste quadro: {x, y, z, força}. */
    final List<double[]> explosions = new ArrayList<>();

    /** Flechas que os esqueletos soltaram neste quadro: {id da criatura, x, y, z, vx, vy, vz}. */
    final List<double[]> shots = new ArrayList<>();

    void clear() {
        list.clear();
    }

    /** Uma explosão machuca e empurra as criaturas em volta. */
    void blast(double x, double y, double z, double power) {
        for (Mob m : list) {
            double dx = m.x - x, dy = m.y + m.h / 2 - y, dz = m.z - z;
            double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > power * 2) continue;
            double k = 1 - dist / (power * 2);
            m.damage(k * power * 5);
            double l = Math.max(0.3, dist);
            m.vx += dx / l * k * 10; m.vz += dz / l * k * 10; m.vy += 4 + k * 5;
        }
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
    /** Criaturas que os lobos domesticados mataram neste quadro (o jogo solta o que elas deixam). */
    final List<Mob> kills = new ArrayList<>();

    void update(double dt, World w, List<Player> players, Player listener, boolean survival) {
        hits.clear();
        explosions.clear();
        shots.clear();
        kills.clear();
        if (players.isEmpty()) return;
        double daylight = w.daylight();
        for (Iterator<Mob> it = list.iterator(); it.hasNext(); ) {
            Mob m = it.next();
            if (!w.isLoaded((int) Math.floor(m.x), (int) Math.floor(m.z))) {
                if (m.tamed) continue;   // o lobo do jogador espera onde está (é salvo com o mundo)
                it.remove();             // o pedaço foi descarregado
                continue;
            }
            Player p = nearest(players, m.x, m.z);
            if (m.tamed && !m.sitting) chooseTarget(m);
            m.update(dt, w, p, survival && p.health > 0, rnd);
            if (m.wantsBite && m.target != null) { // mordida do lobo domesticado
                Mob t = m.target;
                t.damage(4);
                double kx = t.x - m.x, kz = t.z - m.z, kl = Math.max(0.01, Math.sqrt(kx * kx + kz * kz));
                t.vx += kx / kl * 6; t.vz += kz / kl * 6; t.vy = 4;
                Sounds.playAt("criatura_dano", t.x, t.y + 0.8, t.z, listener, 0.8);
                if (t.health <= 0) { kills.add(t); m.target = null; }
            }
            if (m.fuseStarted) Sounds.playAt("pavio", m.x, m.y + 1, m.z, listener, 0.9);
            if (m.exploding) {
                explosions.add(new double[] { m.x, m.y + 0.8, m.z, Mob.CREEPER_POWER });
                it.remove();
                continue;
            }
            if (m.wantsShoot) shots.add(shot(m, p));
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
            if (m.hostile() && m.type != Mob.CREEPER && daylight > 0.75 && w.skyLight((int) Math.floor(m.x), (int) Math.floor(m.y + 1), (int) Math.floor(m.z)) >= 14) {
                m.burn += dt;
                if (m.burn > 4) { it.remove(); continue; }
            }
            if (m.health <= 0 || (dist > 100 && !m.tamed) || m.y < -10) it.remove();
        }

        spawnTimer -= dt;
        if (spawnTimer > 0) return;
        spawnTimer = 0.8;
        int passive = 0, hostile = 0, fish = 0, birds = 0, sharks = 0;
        for (Mob m : list) {
            if (m.tamed) continue;
            if (m.type == Mob.SHARK) sharks++;
            if (m.swimmer()) fish++;
            else if (m.type == Mob.BIRD) birds++;
            else if (m.hostile()) hostile++;
            else passive++;
        }
        int n = players.size();
        Player p = players.get(rnd.nextInt(n)); // aparecem em volta de um jogador qualquer
        if (passive < 14 * n && rnd.nextDouble() < 0.45) spawnPassive(w, p);
        if (fish < 12 * n && rnd.nextDouble() < 0.5) spawnFish(w, p, sharks < n);
        if (birds < 8 * n && daylight > 0.3 && rnd.nextDouble() < 0.3) spawnBirds(w, p);
        if (hostile < 10 * n) spawnHostile(w, p, daylight);
    }

    /** Lobo domesticado: escolhe o monstro mais perto (até 10 blocos do dono) para atacar. */
    private void chooseTarget(Mob wolf) {
        if (wolf.target != null && (wolf.target.health <= 0 || !list.contains(wolf.target))) wolf.target = null;
        if (wolf.owner == null) { wolf.target = null; return; }
        if (wolf.target != null) return;
        Mob best = null;
        double bd = 10 * 10;
        for (Mob m : list) {
            if (!m.hostile() && !(m.attacksPlayer() && m.type != Mob.SHARK)) continue;
            double dx = m.x - wolf.owner.x, dz = m.z - wolf.owner.z, d = dx * dx + dz * dz;
            if (d < bd && Math.abs(m.y - wolf.owner.y) < 6) { bd = d; best = m; }
        }
        wolf.target = best;
    }

    /** Flecha do esqueleto m em direção ao jogador p: arco calculado para a distância, com um pouco de erro. */
    private double[] shot(Mob m, Player p) {
        double sx = m.x, sy = m.y + 1.45, sz = m.z;
        double dx = p.x - sx, dy = p.y + 1.0 - sy, dz = p.z - sz;
        double flat = Math.max(0.5, Math.sqrt(dx * dx + dz * dz));
        double t = flat / Mob.ARROW_SPEED;
        double e = 0.07;
        double vx = dx / t * (1 + (rnd.nextDouble() - 0.5) * e), vz = dz / t * (1 + (rnd.nextDouble() - 0.5) * e);
        double vy = (dy / t + 0.5 * Arrows.GRAVITY * t) * (1 + (rnd.nextDouble() - 0.5) * e) + 0.4;
        return new double[] { m.id, sx + dx / flat * 0.45, sy, sz + dz / flat * 0.45, vx, vy, vz };
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
        if (!w.isLoaded(x, z)) return;
        int top = w.grassTop(x, z);
        if (top < 0) return;
        int ground = w.get(x, top, z), biome = w.biomeAt(x, z, top);
        boolean desert = ground == Block.SAND && biome == World.DESERT;
        if (ground != Block.GRASS && !(ground == Block.SNOW && biome == World.TUNDRA) && !desert) return;
        // cada bioma tem seus bichos: fazenda nas planícies, selvagens nas florestas e na tundra
        int[] pool;
        if (desert) // deserto: escorpiões (o imperador é raro) e alguns coelhos
            pool = new int[] { Mob.SCORPION, Mob.SCORPION, Mob.SCORPION, Mob.RABBIT, Mob.EMPEROR };
        else if (biome == World.FOREST || biome == World.BIRCH_FOREST)
            pool = new int[] { Mob.DEER, Mob.DEER, Mob.FOX, Mob.RABBIT, Mob.WOLF, Mob.PIG, Mob.COW, Mob.BEAR, Mob.TIGER };
        else if (biome == World.TUNDRA)
            pool = new int[] { Mob.WOLF, Mob.FOX, Mob.RABBIT, Mob.RABBIT, Mob.BEAR, Mob.DEER, Mob.WHITE_TIGER };
        else if (biome == World.MOUNTAINS)
            pool = new int[] { Mob.SHEEP, Mob.SHEEP, Mob.RABBIT, Mob.WOLF };
        else
            pool = new int[] { Mob.PIG, Mob.SHEEP, Mob.CHICKEN, Mob.COW, Mob.PIG, Mob.SHEEP, Mob.CHICKEN, Mob.COW, Mob.RABBIT, Mob.FOX, Mob.DEER, Mob.CAT };
        int type = pool[rnd.nextInt(pool.length)];
        if ((type == Mob.BEAR || type == Mob.TIGER || type == Mob.WHITE_TIGER) && rnd.nextDouble() < 0.5) type = Mob.DEER; // urso e tigre são raros
        if (type == Mob.EMPEROR && rnd.nextDouble() < 0.85) type = Mob.SCORPION; // o imperador é bem raro (~3% dos bichos do deserto)
        int n = type == Mob.BEAR || type == Mob.TIGER || type == Mob.WHITE_TIGER || type == Mob.EMPEROR || type == Mob.CAT ? 1 : type == Mob.WOLF ? 2 + rnd.nextInt(2) : type == Mob.FOX ? 1 : 1 + rnd.nextInt(3);
        for (int i = 0; i < n; i++) {
            double mx = x + 0.5 + rnd.nextDouble() * 2 - 1, mz = z + 0.5 + rnd.nextDouble() * 2 - 1;
            Mob m = new Mob(type, mx, top + 1.01, mz);
            if (!m.collides(m.x, m.y, m.z, w)) list.add(m);
        }
    }

    /**
     * Peixes: num ponto de água com pelo menos 2 blocos de fundo, perto do jogador. Tropicais em águas
     * quentes, salmão nas frias; em água funda (6+ blocos) às vezes aparece um tubarão.
     */
    private void spawnFish(World w, Player p, boolean sharkAllowed) {
        for (int attempt = 0; attempt < 6; attempt++) {
            double a = rnd.nextDouble() * Math.PI * 2, r = 8 + rnd.nextDouble() * 26;
            int x = (int) (p.x + Math.sin(a) * r), z = (int) (p.z + Math.cos(a) * r);
            if (!w.isLoaded(x, z)) continue;
            for (int y = World.SEA - 1; y > 2; y--) {
                if (!Block.isWater(w.get(x, y, z))) continue;
                if (!Block.isWater(w.get(x, y - 1, z))) break; // raso demais
                int depth = 0;
                while (depth < 12 && Block.isWater(w.get(x, y - depth, z))) depth++;
                if (sharkAllowed && depth >= 6 && r > 16 && rnd.nextDouble() < 0.12) {
                    Mob s = new Mob(Mob.SHARK, x + 0.5, y - depth / 2.0, z + 0.5);
                    if (!s.collides(s.x, s.y, s.z, w)) list.add(s);
                    return;
                }
                int biome = w.biomeAt(x, z, w.heightAt(x, z) - 1);
                double roll = rnd.nextDouble();
                int type = biome == World.DESERT || (biome == World.PLAINS && roll < 0.35) ? Mob.TROPICAL
                        : (biome == World.TUNDRA || biome == World.FOREST || biome == World.MOUNTAINS) && roll < 0.5 ? Mob.SALMON : Mob.FISH;
                int n = 1 + rnd.nextInt(3);
                for (int i = 0; i < n; i++) {
                    double fx = x + 0.5 + (rnd.nextDouble() - 0.5), fz = z + 0.5 + (rnd.nextDouble() - 0.5);
                    if (!Block.isWater(w.get((int) Math.floor(fx), y - 1, (int) Math.floor(fz)))) continue;
                    list.add(new Mob(type, fx, y - 0.7, fz));
                }
                return;
            }
        }
    }

    /** Bando de pássaros voando um pouco acima das árvores (menos no deserto). */
    private void spawnBirds(World w, Player p) {
        double a = rnd.nextDouble() * Math.PI * 2, r = 20 + rnd.nextDouble() * 25;
        int x = (int) (p.x + Math.sin(a) * r), z = (int) (p.z + Math.cos(a) * r);
        if (!w.isLoaded(x, z)) return;
        int top = w.heightAt(x, z);
        if (w.biomeAt(x, z, top - 1) == World.DESERT || top < World.SEA) return;
        int n = 2 + rnd.nextInt(3);
        double y = Math.min(World.SY + 2, top + 8 + rnd.nextDouble() * 6);
        for (int i = 0; i < n; i++) {
            Mob b = new Mob(Mob.BIRD, x + rnd.nextDouble() * 3, y + rnd.nextDouble(), z + rnd.nextDouble() * 3);
            if (b.collides(b.x, b.y, b.z, w)) continue;
            b.flying = true;
            list.add(b);
        }
    }

    private void spawnHostile(World w, Player p, double daylight) {
        for (int attempt = 0; attempt < 4; attempt++) {
            double a = rnd.nextDouble() * Math.PI * 2, r = 18 + rnd.nextDouble() * 24;
            int x = (int) (p.x + Math.sin(a) * r), z = (int) (p.z + Math.cos(a) * r);
            if (!w.isLoaded(x, z)) continue;
            // procura um lugar com chão firme, duas células livres e escuro
            int y = 2 + rnd.nextInt(World.SY - 4);
            for (int k = 0; k < 12 && y > 1; k++, y--) {
                if (!Block.solid(w.get(x, y - 1, z)) || Block.solid(w.get(x, y, z)) || Block.solid(w.get(x, y + 1, z))) continue;
                if (Block.isWater(w.get(x, y, z)) || w.get(x, y, z) == Block.LAVA) continue;
                int sky = w.skyLight(x, y, z), blk = w.blockLightAt(x, y, z);
                double light = Math.max(sky / 15.0 * daylight, blk / 15.0);
                if (light > 0.3) continue;
                double roll = rnd.nextDouble();
                Mob m = new Mob(roll < 0.38 ? Mob.ZOMBIE : roll < 0.62 ? Mob.SKELETON : roll < 0.82 ? Mob.SPIDER : Mob.CREEPER, x + 0.5, y + 0.01, z + 0.5);
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
