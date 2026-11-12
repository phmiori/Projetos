/**
 * Tipos de bloco do mundo e suas propriedades.
 * Os números (ids) dos blocos antigos não mudaram, então mundos salvos antes continuam abrindo.
 */
final class Block {
    static final int AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, COBBLE = 4, SAND = 5,
            LOG = 6, LEAVES = 7, PLANKS = 8, BRICK = 9, SNOW = 10, WATER = 11,
            COAL_ORE = 12, IRON_ORE = 13, GOLD_ORE = 14, CRYSTAL_ORE = 15, GRAVEL = 16, SANDSTONE = 17,
            GLASS = 18, TORCH = 19, TABLE = 20, FURNACE = 21, BIRCH_LOG = 22, BIRCH_LEAVES = 23,
            CACTUS = 24, TALL_GRASS = 25, FLOWER_YELLOW = 26, FLOWER_RED = 27, ICE = 28, LAVA = 29,
            WOOL = 30, STONE_BRICK = 31, IRON_BLOCK = 32, GOLD_BLOCK = 33, BEDROCK = 34;
    /** Água corrente, do nível 1 (quase cheia) ao 7 (só uma lâmina); WATER é a fonte (nível 0). */
    static final int WATER_FLOW = 35; // 35..41

    /**
     * Blocos com formato (feitos de caixas menores). Cada variante é um id próprio:
     *   escada: STAIR_BASE + material*8 + direção*2 + invertida
     *   laje:   SLAB_BASE + material*2 + em cima
     *   porta:  DOOR_BASE + metade*8 + direção*2 + aberta   (metade 0 = de baixo, 1 = de cima)
     * Direção: 0 = +Z, 1 = -X, 2 = -Z, 3 = +X (para onde o jogador olhava ao colocar).
     */
    static final int STAIR_BASE = 42, SLAB_BASE = 82, DOOR_BASE = 92, DOOR_TEX_LOWER = 108, DOOR_TEX_UPPER = 109;
    /**
     * laje vertical: VSLAB_BASE + material*4 + direção (ocupa a metade do bloco nessa direção)
     * cerca e painel de vidro: conectam-se aos vizinhos (formato calculado na hora)
     * tocha na parede: WALL_TORCH_BASE + direção (a parede fica nessa direção)
     * lajes empilhadas de materiais diferentes: MIXED_SLAB_BASE + material_de_baixo*5 + material_de_cima
     */
    static final int VSLAB_BASE = 110, FENCE = 130, GLASS_PANE = 131, WALL_TORCH_BASE = 132, MIXED_SLAB_BASE = 136;
    /** Dinamite, cama (meio bloco de altura) e mudas de árvore. */
    static final int TNT = 161, BED = 162, SAPLING = 163, BIRCH_SAPLING = 164;
    // limite: o desenho guarda bloco*6+face em 10 bits, então no máximo 170 blocos
    /** Baú, terra arada (pela enxada) e trigo em 3 fases de crescimento (WHEAT..WHEAT+2). */
    static final int CHEST = 165, FARMLAND = 166, WHEAT = 167;
    static final int COUNT = 170;
    /** Materiais das escadas e lajes. */
    static final int[] SHAPE_MATS = { PLANKS, COBBLE, STONE_BRICK, BRICK, SANDSTONE };
    private static final String[] SHAPE_MAT_NAMES = { "de tábuas", "de pedregulho", "de tijolos de pedra", "de tijolos", "de arenito" };

    /** Forma de desenhar. MODEL = feito de caixas (escadas, lajes, portas). */
    static final int CUBE = 0, CUTOUT = 1, CROSS = 2, LIQUID = 3, MODEL = 4;
    /** Material: qual ferramenta quebra mais rápido. */
    static final int M_NONE = 0, M_SOIL = 1, M_WOOD = 2, M_ROCK = 3, M_PLANT = 4;

    static final String[] NAMES = new String[COUNT];
    private static final double[] HARDNESS = new double[COUNT];
    private static final int[] SHAPE = new int[COUNT], MATERIAL = new int[COUNT], TIER = new int[COUNT],
            DROP = new int[COUNT], LIGHT = new int[COUNT], TEXTURE = new int[COUNT];
    /** Caixas de cada bloco com formato (x0,y0,z0,x1,y1,z1 de 0 a 1); null = cubo inteiro. */
    private static final float[][][] BOXES = new float[COUNT][][];

