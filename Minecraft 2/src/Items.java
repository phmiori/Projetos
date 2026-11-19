import java.awt.image.BufferedImage;

/**
 * Itens do jogo. Ids abaixo de Block.COUNT são blocos; de 200 em diante são itens que não se colocam no mundo:
 * materiais, comida e ferramentas.
 */
final class Items {
    static final int FIRST_ITEM = 200;
    static final int STICK = 200, COAL = 201, IRON_INGOT = 202, GOLD_INGOT = 203, CRYSTAL = 204,
            APPLE = 205, RAW_MEAT = 206, COOKED_MEAT = 207, RAW_FISH = 208, COOKED_FISH = 209, GUNPOWDER = 210;
    private static final int LAST_SIMPLE = GUNPOWDER;
    /** Ids que os itens tinham antes das escadas/lajes/portas (64..95), para converter saves antigos. */
    static final int OLD_FIRST_ITEM = 64, OLD_LAST = 95;

    /** Ferramentas: id = TOOL_BASE + tipo*4 + material. */
    static final int TOOL_BASE = 216;
    static final int PICK = 0, AXE = 1, SHOVEL = 2, SWORD = 3, HOE = 4;
    static final int WOOD = 0, STONE_T = 1, IRON = 2, CRYSTAL_T = 3;
    static final int LAST_TOOL = 235;

    /** Segunda leva de itens simples (RAW_MEAT/COOKED_MEAT são o bife da vaca). */
    static final int FLINT = 236, SEEDS = 237, WHEAT = 238, BREAD = 239, LEATHER = 240,
            RAW_PORK = 241, COOKED_PORK = 242, RAW_MUTTON = 243, COOKED_MUTTON = 244, RAW_CHICKEN = 245, COOKED_CHICKEN = 246,
            STRING = 247, FEATHER = 248, BONE = 249;
    private static final int FIRST_EXTRA = FLINT, LAST_EXTRA = BONE;
    /** Flecha (empilha) e arco (gasta com o uso). */
    static final int ARROW = 251, BOW = 264;
    /** Pederneira: acende a dinamite (gasta com o uso). */
    static final int FLINT_STEEL = 250;
    /** Armadura: id = ARMOR_BASE + peça*3 + material (couro, ferro, cristal). */
    static final int ARMOR_BASE = 252;
    static final int HELMET = 0, CHESTPLATE = 1, LEGGINGS = 2, BOOTS = 3;
    static final int LAST_ARMOR = 263;
    /** Ovos de criatura (criativo): id = SPAWN_EGG + tipo da criatura (Mob). */
    static final int SPAWN_EGG = 265;
    static final int LAST = SPAWN_EGG + Mob.TYPES - 1;
    /** Cores do ovo de cada criatura: fundo e pintas (na ordem dos tipos de Mob). */
    private static final int[][] EGG_COLORS = {
            { 0xF0A6B0, 0xD27C8A }, { 0xE8E8E2, 0xB8B0A8 }, { 0xB4B4B4, 0xD02828 }, { 0x2E8A8A, 0x6E9A68 }, { 0x352A28, 0xA01818 },
            { 0xE48A3A, 0xF2D2A0 }, { 0x4A3424, 0xBEB8B0 }, { 0x0DA70B, 0x101010 }, { 0xC4C4C4, 0x4C4C4C }, { 0xD6D6D8, 0x8E9096 },
            { 0xD8682A, 0xF2EEE6 }, { 0x9A6A40, 0xE4D2B4 }, { 0x9C8670, 0xF6F4F0 }, { 0x5A3A22, 0xA67C52 }, { 0x3A6AD8, 0xF0D030 },
            { 0xF07020, 0xFAFAF4 }, { 0xA03A30, 0x9AA6B0 }, { 0x6E7A86, 0xE6E8EA },
            { 0xE07A1E, 0x1A1410 }, { 0xF2EEE6, 0x2E2824 }, { 0xD8902E, 0xF4E6CC }, { 0xE8C040, 0x5A4010 }, { 0x1C1E26, 0x34405A } };

    static boolean isEgg(int id) { return id >= SPAWN_EGG && id <= LAST; }
    static int eggMob(int id) { return id - SPAWN_EGG; }

    private static final String[] ITEM_NAMES = {
            "Graveto", "Carvão", "Lingote de ferro", "Lingote de ouro", "Cristal", "Maçã", "Bife cru", "Bife assado", "Peixe cru", "Peixe assado", "Pólvora" };
    private static final String[] EXTRA_NAMES = {
            "Sílex", "Sementes de trigo", "Trigo", "Pão", "Couro", "Carne de porco crua", "Carne de porco assada",
            "Carneiro cru", "Carneiro assado", "Frango cru", "Frango assado", "Fio", "Pena", "Osso" };
    private static final String[] TOOL_KIND = { "Picareta", "Machado", "Pá", "Espada", "Enxada" };
    private static final String[] TOOL_MAT = { "de madeira", "de pedra", "de ferro", "de cristal" };
    private static final int[] DURABILITY = { 60, 132, 250, 1200 };
    private static final double[] SPEED = { 2.0, 4.0, 6.0, 9.0 };
    private static final String[] ARMOR_PIECE = { "Capacete", "Peitoral", "Calças", "Botas" };
    private static final String[] ARMOR_MAT = { "de couro", "de ferro", "de cristal" };
    private static final int[] ARMOR_DURABILITY = { 70, 220, 500 };
    /** Pontos de defesa [material][peça]; cada ponto tira 4% do dano. */
    private static final int[][] ARMOR_POINTS = { { 1, 3, 2, 1 }, { 2, 6, 5, 2 }, { 3, 8, 6, 3 } };
    private static final int[] ARMOR_COLOR = { 0x9A5E34, 0xD8D8DC, 0x5EE0D8 }, ARMOR_DARK = { 0x6E3E20, 0x9A9AA2, 0x2A9CA0 };

