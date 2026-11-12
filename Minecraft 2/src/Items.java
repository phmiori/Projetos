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
    static final int LAST = 264;

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
        return isBlock(id) || (id >= FIRST_ITEM && id <= LAST_SIMPLE) || (id >= FIRST_EXTRA && id <= LAST_EXTRA) || id == ARROW || isDurable(id);
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

    static final int HAND = 0, TABLE = 1, FURNACE = 2;
    static final String[] STATION_NAMES = { "Mão", "Bancada", "Fornalha" };

    static final class Recipe {
        final int station, out, outCount;
        final int[] in; // pares: item, quantidade
        Recipe(int station, int out, int outCount, int... in) {
            this.station = station; this.out = out; this.outCount = outCount; this.in = in;
        }

        String describe() {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < in.length; i += 2) {
                if (i > 0) sb.append(" + ");
                sb.append(in[i + 1]).append(' ').append(name(in[i]));
            }
            return sb.toString();
        }
    }

    static final Recipe[] RECIPES;
    static {
        java.util.List<Recipe> r = new java.util.ArrayList<>();
        // na mão
        r.add(new Recipe(HAND, Block.PLANKS, 4, Block.LOG, 1));
        r.add(new Recipe(HAND, Block.PLANKS, 4, Block.BIRCH_LOG, 1));
        r.add(new Recipe(HAND, STICK, 4, Block.PLANKS, 2));
        r.add(new Recipe(HAND, Block.TABLE, 1, Block.PLANKS, 4));
        r.add(new Recipe(HAND, Block.TORCH, 4, COAL, 1, STICK, 1));
        // na bancada
        r.add(new Recipe(TABLE, Block.FURNACE, 1, Block.COBBLE, 8));
        int[] mats = { Block.PLANKS, Block.COBBLE, IRON_INGOT, CRYSTAL };
        for (int m = 0; m < 4; m++) {
            r.add(new Recipe(TABLE, tool(PICK, m), 1, mats[m], 3, STICK, 2));
            r.add(new Recipe(TABLE, tool(AXE, m), 1, mats[m], 3, STICK, 2));
            r.add(new Recipe(TABLE, tool(SHOVEL, m), 1, mats[m], 1, STICK, 2));
            r.add(new Recipe(TABLE, tool(SWORD, m), 1, mats[m], 2, STICK, 1));
            r.add(new Recipe(TABLE, tool(HOE, m), 1, mats[m], 2, STICK, 2));
        }
        r.add(new Recipe(HAND, FLINT_STEEL, 1, IRON_INGOT, 1, FLINT, 1));
        r.add(new Recipe(TABLE, Block.CHEST, 1, Block.PLANKS, 8));
        r.add(new Recipe(TABLE, BREAD, 1, WHEAT, 3));
        r.add(new Recipe(TABLE, BOW, 1, STICK, 3, STRING, 3));
        r.add(new Recipe(TABLE, ARROW, 4, STICK, 1, FLINT, 1, FEATHER, 1));
        int[] armorMats = { LEATHER, IRON_INGOT, CRYSTAL }, armorCost = { 5, 8, 7, 4 };
        for (int m = 0; m < 3; m++)
            for (int p = 0; p < 4; p++) r.add(new Recipe(TABLE, armor(p, m), 1, armorMats[m], armorCost[p]));
        r.add(new Recipe(TABLE, Block.STONE_BRICK, 4, Block.STONE, 4));
        r.add(new Recipe(TABLE, Block.SANDSTONE, 1, Block.SAND, 4));
        r.add(new Recipe(TABLE, Block.BRICK, 4, Block.DIRT, 2, Block.SAND, 2));
        r.add(new Recipe(TABLE, Block.IRON_BLOCK, 1, IRON_INGOT, 9));
        r.add(new Recipe(TABLE, Block.GOLD_BLOCK, 1, GOLD_INGOT, 9));
        r.add(new Recipe(TABLE, IRON_INGOT, 9, Block.IRON_BLOCK, 1));
        r.add(new Recipe(TABLE, GOLD_INGOT, 9, Block.GOLD_BLOCK, 1));
        // escadas, lajes e porta
        for (int m = 0; m < Block.SHAPE_MATS.length; m++) {
            r.add(new Recipe(TABLE, Block.stair(m, 0, 0), 4, Block.SHAPE_MATS[m], 6));
            r.add(new Recipe(TABLE, Block.slab(m, 0), 6, Block.SHAPE_MATS[m], 3));
        }
        r.add(new Recipe(TABLE, Block.door(0, 0, 0), 3, Block.PLANKS, 6));
        for (int m = 0; m < Block.SHAPE_MATS.length; m++) {
            r.add(new Recipe(TABLE, Block.vslab(m, 0), 6, Block.SHAPE_MATS[m], 3));
            r.add(new Recipe(HAND, Block.vslab(m, 0), 1, Block.slab(m, 0), 1));
            r.add(new Recipe(HAND, Block.slab(m, 0), 1, Block.vslab(m, 0), 1));
        }
        r.add(new Recipe(TABLE, Block.FENCE, 3, Block.PLANKS, 4, STICK, 2));
        r.add(new Recipe(TABLE, Block.BED, 1, Block.WOOL, 3, Block.PLANKS, 3));
        r.add(new Recipe(TABLE, Block.TNT, 1, GUNPOWDER, 4, Block.SAND, 4));
        r.add(new Recipe(TABLE, Block.GLASS_PANE, 16, Block.GLASS, 6));
        // na fornalha (o carvão, o graveto ou as tábuas são o combustível)
        r.add(new Recipe(FURNACE, IRON_INGOT, 1, Block.IRON_ORE, 1, COAL, 1));
        r.add(new Recipe(FURNACE, GOLD_INGOT, 1, Block.GOLD_ORE, 1, COAL, 1));
        r.add(new Recipe(FURNACE, Block.GLASS, 2, Block.SAND, 2, COAL, 1));
        r.add(new Recipe(FURNACE, Block.STONE, 2, Block.COBBLE, 2, COAL, 1));
        r.add(new Recipe(FURNACE, COOKED_MEAT, 1, RAW_MEAT, 1, STICK, 1));
        r.add(new Recipe(FURNACE, COOKED_PORK, 1, RAW_PORK, 1, STICK, 1));
        r.add(new Recipe(FURNACE, COOKED_MUTTON, 1, RAW_MUTTON, 1, STICK, 1));
        r.add(new Recipe(FURNACE, COOKED_CHICKEN, 1, RAW_CHICKEN, 1, STICK, 1));
        r.add(new Recipe(FURNACE, COOKED_FISH, 1, RAW_FISH, 1, STICK, 1));
        r.add(new Recipe(FURNACE, COAL, 1, Block.LOG, 1, Block.PLANKS, 1));
        r.add(new Recipe(FURNACE, COAL, 1, Block.BIRCH_LOG, 1, Block.PLANKS, 1));
        RECIPES = r.toArray(new Recipe[0]);
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

    private static void put(int[] px, int x, int y, int rgb) {
        if (x >= 0 && y >= 0 && x < 16 && y < 16) px[y * 16 + x] = 0xFF000000 | rgb;
    }

    private Items() {}
}
