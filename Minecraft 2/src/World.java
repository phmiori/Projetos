import java.util.Random;
import java.util.stream.IntStream;

/**
 * Mundo de blocos 512 x 64 x 512.
 * Geração: biomas, cavernas, minérios, árvores e plantas. Também guarda a luz das tochas/lava
 * e a altura do "teto" de cada coluna (para a luz do céu não entrar em cavernas).
 */
final class World {
    static final int SX = 512, SZ = 512, SY = 64, SEA = 24;
    static final double DAY_LENGTH = 720; // segundos por dia completo

    static final int PLAINS = 0, FOREST = 1, BIRCH_FOREST = 2, DESERT = 3, TUNDRA = 4, MOUNTAINS = 5;
    static final String[] BIOME_NAMES = { "Planície", "Floresta", "Bosque de bétulas", "Deserto", "Tundra", "Montanhas" };

    final byte[] blocks = new byte[SX * SZ * SY];
    final byte[] blockLight = new byte[SX * SZ * SY];
    /** Y do bloco mais alto que bloqueia a luz em cada coluna (-1 se nenhum). */
    final byte[] skyTop = new byte[SX * SZ];
    final int seed;
    double time = DAY_LENGTH * 0.3; // começa de manhã

    /** Pedaços de 16x16 colunas cuja malha 3D precisa ser refeita (lido pelo renderizador). */
    static final int CHUNKS_X = SX >> 4, CHUNKS_Z = SZ >> 4;
    final boolean[] dirty = new boolean[CHUNKS_X * CHUNKS_Z];
    boolean anyDirty;
    private boolean trackChanges;

    World(int seed) {
        this.seed = seed;
        generate();
        finishLoad();
    }

    /** Mundo carregado de um save (blocos já prontos). */
    World(int seed, byte[] data) {
        this.seed = seed;
        System.arraycopy(data, 0, blocks, 0, Math.min(data.length, blocks.length));
        finishLoad();
    }

    private void finishLoad() {
        for (int x = 0; x < SX; x++)
            for (int z = 0; z < SZ; z++) recomputeSkyTop(x, z);
        computeAllLight();
        // água corrente salva é reavaliada: a que não tem mais de onde vir seca aos poucos
        for (int i = 0; i < blocks.length; i++)
            if (Block.waterLevel(blocks[i] & 0xFF) > 0) fluidQueue.add(i);
        trackChanges = true;
    }

    static int idx(int x, int y, int z) {
        return (x << 15) | (z << 6) | y;
    }

    /** Fora do mundo (lados/baixo) conta como rocha-mãe: funciona como parede invisível. */
    int get(int x, int y, int z) {
        if (y >= SY) return Block.AIR;
        if (y < 0 || x < 0 || z < 0 || x >= SX || z >= SZ) return Block.BEDROCK;
        return blocks[idx(x, y, z)] & 0xFF;
    }

    static boolean inBounds(int x, int y, int z) {
        return x >= 0 && z >= 0 && y >= 0 && x < SX && z < SZ && y < SY;
    }