    static int tool(int kind, int mat) { return TOOL_BASE + kind * 4 + mat; }
    static int armor(int piece, int mat) { return ARMOR_BASE + piece * 3 + mat; }

    static boolean isBlock(int id) { return id > 0 && id < Block.COUNT; }
    static boolean isTool(int id) { return id >= TOOL_BASE && id <= LAST_TOOL; }
    static boolean isArmor(int id) { return id >= ARMOR_BASE && id <= LAST_ARMOR; }
    /** Item que não empilha e gasta com o uso: ferramentas, armaduras e a pederneira. */
    static boolean isDurable(int id) { return isTool(id) || isArmor(id) || id == FLINT_STEEL || id == BOW; }
    static boolean exists(int id) {
        return isBlock(id) || (id >= FIRST_ITEM && id <= LAST_SIMPLE) || (id >= FIRST_EXTRA && id <= LAST_EXTRA) || id == ARROW || isDurable(id) || isEgg(id);
    }
    static int toolKind(int id) { return (id - TOOL_BASE) / 4; }
    static int toolMat(int id) { return (id - TOOL_BASE) % 4; }
    static boolean isHoe(int id) { return isTool(id) && toolKind(id) == HOE; }
    static int armorPiece(int id) { return (id - ARMOR_BASE) / 3; }
    static int armorMat(int id) { return (id - ARMOR_BASE) % 3; }
    static int armorPoints(int id) { return isArmor(id) ? ARMOR_POINTS[armorMat(id)][armorPiece(id)] : 0; }
    static int armorColor(int id) { return ARMOR_COLOR[armorMat(id)]; }
    static int maxStack(int id) { return isDurable(id) ? 1 : 64; }
    static int durability(int id) {
        if (isTool(id)) return DURABILITY[toolMat(id)];
        if (isArmor(id)) return ARMOR_DURABILITY[armorMat(id)];
        return id == FLINT_STEEL ? 64 : id == BOW ? 384 : 0;
    }

    static String name(int id) {
        if (isBlock(id)) return Block.NAMES[id];
        if (isTool(id)) return TOOL_KIND[toolKind(id)] + " " + TOOL_MAT[toolMat(id)];
        if (isArmor(id)) return ARMOR_PIECE[armorPiece(id)] + " " + ARMOR_MAT[armorMat(id)];
        if (isEgg(id)) { String n = Mob.NAMES[eggMob(id)]; return "Ovo de " + (n.equals("Creeper") ? n : n.toLowerCase()); }
        if (id == FLINT_STEEL) return "Pederneira";
        if (id == BOW) return "Arco";
        if (id == ARROW) return "Flecha";
        if (id >= FIRST_ITEM && id <= LAST_SIMPLE) return ITEM_NAMES[id - FIRST_ITEM];
        if (id >= FIRST_EXTRA && id <= LAST_EXTRA) return EXTRA_NAMES[id - FIRST_EXTRA];
        return "?";
    }

    /** Quanto a comida enche a barra de fome (0 = não é comida). */
    static int food(int id) {
        switch (id) {
            case APPLE: return 4;
            case RAW_MEAT: return 3;
            case COOKED_MEAT: return 8;
            case RAW_PORK: return 3;
            case COOKED_PORK: return 8;
            case RAW_MUTTON: return 2;
            case COOKED_MUTTON: return 6;
            case RAW_CHICKEN: return 2;
            case COOKED_CHICKEN: return 6;
            case RAW_FISH: return 2;
            case COOKED_FISH: return 6;
            case BREAD: return 5;
            default: return 0;
        }
    }

    /** Dano ao bater numa criatura segurando este item. */
    static double damage(int id) {
        if (!isTool(id)) return 1;
        int k = toolKind(id), m = toolMat(id);
        if (k == SWORD) return 4 + m * 1.5;
        if (k == AXE) return 3 + m;
        return 2 + m * 0.5;
    }

    /**
     * Multiplicador de velocidade para quebrar o bloco com o item, e se o bloco dá item.
     * Retorna {velocidade, dá item (1/0)}.
     */
    static double[] mining(int id, int block) {
        int mat = Block.material(block);
        int needTier = Block.requiredTier(block);
        double speed = 1;
        int tier = -1; // nível da picareta segurada
        if (isTool(id)) {
            int k = toolKind(id), m = toolMat(id);
            boolean right = (k == PICK && mat == Block.M_ROCK) || (k == AXE && mat == Block.M_WOOD)
                    || (k == SHOVEL && mat == Block.M_SOIL) || (k == SWORD && mat == Block.M_PLANT);
            if (right) speed = SPEED[m];
            if (k == PICK) tier = m;
        }
        boolean drops = needTier < 0 || tier >= needTier;
        if (!drops) speed *= 0.3; // sem a picareta certa é bem lento e não dá nada
        return new double[] { speed, drops ? 1 : 0 };
    }

