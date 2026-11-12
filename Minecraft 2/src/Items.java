import java.awt.image.BufferedImage;

/**
 * Itens do jogo. Ids abaixo de Block.COUNT são blocos; de 200 em diante são itens que não se colocam no mundo:
 * materiais, comida e ferramentas.
 */
final class Items {
    static final int FIRST_ITEM = 200;
    static final int STICK = 200, COAL = 201, IRON_INGOT = 202, GOLD_INGOT = 203, CRYSTAL = 204,
            APPLE = 205, RAW_MEAT = 206, COOKED_MEAT = 207, RAW_FISH = 208, COOKED_FISH = 209;
    private static final int LAST_SIMPLE = COOKED_FISH;
    /** Ids que os itens tinham antes das escadas/lajes/portas (64..95), para converter saves antigos. */
    static final int OLD_FIRST_ITEM = 64, OLD_LAST = 95;

    /** Ferramentas: id = 80 + tipo*4 + material. */
    static final int TOOL_BASE = 216;
    static final int PICK = 0, AXE = 1, SHOVEL = 2, SWORD = 3;
    static final int WOOD = 0, STONE_T = 1, IRON = 2, CRYSTAL_T = 3;
    static final int LAST = 231;

    private static final String[] ITEM_NAMES = {
            "Graveto", "Carvão", "Lingote de ferro", "Lingote de ouro", "Cristal", "Maçã", "Carne crua", "Carne assada", "Peixe cru", "Peixe assado" };
    private static final String[] TOOL_KIND = { "Picareta", "Machado", "Pá", "Espada" };
    private static final String[] TOOL_MAT = { "de madeira", "de pedra", "de ferro", "de cristal" };
    private static final int[] DURABILITY = { 60, 132, 250, 1200 };
    private static final double[] SPEED = { 2.0, 4.0, 6.0, 9.0 };

    static int tool(int kind, int mat) { return TOOL_BASE + kind * 4 + mat; }

    static boolean isBlock(int id) { return id > 0 && id < Block.COUNT; }
    static boolean isTool(int id) { return id >= TOOL_BASE && id <= LAST; }
    static boolean exists(int id) { return isBlock(id) || (id >= FIRST_ITEM && id <= LAST_SIMPLE) || isTool(id); }
    static int toolKind(int id) { return (id - TOOL_BASE) / 4; }
    static int toolMat(int id) { return (id - TOOL_BASE) % 4; }
    static int maxStack(int id) { return isTool(id) ? 1 : 64; }
    static int durability(int id) { return isTool(id) ? DURABILITY[toolMat(id)] : 0; }

    static String name(int id) {
        if (isBlock(id)) return Block.NAMES[id];
        if (isTool(id)) return TOOL_KIND[toolKind(id)] + " " + TOOL_MAT[toolMat(id)];
        if (id >= FIRST_ITEM && id <= LAST_SIMPLE) return ITEM_NAMES[id - FIRST_ITEM];
        return "?";
    }

    /** Quanto a comida enche a barra de fome (0 = não é comida). */
    static int food(int id) {
        switch (id) {
            case APPLE: return 4;
            case RAW_MEAT: return 3;
            case COOKED_MEAT: return 8;
            case RAW_FISH: return 2;
            case COOKED_FISH: return 6;
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
        }
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
        r.add(new Recipe(TABLE, Block.GLASS_PANE, 16, Block.GLASS, 6));
        // na fornalha (o carvão, o graveto ou as tábuas são o combustível)
        r.add(new Recipe(FURNACE, IRON_INGOT, 1, Block.IRON_ORE, 1, COAL, 1));
        r.add(new Recipe(FURNACE, GOLD_INGOT, 1, Block.GOLD_ORE, 1, COAL, 1));
        r.add(new Recipe(FURNACE, Block.GLASS, 2, Block.SAND, 2, COAL, 1));
        r.add(new Recipe(FURNACE, Block.STONE, 2, Block.COBBLE, 2, COAL, 1));
        r.add(new Recipe(FURNACE, COOKED_MEAT, 1, RAW_MEAT, 1, STICK, 1));
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
        else switch (id) {
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
            default:
                break;
        }
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