    void set(int x, int y, int z, int b) {
        if (!inBounds(x, y, z)) return;
        int old = blocks[idx(x, y, z)] & 0xFF;
        if (old == b) return;
        blocks[idx(x, y, z)] = (byte) b;
        if (!trackChanges) return;
        if (listener != null) listener.changed(x, y, z, b); // multijogador: avisa a rede

        // teto de luz da coluna
        int top = skyTop[x * SZ + z];
        if (Block.blocksLight(b) && y > top) skyTop[x * SZ + z] = (byte) y;
        else if (!Block.blocksLight(b) && y == top) recomputeSkyTop(x, z);

        // luz de tochas/lava: refaz a região se algo que emite ou bloqueia luz mudou perto de luz
        boolean lightChange = Block.light(old) > 0 || Block.light(b) > 0;
        boolean blockChange = Block.blocksLight(old) != Block.blocksLight(b) && nearLight(x, y, z);
        if (lightChange || blockChange) relight(x, y, z);

        // o pedaço (chunk) do bloco e os vizinhos que encostam nele precisam de malha nova
        int cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
        for (int dx = lx <= 1 ? -1 : 0; dx <= (lx >= 14 ? 1 : 0); dx++)
            for (int dz = lz <= 1 ? -1 : 0; dz <= (lz >= 14 ? 1 : 0); dz++)
                markDirty(cx + dx, cz + dz);

        // plantas e tochas sem apoio caem junto
        if (y + 1 < SY && !Block.solid(b)) {
            int above = blocks[idx(x, y + 1, z)] & 0xFF;
            if (Block.needsSupport(above)) set(x, y + 1, z, Block.AIR);
            // tochas presas nesta parede também caem
            for (int f = 0; f < 4; f++) {
                int tx = x - Block.DIR_X[f], tz = z - Block.DIR_Z[f];
                if (get(tx, y, tz) == Block.WALL_TORCH_BASE + f) set(tx, y, tz, Block.AIR);
            }
        }

        // água perto: ela pode escorrer para cá, secar ou mudar de nível
        if (Block.isWater(old) || Block.isWater(b) || waterAround(x, y, z)) {
            scheduleFluid(x, y, z);
            for (int d = 0; d < 6; d++) scheduleFluid(x + DX[d], y + DY[d], z + DZ[d]);
        }
    }

    // =====================================================================
    // água corrente
    // =====================================================================
    private static final int[] DX = { 1, -1, 0, 0, 0, 0 }, DY = { 0, 0, 1, -1, 0, 0 }, DZ = { 0, 0, 0, 0, 1, -1 };
    private final java.util.LinkedHashSet<Integer> fluidQueue = new java.util.LinkedHashSet<>();
    private double fluidTimer;

    private boolean waterAround(int x, int y, int z) {
        for (int d = 0; d < 6; d++) if (Block.isWater(get(x + DX[d], y + DY[d], z + DZ[d]))) return true;
        return false;
    }

    private void scheduleFluid(int x, int y, int z) {
        if (inBounds(x, y, z)) fluidQueue.add(idx(x, y, z));
    }

    /** Ar, plantas e tochas: a água ocupa o lugar (e leva as plantas embora). */
    private static boolean flowable(int b) {
        return b == Block.AIR || Block.shape(b) == Block.CROSS;
    }

    /**
     * Avança a água a cada 0,2 s: cai, espalha até 7 blocos perdendo altura e seca quando perde
     * a fonte. Só as células perto de onde algo mudou são olhadas.
     */
    void tickFluids(double dt) {
        fluidTimer += dt;
        if (fluidTimer < 0.2 || fluidQueue.isEmpty()) return;
        fluidTimer = 0;
        int n = Math.min(fluidQueue.size(), 6000);
        int[] batch = new int[n];
        java.util.Iterator<Integer> it = fluidQueue.iterator();
        for (int i = 0; i < n; i++) { batch[i] = it.next(); it.remove(); }
        for (int i : batch) updateFluid(i >> 15, i & 63, (i >> 6) & 511);
    }

    private void updateFluid(int x, int y, int z) {
        int b = get(x, y, z);
        int level = Block.waterLevel(b);
        if (level < 0) {
            // célula livre ao lado de água: enche se alguma água chega até aqui
            if (flowable(b)) {
                int want = supportLevel(x, y, z);
                if (want <= 7) set(x, y, z, Block.waterOfLevel(want));
            }
            return;
        }
        if (level > 0) {
            // água corrente precisa de algo que a alimente; senão vai secando
            int want = supportLevel(x, y, z);
            if (want > 7) { set(x, y, z, Block.AIR); return; }
            if (want != level) { set(x, y, z, Block.waterOfLevel(want)); return; }
        }
        int below = get(x, y - 1, z);
        if (flowable(below)) {
            set(x, y - 1, z, Block.waterOfLevel(1)); // cai
        } else if (!Block.isWater(below) || level == 0) {
            int next = level + 1;
            if (next > 7) return;
            for (int d = 0; d < 6; d++) {
                if (DY[d] != 0) continue;
                int nx = x + DX[d], nz = z + DZ[d];
                int nb = get(nx, y, nz);
                if (flowable(nb)) set(nx, y, nz, Block.waterOfLevel(next));
            }
        }
    }