    static {
        // id, nome, dureza (s com a mão; -1 = inquebrável), forma, material, nível de picareta exigido (-1 nenhum), item que dá, luz
        def(AIR, "Ar", 0, CUBE, M_NONE, -1, AIR, 0);
        def(GRASS, "Grama", 0.6, CUBE, M_SOIL, -1, DIRT, 0);
        def(DIRT, "Terra", 0.5, CUBE, M_SOIL, -1, DIRT, 0);
        def(STONE, "Pedra", 2.0, CUBE, M_ROCK, 0, COBBLE, 0);
        def(COBBLE, "Pedregulho", 2.2, CUBE, M_ROCK, 0, COBBLE, 0);
        def(SAND, "Areia", 0.5, CUBE, M_SOIL, -1, SAND, 0);
        def(LOG, "Tronco", 1.8, CUBE, M_WOOD, -1, LOG, 0);
        def(LEAVES, "Folhas", 0.3, CUTOUT, M_PLANT, -1, LEAVES, 0);
        def(PLANKS, "Tábuas", 1.4, CUBE, M_WOOD, -1, PLANKS, 0);
        def(BRICK, "Tijolos", 2.5, CUBE, M_ROCK, 0, BRICK, 0);
        def(SNOW, "Neve", 0.3, CUBE, M_SOIL, -1, SNOW, 0);
        def(WATER, "Água", -1, LIQUID, M_NONE, -1, AIR, 0);
        def(COAL_ORE, "Minério de carvão", 3.0, CUBE, M_ROCK, 0, Items.COAL, 0);
        def(IRON_ORE, "Minério de ferro", 3.5, CUBE, M_ROCK, 1, IRON_ORE, 0);
        def(GOLD_ORE, "Minério de ouro", 3.5, CUBE, M_ROCK, 2, GOLD_ORE, 0);
        def(CRYSTAL_ORE, "Minério de cristal", 4.0, CUBE, M_ROCK, 2, Items.CRYSTAL, 0);
        def(GRAVEL, "Cascalho", 0.7, CUBE, M_SOIL, -1, GRAVEL, 0);
        def(SANDSTONE, "Arenito", 1.6, CUBE, M_ROCK, 0, SANDSTONE, 0);
        def(GLASS, "Vidro", 0.4, CUTOUT, M_NONE, -1, GLASS, 0);
        def(TORCH, "Tocha", 0.05, CROSS, M_NONE, -1, TORCH, 14);
        def(TABLE, "Bancada", 1.6, CUBE, M_WOOD, -1, TABLE, 0);
        def(FURNACE, "Fornalha", 3.0, CUBE, M_ROCK, 0, FURNACE, 0);
        def(BIRCH_LOG, "Tronco de bétula", 1.8, CUBE, M_WOOD, -1, BIRCH_LOG, 0);
        def(BIRCH_LEAVES, "Folhas de bétula", 0.3, CUTOUT, M_PLANT, -1, BIRCH_LEAVES, 0);
        def(CACTUS, "Cacto", 0.5, CUBE, M_PLANT, -1, CACTUS, 0);
        def(TALL_GRASS, "Grama alta", 0.05, CROSS, M_PLANT, -1, AIR, 0);
        def(FLOWER_YELLOW, "Flor amarela", 0.05, CROSS, M_PLANT, -1, FLOWER_YELLOW, 0);
        def(FLOWER_RED, "Flor vermelha", 0.05, CROSS, M_PLANT, -1, FLOWER_RED, 0);
        def(ICE, "Gelo", 0.6, CUBE, M_ROCK, -1, AIR, 0);
        def(LAVA, "Lava", -1, LIQUID, M_NONE, -1, AIR, 15);
        def(WOOL, "Lã", 0.8, CUBE, M_NONE, -1, WOOL, 0);
        def(STONE_BRICK, "Tijolos de pedra", 2.4, CUBE, M_ROCK, 0, STONE_BRICK, 0);
        def(IRON_BLOCK, "Bloco de ferro", 5.0, CUBE, M_ROCK, 1, IRON_BLOCK, 0);
        def(GOLD_BLOCK, "Bloco de ouro", 4.0, CUBE, M_ROCK, 2, GOLD_BLOCK, 0);
        def(BEDROCK, "Rocha-mãe", -1, CUBE, M_ROCK, -1, AIR, 0);
        for (int l = 1; l <= 7; l++) def(WATER_FLOW + l - 1, "Água corrente", -1, LIQUID, M_NONE, -1, AIR, 0);
        for (int i = 0; i < COUNT; i++) TEXTURE[i] = i;

        // escadas e lajes: dureza, material e textura do bloco de origem
        for (int m = 0; m < SHAPE_MATS.length; m++) {
            int base = SHAPE_MATS[m];
            for (int f = 0; f < 4; f++)
                for (int up = 0; up < 2; up++) {
                    int id = stair(m, f, up);
                    def(id, "Escada " + SHAPE_MAT_NAMES[m], HARDNESS[base], MODEL, MATERIAL[base], TIER[base], stair(m, 0, 0), 0);
                    TEXTURE[id] = base;
                    BOXES[id] = up == 0
                            ? rotate(f, new float[][] { { 0, 0, 0, 1, 0.5f, 1 }, { 0, 0.5f, 0.5f, 1, 1, 1 } })
                            : rotate(f, new float[][] { { 0, 0.5f, 0, 1, 1, 1 }, { 0, 0, 0.5f, 1, 0.5f, 1 } });
                }
            for (int top = 0; top < 2; top++) {
                int id = slab(m, top);
                def(id, "Laje " + SHAPE_MAT_NAMES[m], HARDNESS[base], MODEL, MATERIAL[base], TIER[base], slab(m, 0), 0);
                TEXTURE[id] = base;
                BOXES[id] = new float[][] { top == 0 ? new float[] { 0, 0, 0, 1, 0.5f, 1 } : new float[] { 0, 0.5f, 0, 1, 1, 1 } };
            }
        }
        // portas: placa fina; fechada fica no lado para onde o jogador olhava, aberta gira para o lado da dobradiça
        def(DOOR_TEX_LOWER, "Porta (textura de baixo)", 1, CUBE, M_WOOD, -1, AIR, 0);
        def(DOOR_TEX_UPPER, "Porta (textura de cima)", 1, CUBE, M_WOOD, -1, AIR, 0);
        float t = 3 / 16f;
        for (int half = 0; half < 2; half++)
            for (int f = 0; f < 4; f++)
                for (int open = 0; open < 2; open++) {
                    int id = door(half, f, open);
                    def(id, "Porta de madeira", 1.4, MODEL, M_WOOD, -1, door(0, 0, 0), 0);
                    TEXTURE[id] = half == 0 ? DOOR_TEX_LOWER : DOOR_TEX_UPPER;
                    BOXES[id] = rotate(f, new float[][] { open == 0 ? new float[] { 0, 0, 1 - t, 1, 1, 1 } : new float[] { 0, 0, 0, t, 1, 1 } });
                }

        // lajes verticais: meia parede na direção em que foi colocada
        for (int m = 0; m < SHAPE_MATS.length; m++) {
            int base = SHAPE_MATS[m];
            for (int f = 0; f < 4; f++) {
                int id = vslab(m, f);
                def(id, "Laje vertical " + SHAPE_MAT_NAMES[m], HARDNESS[base], MODEL, MATERIAL[base], TIER[base], vslab(m, 0), 0);
                TEXTURE[id] = base;
                BOXES[id] = rotate(f, new float[][] { { 0, 0, 0.5f, 1, 1, 1 } });
            }
        }
        // cerca e painel de vidro (as caixas aqui são só a forma do ícone; no mundo dependem dos vizinhos)
        def(FENCE, "Cerca de madeira", 1.4, MODEL, M_WOOD, -1, FENCE, 0);
        TEXTURE[FENCE] = PLANKS;
        BOXES[FENCE] = fenceBoxes(false, false, true, true, false);
        def(GLASS_PANE, "Painel de vidro", 0.4, MODEL, M_NONE, -1, GLASS_PANE, 0);
        TEXTURE[GLASS_PANE] = GLASS;
        BOXES[GLASS_PANE] = paneBoxes(false, false, true, true);
        // tocha na parede (dá a tocha comum ao quebrar)
        for (int f = 0; f < 4; f++) {
            def(WALL_TORCH_BASE + f, "Tocha", 0.05, CROSS, M_NONE, -1, TORCH, 14);
            TEXTURE[WALL_TORCH_BASE + f] = TORCH;
        }
        def(TNT, "Dinamite", 0.3, CUBE, M_PLANT, -1, TNT, 0);
        def(BED, "Cama", 0.6, MODEL, M_WOOD, -1, BED, 0);
        BOXES[BED] = new float[][] { { 0, 0, 0, 1, 9 / 16f, 1 } };
        def(SAPLING, "Muda de árvore", 0.05, CROSS, M_PLANT, -1, SAPLING, 0);
        def(BIRCH_SAPLING, "Muda de bétula", 0.05, CROSS, M_PLANT, -1, BIRCH_SAPLING, 0);
        def(CHEST, "Baú", 1.6, CUBE, M_WOOD, -1, CHEST, 0);
        def(FARMLAND, "Terra arada", 0.5, CUBE, M_SOIL, -1, DIRT, 0);
        for (int s = 0; s < 3; s++) def(WHEAT + s, "Trigo", 0.05, CROSS, M_PLANT, -1, Items.SEEDS, 0);
        // duas lajes diferentes no mesmo bloco: cada metade com a textura do seu material
        for (int lo = 0; lo < SHAPE_MATS.length; lo++)
            for (int hi = 0; hi < SHAPE_MATS.length; hi++) {
                int id = mixedSlab(lo, hi);
                int a = SHAPE_MATS[lo], b = SHAPE_MATS[hi];
                def(id, "Lajes empilhadas", Math.max(HARDNESS[a], HARDNESS[b]), MODEL, MATERIAL[a],
                        Math.max(TIER[a], TIER[b]), slab(lo, 0), 0);
                TEXTURE[id] = a;
                BOXES[id] = new float[][] { { 0, 0, 0, 1, 0.5f, 1, a }, { 0, 0.5f, 0, 1, 1, 1, b } };
            }
    }

