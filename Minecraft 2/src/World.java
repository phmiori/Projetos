import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Mundo de blocos infinito (64 de altura), feito de pedaços (Chunk) de 16 x 16 colunas.
 * Os pedaços são gerados sob demanda perto dos jogadores, a partir da semente: biomas, cavernas,
 * minérios, árvores e plantas. A mesma semente sempre dá o mesmo mundo; só o que o jogador mudou
 * precisa ser salvo. Também guarda a luz das tochas/lava e a altura do "teto" de cada coluna.
 */
final class World {
    static final int SY = 64, SEA = 24;
    static final double DAY_LENGTH = 2880; // segundos por dia completo (dia e noite): 48 minutos

    static final int PLAINS = 0, FOREST = 1, BIRCH_FOREST = 2, DESERT = 3, TUNDRA = 4, MOUNTAINS = 5, ICE_FIELD = 6;
    static final String[] BIOME_NAMES = { "Planície", "Floresta", "Bosque de bétulas", "Deserto", "Tundra", "Montanhas", "Campo de gelo" };

    /** Onde ficam guardados os pedaços modificados que saíram da memória (disco, ou memória no amigo). */
    interface Store {
        byte[] read(int cx, int cz);
        void write(int cx, int cz, byte[] data);
        /** Todos os pedaços guardados: {cx, cz}. */
        java.util.List<int[]> list();
    }

    /** Guarda em memória (o amigo no multijogador: os pedaços do anfitrião e os que ele mesmo mexeu). */
    static final class MemoryStore implements Store {
        final ConcurrentHashMap<Long, byte[]> data = new ConcurrentHashMap<>();
        public byte[] read(int cx, int cz) { return data.get(ckey(cx, cz)); }
        public void write(int cx, int cz, byte[] d) { data.put(ckey(cx, cz), d); }
        public java.util.List<int[]> list() {
            java.util.List<int[]> out = new java.util.ArrayList<>();
            for (Long k : data.keySet()) out.add(new int[] { ckeyX(k), ckeyZ(k) });
            return out;
        }
    }

    final int seed;
    double time = DAY_LENGTH * 0.3; // começa de manhã
    Store store;

    private final ConcurrentHashMap<Long, Chunk> chunks = new ConcurrentHashMap<>();
    private volatile Chunk lastChunk;
    private int pendingRot;

    // ---------------------------------------------------------------------------------
    // chaves
    // ---------------------------------------------------------------------------------
    static long ckey(int cx, int cz) {
        return ((long) cx << 32) | (cz & 0xFFFFFFFFL);
    }

    static int ckeyX(long k) { return (int) (k >> 32); }

    static int ckeyZ(long k) { return (int) k; }

    private static final int OFF = 1 << 28;

    /** Posição de uma célula num só long (x e z de -268 milhões a +268 milhões, y de 0 a 63). */
    static long key(int x, int y, int z) {
        return ((long) (x + OFF) << 35) | ((long) (z + OFF) << 6) | y;
    }

    static int keyX(long k) { return (int) (k >>> 35) - OFF; }

    static int keyZ(long k) { return (int) ((k >>> 6) & 0x1FFFFFFFL) - OFF; }

    static int keyY(long k) { return (int) (k & 63); }

    /**
     * Tamanho dos biomas: os mapas de temperatura e umidade são esticados por este fator. Os mundos novos usam
     * BIG_BIOMES (biomas 2x maiores em cada direção); os criados antes guardam 1, para não mudar o que já existe.
     */
    final double biomeScale;
    static final double BIG_BIOMES = 2.0;

    World(int seed) {
        this(seed, null, BIG_BIOMES);
    }

    World(int seed, Store store, double biomeScale) {
        this.seed = seed;
        this.biomeScale = biomeScale;
        this.store = store;
        int n = Runtime.getRuntime().availableProcessors();
        pool = java.util.concurrent.Executors.newFixedThreadPool(Math.max(1, Math.min(4, n / 2)), r -> {
            Thread t = new Thread(r, "geracao");
            t.setDaemon(true);
            t.setPriority(Thread.NORM_PRIORITY - 1);
            return t;
        });
    }

    // ---------------------------------------------------------------------------------
    // pedaços carregados
    // ---------------------------------------------------------------------------------
    private final java.util.concurrent.ExecutorService pool;
    private final java.util.concurrent.ConcurrentLinkedQueue<Chunk> ready = new java.util.concurrent.ConcurrentLinkedQueue<>();
    private final java.util.Set<Long> pending = ConcurrentHashMap.newKeySet();
    /** Quem precisa dos pedaços: {cx, cz, raio em pedaços}. Pedaços fora do alcance de todos são descarregados. */
    private volatile double[][] anchors;
    private double sweepTimer;

    /** O pedaço (cx, cz), se estiver carregado. */
    Chunk chunk(int cx, int cz) {
        return chunks.get(ckey(cx, cz));
    }

    /** O pedaço que contém o bloco (x, z), se estiver carregado. */
    Chunk chunkAt(int x, int z) {
        int cx = x >> 4, cz = z >> 4;
        Chunk c = lastChunk;
        if (c != null && c.cx == cx && c.cz == cz) return c;
        c = chunks.get(ckey(cx, cz));
        if (c != null) lastChunk = c;
        return c;
    }

    boolean isLoaded(int x, int z) {
        return chunkAt(x, z) != null;
    }

    int loadedCount() {
        return chunks.size();
    }

    /** O pedaço e seus 8 vizinhos estão carregados? (precisa disso para montar a malha 3D) */
    boolean neighborsLoaded(int cx, int cz) {
        for (int dx = -1; dx <= 1; dx++)
            for (int dz = -1; dz <= 1; dz++)
                if (!chunks.containsKey(ckey(cx + dx, cz + dz))) return false;
        return true;
    }

    /** Lê do arquivo ou gera um pedaço, já com a luz de dentro dele. Pode rodar em qualquer thread. */
    private Chunk produce(int cx, int cz) {
        Chunk c = null;
        byte[] saved = store == null ? null : store.read(cx, cz);
        if (saved != null) {
            try {
                c = Chunk.fromBytes(cx, cz, saved);
                c.fromStore = true;
            } catch (java.io.IOException e) {
                System.out.println("Pedaço " + cx + "," + cz + " ilegível, gerando de novo: " + e.getMessage());
            }
        }
        if (c == null) c = generate(cx, cz);
        c.prepare();
        return c;
    }

    /** Pede um pedaço em segundo plano. */
    void request(int cx, int cz) {
        long k = ckey(cx, cz);
        if (chunks.containsKey(k) || !pending.add(k)) return;
        pool.execute(() -> {
            try {
                ready.add(produce(cx, cz));
            } catch (Throwable t) {
                t.printStackTrace();
                pending.remove(k);
            }
        });
    }

    /** Carrega agora (esperando) o pedaço (cx, cz). */
    Chunk ensureChunk(int cx, int cz) {
        Chunk c = chunks.get(ckey(cx, cz));
        if (c != null) return c;
        c = produce(cx, cz);
        insert(c);
        return c;
    }

    /** Carrega agora todos os pedaços até `radius` pedaços de distância do bloco (x, z). */
    void ensureAround(double x, double z, int radius) {
        int cx = (int) Math.floor(x) >> 4, cz = (int) Math.floor(z) >> 4;
        for (int dx = -radius; dx <= radius; dx++)
            for (int dz = -radius; dz <= radius; dz++) ensureChunk(cx + dx, cz + dz);
    }

    private void insert(Chunk c) {
        long k = ckey(c.cx, c.cz);
        Chunk old = chunks.putIfAbsent(k, c);
        pending.remove(k);
        if (old != null) return;
        if (c.fromStore && c.hasWater()) { // água corrente salva é reavaliada: a que não tem mais de onde vir seca aos poucos
            for (int lx = 0; lx < 16; lx++)
                for (int lz = 0; lz < 16; lz++)
                    for (int y = 0; y < SY; y++)
                        if (Block.waterLevel(c.blocks[Chunk.idx(lx, y, lz)] & 0xFF) > 0) fluidQueue.add(key(c.cx * 16 + lx, y, c.cz * 16 + lz));
        }
        spillLight(c);
    }