    /** Nível que esta célula teria pela água em volta (99 = nenhuma água chega). */
    private int supportLevel(int x, int y, int z) {
        if (Block.isWater(get(x, y + 1, z))) return 1; // água caindo de cima
        int best = 99;
        for (int d = 0; d < 6; d++) {
            if (DY[d] != 0) continue;
            int nx = x + DX[d], nz = z + DZ[d];
            int l = Block.waterLevel(get(nx, y, nz));
            if (l < 0) continue;
            int under = get(nx, y - 1, nz);
            // água caindo (ar ou mais água embaixo) não espalha para o lado; só a apoiada em chão ou a fonte
            if (l > 0 && (flowable(under) || Block.isWater(under))) continue;
            best = Math.min(best, l + 1);
        }
        return best;
    }

    /** Quem quer saber de cada bloco mudado (a rede, no multijogador). */
    interface Listener { void changed(int x, int y, int z, int b); }
    Listener listener;

    private void markDirty(int cx, int cz) {
        if (cx < 0 || cz < 0 || cx >= CHUNKS_X || cz >= CHUNKS_Z) return;
        dirty[cx * CHUNKS_Z + cz] = true;
        anyDirty = true;
    }

    // =====================================================================
    // luz
    // =====================================================================

    private void recomputeSkyTop(int x, int z) {
        int base = (x << 15) | (z << 6);
        int y = SY - 1;
        while (y >= 0 && !Block.blocksLight(blocks[base | y] & 0xFF)) y--;
        skyTop[x * SZ + z] = (byte) y;
    }

    /** Luz do céu (0-15): plena acima do teto da coluna, e cai rápido abaixo dele. */
    int skyLight(int x, int y, int z) {
        if (x < 0 || z < 0 || x >= SX || z >= SZ || y >= SY) return 15;
        int top = skyTop[x * SZ + z];
        if (y > top) return 15;
        return Math.max(0, 15 - (top - y + 1) * 3);
    }

    int blockLightAt(int x, int y, int z) {
        if (!inBounds(x, y, z)) return 0;
        return blockLight[idx(x, y, z)];
    }

    private boolean nearLight(int x, int y, int z) {
        for (int dx = -1; dx <= 1; dx++)
            for (int dy = -1; dy <= 1; dy++)
                for (int dz = -1; dz <= 1; dz++)
                    if (blockLightAt(x + dx, y + dy, z + dz) > 0) return true;
        return false;
    }

    private int[] queue = new int[1 << 16];

    private void computeAllLight() {
        java.util.Arrays.fill(blockLight, (byte) 0);
        int n = 0;
        for (int i = 0; i < blocks.length; i++) {
            int l = Block.light(blocks[i] & 0xFF);
            if (l > 0) {
                blockLight[i] = (byte) l;
                n = push(n, i);
            }
        }
        spread(n, 0, SX - 1, 0, SY - 1, 0, SZ - 1);
    }

    /** Refaz a luz de blocos numa caixa de raio 15 em volta de (x,y,z). */
    private void relight(int cx, int cy, int cz) {
        int r = 15;
        int x0 = Math.max(0, cx - r), x1 = Math.min(SX - 1, cx + r);
        int y0 = Math.max(0, cy - r), y1 = Math.min(SY - 1, cy + r);
        int z0 = Math.max(0, cz - r), z1 = Math.min(SZ - 1, cz + r);
        for (int x = x0; x <= x1; x++)
            for (int z = z0; z <= z1; z++)
                for (int y = y0; y <= y1; y++) blockLight[idx(x, y, z)] = 0;
        int n = 0;
        // fontes dentro da caixa
        for (int x = x0; x <= x1; x++)
            for (int z = z0; z <= z1; z++)
                for (int y = y0; y <= y1; y++) {
                    int i = idx(x, y, z), l = Block.light(blocks[i] & 0xFF);
                    if (l > 0) { blockLight[i] = (byte) l; n = push(n, i); }
                }
        // luz que entra pelas bordas da caixa, vinda de fora
        for (int x = x0 - 1; x <= x1 + 1; x++)
            for (int z = z0 - 1; z <= z1 + 1; z++)
                for (int y = y0 - 1; y <= y1 + 1; y++) {
                    boolean inside = x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1;
                    if (inside || !inBounds(x, y, z)) continue;
                    if (blockLight[idx(x, y, z)] > 1) n = push(n, idx(x, y, z));
                }
        spread(n, x0, x1, y0, y1, z0, z1);
        for (int x = x0 >> 4; x <= x1 >> 4; x++)
            for (int z = z0 >> 4; z <= z1 >> 4; z++) markDirty(x, z);
    }