    static int vslab(int mat, int facing) { return VSLAB_BASE + mat * 4 + facing; }
    static int mixedSlab(int lower, int upper) { return MIXED_SLAB_BASE + lower * 5 + upper; }
    static boolean isVSlab(int b) { return b >= VSLAB_BASE && b < FENCE; }
    static int vslabMat(int b) { return (b - VSLAB_BASE) / 4; }
    static int vslabFacing(int b) { return (b - VSLAB_BASE) % 4; }
    static boolean isWallTorch(int b) { return b >= WALL_TORCH_BASE && b < WALL_TORCH_BASE + 4; }
    static int wallTorchFacing(int b) { return b - WALL_TORCH_BASE; }
    static boolean isMixedSlab(int b) { return b >= MIXED_SLAB_BASE && b < MIXED_SLAB_BASE + 25; }
    /** Areia e cascalho caem quando ficam sem apoio. */
    static boolean falls(int b) { return b == SAND || b == GRAVEL; }
    static boolean isLeaves(int b) { return b == LEAVES || b == BIRCH_LEAVES; }
    static boolean isLog(int b) { return b == LOG || b == BIRCH_LOG; }
    /** Blocos que guardam para onde estão virados (cubos e a cama): a frente aponta para quem os colocou. */
    static boolean rotatable(int b) { return b > AIR && b < COUNT && (SHAPE[b] == CUBE || b == BED); }
    static boolean isSapling(int b) { return b == SAPLING || b == BIRCH_SAPLING; }
    static boolean isWheat(int b) { return b >= WHEAT && b < WHEAT + 3; }
    static int mixedLower(int b) { return (b - MIXED_SLAB_BASE) / 5; }
    static int mixedUpper(int b) { return (b - MIXED_SLAB_BASE) % 5; }
    /** Bloco que conecta (cerca e painel). */
    static boolean connects(int b) { return b == FENCE || b == GLASS_PANE; }