    /**
     * Junta os pedaços que as threads terminaram. `budgetNs` limita o tempo gasto no quadro.
     * Retorna quantos entraram no mundo.
     */
    int integrate(long budgetNs) {
        long end = System.nanoTime() + budgetNs;
        int n = 0;
        Chunk c;
        while ((c = ready.poll()) != null) {
            long k = ckey(c.cx, c.cz);
            if (chunks.containsKey(k)) { pending.remove(k); continue; }
            if (!wanted(c.cx, c.cz, 1)) { pending.remove(k); continue; } // o jogador já foi embora
            insert(c);
            n++;
            if (System.nanoTime() > end) break;
        }
        return n;
    }

    private boolean wanted(int cx, int cz, int margin) {
        double[][] a = anchors;
        if (a == null) return true;
        for (double[] an : a) {
            double dx = cx - an[0], dz = cz - an[1], r = an[2] + margin;
            if (dx * dx + dz * dz <= r * r) return true;
        }
        return false;
    }

    private static final java.util.Map<Integer, int[][]> RING = new java.util.HashMap<>();

    /** Posições (dx, dz) em volta de um pedaço dentro do raio, da mais perto para a mais longe. */
    private static synchronized int[][] ring(int radius) {
        int[][] r = RING.get(radius);
        if (r == null) {
            java.util.List<int[]> l = new java.util.ArrayList<>();
            for (int dx = -radius; dx <= radius; dx++)
                for (int dz = -radius; dz <= radius; dz++)
                    if (dx * dx + dz * dz <= radius * radius) l.add(new int[] { dx, dz });
            l.sort((p, q) -> Integer.compare(p[0] * p[0] + p[1] * p[1], q[0] * q[0] + q[1] * q[1]));
            r = l.toArray(new int[0][]);
            RING.put(radius, r);
        }
        return r;
    }

    /**
     * Chamado todo quadro: carrega (em segundo plano) os pedaços em volta de cada jogador, garante já os
     * vizinhos imediatos e descarrega o que ficou longe. anchors: {x, z, raio em pedaços} de cada jogador.
     */
    void updateLoading(double[][] players, double dt) {
        double[][] a = new double[players.length][];
        for (int i = 0; i < a.length; i++) // o pedaço de cada jogador, em coordenadas de pedaço
            a[i] = new double[] { (int) Math.floor(players[i][0]) >> 4, (int) Math.floor(players[i][1]) >> 4, players[i][2] };
        anchors = a;
        integrate(3_000_000L);
        for (double[] an : a) {
            int acx = (int) an[0], acz = (int) an[1];
            for (int dx = -1; dx <= 1; dx++)
                for (int dz = -1; dz <= 1; dz++) {
                    ensureChunk(acx + dx, acz + dz); // nunca deixa o jogador sem chão
                }
            if (pending.size() < 40)
                for (int[] o : ring((int) an[2])) {
                    int cx = acx + o[0], cz = acz + o[1];
                    if (!chunks.containsKey(ckey(cx, cz))) request(cx, cz);
                    if (pending.size() >= 40) break;
                }
        }
        sweepTimer -= dt;
        if (sweepTimer <= 0) {
            sweepTimer = 1;
            for (Chunk c : chunks.values()) if (!wanted(c.cx, c.cz, 2)) unload(c);
        }
    }

    private void unload(Chunk c) {
        if (c.modified && store != null) {
            c.modified = false;
            try {
                store.write(c.cx, c.cz, c.toBytes());
            } catch (RuntimeException e) {
                System.out.println("Não consegui guardar o pedaço " + c.cx + "," + c.cz + ": " + e.getMessage());
            }
        }
        chunks.remove(ckey(c.cx, c.cz));
        lastChunk = null;
    }

    /** Para as threads de geração (o mundo não vai mais ser usado). */
    void close() {
        pool.shutdownNow();
        ready.clear();
        pending.clear();
    }

    /** Larga todos os pedaços (o mundo do lobby, ao entrar num mundo). */
    void clear() {
        anchors = new double[0][];
        for (Chunk c : chunks.values()) unload(c);
        ready.clear();
        pending.clear();
        lastChunk = null;
    }

    /** Guarda no armazenamento todos os pedaços carregados que mudaram (esperando terminar). */
    void saveAll() {
        if (store == null) return;
        for (Chunk c : chunks.values())
            if (c.modified) {
                c.modified = false;
                store.write(c.cx, c.cz, c.toBytes());
            }
    }

    /** Cópias dos pedaços modificados, para gravar em segundo plano. Desmarca os originais. */
    java.util.List<Chunk> snapshotModified() {
        java.util.List<Chunk> out = new java.util.ArrayList<>();
        for (Chunk c : chunks.values())
            if (c.modified) {
                c.modified = false;
                out.add(c.copyForSave());
            }
        return out;
    }