    private int push(int n, int i) {
        if (n == queue.length) queue = java.util.Arrays.copyOf(queue, n * 2);
        queue[n] = i;
        return n + 1;
    }

    /** Espalha a luz (busca em largura), perdendo 1 nível por bloco, só dentro da caixa. */
    private void spread(int n, int x0, int x1, int y0, int y1, int z0, int z1) {
        int head = 0;
        while (head < n) {
            int i = queue[head++];
            int l = blockLight[i] - 1;
            if (l <= 0) continue;
            int x = i >> 15, z = (i >> 6) & 511, y = i & 63;
            for (int d = 0; d < 6; d++) {
                int nx = x + (d == 0 ? 1 : d == 1 ? -1 : 0);
                int ny = y + (d == 2 ? 1 : d == 3 ? -1 : 0);
                int nz = z + (d == 4 ? 1 : d == 5 ? -1 : 0);
                if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || nz < z0 || nz > z1) continue;
                int j = idx(nx, ny, nz);
                if (Block.blocksLight(blocks[j] & 0xFF) || blockLight[j] >= l) continue;
                blockLight[j] = (byte) l;
                n = push(n, j);
            }
            if (head > 1 << 22) { // compacta a fila para não crescer sem fim
                System.arraycopy(queue, head, queue, 0, n - head);
                n -= head;
                head = 0;
            }
        }
    }

    /** 0 = noite, 1 = dia pleno. */
    double daylight() {
        double a = time / DAY_LENGTH * Math.PI * 2;
        double sunY = Math.sin(a);
        return Math.max(0, Math.min(1, (sunY + 0.12) / 0.4));
    }

    // =====================================================================
    // ruído
    // =====================================================================
    static double hash(int x, int z, int s) {
        int h = x * 374761393 + z * 668265263 + s * 1442695041;
        h = (h ^ (h >>> 13)) * 1274126177;
        h ^= h >>> 16;
        return (h & 0x7fffffff) / 2147483647.0;
    }

    static double hash3(int x, int y, int z, int s) {
        int h = x * 374761393 + y * 1103515245 + z * 668265263 + s * 1442695041;
        h = (h ^ (h >>> 13)) * 1274126177;
        h ^= h >>> 16;
        return (h & 0x7fffffff) / 2147483647.0;
    }

    static double noise(double x, double z, int s) {
        int x0 = (int) Math.floor(x), z0 = (int) Math.floor(z);
        double fx = x - x0, fz = z - z0;
        double ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
        double a = hash(x0, z0, s), b = hash(x0 + 1, z0, s);
        double c = hash(x0, z0 + 1, s), d = hash(x0 + 1, z0 + 1, s);
        double ab = a + (b - a) * ux, cd = c + (d - c) * ux;
        return ab + (cd - ab) * uz;
    }

    static double noise3(double x, double y, double z, int s) {
        int x0 = (int) Math.floor(x), y0 = (int) Math.floor(y), z0 = (int) Math.floor(z);
        double fx = x - x0, fy = y - y0, fz = z - z0;
        double ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
        double c000 = hash3(x0, y0, z0, s), c100 = hash3(x0 + 1, y0, z0, s);
        double c010 = hash3(x0, y0 + 1, z0, s), c110 = hash3(x0 + 1, y0 + 1, z0, s);
        double c001 = hash3(x0, y0, z0 + 1, s), c101 = hash3(x0 + 1, y0, z0 + 1, s);
        double c011 = hash3(x0, y0 + 1, z0 + 1, s), c111 = hash3(x0 + 1, y0 + 1, z0 + 1, s);
        double x00 = c000 + (c100 - c000) * ux, x10 = c010 + (c110 - c010) * ux;
        double x01 = c001 + (c101 - c001) * ux, x11 = c011 + (c111 - c011) * ux;
        double y0v = x00 + (x10 - x00) * uy, y1v = x01 + (x11 - x01) * uy;
        return y0v + (y1v - y0v) * uz;
    }

    static double fbm(double x, double z, int octaves, int s) {
        double sum = 0, amp = 1, norm = 0, f = 1;
        for (int i = 0; i < octaves; i++) {
            sum += noise(x * f, z * f, s + i * 31) * amp;
            norm += amp;
            amp *= 0.5;
            f *= 2;
        }
        return sum / norm;
    }

    int heightAt(int x, int z) {
        double base = fbm(x / 96.0, z / 96.0, 5, seed);
        double mountains = fbm(x / 220.0, z / 220.0, 3, seed + 101);
        double h = SEA + 3 + (base - 0.5) * 34 + Math.max(0, mountains - 0.52) * 70;
        int hi = (int) h;
        return hi < 2 ? 2 : Math.min(hi, SY - 10);
    }

    int biomeAt(int x, int z, int top) {
        if (top >= 46) return MOUNTAINS;
        double t = fbm(x / 260.0, z / 260.0, 3, seed + 11);
        double m = fbm(x / 210.0, z / 210.0, 3, seed + 12);
        if (t > 0.58 && m < 0.5) return DESERT;
        if (t < 0.43) return TUNDRA;
        if (m > 0.56) return t > 0.5 ? BIRCH_FOREST : FOREST;
        return PLAINS;
    }

    // =====================================================================
    // geração
    // =====================================================================
    private void generate() {
        final int[] heights = new int[SX * SZ];
        final byte[] biomes = new byte[SX * SZ];
        IntStream.range(0, SX).parallel().forEach(x -> {
            for (int z = 0; z < SZ; z++) column(x, z, heights, biomes);
        });

        Random r = new Random(seed);
        for (int x = 3; x < SX - 3; x++)
            for (int z = 3; z < SZ - 3; z++) {
                int top = heights[x * SZ + z] - 1;
                int biome = biomes[x * SZ + z];
                int b = blocks[idx(x, top, z)] & 0xFF;
                if (top + 6 >= SY || blocks[idx(x, top + 1, z)] != Block.AIR) continue;
                double roll = r.nextDouble();
                if (b == Block.GRASS || (b == Block.SNOW && biome == TUNDRA)) {
                    double treeP = biome == FOREST ? 0.05 : biome == BIRCH_FOREST ? 0.045
                            : biome == TUNDRA ? 0.006 : biome == MOUNTAINS ? 0.003 : 0.004;
                    if (roll < treeP) {
                        boolean birch = biome == BIRCH_FOREST || (biome == FOREST && r.nextDouble() < 0.2);
                        tree(x, top + 1, z, r, birch);
                    } else if (b == Block.GRASS) {
                        double grassP = biome == PLAINS ? 0.16 : 0.08;
                        double flowerP = biome == PLAINS ? 0.025 : 0.01;
                        double k = r.nextDouble();
                        if (k < flowerP) blocks[idx(x, top + 1, z)] = (byte) (r.nextBoolean() ? Block.FLOWER_YELLOW : Block.FLOWER_RED);
                        else if (k < flowerP + grassP) blocks[idx(x, top + 1, z)] = (byte) Block.TALL_GRASS;
                    }
                } else if (b == Block.SAND && biome == DESERT && roll < 0.006) {
                    int hgt = 1 + r.nextInt(3);
                    for (int i = 1; i <= hgt; i++) blocks[idx(x, top + i, z)] = (byte) Block.CACTUS;
                }
            }
    }

    private void column(int x, int z, int[] heights, byte[] biomes) {
        int h = heightAt(x, z);
        int top = h - 1;
        int biome = biomeAt(x, z, top);
        heights[x * SZ + z] = h;
        biomes[x * SZ + z] = (byte) biome;
        boolean beach = top <= SEA + 1;
        boolean underwater = top < SEA - 1;
        boolean gravelFloor = underwater && noise(x / 9.0, z / 9.0, seed + 70) > 0.62;
        int base = (x << 15) | (z << 6);

        for (int y = 0; y <= top; y++) {
            int depth = top - y;
            int b;
            if (y == 0 || (y == 1 && hash(x, z, seed + 3) < 0.5)) b = Block.BEDROCK;
            else if (depth == 0) {
                if (gravelFloor) b = Block.GRAVEL;
                else if (beach || biome == DESERT) b = Block.SAND;
                else if (biome == TUNDRA) b = Block.SNOW;
                else if (biome == MOUNTAINS) b = top >= 49 + (int) (hash(x, z, seed + 5) * 3) ? Block.SNOW : Block.STONE;
                else b = Block.GRASS;
            } else if (depth < 4) {
                if (gravelFloor && depth < 2) b = Block.GRAVEL;
                else if (beach) b = Block.SAND;
                else if (biome == DESERT) b = depth < 3 ? Block.SAND : Block.SANDSTONE;
                else if (biome == MOUNTAINS) b = Block.STONE;
                else b = Block.DIRT;
            } else b = ore(x, y, z);
            blocks[base | y] = (byte) b;
        }
        for (int y = h; y < SEA; y++)
            blocks[base | y] = (byte) (biome == TUNDRA && y == SEA - 1 ? Block.ICE : Block.WATER);

        // cavernas: túneis (dois ruídos 3D perto de 0.5 ao mesmo tempo) e salões
        boolean canOpen = top >= SEA + 3; // não abre cavernas debaixo de água
        for (int y = 2; y <= top; y++) {
            int depth = top - y;
            if (depth < 5 && !canOpen) continue;
            int b = blocks[base | y] & 0xFF;
            if (b == Block.BEDROCK || Block.isWater(b)) continue;
            double a = noise3(x / 22.0, y / 12.0, z / 22.0, seed + 20) - 0.5;
            double c = noise3(x / 22.0, y / 12.0, z / 22.0, seed + 21) - 0.5;
            boolean tunnel = a * a + c * c < 0.0028;
            boolean room = y < 28 && noise3(x / 34.0, y / 16.0, z / 34.0, seed + 22) > 0.8;
            if (tunnel || room) blocks[base | y] = (byte) (y <= 5 ? Block.LAVA : Block.AIR);
        }
        // nada flutuando: se a caverna abriu bem embaixo da superfície, a planta de cima some sozinha
    }

    /** Pedra, ou um minério em veios (grupos de 2x2x2) dependendo da profundidade. */
    private int ore(int x, int y, int z) {
        double cluster = hash3(x >> 1, y >> 1, z >> 1, seed + 30);
        if (hash3(x, y, z, seed + 31) < 0.6) {
            double p = 0;
            if (y <= 14 && cluster < (p += 0.0018)) return Block.CRYSTAL_ORE;
            if (y <= 24 && cluster < (p += 0.0035)) return Block.GOLD_ORE;
            if (y <= 42 && cluster < (p += 0.010)) return Block.IRON_ORE;
            if (y <= 56 && cluster < (p += 0.016)) return Block.COAL_ORE;
            if (cluster > 0.994) return Block.GRAVEL;
        }
        return Block.STONE;
    }

    private void tree(int x, int y, int z, Random r, boolean birch) {
        int log = birch ? Block.BIRCH_LOG : Block.LOG, leaf = birch ? Block.BIRCH_LEAVES : Block.LEAVES;
        int h = (birch ? 5 : 4) + r.nextInt(3);
        int top = y + h;
        for (int dy = -2; dy <= 1; dy++) {
            int rad = dy < 0 ? 2 : 1;
            for (int dx = -rad; dx <= rad; dx++)
                for (int dz = -rad; dz <= rad; dz++) {
                    boolean corner = Math.abs(dx) == rad && Math.abs(dz) == rad;
                    if (corner && (dy == 1 || r.nextInt(2) == 0)) continue;
                    int px = x + dx, py = top + dy, pz = z + dz;
                    if (inBounds(px, py, pz) && blocks[idx(px, py, pz)] == Block.AIR) blocks[idx(px, py, pz)] = (byte) leaf;
                }
        }
        for (int i = 0; i < h; i++) blocks[idx(x, y + i, z)] = (byte) log;
        if (y - 1 >= 0 && blocks[idx(x, y - 1, z)] == Block.GRASS) blocks[idx(x, y - 1, z)] = (byte) Block.DIRT;
    }

    /** Y do chão de terra firme (grama ou neve) se for o topo da coluna, senão -1. Plantas não contam. */
    int grassTop(int x, int z) {
        for (int y = SY - 1; y >= 0; y--) {
            int b = get(x, y, z);
            if (b == Block.AIR || Block.shape(b) == Block.CROSS) continue;
            return (b == Block.GRASS || b == Block.SNOW || b == Block.SAND) && y >= SEA ? y : -1;
        }
        return -1;
    }

    /** Ponto de nascimento: terra firme mais perto do centro do mapa. {x, y, z} dos pés. */
    double[] findSpawn() {
        int cx = SX / 2, cz = SZ / 2;
        for (int r = 0; r < 240; r++)
            for (int dx = -r; dx <= r; dx++)
                for (int dz = -r; dz <= r; dz++) {
                    if (Math.abs(dx) != r && Math.abs(dz) != r) continue;
                    int top = grassTop(cx + dx, cz + dz);
                    if (top >= 0 && get(cx + dx, top + 1, cz + dz) == Block.AIR || top >= 0 && Block.shape(get(cx + dx, top + 1, cz + dz)) == Block.CROSS)
                        return new double[] { cx + dx + 0.5, top + 1.01, cz + dz + 0.5 };
                }
        return new double[] { cx + 0.5, SY - 1, cz + 0.5 };
    }

    /**
     * Raio DDA até `reach`. Retorna {bx,by,bz, px,py,pz} (bloco atingido e célula anterior) ou null.
     * Mira blocos sólidos, plantas e tochas; atravessa ar e líquidos.
     */
    int[] raycast(double ox, double oy, double oz, double dx, double dy, double dz, double reach) {
        int ix = (int) Math.floor(ox), iy = (int) Math.floor(oy), iz = (int) Math.floor(oz);
        int sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
        double tdx = dx == 0 ? 1e30 : Math.abs(1 / dx);
        double tdy = dy == 0 ? 1e30 : Math.abs(1 / dy);
        double tdz = dz == 0 ? 1e30 : Math.abs(1 / dz);
        double tmx = dx == 0 ? 1e30 : (dx > 0 ? ix + 1 - ox : ox - ix) * tdx;
        double tmy = dy == 0 ? 1e30 : (dy > 0 ? iy + 1 - oy : oy - iy) * tdy;
        double tmz = dz == 0 ? 1e30 : (dz > 0 ? iz + 1 - oz : oz - iz) * tdz;
        int px, py, pz;
        double t = 0;
        while (t <= reach) {
            px = ix; py = iy; pz = iz;
            if (tmx < tmy && tmx < tmz) { ix += sx; t = tmx; tmx += tdx; }
            else if (tmy < tmz) { iy += sy; t = tmy; tmy += tdy; }
            else { iz += sz; t = tmz; tmz += tdz; }
            if (t > reach) break;
            if (!inBounds(ix, iy, iz)) {
                if (iy >= SY && sy > 0) break;
                continue;
            }
            int b = blocks[idx(ix, iy, iz)] & 0xFF;
            if (b != Block.AIR && Block.shape(b) != Block.LIQUID) return new int[] { ix, iy, iz, px, py, pz, (int) (t * 1000) };
        }
        return null;
    }
}