    /** Vetor (dx, dz) de cada direção 0..3. */
    static final int[] DIR_X = { 0, -1, 0, 1 }, DIR_Z = { 1, 0, -1, 0 };

    /**
     * Cerca: poste no meio e travessas para os lados conectados (n = -Z, s = +Z, w = -X, e = +X).
     * collision = true: caixas altas (1,5) para não dar para pular por cima.
     */
    static float[][] fenceBoxes(boolean n, boolean s, boolean w, boolean e, boolean collision) {
        java.util.List<float[]> l = new java.util.ArrayList<>();
        float p0 = 6 / 16f, p1 = 10 / 16f, r0 = 7 / 16f, r1 = 9 / 16f;
        float top = collision ? 1.5f : 1;
        l.add(new float[] { p0, 0, p0, p1, top, p1 });
        float[][] rails = collision ? new float[][] { { 0, 1.5f } } : new float[][] { { 6 / 16f, 9 / 16f }, { 12 / 16f, 15 / 16f } };
        for (float[] y : rails) {
            if (n) l.add(new float[] { r0, y[0], 0, r1, y[1], p0 });
            if (s) l.add(new float[] { r0, y[0], p1, r1, y[1], 1 });
            if (w) l.add(new float[] { 0, y[0], r0, p0, y[1], r1 });
            if (e) l.add(new float[] { p1, y[0], r0, 1, y[1], r1 });
        }
        return l.toArray(new float[0][]);
    }