    /** Tudo o que difere do gerador (o que o anfitrião manda ao amigo que entra): n, e para cada pedaço cx, cz, tamanho, bytes. */
    byte[] exportModified() {
        java.util.LinkedHashMap<Long, byte[]> all = new java.util.LinkedHashMap<>();
        if (store != null)
            for (int[] k : store.list()) {
                byte[] b = store.read(k[0], k[1]);
                if (b != null) all.put(ckey(k[0], k[1]), b);
            }
        for (Chunk c : chunks.values()) if (c.modified) all.put(ckey(c.cx, c.cz), c.toBytes());
        try {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream(1 << 16);
            java.io.DataOutputStream out = new java.io.DataOutputStream(bos);
            out.writeInt(all.size());
            for (java.util.Map.Entry<Long, byte[]> e : all.entrySet()) {
                out.writeInt(ckeyX(e.getKey()));
                out.writeInt(ckeyZ(e.getKey()));
                out.writeInt(e.getValue().length);
                out.write(e.getValue());
            }
            return bos.toByteArray();
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    /** O contrário de exportModified: um armazenamento em memória com esses pedaços. */
    static MemoryStore importModified(byte[] bytes) throws java.io.IOException {
        MemoryStore s = new MemoryStore();
        java.io.DataInputStream in = new java.io.DataInputStream(new java.io.ByteArrayInputStream(bytes));
        int n = in.readInt();
        for (int i = 0; i < n; i++) {
            int cx = in.readInt(), cz = in.readInt();
            byte[] b = new byte[in.readInt()];
            in.readFully(b);
            s.write(cx, cz, b);
        }
        return s;
    }

    // ---------------------------------------------------------------------------------
    // acesso aos blocos
    // ---------------------------------------------------------------------------------

    /** Acima do mundo é ar, abaixo é rocha-mãe e num pedaço ainda não carregado é uma parede (ninguém cai no vazio). */
    int get(int x, int y, int z) {
        if (y >= SY) return Block.AIR;
        if (y < 0) return Block.BEDROCK;
        Chunk c = chunkAt(x, z);
        if (c == null) return Block.STONE;
        return c.blocks[Chunk.idx(x & 15, y, z & 15)] & 0xFF;
    }

    /** A altura é limitada; para os lados o mundo não tem fim. */
    static boolean inBounds(int x, int y, int z) {
        return y >= 0 && y < SY;
    }

    /** Direção da frente do bloco (0 +Z, 1 -X, 2 -Z, 3 +X). */
    int rotation(int x, int y, int z) {
        if (y < 0 || y >= SY) return 0;
        Chunk c = chunkAt(x, z);
        if (c == null || c.rot == null) return 0;
        Byte r = c.rot.get(Chunk.idx(x & 15, y, z & 15));
        return r == null ? 0 : r;
    }

    private static void storeRot(Chunk c, int li, int rot) {
        if (rot == 0) { if (c.rot != null) c.rot.remove(li); }
        else {
            if (c.rot == null) c.rot = new ConcurrentHashMap<>();
            c.rot.put(li, (byte) rot);
        }
    }

    /** Põe um bloco já virado para a direção rot; se o bloco já é esse, só gira. */
    void setRot(int x, int y, int z, int b, int rot) {
        if (y < 0 || y >= SY) return;
        Chunk c = chunkAt(x, z);
        if (c == null) return;
        rot = Block.rotatable(b) ? rot & 3 : 0;
        int li = Chunk.idx(x & 15, y, z & 15);
        if ((c.blocks[li] & 0xFF) == b) {
            if (rotation(x, y, z) == rot) return;
            storeRot(c, li, rot);
            c.modified = true;
            if (listener != null) listener.changed(x, y, z, b);
            markDirty(x >> 4, z >> 4);
            return;
        }
        pendingRot = rot;
        set(x, y, z, b);
        pendingRot = 0;
    }

    void set(int x, int y, int z, int b) {
        if (y < 0 || y >= SY) return;
        Chunk c = chunkAt(x, z);
        if (c == null) return; // pedaço não carregado: nada a fazer
        int lx = x & 15, lz = z & 15, li = Chunk.idx(lx, y, lz);
        int old = c.blocks[li] & 0xFF;
        if (old == b) return;
        c.blocks[li] = (byte) b;
        c.modified = true;
        int rot = pendingRot;
        pendingRot = 0; // vale só para este bloco (set é chamado de novo para plantas que caem)
        storeRot(c, li, rot);
        if (listener != null) listener.changed(x, y, z, b); // multijogador: avisa a rede

        // teto de luz da coluna
        int col = lx * 16 + lz, top = c.skyTop[col];
        if (Block.blocksLight(b) && y > top) c.skyTop[col] = (byte) y;
        else if (!Block.blocksLight(b) && y == top) c.recomputeSkyTop(lx, lz);

        // luz de tochas/lava: refaz a região se algo que emite ou bloqueia luz mudou perto de luz
        boolean lightChange = Block.light(old) > 0 || Block.light(b) > 0;
        boolean blockChange = Block.blocksLight(old) != Block.blocksLight(b) && nearLight(x, y, z);
        if (lightChange || blockChange) relight(x, y, z);

        // o pedaço (chunk) do bloco e os vizinhos que encostam nele precisam de malha nova
        int cx = x >> 4, cz = z >> 4;
        for (int dx = lx <= 1 ? -1 : 0; dx <= (lx >= 14 ? 1 : 0); dx++)
            for (int dz = lz <= 1 ? -1 : 0; dz <= (lz >= 14 ? 1 : 0); dz++)
                markDirty(cx + dx, cz + dz);

        // areia e cascalho: este bloco e o de cima podem cair
        if (Block.falls(b)) fallQueue.add(key(x, y, z));
        if (y + 1 < SY && Block.falls(get(x, y + 1, z))) fallQueue.add(key(x, y + 1, z));

        // plantas e tochas sem apoio caem junto
        if (y + 1 < SY && !Block.solid(b)) {
            int above = get(x, y + 1, z);
            if (Block.needsSupport(above)) set(x, y + 1, z, Block.AIR);
            if (y > 0 && get(x, y - 1, z) == Block.ICICLE) set(x, y - 1, z, Block.AIR); // pingente pendurado aqui cai
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
    // areia e cascalho que caem, crescimento e explosões
    // =====================================================================
    private final java.util.LinkedHashSet<Long> fallQueue = new java.util.LinkedHashSet<>();
    private double fallTimer, growTimer;

    /** O que aconteceu sozinho no mundo e o jogo precisa saber: {tipo, x, y, z, bloco}. */
    static final int EV_LEAF_DECAY = 0;
    final java.util.ArrayList<int[]> events = new java.util.ArrayList<>();

    /** Faz os blocos soltos descerem uma célula por vez (parece que escorrem para baixo). */
    void tickFalling(double dt) {
        fallTimer += dt;
        if (fallTimer < 0.09 || fallQueue.isEmpty()) return;
        fallTimer = 0;
        int n = Math.min(fallQueue.size(), 2000);
        long[] batch = new long[n];
        java.util.Iterator<Long> it = fallQueue.iterator();
        for (int i = 0; i < n; i++) { batch[i] = it.next(); it.remove(); }
        for (long k : batch) {
            int x = keyX(k), y = keyY(k), z = keyZ(k);
            int b = get(x, y, z);
            if (!Block.falls(b) || y == 0) continue;
            int below = get(x, y - 1, z);
            if (below != Block.AIR && Block.shape(below) != Block.LIQUID && Block.shape(below) != Block.CROSS) continue;
            set(x, y, z, Block.AIR);
            set(x, y - 1, z, b); // entra de novo na fila e continua caindo
        }
    }

    /** Dá para ver de um ponto ao outro sem um bloco sólido no caminho? (plantas, tochas e líquidos não tapam) */
    boolean lineOfSight(double x0, double y0, double z0, double x1, double y1, double z1) {
        double dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
        int steps = (int) Math.ceil(Math.sqrt(dx * dx + dy * dy + dz * dz) / 0.25);
        for (int i = 1; i < steps; i++) {
            double t = i / (double) steps;
            if (Block.solid(get((int) Math.floor(x0 + dx * t), (int) Math.floor(y0 + dy * t), (int) Math.floor(z0 + dz * t)))) return false;
        }
        return true;
    }

    /** Há água a até 4 blocos (no mesmo nível ou um acima)? */
    private boolean waterNear(int x, int y, int z) {
        for (int dy = 0; dy <= 1; dy++)
            for (int dx = -4; dx <= 4; dx++)
                for (int dz = -4; dz <= 4; dz++)
                    if (Block.isWater(get(x + dx, y + dy, z + dz))) return true;
        return false;
    }

    /**
     * Vida do mundo perto de um jogador: folhas sem tronco somem, mudas viram árvores, a grama se
     * espalha pela terra e morre debaixo de blocos. Sorteia blocos ao acaso, como no Minecraft.
     */
    void tickGrowth(double dt, double px, double pz, Random r) {
        growTimer += dt;
        if (growTimer < 0.05) return;
        int n = (int) Math.min(2000, growTimer * 8000);
        growTimer = 0;
        int cx = (int) Math.floor(px), cz = (int) Math.floor(pz);
        for (int k = 0; k < n; k++) {
            int x = cx - 48 + r.nextInt(96), z = cz - 48 + r.nextInt(96), y = r.nextInt(SY);
            int b = get(x, y, z);
            if (b == Block.AIR || b == Block.STONE) continue;
            if (Block.isLeaves(b)) {
                if (!logNear(x, y, z)) {
                    set(x, y, z, Block.AIR);
                    events.add(new int[] { EV_LEAF_DECAY, x, y, z, b });
                }
            } else if (Block.isSapling(b)) {
                if (r.nextInt(3) == 0 && Math.max(skyLight(x, y, z), blockLightAt(x, y, z)) >= 9) growTree(x, y, z, r, b == Block.BIRCH_SAPLING);
            } else if (Block.isWheat(b)) {
                // trigo cresce com luz; perto da água, duas vezes mais rápido
                if (b < Block.WHEAT + 2 && Math.max(skyLight(x, y, z), blockLightAt(x, y, z)) >= 9
                        && r.nextInt(waterNear(x, y - 1, z) ? 2 : 4) == 0) set(x, y, z, b + 1);
            } else if (b == Block.FARMLAND) {
                // terra arada volta a ser terra se for coberta, ou se ficar vazia e seca por muito tempo
                int above = y + 1 < SY ? get(x, y + 1, z) : Block.AIR;
                if (Block.solid(above) || (!Block.isWheat(above) && r.nextInt(8) == 0 && !waterNear(x, y, z))) set(x, y, z, Block.DIRT);
            } else if (b == Block.DIRT) {
                if (y + 1 < SY && !coversGrass(get(x, y + 1, z)) && skyLight(x, y + 1, z) >= 9 && grassNear(x, y, z))
                    set(x, y, z, Block.GRASS);
            } else if (b == Block.GRASS) {
                if (y + 1 < SY && coversGrass(get(x, y + 1, z))) set(x, y, z, Block.DIRT);
            }
        }
    }

    private static boolean coversGrass(int above) {
        return Block.opaqueCube(above) || Block.shape(above) == Block.LIQUID;
    }

    private boolean grassNear(int x, int y, int z) {
        for (int dx = -1; dx <= 1; dx++)
            for (int dz = -1; dz <= 1; dz++)
                for (int dy = -1; dy <= 1; dy++)
                    if (get(x + dx, y + dy, z + dz) == Block.GRASS) return true;
        return false;
    }

    private boolean logNear(int x, int y, int z) {
        for (int dx = -4; dx <= 4; dx++)
            for (int dz = -4; dz <= 4; dz++)
                for (int dy = -4; dy <= 4; dy++)
                    if (Block.isLog(get(x + dx, y + dy, z + dz))) return true;
        return false;
    }

    /** A muda vira uma árvore, se houver espaço para o tronco. */
    private void growTree(int x, int y, int z, Random r, boolean birch) {
        int log = birch ? Block.BIRCH_LOG : Block.LOG, leaf = birch ? Block.BIRCH_LEAVES : Block.LEAVES;
        int h = (birch ? 5 : 4) + r.nextInt(3);
        if (y + h + 2 >= SY) return;
        for (int i = 1; i <= h; i++) {
            int b = get(x, y + i, z);
            if (b != Block.AIR && !Block.isLeaves(b)) return;
        }
        int top = y + h;
        for (int dy = -2; dy <= 1; dy++) {
            int rad = dy < 0 ? 2 : 1;
            for (int dx = -rad; dx <= rad; dx++)
                for (int dz = -rad; dz <= rad; dz++) {
                    boolean corner = Math.abs(dx) == rad && Math.abs(dz) == rad;
                    if (corner && (dy == 1 || r.nextInt(2) == 0)) continue;
                    if (get(x + dx, top + dy, z + dz) == Block.AIR) set(x + dx, top + dy, z + dz, leaf);
                }
        }
        for (int i = 0; i < h; i++) set(x, y + i, z, log);
    }

    /**
     * Explosão: destrói os blocos numa esfera (os mais duros resistem mais; rocha-mãe e líquidos ficam).
     * Retorna o que foi destruído: {x, y, z, bloco}.
     */
    java.util.List<int[]> explode(double cx, double cy, double cz, double power, Random r) {
        java.util.List<int[]> out = new java.util.ArrayList<>();
        int rad = (int) Math.ceil(power);
        int bx = (int) Math.floor(cx), by = (int) Math.floor(cy), bz = (int) Math.floor(cz);
        for (int dx = -rad; dx <= rad; dx++)
            for (int dy = -rad; dy <= rad; dy++)
                for (int dz = -rad; dz <= rad; dz++) {
                    int x = bx + dx, y = by + dy, z = bz + dz;
                    if (!inBounds(x, y, z) || !isLoaded(x, z)) continue;
                    int b = get(x, y, z);
                    if (b == Block.AIR || Block.shape(b) == Block.LIQUID) continue;
                    double hard = Block.hardness(b);
                    if (hard < 0) continue;
                    double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist + hard * 0.3 + r.nextDouble() * 0.9 > power) continue;
                    out.add(new int[] { x, y, z, b });
                }
        for (int[] d : out) set(d[0], d[1], d[2], Block.AIR);
        return out;
    }

    // =====================================================================
    // água corrente
    // =====================================================================
    private static final int[] DX = { 1, -1, 0, 0, 0, 0 }, DY = { 0, 0, 1, -1, 0, 0 }, DZ = { 0, 0, 0, 0, 1, -1 };
    private final java.util.LinkedHashSet<Long> fluidQueue = new java.util.LinkedHashSet<>();
    private double fluidTimer;

    private boolean waterAround(int x, int y, int z) {
        for (int d = 0; d < 6; d++) if (Block.isWater(get(x + DX[d], y + DY[d], z + DZ[d]))) return true;
        return false;
    }

    private void scheduleFluid(int x, int y, int z) {
        if (y >= 0 && y < SY) fluidQueue.add(key(x, y, z));
    }

    /** Ar, plantas e tochas: a água ocupa o lugar (e leva as plantas embora). */
    private static boolean flowable(int b) {
        return b == Block.AIR || Block.shape(b) == Block.CROSS;
    }

    private static final int[] HX = { 1, -1, 0, 0 }, HZ = { 0, 0, 1, -1 }; // os 4 lados (h ^ 1 = o lado oposto)

    /** Embaixo de (x, y, z) a água pode cair (ar, planta ou outra água)? */
    private boolean dropBelow(int x, int y, int z) {
        if (y <= 0) return false;
        int b = get(x, y - 1, z);
        return flowable(b) || Block.isWater(b);
    }

    /** A água pode entrar em (x, y, z) pelo lado? */
    private boolean passable(int x, int y, int z) {
        int b = get(x, y, z);
        return flowable(b) || Block.waterLevel(b) > 0;
    }

    /** Quantos blocos andando de lado até um desnível, a partir de (x, y, z), sem voltar pelo lado from (99 = nenhum até 4). */
    private int dropDistance(int x, int y, int z, int from, int dist) {
        if (dropBelow(x, y, z)) return dist;
        if (dist >= 4) return 99;
        int best = 99;
        for (int h = 0; h < 4; h++) {
            if (h == from) continue;
            int nx = x + HX[h], nz = z + HZ[h];
            if (!passable(nx, y, nz)) continue;
            best = Math.min(best, dropDistance(nx, y, nz, h ^ 1, dist + 1));
        }
        return best;
    }

    /**
     * Para quais lados a água de (x, y, z) escorre (bit 1 << h). Como numa encosta de verdade, ela procura o
     * desnível mais perto (até 4 blocos) e vai só por esse caminho, caindo como cachoeira; sem desnível por perto
     * espalha para todos os lados. Água que tem por onde cair embaixo não escorre para o lado.
     */
    private int flowDirs(int x, int y, int z) {
        int below = y > 0 ? get(x, y - 1, z) : Block.BEDROCK;
        if (flowable(below) || Block.waterLevel(below) > 0) return 0;
        int best = 99, mask = 0, open = 0;
        for (int h = 0; h < 4; h++) {
            int nx = x + HX[h], nz = z + HZ[h];
            if (!passable(nx, y, nz) && !Block.isWater(get(nx, y, nz))) continue;
            open |= 1 << h;
            int d = dropDistance(nx, y, nz, h ^ 1, 1);
            if (d < best) { best = d; mask = 1 << h; }
            else if (d == best && d < 99) mask |= 1 << h;
        }
        return best == 99 ? open : mask;
    }

    /**
     * Avança a água a cada 0,2 s: cai, escorre para o desnível mais perto (ou espalha até 7 blocos no plano)
     * perdendo altura e seca quando perde a fonte. Só as células perto de onde algo mudou são olhadas.
     */
    void tickFluids(double dt) {
        fluidTimer += dt;
        if (fluidTimer < 0.2 || fluidQueue.isEmpty()) return;
        fluidTimer = 0;
        int n = Math.min(fluidQueue.size(), 6000);
        long[] batch = new long[n];
        java.util.Iterator<Long> it = fluidQueue.iterator();
        for (int i = 0; i < n; i++) { batch[i] = it.next(); it.remove(); }
        for (long k : batch) updateFluid(keyX(k), keyY(k), keyZ(k));
    }

    private void updateFluid(int x, int y, int z) {
        if (!isLoaded(x, z)) return;
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
            int dirs = flowDirs(x, y, z);
            for (int h = 0; h < 4; h++) {
                if ((dirs & 1 << h) == 0) continue;
                int nx = x + HX[h], nz = z + HZ[h];
                int nb = get(nx, y, nz);
                if (flowable(nb)) set(nx, y, nz, Block.waterOfLevel(next));
            }
        }
    }

    /** Nível que esta célula teria pela água em volta (99 = nenhuma água chega). */
    private int supportLevel(int x, int y, int z) {
        if (Block.isWater(get(x, y + 1, z))) return 1; // água caindo de cima
        int best = 99;
        for (int h = 0; h < 4; h++) {
            int nx = x + HX[h], nz = z + HZ[h];
            int l = Block.waterLevel(get(nx, y, nz));
            if (l < 0 || l + 1 >= best) continue;
            int under = get(nx, y - 1, nz);
            // água caindo (ar ou mais água embaixo) não espalha para o lado; só a apoiada em chão ou a fonte
            if (l > 0 && (flowable(under) || Block.isWater(under))) continue;
            // e só se este lado é um dos caminhos que ela escolheu (o do desnível mais perto)
            if ((flowDirs(nx, y, nz) & 1 << (h ^ 1)) == 0) continue;
            best = l + 1;
        }
        return best;
    }

    /** Quem quer saber de cada bloco mudado (a rede, no multijogador). */
    interface Listener { void changed(int x, int y, int z, int b); }
    Listener listener;

    // =====================================================================
    // pedaços com malha para refazer (lido pelo renderizador)
    // =====================================================================
    private final java.util.LinkedHashSet<Long> dirty = new java.util.LinkedHashSet<>();
    private final java.util.LinkedHashSet<Long> lazyDirty = new java.util.LinkedHashSet<>();
    boolean anyDirty;
    private long lastDirty = Long.MIN_VALUE, lastLazy = Long.MIN_VALUE;

    /** A malha deste pedaço mudou por causa de um bloco: refazer já. */
    private void markDirty(int cx, int cz) {
        long k = ckey(cx, cz);
        if (k == lastDirty) return;
        lastDirty = k;
        dirty.add(k);
        anyDirty = true;
    }

    /** A malha mudou só um pouco (luz que passou da borda de um pedaço novo): pode ser refeita em segundo plano. */
    private void markLazy(int cx, int cz) {
        long k = ckey(cx, cz);
        if (k == lastLazy) return;
        lastLazy = k;
        lazyDirty.add(k);
        anyDirty = true;
    }

    /** Os pedaços cuja malha precisa ser refeita já (chave de ckey). */
    long[] takeDirty() {
        long[] out = new long[dirty.size()];
        int i = 0;
        for (long k : dirty) out[i++] = k;
        dirty.clear();
        lastDirty = Long.MIN_VALUE;
        anyDirty = !lazyDirty.isEmpty();
        return out;
    }

    /** Os que podem esperar a vez das threads de malha. */
    long[] takeLazyDirty() {
        long[] out = new long[lazyDirty.size()];
        int i = 0;
        for (long k : lazyDirty) out[i++] = k;
        lazyDirty.clear();
        lastLazy = Long.MIN_VALUE;
        anyDirty = !dirty.isEmpty();
        return out;
    }

    // =====================================================================
    // luz
    // =====================================================================

    /** Luz do céu (0-15): plena acima do teto da coluna, e cai rápido abaixo dele. Sem o pedaço, é dia pleno. */
    int skyLight(int x, int y, int z) {
        if (y >= SY) return 15;
        Chunk c = chunkAt(x, z);
        if (c == null) return 15;
        int top = c.skyTop[(x & 15) * 16 + (z & 15)];
        if (y > top) return 15;
        return Math.max(0, 15 - (top - y + 1) * 3);
    }

    int blockLightAt(int x, int y, int z) {
        if (y < 0 || y >= SY) return 0;
        Chunk c = chunkAt(x, z);
        if (c == null) return 0;
        return c.light[Chunk.idx(x & 15, y, z & 15)];
    }

    private boolean nearLight(int x, int y, int z) {
        for (int dx = -1; dx <= 1; dx++)
            for (int dy = -1; dy <= 1; dy++)
                for (int dz = -1; dz <= 1; dz++)
                    if (blockLightAt(x + dx, y + dy, z + dz) > 0) return true;
        return false;
    }

    private long[] lq = new long[1 << 12];
    private int lqn;

    private void push(long k) {
        if (lqn == lq.length) lq = java.util.Arrays.copyOf(lq, lqn * 2);
        lq[lqn++] = k;
    }

    /** Refaz a luz de blocos numa caixa de raio 15 em volta de (x,y,z). */
    private void relight(int cx, int cy, int cz) {
        int r = 15;
        int x0 = cx - r, x1 = cx + r, z0 = cz - r, z1 = cz + r;
        int y0 = Math.max(0, cy - r), y1 = Math.min(SY - 1, cy + r);
        lqn = 0;
        // apaga a luz da caixa e anota as fontes que estão nela
        for (int pcx = x0 >> 4; pcx <= x1 >> 4; pcx++)
            for (int pcz = z0 >> 4; pcz <= z1 >> 4; pcz++) {
                Chunk c = chunk(pcx, pcz);
                if (c == null) continue;
                int lx0 = Math.max(x0, pcx * 16) - pcx * 16, lx1 = Math.min(x1, pcx * 16 + 15) - pcx * 16;
                int lz0 = Math.max(z0, pcz * 16) - pcz * 16, lz1 = Math.min(z1, pcz * 16 + 15) - pcz * 16;
                for (int lx = lx0; lx <= lx1; lx++)
                    for (int lz = lz0; lz <= lz1; lz++)
                        for (int y = y0; y <= y1; y++) {
                            int i = Chunk.idx(lx, y, lz);
                            int l = Block.light(c.blocks[i] & 0xFF);
                            c.light[i] = (byte) l;
                            if (l > 0) push(key(pcx * 16 + lx, y, pcz * 16 + lz));
                        }
            }
        // luz que entra pelas bordas da caixa, vinda de fora
        for (int x = x0 - 1; x <= x1 + 1; x++) {
            boolean xEdge = x < x0 || x > x1;
            for (int z = z0 - 1; z <= z1 + 1; z++) {
                boolean zEdge = z < z0 || z > z1;
                if (xEdge || zEdge) {
                    for (int y = y0 - 1; y <= y1 + 1; y++) if (blockLightAt(x, y, z) > 1) push(key(x, y, z));
                } else {
                    if (y0 - 1 >= 0 && blockLightAt(x, y0 - 1, z) > 1) push(key(x, y0 - 1, z));
                    if (y1 + 1 < SY && blockLightAt(x, y1 + 1, z) > 1) push(key(x, y1 + 1, z));
                }
            }
        }
        bfs(x0, x1, y0, y1, z0, z1, false);
        for (int pcx = x0 >> 4; pcx <= x1 >> 4; pcx++)
            for (int pcz = z0 >> 4; pcz <= z1 >> 4; pcz++) markDirty(pcx, pcz);
    }

    /**
     * Um pedaço acabou de entrar no mundo: a luz que ele tem na borda passa para os vizinhos já carregados
     * e a deles passa para ele (a luz só aumenta; nada precisa ser apagado).
     */
    private void spillLight(Chunk c) {
        lqn = 0;
        int x0 = c.cx * 16, z0 = c.cz * 16;
        for (int d = 0; d < 4; d++) {
            int ncx = c.cx + (d == 0 ? 1 : d == 1 ? -1 : 0), ncz = c.cz + (d == 2 ? 1 : d == 3 ? -1 : 0);
            Chunk n = chunk(ncx, ncz);
            if (n == null) continue;
            for (int t = 0; t < 16; t++)
                for (int y = 0; y < SY; y++) {
                    int lx = d == 0 ? 15 : d == 1 ? 0 : t, lz = d == 2 ? 15 : d == 3 ? 0 : t;
                    int nlx = d == 0 ? 0 : d == 1 ? 15 : t, nlz = d == 2 ? 0 : d == 3 ? 15 : t;
                    if (c.light[Chunk.idx(lx, y, lz)] > 1) push(key(x0 + lx, y, z0 + lz));
                    if (n.light[Chunk.idx(nlx, y, nlz)] > 1) push(key(ncx * 16 + nlx, y, ncz * 16 + nlz));
                }
        }
        if (lqn > 0) bfs(x0 - 16, x0 + 31, 0, SY - 1, z0 - 16, z0 + 31, true);
        lqn = 0;
    }

    /** Espalha a luz (busca em largura), perdendo 1 nível por bloco, só dentro da caixa. */
    private void bfs(int x0, int x1, int y0, int y1, int z0, int z1, boolean markWrites) {
        int head = 0;
        while (head < lqn) {
            long k = lq[head++];
            int x = keyX(k), y = keyY(k), z = keyZ(k);
            Chunk c = chunkAt(x, z);
            if (c == null) continue;
            int l = c.light[Chunk.idx(x & 15, y, z & 15)] - 1;
            if (l <= 0) continue;
            for (int d = 0; d < 6; d++) {
                int nx = x + (d == 0 ? 1 : d == 1 ? -1 : 0);
                int ny = y + (d == 2 ? 1 : d == 3 ? -1 : 0);
                int nz = z + (d == 4 ? 1 : d == 5 ? -1 : 0);
                if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || nz < z0 || nz > z1) continue;
                Chunk n = (nx >> 4 == c.cx && nz >> 4 == c.cz) ? c : chunkAt(nx, nz);
                if (n == null) continue;
                int j = Chunk.idx(nx & 15, ny, nz & 15);
                if (Block.blocksLight(n.blocks[j] & 0xFF) || n.light[j] >= l) continue;
                n.light[j] = (byte) l;
                push(key(nx, ny, nz));
                if (markWrites) markLazy(n.cx, n.cz);
            }
            if (head > 1 << 16) { // compacta a fila para não crescer sem fim
                System.arraycopy(lq, head, lq, 0, lqn - head);
                lqn -= head;
                head = 0;
            }
        }
        lqn = 0;
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

    /** Temperatura (0 frio .. 1 quente) que decide os biomas: abaixo de 0,43 é tundra / campo de gelo. */
    double temperature(int x, int z) {
        return fbm(x / (260.0 * biomeScale), z / (260.0 * biomeScale), 3, seed + 11);
    }

    int biomeAt(int x, int z, int top) {
        if (top >= 46) return MOUNTAINS;
        double t = temperature(x, z);
        double m = fbm(x / (210.0 * biomeScale), z / (210.0 * biomeScale), 3, seed + 12);
        if (t > 0.58 && m < 0.5) return DESERT;
        if (t < 0.43) return top < SEA - 3 ? ICE_FIELD : TUNDRA; // mar frio e fundo: campo de gelo com trincheiras
        if (m > 0.56) return t > 0.5 ? BIRCH_FOREST : FOREST;
        return PLAINS;
    }

    // =====================================================================
    // geração (só depende da semente e da posição: dá o mesmo resultado em qualquer computador)
    // =====================================================================

    /** Gera o terreno, as cavernas e a decoração de um pedaço. Pode rodar em qualquer thread. */
    Chunk generate(int cx, int cz) {
        Chunk c = new Chunk(cx, cz);
        int x0 = cx * 16, z0 = cz * 16;
        int[] heights = new int[256];
        byte[] biomes = new byte[256];
        int[] meta = new int[2];
        for (int lx = 0; lx < 16; lx++)
            for (int lz = 0; lz < 16; lz++) {
                column(x0 + lx, z0 + lz, c.blocks, Chunk.idx(lx, 0, lz), meta);
                heights[lx * 16 + lz] = meta[0];
                biomes[lx * 16 + lz] = (byte) meta[1];
            }
        decorate(c, heights, biomes);
        int[] igloo = iglooSite(cx, cz);
        if (igloo != null) buildIgloo(c, igloo);
        return c;
    }

    // =====================================================================
    // campo de gelo: no mar frio e fundo, uma camada grossa de gelo sobe acima da água e é cortada por
    // trincheiras (canais de água com paredes de gelo retas). Na linha d'água o gelo é azul e as ondas cavam
    // um recorte embaixo da parede, de onde pendem pingentes. Só depende da semente e da posição.
    // =====================================================================

    /** Quanto a coluna fica longe de um canal: 0 = no meio do canal; acima de ~0,05 = gelo. */
    private double channel(int x, int z) {
        double a = Math.abs(fbm(x / 46.0, z / 46.0, 2, seed + 160) - 0.5);           // canais largos e compridos
        double b = Math.abs(fbm(x / 23.0 + 50, z / 23.0, 2, seed + 161) - 0.5) * 1.6; // canais menores que os cruzam
        return Math.min(a, b) - 0.012 * noise(x / 5.0, z / 5.0, seed + 162);
    }

    /**
     * Escreve a camada de gelo na coluna (x, z) de água fria. A altura cresce aos poucos: perto da margem (água rasa)
     * e na borda do frio o gelo fica no nível da água, como o gelo comum da tundra, e vai subindo em rampa conforme
     * a água fica funda e o frio aumenta, até o planalto (uns 2 a 6 blocos acima da água). As trincheiras só cortam
     * o gelo onde ele já está alto, então sempre dá para chegar no topo andando.
     */
    private void iceField(int x, int z, int top, byte[] out, int base) {
        double t = temperature(x, z);
        double cold = Math.max(0, Math.min(1, (0.43 - t) / 0.02));       // 0 na borda da tundra, 1 bem no frio
        double deep = Math.max(0, Math.min(1, (SEA - 1 - top) / 8.0));   // 0 na margem, 1 em água funda
        deep = deep * deep * (3 - 2 * deep);
        double rise = (2.5 + fbm(x / 30.0, z / 30.0, 3, seed + 163) * 4.5) * cold * deep;
        int topY = SEA - 1 + (int) Math.round(rise + (noise(x / 4.0, z / 4.0, seed + 164) - 0.5) * 0.6 * cold * deep);
        if (topY <= SEA - 1) return; // no nível da água: fica a placa de gelo comum
        double c = channel(x, z);
        final double W = 0.035; // abaixo disso é canal (água)
        boolean carve = rise >= 2.5;
        if (carve && c < W) return;
        boolean undercut = carve && topY >= SEA + 2 && c < W + 0.012; // perto do canal as ondas cavam a parede na linha d'água
        boolean streak = noise(x / 2.5, z / 2.5, seed + 165) > 0.68; // listras azuis descendo pela parede
        for (int y = Math.max(top + 1, SEA - 3); y <= topY; y++) {
            if (undercut && y == SEA) continue;
            int b;
            if (y == topY) b = Block.SNOW;
            else if (y == topY - 1 && hash(x, z, seed + 166) < 0.6) b = Block.SNOW;
            else if (y <= SEA || streak) b = Block.BLUE_ICE;
            else b = Block.PACKED_ICE;
            out[base | y] = (byte) b;
        }
        // pingentes embaixo do recorte
        if (undercut && out[base | (SEA + 1)] != Block.AIR && hash3(x, SEA, z, seed + 167) < 0.55) out[base | SEA] = (byte) Block.ICICLE;
    }

    // =====================================================================
    // estruturas: iglu (a primeira). Só depende da semente, como o resto da geração.
    // =====================================================================

    /**
     * Há um iglu no pedaço (cx, cz)? Retorna {x, y do chão, z} do centro, ou null. Uns 2% dos pedaços sorteiam;
     * o lugar precisa ser tundra, longe da água e quase plano. O iglu inteiro cabe dentro do pedaço.
     */
    int[] iglooSite(int cx, int cz) {
        if (hash(cx, cz, seed + 90) >= 0.02) return null; // raro: só 2% dos pedaços sorteiam
        int x = cx * 16 + 5 + (int) (hash(cx, cz, seed + 91) * 6), z = cz * 16 + 5 + (int) (hash(cx, cz, seed + 92) * 4);
        int lo = Integer.MAX_VALUE, hi = Integer.MIN_VALUE;
        for (int dx = -4; dx <= 4; dx++)
            for (int dz = -4; dz <= 6; dz++) {
                int h = heightAt(x + dx, z + dz);
                if (h - 1 <= SEA + 1 || h + 6 >= SY) return null;
                if (biomeAt(x + dx, z + dz, h - 1) != TUNDRA) return null;
                lo = Math.min(lo, h);
                hi = Math.max(hi, h);
            }
        if (hi - lo > 2) return null;
        return new int[] { x, hi, z };
    }

    /** A coluna (x, z) fica no terreno de um iglu (com folga para a copa das árvores e a frente da porta)? */
    private boolean nearIgloo(int x, int z) {
        for (int cx = (x - 7) >> 4; cx <= (x + 7) >> 4; cx++)
            for (int cz = (z - 10) >> 4; cz <= (z + 7) >> 4; cz++) {
                int[] s = iglooSite(cx, cz);
                if (s != null && Math.abs(x - s[0]) <= 7 && z >= s[2] - 7 && z <= s[2] + 10) return true;
            }
        return false;
    }

    /** O baú do iglu fica nesta posição? (o jogo enche o baú na primeira vez que alguém o abre) */
    boolean iglooChest(int x, int y, int z) {
        int[] s = iglooSite(x >> 4, z >> 4);
        return s != null && x == s[0] && y == s[1] && z == s[2] - 3;
    }

    /** Distância "achatada" do centro da cúpula: abaixo de 3,3 é o lado de dentro; até 4,4 é a parede de neve. */
    private static double domeDist(int dx, int dy, int dz) {
        return Math.sqrt(dx * dx + dy * 1.2 * dy * 1.2 + dz * dz);
    }

    private void buildIgloo(Chunk c, int[] s) {
        int ox = s[0] - c.cx * 16, fy = s[1], oz = s[2] - c.cz * 16;
        // limpa o lugar (árvores, plantas) e firma o chão embaixo da cúpula e do túnel
        for (int dx = -4; dx <= 4; dx++)
            for (int dz = -4; dz <= 6; dz++) {
                boolean tunnel = dz >= 3 && Math.abs(dx) <= 1;
                if (!tunnel && domeDist(dx, 0, dz) >= 4.6) continue;
                int lx = ox + dx, lz = oz + dz;
                for (int y = fy; y < Math.min(SY, fy + 9); y++) c.blocks[Chunk.idx(lx, y, lz)] = (byte) Block.AIR;
                for (int y = fy - 1; y >= Math.max(1, fy - 5); y--) {
                    int i = Chunk.idx(lx, y, lz), b = c.blocks[i] & 0xFF;
                    if (b == Block.AIR || Block.isWater(b) || Block.isLeaves(b) || Block.shape(b) == Block.CROSS) c.blocks[i] = (byte) Block.SNOW;
                    else break;
                }
            }
        // a cúpula de neve
        for (int dx = -4; dx <= 4; dx++)
            for (int dz = -4; dz <= 4; dz++)
                for (int dy = 0; dy <= 4; dy++) {
                    double d = domeDist(dx, dy, dz);
                    int i = Chunk.idx(ox + dx, fy + dy, oz + dz);
                    if (d < 3.3) c.blocks[i] = (byte) Block.AIR;
                    else if (d < 4.4) c.blocks[i] = (byte) Block.SNOW;
                    if (dy == 0 && d < 3.3) c.blocks[Chunk.idx(ox + dx, fy - 1, oz + dz)] = (byte) Block.WOOL; // piso de lã
                }
        // túnel de entrada (para +Z) e a porta na cúpula
        for (int dz = 3; dz <= 6; dz++) {
            for (int dy = 0; dy <= 1; dy++) {
                c.blocks[Chunk.idx(ox, fy + dy, oz + dz)] = (byte) Block.AIR;
                if (dz >= 5) {
                    c.blocks[Chunk.idx(ox - 1, fy + dy, oz + dz)] = (byte) Block.SNOW;
                    c.blocks[Chunk.idx(ox + 1, fy + dy, oz + dz)] = (byte) Block.SNOW;
                }
            }
            if (dz >= 5) for (int dx = -1; dx <= 1; dx++) c.blocks[Chunk.idx(ox + dx, fy + 2, oz + dz)] = (byte) Block.SNOW;
        }
        // janelas de gelo dos lados
        c.blocks[Chunk.idx(ox - 4, fy + 1, oz)] = (byte) Block.ICE;
        c.blocks[Chunk.idx(ox + 4, fy + 1, oz)] = (byte) Block.ICE;
        // dentro: baú no fundo (de frente para a porta), fornalha, bancada, cama e uma tocha
        putRot(c, ox, fy, oz - 3, Block.CHEST, 0);
        putRot(c, ox + 2, fy, oz - 2, Block.FURNACE, 1);
        putRot(c, ox - 2, fy, oz - 2, Block.TABLE, 3);
        putRot(c, ox - 2, fy, oz, Block.BED, 0);
        putRot(c, ox + 2, fy, oz + 1, Block.TORCH, 0);
    }

    private static void putRot(Chunk c, int lx, int y, int lz, int b, int rot) {
        int i = Chunk.idx(lx, y, lz);
        c.blocks[i] = (byte) b;
        storeRot(c, i, rot);
    }


    /** Sorteio próprio de cada coluna: árvores de um pedaço vizinho chegam iguais nos dois lados da borda. */
    private Random columnRandom(int x, int z) {
        long h = (long) x * 0x9E3779B97F4A7C15L ^ (long) z * 0xC2B2AE3D27D4EB4FL ^ ((long) seed << 21) ^ 0x5DEECE66DL;
        return new Random(h);
    }

    private static double treeChance(int biome) {
        return biome == FOREST ? 0.05 : biome == BIRCH_FOREST ? 0.045 : biome == TUNDRA ? 0.006 : biome == MOUNTAINS ? 0.003 : 0.004;
    }

    /**
     * Árvores, plantas e cactos. Uma árvore pode ficar em cima da borda do pedaço, então olhamos também as
     * colunas até 2 blocos fora dele e escrevemos só a parte da árvore que cai dentro. Para todos os pedaços
     * concordarem sobre a árvore, a decisão usa só o terreno "limpo" (antes de qualquer decoração).
     */
    private void decorate(Chunk c, int[] heights, byte[] biomes) {
        int x0 = c.cx * 16, z0 = c.cz * 16;
        byte[] terrain = c.blocks.clone();
        byte[] tmp = new byte[SY];
        int[] meta = new int[2];
        for (int x = x0 - 2; x < x0 + 18; x++)
            for (int z = z0 - 2; z < z0 + 18; z++) {
                boolean inside = x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
                int h, biome;
                byte[] col;
                int base;
                Random r = columnRandom(x, z);
                double roll = r.nextDouble();
                if (inside) {
                    int i = (x - x0) * 16 + (z - z0);
                    h = heights[i];
                    biome = biomes[i];
                    col = terrain;
                    base = Chunk.idx(x - x0, 0, z - z0);
                } else {
                    h = heightAt(x, z);
                    biome = biomeAt(x, z, h - 1);
                    if (roll >= treeChance(biome)) continue; // fora do pedaço só interessam as árvores
                    column(x, z, tmp, 0, meta);
                    col = tmp;
                    base = 0;
                }
                int top = h - 1;
                if (top + 6 >= SY || col[base + top + 1] != Block.AIR) continue;
                int b = col[base + top] & 0xFF;
                if (b == Block.GRASS || (b == Block.SNOW && biome == TUNDRA)) {
                    if (roll < treeChance(biome)) {
                        if (nearIgloo(x, z)) continue; // nada de árvore em cima ou na porta do iglu
                        boolean birch = biome == BIRCH_FOREST || (biome == FOREST && r.nextDouble() < 0.2);
                        placeTree(c, x, top + 1, z, r, birch);
                    } else if (inside && b == Block.GRASS) {
                        double grassP = biome == PLAINS ? 0.16 : 0.08;
                        double flowerP = biome == PLAINS ? 0.025 : 0.01;
                        double k = r.nextDouble();
                        int pi = Chunk.idx(x - x0, top + 1, z - z0);
                        if (k < flowerP) c.blocks[pi] = (byte) (r.nextBoolean() ? Block.FLOWER_YELLOW : Block.FLOWER_RED);
                        else if (k < flowerP + grassP) c.blocks[pi] = (byte) Block.TALL_GRASS;
                    }
                } else if (inside && b == Block.SAND && biome == DESERT && roll < 0.006) {
                    int hgt = 1 + r.nextInt(3);
                    for (int i = 1; i <= hgt; i++) c.blocks[Chunk.idx(x - x0, top + i, z - z0)] = (byte) Block.CACTUS;
                }
            }
    }

    /** Coluna (x, z) do terreno: pedra, minérios, solo, água e cavernas, escrita em out a partir de base. meta: {altura, bioma}. */
    private void column(int x, int z, byte[] out, int base, int[] meta) {
        int h = heightAt(x, z);
        int top = h - 1;
        int biome = biomeAt(x, z, top);
        meta[0] = h;
        meta[1] = biome;
        boolean beach = top <= SEA + 1;
        // no frio a margem fora d'água é de neve, não de areia (a areia fica só no fundo)
        if (beach && top >= SEA - 1 && (biome == TUNDRA || biome == ICE_FIELD)) beach = false;
        boolean gravelFloor = top < SEA - 1 && noise(x / 9.0, z / 9.0, seed + 70) > 0.62;

        for (int y = 0; y < SY; y++) out[base | y] = (byte) Block.AIR;
        for (int y = 0; y <= top; y++) {
            int depth = top - y;
            int b;
            if (y == 0 || (y == 1 && hash(x, z, seed + 3) < 0.5)) b = Block.BEDROCK;
            else if (depth == 0) {
                if (gravelFloor) b = Block.GRAVEL;
                else if (beach || biome == DESERT || (biome == ICE_FIELD && top < SEA - 1)) b = Block.SAND;
                else if (biome == TUNDRA) b = Block.SNOW;
                else if (biome == MOUNTAINS) b = top >= 49 + (int) (hash(x, z, seed + 5) * 3) ? Block.SNOW : Block.STONE;
                else b = Block.GRASS;
            } else if (depth < 4) {
                if (gravelFloor && depth < 2) b = Block.GRAVEL;
                else if (beach || (biome == ICE_FIELD && top < SEA - 1 && depth < 2)) b = Block.SAND;
                else if (biome == DESERT) b = depth < 3 ? Block.SAND : Block.SANDSTONE;
                else if (biome == MOUNTAINS) b = Block.STONE;
                else b = Block.DIRT;
            } else b = ore(x, y, z);
            out[base | y] = (byte) b;
        }
        for (int y = h; y < SEA; y++)
            out[base | y] = (byte) ((biome == TUNDRA || biome == ICE_FIELD) && y == SEA - 1 ? Block.ICE : Block.WATER);
        if (biome == ICE_FIELD && channel(x, z) < 0.035) {
            // nos canais, placas de gelo soltas boiando
            if (noise(x / 5.0, z / 5.0, seed + 155) * 0.75 + hash(x, z, seed + 156) * 0.25 <= 0.66) out[base | (SEA - 1)] = (byte) Block.WATER;
        }
        if ((biome == ICE_FIELD || biome == TUNDRA) && top < SEA - 1) iceField(x, z, top, out, base);

        // cavernas: túneis (dois ruídos 3D perto de 0.5 ao mesmo tempo) e salões
        boolean canOpen = top >= SEA + 3; // não abre cavernas debaixo de água
        for (int y = 2; y <= top; y++) {
            int depth = top - y;
            if (depth < 5 && !canOpen) continue;
            int b = out[base | y] & 0xFF;
            if (b == Block.BEDROCK || Block.isWater(b)) continue;
            double a = noise3(x / 22.0, y / 12.0, z / 22.0, seed + 20) - 0.5;
            double cc = noise3(x / 22.0, y / 12.0, z / 22.0, seed + 21) - 0.5;
            boolean tunnel = a * a + cc * cc < 0.0028;
            boolean room = y < 28 && noise3(x / 34.0, y / 16.0, z / 34.0, seed + 22) > 0.8;
            if (tunnel || room) out[base | y] = (byte) (y <= 5 ? Block.LAVA : Block.AIR);
        }
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

    /** Uma árvore com o tronco em (x, y, z); só entra no pedaço c o que cai dentro dele. */
    private void placeTree(Chunk c, int x, int y, int z, Random r, boolean birch) {
        int log = birch ? Block.BIRCH_LOG : Block.LOG, leaf = birch ? Block.BIRCH_LEAVES : Block.LEAVES;
        int x0 = c.cx * 16, z0 = c.cz * 16;
        int h = (birch ? 5 : 4) + r.nextInt(3);
        int top = y + h;
        for (int dy = -2; dy <= 1; dy++) {
            int rad = dy < 0 ? 2 : 1;
            for (int dx = -rad; dx <= rad; dx++)
                for (int dz = -rad; dz <= rad; dz++) {
                    boolean corner = Math.abs(dx) == rad && Math.abs(dz) == rad;
                    if (corner && (dy == 1 || r.nextInt(2) == 0)) continue;
                    int px = x + dx - x0, py = top + dy, pz = z + dz - z0;
                    if (px < 0 || px > 15 || pz < 0 || pz > 15 || py < 0 || py >= SY) continue;
                    int i = Chunk.idx(px, py, pz);
                    if (c.blocks[i] == Block.AIR) c.blocks[i] = (byte) leaf;
                }
        }
        int tx = x - x0, tz = z - z0;
        if (tx < 0 || tx > 15 || tz < 0 || tz > 15) return;
        for (int i = 0; i < h && y + i < SY; i++) c.blocks[Chunk.idx(tx, y + i, tz)] = (byte) log;
        if (y - 1 >= 0 && c.blocks[Chunk.idx(tx, y - 1, tz)] == Block.GRASS) c.blocks[Chunk.idx(tx, y - 1, tz)] = (byte) Block.DIRT;
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

    /** Ponto de nascimento: terra firme mais perto da origem (0, 0). {x, y, z} dos pés. Carrega os pedaços que precisar. */
    double[] findSpawn() {
        for (int r = 0; r < 600; r++)
            for (int dx = -r; dx <= r; dx++)
                for (int dz = -r; dz <= r; dz++) {
                    if (Math.abs(dx) != r && Math.abs(dz) != r) continue;
                    if (heightAt(dx, dz) < SEA + 2) continue; // água ou praia baixa: nem vale carregar
                    ensureChunk(dx >> 4, dz >> 4);
                    int top = grassTop(dx, dz);
                    if (top >= 0 && (get(dx, top + 1, dz) == Block.AIR || Block.shape(get(dx, top + 1, dz)) == Block.CROSS))
                        return new double[] { dx + 0.5, top + 1.01, dz + 0.5 };
                }
        ensureChunk(0, 0);
        return new double[] { 0.5, SY - 1, 0.5 };
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
            if (iy < 0 || iy >= SY) {
                if (iy >= SY && sy > 0) break;
                continue;
            }
            Chunk c = chunkAt(ix, iz);
            if (c == null) continue;
            int b = c.blocks[Chunk.idx(ix & 15, iy, iz & 15)] & 0xFF;
            if (b != Block.AIR && Block.shape(b) != Block.LIQUID) return new int[] { ix, iy, iz, px, py, pz, (int) (t * 1000) };
        }
        return null;
    }
}