    // ------------------------------------------------------------------ receitas

    /**
     * Receita montada na grade de criação. Com forma, o desenho importa: os itens precisam estar nessa
     * posição uns em relação aos outros (em qualquer lugar da grade, e pode ser espelhado da esquerda para
     * a direita). Sem forma, só os ingredientes importam. A grade do inventário é 2x2; a da bancada é 3x3.
     */
    static final class Recipe {
        final int out, outCount, w, h;
        /** Com forma: w*h itens linha por linha (0 = espaço vazio). Sem forma: os ingredientes, um por espaço. */
        final int[] cells;
        final boolean shapeless;

        Recipe(int out, int outCount, int w, int h, int[] cells, boolean shapeless) {
            this.out = out; this.outCount = outCount; this.w = w; this.h = h; this.cells = cells; this.shapeless = shapeless;
        }

        /** Precisa da grade 3x3 da bancada? */
        boolean needsTable() { return shapeless ? cells.length > 4 : w > 2 || h > 2; }

        /** Item da posição (x, y) do desenho, ou 0. */
        int at(int x, int y) { return cells[y * w + x]; }

        /** O que a receita gasta: pares (item, quantidade). */
        int[] ingredients() {
            java.util.LinkedHashMap<Integer, Integer> m = new java.util.LinkedHashMap<>();
            for (int c : cells) if (c != 0) m.merge(c, 1, Integer::sum);
            int[] out = new int[m.size() * 2];
            int i = 0;
            for (java.util.Map.Entry<Integer, Integer> e : m.entrySet()) { out[i++] = e.getKey(); out[i++] = e.getValue(); }
            return out;
        }