    /** Painel de vidro: haste fina no meio e braços para os lados conectados. */
    static float[][] paneBoxes(boolean n, boolean s, boolean w, boolean e) {
        java.util.List<float[]> l = new java.util.ArrayList<>();
        float a = 7 / 16f, b = 9 / 16f;
        l.add(new float[] { a, 0, a, b, 1, b });
        if (n) l.add(new float[] { a, 0, 0, b, 1, a });
        if (s) l.add(new float[] { a, 0, b, b, 1, 1 });
        if (w) l.add(new float[] { 0, 0, a, a, 1, b });
        if (e) l.add(new float[] { b, 0, a, 1, 1, b });
        return l.toArray(new float[0][]);
    }

    /** Caixas para desenhar o bloco nesta posição (cerca e painel se ligam aos vizinhos). */
    static float[][] renderBoxes(World w, int x, int y, int z, int b) {
        if (b == FENCE) return fenceBoxes(link(w, x, y, z - 1, b), link(w, x, y, z + 1, b), link(w, x - 1, y, z, b), link(w, x + 1, y, z, b), false);
        if (b == GLASS_PANE) {
            boolean n = link(w, x, y, z - 1, b), s = link(w, x, y, z + 1, b), we = link(w, x - 1, y, z, b), e = link(w, x + 1, y, z, b);
            if (!n && !s && !we && !e) { we = true; e = true; } // painel sozinho: atravessado de lado a lado
            return paneBoxes(n, s, we, e);
        }
        return BOXES[b];
    }

    /** Caixas de colisão nesta posição (a cerca tem 1,5 de altura). */
    static float[][] collisionBoxes(World w, int x, int y, int z, int b) {
        if (b == FENCE) return fenceBoxes(link(w, x, y, z - 1, b), link(w, x, y, z + 1, b), link(w, x - 1, y, z, b), link(w, x + 1, y, z, b), true);
        return renderBoxes(w, x, y, z, b);
    }

    private static boolean link(World w, int x, int y, int z, int self) {
        int n = w.get(x, y, z);
        if (n == self) return true;
        if (self == GLASS_PANE && n == GLASS) return true;
        return opaqueCube(n) && n != BEDROCK || (self == FENCE && n == GLASS_PANE) || (self == GLASS_PANE && n == FENCE);
    }

    static int stair(int mat, int facing, int upside) { return STAIR_BASE + mat * 8 + facing * 2 + upside; }
    static int slab(int mat, int top) { return SLAB_BASE + mat * 2 + top; }
    static int door(int half, int facing, int open) { return DOOR_BASE + half * 8 + facing * 2 + open; }

    static boolean isStair(int b) { return b >= STAIR_BASE && b < SLAB_BASE; }
    static boolean isSlab(int b) { return b >= SLAB_BASE && b < DOOR_BASE; }
    static boolean isDoor(int b) { return b >= DOOR_BASE && b < DOOR_TEX_LOWER; }
    static int stairMat(int b) { return (b - STAIR_BASE) / 8; }
    static int slabMat(int b) { return (b - SLAB_BASE) / 2; }
    static boolean slabTop(int b) { return (b - SLAB_BASE) % 2 == 1; }
    static int doorHalf(int b) { return (b - DOOR_BASE) / 8; }
    static int doorFacing(int b) { return ((b - DOOR_BASE) % 8) / 2; }
    static boolean doorOpen(int b) { return (b - DOOR_BASE) % 2 == 1; }

    /** Caixas do bloco (null = cubo inteiro). */
    static float[][] boxes(int b) { return BOXES[b]; }