        String describe() {
            int[] in = ingredients();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < in.length; i += 2) {
                if (i > 0) sb.append(" + ");
                sb.append(in[i + 1]).append(' ').append(name(in[i]));
            }
            return sb.toString();
        }
    }

    /** Receita com forma: linhas separadas por '|', e depois pares (letra, item). Espaço = vazio. */
    private static Recipe shaped(int out, int count, String rows, Object... key) {
        String[] r = rows.split("\\|", -1);
        int h = r.length, w = 0;
        for (String s : r) w = Math.max(w, s.length());
        int[] cells = new int[w * h];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < r[y].length(); x++) {
                char c = r[y].charAt(x);
                if (c == ' ') continue;
                int item = 0;
                for (int k = 0; k < key.length; k += 2) if ((Character) key[k] == c) item = (Integer) key[k + 1];
                if (item == 0) throw new IllegalArgumentException("letra sem item na receita: " + c);
                cells[y * w + x] = item;
            }
        return new Recipe(out, count, w, h, cells, false);
    }

    private static Recipe shapeless(int out, int count, int... items) {
        return new Recipe(out, count, items.length, 1, items, true);
    }

    static final Recipe[] RECIPES;
    static {
        java.util.List<Recipe> r = new java.util.ArrayList<>();
        int P = Block.PLANKS, S = STICK;
        // cabem na grade 2x2 do inventário
        r.add(shapeless(Block.PLANKS, 4, Block.LOG));
        r.add(shapeless(Block.BIRCH_PLANKS, 4, Block.BIRCH_LOG));
        r.add(shaped(STICK, 4, "P|P", 'P', P));
        r.add(shaped(Block.TABLE, 1, "PP|PP", 'P', P));
        r.add(shaped(Block.TORCH, 4, "C|S", 'C', COAL, 'S', S));
        r.add(shapeless(FLINT_STEEL, 1, IRON_INGOT, FLINT));
        r.add(shaped(Block.STONE_BRICK, 4, "SS|SS", 'S', Block.STONE));
        r.add(shaped(Block.SANDSTONE, 1, "SS|SS", 'S', Block.SAND));
        r.add(shaped(Block.BRICK, 4, "DS|SD", 'D', Block.DIRT, 'S', Block.SAND));
        for (int m = 0; m < Block.SHAPE_MATS.length; m++) { // laje deitada <-> laje em pé
            r.add(shapeless(Block.vslab(m, 0), 1, Block.slab(m, 0)));
            r.add(shapeless(Block.slab(m, 0), 1, Block.vslab(m, 0)));
        }
        r.add(shapeless(IRON_INGOT, 9, Block.IRON_BLOCK));
        r.add(shapeless(GOLD_INGOT, 9, Block.GOLD_BLOCK));
        // precisam da bancada (3x3)
        r.add(shaped(Block.FURNACE, 1, "CCC|C C|CCC", 'C', Block.COBBLE));
        r.add(shaped(Block.CHEST, 1, "PPP|P P|PPP", 'P', P));
        int[] mats = { P, Block.COBBLE, IRON_INGOT, CRYSTAL };
        for (int m = 0; m < 4; m++) {
            int M = mats[m];
            r.add(shaped(tool(PICK, m), 1, "MMM| S | S ", 'M', M, 'S', S));
            r.add(shaped(tool(AXE, m), 1, "MM|MS| S", 'M', M, 'S', S));
            r.add(shaped(tool(SHOVEL, m), 1, "M|S|S", 'M', M, 'S', S));
            r.add(shaped(tool(SWORD, m), 1, "M|M|S", 'M', M, 'S', S));
            r.add(shaped(tool(HOE, m), 1, "MM| S| S", 'M', M, 'S', S));
        }
        r.add(shaped(BREAD, 1, "WWW", 'W', WHEAT));
        r.add(shaped(BOW, 1, " TS|T S| TS", 'T', S, 'S', STRING));
        r.add(shaped(ARROW, 4, "F|T|E", 'F', FLINT, 'T', S, 'E', FEATHER));
        int[] armorMats = { LEATHER, IRON_INGOT, CRYSTAL };
        for (int m = 0; m < 3; m++) {
            int L = armorMats[m];
            r.add(shaped(armor(HELMET, m), 1, "LLL|L L", 'L', L));
            r.add(shaped(armor(CHESTPLATE, m), 1, "L L|LLL|LLL", 'L', L));
            r.add(shaped(armor(LEGGINGS, m), 1, "LLL|L L|L L", 'L', L));
            r.add(shaped(armor(BOOTS, m), 1, "L L|L L", 'L', L));
        }
        r.add(shaped(Block.IRON_BLOCK, 1, "III|III|III", 'I', IRON_INGOT));
        r.add(shaped(Block.GOLD_BLOCK, 1, "III|III|III", 'I', GOLD_INGOT));
        for (int m = 0; m < Block.SHAPE_MATS.length; m++) { // escadas e lajes
            int M = Block.SHAPE_MATS[m];
            r.add(shaped(Block.stair(m, 0, 0), 4, "M  |MM |MMM", 'M', M));
            r.add(shaped(Block.slab(m, 0), 6, "MMM", 'M', M));
            r.add(shaped(Block.vslab(m, 0), 6, "M|M|M", 'M', M));
        }
        r.add(shaped(Block.door(0, 0, 0), 3, "PP|PP|PP", 'P', P));
        r.add(shaped(Block.FENCE, 3, "PSP|PSP", 'P', P, 'S', S));
        r.add(shaped(Block.BED, 1, "WWW|PPP", 'W', Block.WOOL, 'P', P));
        r.add(shaped(Block.TNT, 1, "GSG|SGS|GSG", 'G', GUNPOWDER, 'S', Block.SAND));
        r.add(shaped(Block.GLASS_PANE, 16, "GGG|GGG", 'G', Block.GLASS));
        RECIPES = r.toArray(new Recipe[0]);
    }

    /**
     * Procura a receita que bate com a grade (size x size, ids linha por linha; 0 = vazio).
     * O desenho pode estar em qualquer canto da grade e espelhado. Retorna null se nada bate.
     */
    /** Itens que servem um no lugar do outro nas receitas: as tábuas de bétula valem como tábuas. */
    static int same(int id) {
        return id == Block.BIRCH_PLANKS ? Block.PLANKS : id;
    }

    static Recipe match(int[] grid, int size) {
        int minX = size, minY = size, maxX = -1, maxY = -1, n = 0;
        for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
                if (grid[y * size + x] != 0) {
                    n++;
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                }
        if (n == 0) return null;
        int w = maxX - minX + 1, h = maxY - minY + 1;
        for (Recipe r : RECIPES) {
            if (r.shapeless) {
                if (r.cells.length != n) continue;
                int[] a = new int[n], b = r.cells.clone();
                int k = 0;
                for (int c : grid) if (c != 0) a[k++] = same(c);
                java.util.Arrays.sort(a);
                java.util.Arrays.sort(b);
                if (java.util.Arrays.equals(a, b)) return r;
                continue;
            }
            if (r.w != w || r.h != h) continue;
            for (int mirror = 0; mirror < 2; mirror++) {
                boolean ok = true;
                for (int y = 0; y < h && ok; y++)
                    for (int x = 0; x < w && ok; x++) {
                        int want = r.at(mirror == 0 ? x : w - 1 - x, y);
                        if (same(grid[(minY + y) * size + minX + x]) != want) ok = false;
                    }
                if (ok) return r;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ fornalha

    /** O que o item vira na fornalha (0 = não assa). */
    static int smelt(int id) {
        switch (id) {
            case Block.IRON_ORE: return IRON_INGOT;
            case Block.GOLD_ORE: return GOLD_INGOT;
            case Block.SAND: return Block.GLASS;
            case Block.COBBLE: return Block.STONE;
            case Block.LOG: case Block.BIRCH_LOG: return COAL;
            case RAW_MEAT: return COOKED_MEAT;
            case RAW_PORK: return COOKED_PORK;
            case RAW_MUTTON: return COOKED_MUTTON;
            case RAW_CHICKEN: return COOKED_CHICKEN;
            case RAW_FISH: return COOKED_FISH;
            default: return 0;
        }
    }

    /** Quantos itens um combustível assa (0 = não queima). */
    static int fuel(int id) {
        switch (id) {
            case COAL: return 8;
            case Block.LOG: case Block.BIRCH_LOG: case Block.PLANKS: case Block.BIRCH_PLANKS: return 2;
            case STICK: return 1;
            default: return 0;
        }
    }
    // ------------------------------------------------------------------ ícones

    private static final BufferedImage[] ICONS = new BufferedImage[LAST + 1];

    /** Ícone 64x64: cubo 3D para blocos, figura plana para plantas, tocha e itens. */
    static synchronized BufferedImage icon(int id) {
        if (id <= 0 || id > LAST) return null;
        if (ICONS[id] != null) return ICONS[id];
        BufferedImage img;
        if (isBlock(id)) img = Block.shape(id) == Block.CROSS ? Textures.flatIcon(id) : Textures.cube(id);
        else img = sprite(id);
        ICONS[id] = img;
        return img;
    }

    /** Esquece os ícones (quando as texturas são recarregadas). */
    static synchronized void reloadIcons() {
        java.util.Arrays.fill(ICONS, null);
    }

    /** Pixels 16x16 (ARGB) da figura plana do item: itens desenhados, ou a textura de plantas/tocha. */
    static int[] pixels16(int id) {
        if (isBlock(id)) return Textures.get(16)[id * 6 + 4];
        return spritePixels(id);
    }

    /** Desenha os itens em pixel art 16x16 e amplia para 64x64. */
    private static BufferedImage sprite(int id) {
        int[] px = spritePixels(id);
        BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 64; y++)
            for (int x = 0; x < 64; x++) img.setRGB(x, y, px[(y / 4) * 16 + x / 4]);
        return img;
    }

    private static int[] spritePixels(int id) {
        int[] px = new int[256];
        if (isTool(id)) drawTool(px, toolKind(id), toolMat(id));
        else if (isArmor(id)) drawArmor(px, armorPiece(id), ARMOR_COLOR[armorMat(id)], ARMOR_DARK[armorMat(id)]);
        else if (isEgg(id)) drawEgg(px, EGG_COLORS[eggMob(id)][0], EGG_COLORS[eggMob(id)][1], eggMob(id));
        else switch (id) {
            case BOW:
                return bowPixels(0);
            case ARROW:
                line(px, 3, 12, 11, 4, 0x8A6236);
                put(px, 12, 3, 0x6A6A74); put(px, 13, 2, 0x8E8E98); put(px, 12, 2, 0x6A6A74); put(px, 13, 3, 0x55555C); put(px, 11, 2, 0x55555C); put(px, 13, 4, 0x55555C);
                put(px, 2, 13, 0xEDEDE4); put(px, 2, 12, 0xEDEDE4); put(px, 3, 13, 0xEDEDE4); put(px, 2, 11, 0xC8C8C0); put(px, 4, 13, 0xC8C8C0);
                break;
            case STRING:
                for (int i = 0; i < 12; i++) {
                    int x = 7 + (int) Math.round(Math.sin(i * 1.1) * 3);
                    put(px, x, 2 + i, 0xF2F2F2); put(px, x + 1, 2 + i, 0xC4C4C4);
                }
                break;
            case FEATHER:
                for (int i = 0; i < 11; i++) {
                    int x = 2 + i, y = 13 - i;
                    put(px, x, y, 0xA8A8A8);
                    if (i > 2) { put(px, x, y - 1, 0xFFFFFF); put(px, x + 1, y, 0xE4E4E4); }
                    if (i > 4 && i < 10) { put(px, x, y - 2, 0xF4F4F4); put(px, x + 2, y, 0xD8D8D8); }
                }
                break;
            case BONE:
                for (int i = 0; i < 8; i++) { put(px, 4 + i, 11 - i, 0xF2F0E2); put(px, 5 + i, 11 - i, 0xCFCBB8); }
                put(px, 3, 11, 0xF2F0E2); put(px, 2, 12, 0xF2F0E2); put(px, 4, 12, 0xF2F0E2); put(px, 3, 13, 0xCFCBB8); put(px, 2, 11, 0xF2F0E2); put(px, 4, 13, 0xCFCBB8);
                put(px, 12, 3, 0xF2F0E2); put(px, 13, 2, 0xF2F0E2); put(px, 11, 2, 0xF2F0E2); put(px, 12, 1, 0xF2F0E2); put(px, 13, 4, 0xCFCBB8); put(px, 14, 3, 0xCFCBB8);
                break;
            case FLINT:
                for (int y = 3; y < 13; y++)
                    for (int x = 4; x < 12; x++)
                        if (Math.abs(x - 7.5) + Math.abs(y - 8) * 0.8 < 5) put(px, x, y, x + y < 13 ? 0x6A6A74 : (x + y > 17 ? 0x26262C : 0x3E3E46));
                break;
            case FLINT_STEEL:
                for (int y = 2; y < 9; y++)
                    for (int x = 2; x < 9; x++)
                        if ((y < 4 || y > 6 || x < 4) && !(x > 6 && y > 3 && y < 7)) put(px, x, y, y < 3 || x < 3 ? 0xE0E0E6 : 0x9A9AA4);
                blob(px, 11, 11, 3.2, 0x3E3E46, 0x6A6A74);
                break;
            case SEEDS: {
                int[][] dots = { { 4, 5 }, { 9, 4 }, { 12, 8 }, { 6, 9 }, { 10, 12 }, { 4, 12 } };
                for (int[] d : dots) { put(px, d[0], d[1], 0x7CB342); put(px, d[0] + 1, d[1], 0x558B2F); put(px, d[0], d[1] + 1, 0x558B2F); }
                break;
            }
            case WHEAT:
                for (int s = 0; s < 3; s++) {
                    int ox = 3 + s * 3;
                    for (int i = 0; i < 9; i++) put(px, ox + i * 2 / 3, 14 - i, 0xC8A438);
                    for (int i = 0; i < 5; i++) { put(px, ox + 6 + i / 3, 5 - i + s, 0xE8C850); put(px, ox + 5 + i / 3, 5 - i + s, 0xB89028); }
                }
                break;
            case BREAD:
                for (int y = 5; y < 12; y++)
                    for (int x = 1; x < 15; x++) {
                        double dx = (x + 0.5 - 8) / 7.0, dy = (y + 0.5 - 8.5) / 3.6;
                        if (dx * dx + dy * dy < 1) put(px, x, y, y < 7 ? 0xE0B060 : (y > 9 ? 0x9A6A2C : 0xC08840));
                    }
                for (int k = 0; k < 3; k++) { put(px, 4 + k * 4, 7, 0x8A5A20); put(px, 5 + k * 4, 8, 0x8A5A20); }
                break;
            case LEATHER:
                for (int y = 3; y < 13; y++)
                    for (int x = 3; x < 13; x++) put(px, x, y, x == 3 || y == 3 ? 0xB87848 : (x == 12 || y == 12 ? 0x6E3E20 : 0x9A5E34));
                put(px, 2, 3, 0x9A5E34); put(px, 13, 3, 0x9A5E34); put(px, 2, 12, 0x6E3E20); put(px, 13, 12, 0x6E3E20);
                put(px, 2, 4, 0x9A5E34); put(px, 13, 4, 0x9A5E34); put(px, 2, 11, 0x6E3E20); put(px, 13, 11, 0x6E3E20);
                break;
            case RAW_PORK:
                chop(px, 0xF2A0AE, 0xFAC8D0, 0xFFF0F0);
                break;
            case COOKED_PORK:
                chop(px, 0xC89058, 0xE0B480, 0xF0DCC0);
                break;
            case RAW_MUTTON:
                leg(px, 0xD84C54, 0xF07880, 7, 5.2);
                break;
            case COOKED_MUTTON:
                leg(px, 0x7A4A28, 0xA06A3C, 7, 5.2);
                break;
            case RAW_CHICKEN:
                leg(px, 0xF2C8B0, 0xFAE0D0, 6, 3.8);
                break;
            case COOKED_CHICKEN:
                leg(px, 0xC88838, 0xE0A858, 6, 3.8);
                break;
            case STICK:
                for (int i = 2; i < 14; i++) { put(px, i, 15 - i, 0x8A6236); put(px, i + 1, 15 - i, 0x5E4022); }
                break;
            case COAL:
                blob(px, 8, 8, 5.2, 0x2A2A2E, 0x4A4A52);
                break;
            case IRON_INGOT:
                ingot(px, 0xD8D8DC, 0x9A9AA2);
                break;
            case GOLD_INGOT:
                ingot(px, 0xF4CC3A, 0xB8901C);
                break;
            case CRYSTAL:
                for (int y = 2; y < 14; y++) {
                    int half = y < 6 ? (y - 1) : (14 - y) * 6 / 8;
                    for (int x = 8 - half; x <= 8 + half; x++) put(px, x, y, (x + y) % 5 == 0 ? 0xE8FFFF : (x < 8 ? 0x4ED8D0 : 0x2AA8B0));
                }
                break;
            case GUNPOWDER:
                blob(px, 8, 10, 4.6, 0x4A4A4E, 0x6E6E74);
                put(px, 5, 5, 0x3A3A3E); put(px, 10, 4, 0x56565C); put(px, 12, 7, 0x3A3A3E); put(px, 7, 3, 0x56565C);
                break;
            case APPLE:
                blob(px, 8, 9, 5.0, 0xD8282C, 0xF06060);
                put(px, 8, 3, 0x5E4022); put(px, 8, 2, 0x5E4022); put(px, 9, 2, 0x3C9A3C); put(px, 10, 2, 0x3C9A3C);
                break;
            case RAW_MEAT:
                blob(px, 8, 8, 5.0, 0xE07A80, 0xF4A8AC);
                for (int i = 0; i < 4; i++) put(px, 11 + i / 2, 11 + i % 2, 0xF2EEE0);
                break;
            case RAW_FISH:
                fish(px, 0x8FB4C8, 0x5E7E94, 0xE8B0A0);
                break;
            case COOKED_FISH:
                fish(px, 0xB07848, 0x7A4E2C, 0xD8A070);
                break;
            case COOKED_MEAT:
                blob(px, 8, 8, 5.0, 0x8A4A24, 0xB0703C);
                for (int i = 0; i < 4; i++) put(px, 11 + i / 2, 11 + i % 2, 0xF2EEE0);
                break;
            default:
                break;
        }
        return px;
    }

    private static void drawTool(int[] px, int kind, int mat) {
        int[] head = { 0xA87C44, 0x8C8C8C, 0xE0E0E6, 0x5EE0D8 };
        int[] dark = { 0x6E4E28, 0x5A5A5A, 0x9A9AA4, 0x2A9CA0 };
        int h = head[mat], d = dark[mat];
        int handleLen = kind == SWORD ? 4 : 11;
        // cabo na diagonal, do canto inferior esquerdo para o centro
        for (int i = 0; i < handleLen; i++) {
            put(px, 2 + i, 13 - i, 0x7A5630);
            put(px, 3 + i, 13 - i, 0x5A3E20);
        }
        switch (kind) {
            case PICK:
                for (int i = 0; i < 9; i++) {
                    int x = 5 + i, y = i < 4 ? 2 + (4 - i) / 2 : 2 + (i - 4) / 2;
                    put(px, x, y + 2, h); put(px, x, y + 3, d);
                }
                put(px, 4, 6, d); put(px, 13, 6, d);
                break;
            case AXE:
                for (int y = 1; y < 8; y++)
                    for (int x = 8; x < 14; x++)
                        if (x - 8 + y > 2 && (x - 8) + (8 - y) > 2) put(px, x, y, x > 11 ? d : h);
                break;
            case SHOVEL:
                for (int y = 1; y < 7; y++)
                    for (int x = 9; x < 15; x++) {
                        double cx = x - 11.5, cy = y - 3.5;
                        if (cx * cx + cy * cy < 7.5) put(px, x, y, cx + cy > 1 ? d : h);
                    }
                break;
            case SWORD:
                for (int i = 0; i < 9; i++) { put(px, 6 + i, 9 - i, h); put(px, 7 + i, 9 - i, d); put(px, 6 + i, 8 - i, h); }
                for (int i = -2; i <= 2; i++) put(px, 5 + i, 10 + i, 0x4A3A2A); // guarda
                break;
            case HOE:
                for (int x = 7; x < 14; x++) { put(px, x, 2, h); put(px, x, 3, d); }
                for (int y = 4; y < 7; y++) { put(px, 7, y, h); put(px, 8, y, d); }
                break;
            default:
                break;
        }
    }

    /**
     * Arco em 4 fases: 0 = solto; 1 a 3 = corda cada vez mais puxada, com a flecha encaixada.
     * A fase 0 é o ícone do item; as outras aparecem na mão enquanto o jogador segura o disparo.
     */
    static int[] bowPixels(int stage) {
        int[] px = new int[256];
        double pull = stage * 1.5, hx = 8.5 + pull, hy = 8.5 + pull; // onde a mão segura a corda
        line(px, 3, 14, hx, hy, 0xE4E4E4);
        line(px, hx, hy, 14, 3, 0xE4E4E4);
        if (stage > 0) { // a flecha, da corda para a frente do arco
            line(px, hx, hy, hx - 9, hy - 9, 0xB89060);
            put(px, (int) Math.round(hx - 9), (int) Math.round(hy - 9), 0x6A6A74);
            put(px, (int) Math.round(hx - 10), (int) Math.round(hy - 10), 0x8E8E98);
        }
        double c = 0.5 + stage * 0.7; // quanto mais puxado, mais as pontas se curvam para trás
        for (double t = 0; t <= 1.0001; t += 0.02) {
            double x = (1 - t) * (1 - t) * 3 + 2 * (1 - t) * t * c + t * t * 14;
            double y = (1 - t) * (1 - t) * 14 + 2 * (1 - t) * t * c + t * t * 3;
            put(px, (int) Math.round(x), (int) Math.round(y), 0x8A6236);
            put(px, (int) Math.round(x) + 1, (int) Math.round(y), 0x5E4022);
        }
        return px;
    }

    private static void line(int[] px, double x0, double y0, double x1, double y1, int c) {
        for (int i = 0; i <= 24; i++) put(px, (int) Math.round(x0 + (x1 - x0) * i / 24), (int) Math.round(y0 + (y1 - y0) * i / 24), c);
    }

    /** Peças de armadura vistas de frente. */
    private static void drawArmor(int[] px, int piece, int c, int dark) {
        int light = brighten(c);
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 16; x++) {
                boolean on;
                switch (piece) {
                    case HELMET: on = y >= 3 && y <= 11 && x >= 3 && x <= 12 && !(y >= 8 && x >= 5 && x <= 10) && !(y == 3 && (x == 3 || x == 12)); break;
                    case CHESTPLATE: on = y >= 2 && y <= 13 && ((x >= 4 && x <= 11) || (y <= 6 && x >= 1 && x <= 14)) && !(y <= 3 && x >= 6 && x <= 9); break;
                    case LEGGINGS: on = y >= 2 && y <= 13 && x >= 3 && x <= 12 && !(y >= 6 && x >= 7 && x <= 8); break;
                    default: on = (y >= 4 && y <= 12 && ((x >= 2 && x <= 5) || (x >= 10 && x <= 13))) || (y >= 11 && y <= 12 && (x == 1 || x == 6 || x == 9 || x == 14)); break;
                }
                if (!on) continue;
                boolean edgeDark = (piece == BOOTS && y >= 11) || (piece == LEGGINGS && y <= 3) || (piece == HELMET && y >= 10) || (piece == CHESTPLATE && y >= 12);
                put(px, x, y, edgeDark ? dark : ((x + y) % 7 == 0 ? light : (x > 8 ? mixHalf(c, dark) : c)));
            }
    }

    private static int mixHalf(int a, int b) {
        return (((a >> 16 & 255) * 3 + (b >> 16 & 255)) / 4) << 16 | (((a >> 8 & 255) * 3 + (b >> 8 & 255)) / 4) << 8 | ((a & 255) * 3 + (b & 255)) / 4;
    }

    /** Costeleta: fatia com uma borda de gordura. */
    private static void chop(int[] px, int meat, int light, int fat) {
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 16; x++) {
                double dx = (x + 0.5 - 8) / 6.2, dy = (y + 0.5 - 8) / 4.6;
                double d = dx * dx + dy * dy;
                if (d < 1) put(px, x, y, d > 0.7 && y < 8 ? fat : (dx + dy < -0.5 ? light : meat));
            }
    }

    /** Coxa/pernil: a carne em cima à esquerda e o osso saindo para baixo à direita. */
    private static void leg(int[] px, int meat, int light, double c, double r) {
        for (int i = 0; i < 5; i++) { put(px, 10 + i, 10 + i, 0xF2EEE0); put(px, 11 + i, 10 + i, 0xD8D2C0); }
        put(px, 15, 13, 0xF2EEE0); put(px, 13, 15, 0xF2EEE0);
        blob(px, c, c, r, meat, light);
    }

    /** Peixe de lado: corpo oval, cauda em leque, olho. */
    private static void fish(int[] px, int body, int dark, int belly) {
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 16; x++) {
                double dx = (x + 0.5 - 7) / 5.5, dy = (y + 0.5 - 8) / 3.2;
                if (dx * dx + dy * dy < 1) put(px, x, y, y > 9 ? belly : (y < 6 ? dark : body));
                int tx = x - 12;
                if (tx >= 0 && tx < 3 && Math.abs(y + 0.5 - 8) < tx + 1.5) put(px, x, y, dark);
            }
        put(px, 3, 7, 0x101010);
        put(px, 7, 6, dark); put(px, 8, 5, dark); put(px, 9, 6, dark); // barbatana
    }

    private static void ingot(int[] px, int c, int dark) {
        for (int y = 6; y < 12; y++)
            for (int x = 2 + (11 - y) / 2; x < 14 - (11 - y) / 2; x++)
                put(px, x, y, y == 6 ? 0xFFFFFF & brighten(c) : (y > 9 ? dark : c));
    }

    private static int brighten(int c) {
        int r = Math.min(255, ((c >> 16) & 255) + 40), g = Math.min(255, ((c >> 8) & 255) + 40), b = Math.min(255, (c & 255) + 40);
        return r << 16 | g << 8 | b;
    }

    private static void blob(int[] px, double cx, double cy, double r, int c, int light) {
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 16; x++) {
                double dx = x + 0.5 - cx, dy = y + 0.5 - cy;
                double d = dx * dx + dy * dy;
                if (d < r * r) put(px, x, y, (dx + dy < -2 && d > r * r * 0.3) ? light : c);
            }
    }

    /** Ovo: oval com luz em cima à esquerda, sombra embaixo à direita e pintas da cor da criatura. */
    private static void drawEgg(int[] px, int base, int spot, int seed) {
        java.util.Random r = new java.util.Random(seed * 7919L + 13);
        boolean[] spots = new boolean[256];
        for (int k = 0; k < 7; k++) { // pintas de 1 ou 2 pixels
            int sx = 5 + r.nextInt(7), sy = 4 + r.nextInt(10);
            spots[sy * 16 + sx] = true;
            if (r.nextBoolean()) spots[sy * 16 + Math.min(15, sx + 1)] = true;
            if (r.nextInt(3) == 0) spots[Math.min(15, sy + 1) * 16 + sx] = true;
        }
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 16; x++) {
                // ovo: mais estreito em cima (largura cresce até 2/3 da altura)
                double cy = (y + 0.5 - 8.6) / 6.6, w = cy < 0 ? 4.3 + cy * 1.2 : 5.0;
                double cx = (x + 0.5 - 8) / w;
                double d = cx * cx + cy * cy;
                if (d > 1) continue;
                double shade = 1.0 - (cx * 0.18 + cy * 0.22);           // luz vindo de cima à esquerda
                if (d > 0.72) shade *= 0.78;                           // borda mais escura
                int c = spots[y * 16 + x] && d < 0.8 ? spot : base;
                put(px, x, y, scale(c, shade));
            }
        put(px, 6, 4, scale(base, 1.35)); put(px, 6, 5, scale(base, 1.25)); put(px, 5, 6, scale(base, 1.2)); // brilho
    }

    private static int scale(int c, double k) {
        int r = (int) Math.min(255, ((c >> 16) & 255) * k), g = (int) Math.min(255, ((c >> 8) & 255) * k), b = (int) Math.min(255, (c & 255) * k);
        return r << 16 | g << 8 | b;
    }

    private static void put(int[] px, int x, int y, int rgb) {
        if (x >= 0 && y >= 0 && x < 16 && y < 16) px[y * 16 + x] = 0xFF000000 | rgb;
    }

    private Items() {}
}