    /** Bloco cujas texturas este usa (variantes de escada/laje usam as do material). */
    static int texture(int b) { return TEXTURE[b]; }

    /** Aparece como item (paleta do criativo): só a variante padrão de cada escada, laje e porta. */
    static boolean isItemForm(int b) {
        if (b <= AIR || b >= COUNT || b == DOOR_TEX_LOWER || b == DOOR_TEX_UPPER || waterLevel(b) > 0) return false;
        if (isWallTorch(b) || isMixedSlab(b) || isWheat(b)) return false;
        if (isStair(b) || isSlab(b) || isDoor(b) || isVSlab(b)) return DROP[b] == b;
        return true;
    }

    /** Direção (0 +Z, 1 -X, 2 -Z, 3 +X) mais próxima para onde a câmera olha. */
    static int facingFromYaw(double yaw) {
        double fx = Math.sin(yaw), fz = Math.cos(yaw);
        if (Math.abs(fz) >= Math.abs(fx)) return fz > 0 ? 0 : 2;
        return fx < 0 ? 1 : 3;
    }

    /** Gira caixas (feitas para a direção +Z) em volta do centro do bloco, k vezes 90°. */
    private static float[][] rotate(int k, float[][] boxes) {
        float[][] out = new float[boxes.length][];
        for (int i = 0; i < boxes.length; i++) {
            float x0 = boxes[i][0], z0 = boxes[i][2], x1 = boxes[i][3], z1 = boxes[i][5];
            for (int r = 0; r < k; r++) {
                float nx0 = 1 - z1, nx1 = 1 - z0, nz0 = x0, nz1 = x1; // (x,z) -> (1-z, x)
                x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1;
            }
            out[i] = boxes[i].clone(); // mantém o 7º valor (textura da caixa), se houver
            out[i][0] = x0; out[i][2] = z0; out[i][3] = x1; out[i][5] = z1;
        }
        return out;
    }

    static boolean isWater(int b) {
        return b == WATER || (b >= WATER_FLOW && b < WATER_FLOW + 7);
    }

    /** Nível da água: 0 = fonte, 1..7 = corrente (quanto maior, mais rasa). -1 se não é água. */
    static int waterLevel(int b) {
        if (b == WATER) return 0;
        if (b >= WATER_FLOW && b < WATER_FLOW + 7) return b - WATER_FLOW + 1;
        return -1;
    }

    static int waterOfLevel(int level) {
        return level <= 0 ? WATER : WATER_FLOW + level - 1;
    }

    private static void def(int id, String name, double hard, int shape, int mat, int tier, int drop, int light) {
        NAMES[id] = name;
        HARDNESS[id] = hard;
        SHAPE[id] = shape;
        MATERIAL[id] = mat;
        TIER[id] = tier;
        DROP[id] = drop;
        LIGHT[id] = light;
    }

    /** Barra inicial do modo criativo. */
    static final int[] HOTBAR = { GRASS, STONE, PLANKS, LOG, GLASS, TORCH, STONE_BRICK, BRICK, WOOL };

    /** Tem colisão (o jogador não atravessa). */
    static boolean solid(int b) {
        int s = SHAPE[b];
        return b != AIR && s != LIQUID && s != CROSS;
    }

    /** Cubo que esconde completamente as faces vizinhas e bloqueia a luz. */
    static boolean opaqueCube(int b) {
        return b != AIR && SHAPE[b] == CUBE;
    }

    /** Bloqueia a luz (cubos opacos). Folhas, vidro, plantas e líquidos deixam passar. */
    static boolean blocksLight(int b) {
        return opaqueCube(b);
    }

    static int shape(int b) { return SHAPE[b]; }
    static int material(int b) { return MATERIAL[b]; }
    static double hardness(int b) { return HARDNESS[b]; }
    static int light(int b) { return LIGHT[b]; }
    /** Nível mínimo de picareta (0 madeira, 1 pedra, 2 ferro) para o bloco dar item; -1 = qualquer coisa. */
    static int requiredTier(int b) { return TIER[b]; }

    /** Item que o bloco dá ao ser quebrado no modo sobrevivência (pode ser um item, não bloco). */
    static int drop(int b) { return DROP[b]; }

    /** Plantas e tochas precisam de chão firme embaixo. */
    static boolean needsSupport(int b) {
        return (SHAPE[b] == CROSS && !isWallTorch(b)) || b == CACTUS;
    }

    private Block() {}
}
