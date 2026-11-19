import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.util.HashMap;
import java.util.Map;
import javax.imageio.ImageIO;

/**
 * Texturas dos blocos. Cada bloco tem 6 faces; índice = bloco*6 + face, com as faces na ordem
 * 0 direita (+X), 1 esquerda (-X), 2 topo, 3 base, 4 frente (+Z), 5 trás (-Z).
 * Cada textura tem S*S pixels ARGB.
 *
 * Na pasta "textures" cada bloco é UM arquivo PNG com as 6 faces num "cubo aberto" de 4x3 células:
 *
 *            [topo]
 *   [esquerda][frente][direita][trás]
 *            [base]
 *
 * (16x16 por célula = imagem de 64x48; também vale 32x32 por célula = 128x96, e assim por diante.)
 * Na primeira execução a pasta é criada com as texturas padrão; texturas no formato antigo
 * (uma face por arquivo) são convertidas sozinhas e os arquivos antigos vão para "textures/antigo".
 */
final class Textures {
    private interface Px { int at(double gx, double gy, int x, int y); }

    static final File DIR = new File("textures");
    static final int FACES = 6;

    /** Nome do arquivo de cada bloco (sem extensão). */
    private static final String[] FILE = new String[Block.COUNT];
    static {
        String[] base = { "ar", "grama", "terra", "pedra", "pedregulho", "areia",
                "tronco", "folhas", "tabuas", "tijolos", "neve", "agua",
                "minerio_carvao", "minerio_ferro", "minerio_ouro", "minerio_cristal", "cascalho", "arenito",
                "vidro", "tocha", "bancada", "fornalha", "tronco_betula", "folhas_betula",
                "cacto", "grama_alta", "flor_amarela", "flor_vermelha", "gelo", "lava",
                "la", "tijolos_pedra", "bloco_ferro", "bloco_ouro", "rocha_mae" };
        System.arraycopy(base, 0, FILE, 0, base.length);
        FILE[Block.TNT] = "dinamite";
        FILE[Block.BED] = "cama";
        FILE[Block.SAPLING] = "muda";
        FILE[Block.BIRCH_SAPLING] = "muda_betula";
        FILE[Block.CHEST] = "bau";
        FILE[Block.FARMLAND] = "terra_arada";
        FILE[Block.FURNACE_LIT] = "fornalha_acesa";
        FILE[Block.BIRCH_PLANKS] = "tabuas_betula";
        for (int s = 0; s < 3; s++) FILE[Block.WHEAT + s] = "trigo_" + (s + 1);
        FILE[Block.DOOR_TEX_LOWER] = "porta_baixo";
        FILE[Block.DOOR_TEX_UPPER] = "porta_cima";
        FILE[Block.BIRCH_DOOR_TEX_LOWER] = "porta_betula_baixo";
        FILE[Block.BIRCH_DOOR_TEX_UPPER] = "porta_betula_cima";
        for (int l = 0; l < 7; l++) FILE[Block.WATER_FLOW + l] = "agua"; // água corrente usa a mesma textura
        // escadas, lajes e portas usam o arquivo do material (ou da porta)
        for (int b = 0; b < Block.COUNT; b++) if (Block.texture(b) != b) FILE[b] = FILE[Block.texture(b)];
    }

    private static String fileList() {
        StringBuilder sb = new StringBuilder();
        for (int b = 1; b < Block.COUNT; b++)
            if (ownsFile(b)) sb.append(sb.length() > 0 ? ", " : "").append(FILE[b]);
        return sb.toString();
    }

    /** Bloco que tem arquivo próprio (não é variante nem água corrente). */
    private static boolean ownsFile(int b) {
        return b > 0 && Block.texture(b) == b && Block.waterLevel(b) <= 0;
    }
    /** Célula (coluna, linha) de cada face no PNG em cubo aberto. */
    private static final int[][] CELL = { { 2, 1 }, { 0, 1 }, { 1, 0 }, { 1, 2 }, { 1, 1 }, { 3, 1 } };
    private static final String[] FACE_NAMES = { "direita", "esquerda", "topo", "base", "frente", "trás" };

    private static final Map<Integer, int[][]> CACHE = new HashMap<>();
    private static boolean useImages = true;
    private static String packInfo = "";

    /** Liga/desliga o uso das imagens. Retorna true se mudou. */
    static synchronized boolean setUseImages(boolean b) {
        if (b == useImages) return false;
        useImages = b;
        reload();
        return true;
    }

    /** Esquece as texturas carregadas (para reler os PNGs depois de editar). */
    static synchronized void reload() {
        CACHE.clear();
        java.util.Arrays.fill(CUBES, null);
        Items.reloadIcons();
        Hand.reload();
    }

    /** Blocos com partes transparentes (folhas, vidro, plantas, tocha). */
    private static boolean hasHoles(int b) {
        int s = Block.shape(Block.texture(b));
        return s == Block.CUTOUT || s == Block.CROSS || Block.isDoorTexture(Block.texture(b));
    }

    /** Variantes (escadas, lajes, portas) passam a apontar para as texturas do material. */
    private static int[][] linkVariants(int[][] t) {
        for (int b = 0; b < Block.COUNT; b++) {
            int src = Block.texture(b);
            if (src != b) for (int f = 0; f < FACES; f++) t[b * 6 + f] = t[src * 6 + f];
        }
        return t;
    }

    static synchronized String packInfo() {
        get(16);
        return packInfo;
    }

    private static boolean folderReady;

    static synchronized int[][] get(int S) {
        if (!folderReady) { // mantém a pasta no formato novo mesmo usando as texturas geradas
            folderReady = true;
            prepareFolder();
        }
        int[][] t = CACHE.get(S);
        if (t == null) {
            t = useImages ? loadPack(S) : expand(generate(S));
            CACHE.put(S, t);
        }
        return t;
    }

    /** Converte as texturas geradas (lado, topo, base) para as 6 faces. */
    private static int[][] expand(int[][] t3) {
        int[][] t = new int[Block.COUNT * FACES][];
        for (int b = 0; b < Block.COUNT; b++) {
            int[] side = t3[b * 3], top = t3[b * 3 + 1], bottom = t3[b * 3 + 2];
            int[] front = t3.length > Block.COUNT * 3 && t3[Block.COUNT * 3 + b] != null ? t3[Block.COUNT * 3 + b] : side; // frente própria, se tiver
            t[b * 6] = side; t[b * 6 + 1] = side; t[b * 6 + 4] = front; t[b * 6 + 5] = side;
            t[b * 6 + 2] = top;
            t[b * 6 + 3] = bottom;
        }
        return linkVariants(t);
    }

    // ------------------------- pacote de imagens -------------------------

    private static int[][] loadPack(int S) {
        prepareFolder();
        int[][] fallback = expand(generate(S));
        int[][] t = new int[Block.COUNT * FACES][];
        int loaded = 0, nativeSize = 0;
        for (int b = 0; b < Block.COUNT; b++) {
            if (b != Block.AIR && Block.texture(b) != b) continue; // variantes: ligadas no fim
            BufferedImage img = b == Block.AIR ? null : read(new File(DIR, FILE[b] + ".png"));
            for (int f = 0; f < FACES; f++) {
                int[] face = null;
                if (img != null) {
                    BufferedImage cell = isNet(img) ? faceOf(img, f) : img; // quadrada = mesma textura nas 6 faces
                    if (!transparent(cell) || hasHoles(b)) face = resample(cell, S, hasHoles(b));
                }
                t[b * 6 + f] = face != null ? face : fallback[b * 6 + f];
            }
            if (img != null) {
                loaded++;
                nativeSize = Math.max(nativeSize, isNet(img) ? img.getWidth() / 4 : img.getWidth());
            }
        }
        packInfo = loaded == 0 ? "nenhuma imagem encontrada, usando as geradas"
                : loaded + " blocos em imagens de " + nativeSize + "px por face";
        return linkVariants(t);
    }

    private static boolean isNet(BufferedImage img) {
        return img.getWidth() * 3 == img.getHeight() * 4;
    }

    private static BufferedImage faceOf(BufferedImage net, int f) {
        int c = net.getWidth() / 4;
        return net.getSubimage(CELL[f][0] * c, CELL[f][1] * c, c, c);
    }

    private static boolean transparent(BufferedImage img) {
        for (int y = 0; y < img.getHeight(); y++)
            for (int x = 0; x < img.getWidth(); x++)
                if ((img.getRGB(x, y) >>> 24) > 0) return false;
        return true;
    }

    private static BufferedImage read(File file) {
        if (!file.exists()) return null;
        try {
            BufferedImage img = ImageIO.read(file);
            if (img != null && img.getWidth() > 0) return img;
        } catch (IOException e) {
            System.out.println("Textura inválida: " + file + " (" + e.getMessage() + ")");
        }
        return null;
    }

    /** Converte a imagem para S x S: amplia sem borrar, ou reduz tirando a média dos pixels. */
    private static int[] resample(BufferedImage img, int S, boolean cutout) {
        int w = img.getWidth(), h = img.getHeight();
        int[] src = img.getRGB(0, 0, w, h, null, 0, w);
        int[] out = new int[S * S];
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++) {
                int x0 = x * w / S, x1 = Math.max(x0 + 1, (x + 1) * w / S);
                int y0 = y * h / S, y1 = Math.max(y0 + 1, (y + 1) * h / S);
                long a = 0, r = 0, g = 0, bl = 0;
                int n = 0;
                for (int yy = y0; yy < y1; yy++)
                    for (int xx = x0; xx < x1; xx++) {
                        int c = src[yy * w + xx];
                        a += c >>> 24; r += (c >> 16) & 255; g += (c >> 8) & 255; bl += c & 255;
                        n++;
                    }
                int alpha = (int) (a / n);
                if (cutout && alpha < 128) { out[y * S + x] = 0; continue; }
                out[y * S + x] = 0xFF000000 | (int) (r / n) << 16 | (int) (g / n) << 8 | (int) (bl / n);
            }
        return out;
    }

    /**
     * Garante um PNG em cubo aberto para cada bloco. Se o bloco ainda está no formato antigo
     * (bloco.png quadrado, bloco_lado/_topo/_base.png), monta o cubo aberto a partir deles e guarda
     * os antigos em "textures/antigo". Blocos sem arquivo nenhum ganham a textura padrão.
     * PNGs que já estão no formato novo nunca são tocados.
     */
    private static void prepareFolder() {
        if (!DIR.exists() && !DIR.mkdirs()) return;
        int[][] gen = expand(generate(16));
        File oldDir = new File(DIR, "antigo");
        for (int b = 1; b < Block.COUNT; b++) {
            if (!ownsFile(b)) continue;
            File netFile = new File(DIR, FILE[b] + ".png");
            BufferedImage cur = read(netFile);
            if (cur != null && isNet(cur)) continue;

            boolean holes = hasHoles(b);
            File sideF = new File(DIR, FILE[b] + "_lado.png"), topF = new File(DIR, FILE[b] + "_topo.png"),
                    baseF = new File(DIR, FILE[b] + "_base.png");
            int[] square = cur != null ? resample(cur, 16, holes) : null;
            int[] side = load16(sideF, holes), top = load16(topF, holes), base = load16(baseF, holes);
            int[][] faces = new int[FACES][];
            for (int f = 0; f < FACES; f++) {
                int[] legacy = f == 2 ? top : f == 3 ? base : side;
                faces[f] = legacy != null ? legacy : square != null ? square : gen[b * 6 + f];
            }
            // guarda os arquivos antigos antes de escrever o novo
            for (File old : new File[] { netFile, sideF, topF, baseF }) {
                if (!old.exists()) continue;
                if (!oldDir.exists()) oldDir.mkdirs();
                try {
                    java.nio.file.Files.move(old.toPath(), new File(oldDir, old.getName()).toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException e) {
                    System.out.println("Não consegui mover " + old + ": " + e.getMessage());
                }
            }
            writeNet(faces, netFile);
        }
        writeGuide();
    }

    private static int[] load16(File f, boolean holes) {
        BufferedImage img = read(f);
        return img == null ? null : resample(img, 16, holes);
    }

    /** Salva as 6 faces (16x16) num PNG de 64x48 em cubo aberto; células que sobram ficam transparentes. */
    private static void writeNet(int[][] faces, File file) {
        BufferedImage img = new BufferedImage(64, 48, BufferedImage.TYPE_INT_ARGB);
        for (int f = 0; f < FACES; f++)
            img.setRGB(CELL[f][0] * 16, CELL[f][1] * 16, 16, 16, faces[f], 0, 16);
        try {
            ImageIO.write(img, "png", file);
        } catch (IOException e) {
            System.out.println("Não consegui salvar " + file + ": " + e.getMessage());
        }
    }

    /** LEIA-ME e um modelo com o nome de cada face, para servir de guia ao pintar. */
    private static void writeGuide() {
        try (Writer w = new OutputStreamWriter(new java.io.FileOutputStream(new File(DIR, "LEIA-ME.txt")), "UTF-8")) {
            w.write("Texturas do Mundo de Blocos\r\n"
                    + "===========================\r\n\r\n"
                    + "Cada bloco é UM arquivo PNG com as 6 faces, num cubo aberto de 4 x 3 células:\r\n\r\n"
                    + "              +--------+\r\n"
                    + "              |  topo  |\r\n"
                    + "     +--------+--------+--------+--------+\r\n"
                    + "     |esquerda| frente |direita |  trás  |\r\n"
                    + "     +--------+--------+--------+--------+\r\n"
                    + "              |  base  |\r\n"
                    + "              +--------+\r\n\r\n"
                    + "Com células de 16x16 a imagem tem 64x48; com 32x32, 128x96; com 64x64, 256x192.\r\n"
                    + "As 4 células dos cantos não são usadas (podem ficar transparentes).\r\n"
                    + "Veja _modelo_faces.png: é um guia com o nome de cada face.\r\n"
                    + "Uma imagem quadrada também funciona: a mesma textura vai para as 6 faces.\r\n\r\n"
                    + "A frente (a célula \"frente\") fica virada para quem colocou o bloco.\r\n"
                    + "Para a fornalha, a bancada e o baú ganharem a frente desenhada, apague o arquivo deles (fornalha.png, bancada.png, bau.png).\r\n\r\n"
                    + "Arquivos: " + fileList() + "\r\n"
                    + "Escadas e lajes usam a textura do material (tabuas, pedregulho, tijolos_pedra, tijolos, arenito).\r\n"
                    + "A porta tem duas: porta_baixo e porta_cima (a janela é transparente).\r\n\r\n"
                    + "Em folhas, vidro, plantas e tocha, pixels transparentes viram buracos\r\n"
                    + "(plantas e tocha usam a célula da frente).\r\n"
                    + "Depois de editar, use Configurações > Recarregar texturas (não precisa fechar o jogo).\r\n"
                    + "Apague um arquivo para ele voltar ao padrão; apague a pasta para voltar tudo.\r\n"
                    + "Texturas no formato antigo (uma face por arquivo) ficam guardadas em antigo\\.\r\n");
        } catch (IOException ignored) {
        }
        File guide = new File(DIR, "_modelo_faces.png");
        if (guide.exists()) return;
        BufferedImage img = new BufferedImage(256, 192, BufferedImage.TYPE_INT_ARGB);
        java.awt.Graphics2D g = img.createGraphics();
        g.setRenderingHint(java.awt.RenderingHints.KEY_TEXT_ANTIALIASING, java.awt.RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        int[] colors = { 0xD06060, 0x6080D0, 0x60B060, 0x8A6A4A, 0xD0B050, 0x9060B0 };
        g.setFont(new java.awt.Font(java.awt.Font.SANS_SERIF, java.awt.Font.BOLD, 12));
        for (int f = 0; f < FACES; f++) {
            int x = CELL[f][0] * 64, y = CELL[f][1] * 64;
            g.setColor(new java.awt.Color(colors[f]));
            g.fillRect(x, y, 64, 64);
            g.setColor(java.awt.Color.WHITE);
            g.drawRect(x, y, 63, 63);
            int tw = g.getFontMetrics().stringWidth(FACE_NAMES[f]);
            g.drawString(FACE_NAMES[f], x + (64 - tw) / 2, y + 36);
        }
        g.dispose();
        try {
            ImageIO.write(img, "png", guide);
        } catch (IOException ignored) {
        }
    }

    /** Ícone plano 64x64 (plantas e tocha), feito da textura da frente de 16px. */
    static synchronized BufferedImage flatIcon(int b) {
        int[] t = get(16)[b * 6 + 4];
        BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < 64; y++)
            for (int x = 0; x < 64; x++) img.setRGB(x, y, t[(y / 4) * 16 + x / 4]);
        return img;
    }

    private static int[][] generate(final int S) {
        final boolean hi = S > 16;
        final int grassC = rgb(98, 160, 55), dirtC = rgb(134, 96, 67), barkC = rgb(102, 81, 51);

        int[] grassTop = make(S, (gx, gy, x, y) -> {
            double f = 0.86 + 0.28 * rnd(x, y, S, 11);
            if (hi && World.hash(x, y, 90 + S) < 0.06) f *= 1.12; // pontas de folhas de grama
            return mul(grassC, f);
        });
        int[] dirt = make(S, (gx, gy, x, y) -> {
            double f = 0.84 + 0.32 * rnd(x, y, S, 12);
            if (hi && World.hash(x, y, 91 + S) < 0.025) f *= 1.3; // pedrinhas
            return mul(dirtC, f);
        });
        int[] grassSide = make(S, (gx, gy, x, y) -> {
            int col = (int) gx;
            double d = 3 + (int) (World.hash(col, 0, 13) * 2) - (World.hash(col, 1, 13) < 0.25 ? 1 : 0);
            if (hi) d += (World.hash(x, 7, 92 + S) - 0.5) * 0.8;
            if (gy < d) return mul(grassC, 0.86 + 0.28 * rnd(x, y, S, 11));
            return mul(dirtC, 0.84 + 0.32 * rnd(x, y, S, 12));
        });
        int[] stone = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.2 * rnd(x, y, S, 14);
            if (World.hash((int) gx, (int) gy, 15) < 0.09) f *= 0.75;
            if (hi) f *= 0.96 + 0.08 * World.noise(gx * 0.6, gy * 0.6, 93);
            return mul(rgb(128, 128, 128), f);
        });

        // pedregulho: diagrama de Voronoi (pedras arredondadas)
        final int n = 11;
        final double[] cx = new double[n], cy = new double[n], br = new double[n];
        for (int i = 0; i < n; i++) {
            cx[i] = World.hash(i, 0, 16) * 16;
            cy[i] = World.hash(i, 1, 16) * 16;
            br[i] = World.hash(i, 2, 16);
        }
        int[] cobble = make(S, (gx, gy, x, y) -> {
            double d1 = 1e9, d2 = 1e9;
            int best = 0;
            for (int i = 0; i < n; i++) {
                double dx = Math.abs(gx - cx[i]), dy = Math.abs(gy - cy[i]);
                dx = Math.min(dx, 16 - dx);
                dy = Math.min(dy, 16 - dy);
                double d = Math.sqrt(dx * dx + dy * dy);
                if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
            }
            double f = 0.75 + br[best] * 0.4;
            if (hi) f *= 1.06 - d1 * 0.035; // pedra arredondada, mais clara no centro
            if (d2 - d1 < (hi ? 0.7 : 1.0)) f *= 0.6;
            return mul(rgb(125, 125, 125), f * (0.95 + 0.1 * rnd(x, y, S, 17)));
        });

        int[] sand = make(S, (gx, gy, x, y) -> mul(rgb(219, 206, 160), 0.93 + 0.14 * rnd(x, y, S, 18)));
        int[] snow = make(S, (gx, gy, x, y) -> mul(rgb(240, 244, 250), 0.96 + 0.08 * rnd(x, y, S, 19)));
        int[] water = make(S, (gx, gy, x, y) -> {
            double f = 0.92 + 0.16 * rnd(x, y, S, 20);
            if (hi) f *= 0.95 + 0.1 * Math.sin(gx * 0.9 + Math.sin(gy * 0.8) * 2);
            return mul(rgb(45, 95, 205), f);
        });

        int[] logSide = make(S, (gx, gy, x, y) -> {
            double f = (0.8 + World.hash((int) gx, 0, 21) * 0.35) * (0.93 + 0.14 * rnd(x, y, S, 22));
            if (hi) f *= 0.94 + 0.12 * World.noise(x * 0.9, gy * 0.15, 94); // veios da casca
            return mul(barkC, f);
        });
        final int ringLight = rgb(182, 147, 92), ringDark = rgb(150, 118, 70);
        int[] logTop = make(S, (gx, gy, x, y) -> {
            double d = Math.sqrt((gx - 8) * (gx - 8) + (gy - 8) * (gy - 8));
            int c;
            if (d > 6.6) c = barkC;
            else if (hi) c = mixRgb(ringDark, ringLight, 0.5 + 0.5 * Math.cos(d * Math.PI));
            else c = ((int) d) % 2 == 0 ? ringLight : ringDark;
            return mul(c, 0.93 + 0.14 * rnd(x, y, S, 23));
        });

        int[] leaves = make(S, (gx, gy, x, y) -> {
            if (World.hash((int) gx, (int) gy, 24) < 0.22) return 0; // buraco transparente
            double f = 0.75 + 0.5 * rnd(x, y, S, 25);
            if (hi) f *= 0.9 + 0.2 * World.noise(gx * 0.8, gy * 0.8, 95);
            return mul(rgb(55, 125, 35), f);
        });

        final double line = hi ? 0.6 : 1.0; // espessura das juntas, em unidades da grade 16x16
        int[] planks = make(S, (gx, gy, x, y) -> {
            int row = (int) (gy / 4);
            double f = 0.92 + 0.16 * rnd(x, y, S, 26);
            double seamX = row % 2 == 0 ? 3 : 11;
            if (gy % 4 >= 4 - line) f *= 0.68;
            else if (gx >= seamX && gx < seamX + line) f *= 0.75;
            f *= 1 + 0.05 * Math.sin(gx * 2.1 + World.hash(row, 0, 27) * 20 + Math.sin(gy * 0.7) * 2);
            return mul(rgb(162, 130, 78), f);
        });

        int[] brick = make(S, (gx, gy, x, y) -> {
            int row = (int) (gy / 4);
            double sx = gx + 8 + (row % 2 == 0 ? 0 : 8);
            double gxm = sx % 16;
            boolean mortar = gy % 4 >= 4 - line || gxm >= 16 - line;
            if (mortar) return mul(rgb(182, 176, 166), 0.94 + 0.12 * rnd(x, y, S, 28));
            double id = World.hash(row, (int) (sx / 16), 29);
            double f = (0.88 + 0.24 * id) * (0.9 + 0.2 * rnd(x, y, S, 30));
            return mul(rgb(150, 74, 58), f);
        });

        // ------------------------- blocos da atualização -------------------------
        int[] coalOre = ore(S, stone, rgb(38, 38, 42), 31);
        int[] ironOre = ore(S, stone, rgb(216, 175, 140), 32);
        int[] goldOre = ore(S, stone, rgb(250, 210, 60), 33);
        int[] crystalOre = ore(S, stone, rgb(80, 225, 215), 34);

        int[] gravel = make(S, (gx, gy, x, y) -> {
            double cxp = gx / 2.6, cyp = gy / 2.6 + ((int) (gx / 2.6) % 2) * 0.5;
            double fx = cxp - Math.floor(cxp), fy = cyp - Math.floor(cyp);
            double h = World.hash((int) cxp, (int) Math.floor(cyp), 40);
            int c = h < 0.33 ? rgb(130, 120, 112) : h < 0.66 ? rgb(105, 98, 92) : rgb(150, 142, 132);
            double f = 0.9 + 0.2 * rnd(x, y, S, 41);
            if (fx < 0.15 || fy < 0.15) f *= 0.7;
            return mul(c, f);
        });

        final int sandC = rgb(219, 206, 160);
        int[] sandstoneSide = make(S, (gx, gy, x, y) -> {
            double f = 0.93 + 0.1 * rnd(x, y, S, 42);
            if (gy % 5 < 0.7) f *= 0.82;
            if (gy < 1.2) f *= 1.06;
            return mul(rgb(216, 196, 140), f);
        });
        int[] sandstoneTop = make(S, (gx, gy, x, y) -> mul(rgb(222, 204, 150), 0.95 + 0.08 * rnd(x, y, S, 43)));

        int[] glass = make(S, (gx, gy, x, y) -> {
            boolean frame = gx < 1 || gx > 15 || gy < 1 || gy > 15;
            if (frame) return rgb(205, 225, 235);
            if (Math.abs(gx - gy - 3) < 0.55 && gx > 4 && gx < 9) return rgb(240, 250, 255);
            if (Math.abs(gx - gy - 6) < 0.55 && gx > 8 && gx < 11) return rgb(240, 250, 255);
            return 0;
        });

        int[] torch = make(S, (gx, gy, x, y) -> {
            if (gx >= 7 && gx < 9 && gy >= 6) return mul(rgb(120, 86, 48), gx < 8 ? 1.0 : 0.75);
            if (gx >= 6.5 && gx < 9.5 && gy >= 2.5 && gy < 6) {
                double t2 = (gy - 2.5) / 3.5;
                return mixRgb(rgb(255, 245, 160), rgb(255, 140, 30), t2);
            }
            return 0;
        });

        final int[] planksF = planks;
        int[] tableTop = make(S, (gx, gy, x, y) -> {
            boolean edge = gx < 1 || gx > 15 || gy < 1 || gy > 15;
            boolean grid = (Math.abs(gx - 8) < 0.5 || Math.abs(gy - 8) < 0.5);
            int c = planksF[y * S + x];
            return edge ? mul(c, 0.6) : grid ? mul(c, 0.78) : c;
        });
        int[] tableSide = make(S, (gx, gy, x, y) -> {
            int c = planksF[y * S + x];
            if (gy < 2.5) return mul(c, 0.7);
            if (gx > 2 && gx < 6 && gy > 5 && gy < 13) return mul(rgb(90, 90, 96), 0.9 + 0.2 * rnd(x, y, S, 44)); // martelo
            if (gx > 9 && gx < 14 && gy > 5 && gy < 8) return mul(rgb(110, 110, 120), 0.9 + 0.2 * rnd(x, y, S, 45));
            if (gx > 11 && gx < 12.5 && gy >= 8 && gy < 14) return mul(rgb(90, 64, 36), 1);
            return c;
        });

        final int[] cobbleF = cobble;
        int[] furnaceSide = make(S, (gx, gy, x, y) -> {
            if (gx >= 4 && gx < 12 && gy >= 8 && gy < 14) {
                if (gy >= 12) return mixRgb(rgb(255, 170, 50), rgb(220, 70, 20), rnd(x, y, S, 46));
                return rgb(28, 24, 24);
            }
            if (gx >= 3 && gx < 13 && gy >= 7 && gy < 15) return mul(cobbleF[y * S + x], 0.6);
            return cobbleF[y * S + x];
        });
        // apagada: a mesma boca, só com cinzas escuras
        int[] furnaceOff = make(S, (gx, gy, x, y) -> {
            if (gx >= 4 && gx < 12 && gy >= 8 && gy < 14) return gy >= 12 ? mul(rgb(58, 54, 52), 0.8 + 0.4 * rnd(x, y, S, 46)) : rgb(24, 22, 22);
            if (gx >= 3 && gx < 13 && gy >= 7 && gy < 15) return mul(cobbleF[y * S + x], 0.6);
            return cobbleF[y * S + x];
        });
        int[] furnaceTop = make(S, (gx, gy, x, y) -> mul(cobbleF[y * S + x], 1.05));

        int[] birchSide = make(S, (gx, gy, x, y) -> {
            double band = World.hash((int) (gx / 4), (int) (gy / 2.5), 47);
            if (band < 0.28 && ((int) (gy * 1.0)) % 3 != 0) return mul(rgb(48, 44, 40), 0.9 + 0.2 * rnd(x, y, S, 48));
            return mul(rgb(222, 222, 212), 0.92 + 0.12 * rnd(x, y, S, 49));
        });
        int[] birchTop = make(S, (gx, gy, x, y) -> {
            double d = Math.sqrt((gx - 8) * (gx - 8) + (gy - 8) * (gy - 8));
            int c = d > 6.6 ? rgb(222, 222, 212) : (((int) d) % 2 == 0 ? rgb(214, 196, 150) : rgb(186, 166, 120));
            return mul(c, 0.94 + 0.12 * rnd(x, y, S, 50));
        });
        int[] birchLeaves = make(S, (gx, gy, x, y) -> {
            if (World.hash((int) gx, (int) gy, 51) < 0.22) return 0;
            return mul(rgb(108, 160, 62), 0.75 + 0.5 * rnd(x, y, S, 52));
        });

        int[] cactusSide = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.15 * rnd(x, y, S, 53);
            if (gx % 4 < 0.8) f *= 0.72;
            if (World.hash((int) gx, (int) gy, 54) < 0.05) return rgb(230, 225, 190);
            return mul(rgb(70, 140, 52), f);
        });
        int[] cactusTop = make(S, (gx, gy, x, y) -> {
            double d = Math.max(Math.abs(gx - 8), Math.abs(gy - 8));
            return mul(rgb(96, 168, 70), (d > 6.5 ? 0.75 : 1.0) * (0.92 + 0.12 * rnd(x, y, S, 55)));
        });

        int[] tallGrass = make(S, (gx, gy, x, y) -> {
            int col = (int) gx;
            double hgt = 5 + World.hash(col, 3, 56) * 10;
            boolean blade = World.hash(col, 4, 56) < 0.7;
            if (blade && gy > 16 - hgt) return mul(rgb(88, 150, 50), 0.8 + 0.4 * (gy / 16.0) * rnd(x, y, S, 57));
            return 0;
        });
        int[] flowerYellow = flower(S, rgb(245, 210, 40), rgb(170, 110, 20));
        int[] flowerRed = flower(S, rgb(215, 40, 45), rgb(250, 220, 90));

        int[] ice = make(S, (gx, gy, x, y) -> {
            if (Math.abs(gx - gy * 0.7 - 3) < 0.4 || Math.abs(gx + gy * 0.5 - 13) < 0.35) return rgb(235, 245, 255);
            return mul(rgb(150, 195, 240), 0.94 + 0.1 * rnd(x, y, S, 58));
        });
        int[] lava = make(S, (gx, gy, x, y) -> {
            double f = World.noise(gx * 0.35, gy * 0.35, 77) * 0.7 + rnd(x, y, S, 59) * 0.3;
            return mixRgb(rgb(190, 50, 10), rgb(255, 200, 50), f);
        });
        int[] wool = make(S, (gx, gy, x, y) ->
                mul(rgb(236, 236, 230), 0.86 + 0.1 * World.noise(gx * 0.8, gy * 0.8, 60) + 0.06 * rnd(x, y, S, 61)));
        int[] stoneBrick = make(S, (gx, gy, x, y) -> {
            int row = (int) (gy / 8);
            double sx = (gx + (row % 2 == 0 ? 0 : 8)) % 16;
            double f = 0.92 + 0.12 * rnd(x, y, S, 62);
            if (gy % 8 >= 8 - line || sx % 8 >= 8 - line) f *= 0.62;
            else if (gy % 8 < line) f *= 1.1;
            return mul(rgb(122, 122, 124), f);
        });
        int[] ironBlock = metalBlock(S, rgb(212, 212, 218));
        int[] goldBlock = metalBlock(S, rgb(246, 202, 64));
        int[] bedrock = make(S, (gx, gy, x, y) ->
                mul(rgb(70, 70, 72), 0.6 + 0.5 * World.noise(gx * 0.5, gy * 0.5, 63) + 0.25 * rnd(x, y, S, 64)));

        // dinamite: faixas vermelhas com a cinta branca no meio; em cima, o pavio
        int[] tntSide = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.16 * rnd(x, y, S, 101);
            if (gy >= 5.5 && gy < 10.5) {
                boolean letter = gy >= 6.5 && gy < 9.5 && (((int) gx) % 5 == 1 || (((int) gx) % 5 == 2 && (int) gy == 7));
                return letter ? rgb(40, 40, 40) : mul(rgb(232, 228, 216), f);
            }
            if (((int) gx) % 4 == 3) f *= 0.72;
            return mul(rgb(200, 44, 36), f);
        });
        int[] tntTop = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.16 * rnd(x, y, S, 102);
            double dx = gx - 8, dy = gy - 8;
            if (dx * dx + dy * dy < 2.6) return rgb(60, 60, 60);
            if (((int) gx) % 4 == 3 || ((int) gy) % 4 == 3) f *= 0.75;
            return mul(rgb(200, 44, 36), f);
        });
        // cama: colchão vermelho com travesseiro branco em cima; lados com a madeira embaixo
        int[] bedTop = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.14 * rnd(x, y, S, 103);
            if (gy < 5) return mul(rgb(238, 238, 232), gx < 1 || gx > 15 || gy < 1 ? f * 0.85 : f);
            return mul(rgb(176, 40, 44), gx < 1 || gx > 15 || gy > 15 ? f * 0.8 : f);
        });
        int[] bedSide = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.14 * rnd(x, y, S, 104);
            if (gy < 7) return mul(rgb(176, 40, 44), f); // (a cama tem 9/16 de altura: esta parte não aparece)
            if (gy < 12) return mul(rgb(176, 40, 44), f);
            return mul(rgb(150, 110, 62), ((int) gx) % 8 == 0 ? f * 0.75 : f);
        });
        int[] sapling = sapling(S, rgb(62, 132, 44), rgb(102, 81, 51));
        int[] birchSapling = sapling(S, rgb(110, 170, 70), rgb(214, 210, 196));

        // baú: caixa de madeira com moldura escura, a linha da tampa e o fecho de metal
        int[] chestSide = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.16 * rnd(x, y, S, 110);
            if (gx < 1 || gx >= 15 || gy < 1 || gy >= 15) return mul(rgb(72, 48, 22), f);
            if (gx >= 7 && gx < 9 && gy >= 4 && gy < 8) return mul(rgb(206, 206, 212), gy >= 7 ? f * 0.7 : f);
            if (gy >= 5 && gy < 6) return mul(rgb(60, 40, 18), f);
            return mul(rgb(162, 114, 50), ((int) gy) % 4 == 0 ? f * 0.86 : f);
        });
        int[] chestTop = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.16 * rnd(x, y, S, 111);
            if (gx < 1 || gx >= 15 || gy < 1 || gy >= 15) return mul(rgb(72, 48, 22), f);
            return mul(rgb(170, 122, 56), ((int) gy) % 4 == 0 ? f * 0.86 : f);
        });
        // terra arada: sulcos escuros em cima; dos lados é terra comum
        int[] farmTop = make(S, (gx, gy, x, y) ->
                mul(rgb(98, 64, 40), (((int) gx) % 4 < 2 ? 0.78 : 1.06) * (0.86 + 0.28 * rnd(x, y, S, 112))));
        int[][] wheat = { wheat(S, 0), wheat(S, 1), wheat(S, 2) };

        // fornalha, bancada e baú: só a frente tem o desenho (boca da fornalha, ferramentas, fecho); os lados são lisos
        int[] furnacePlain = make(S, (gx, gy, x, y) -> cobbleF[y * S + x]);
        int[] tablePlain = make(S, (gx, gy, x, y) -> gy < 2.5 ? mul(planksF[y * S + x], 0.7) : planksF[y * S + x]);
        int[] chestPlain = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.16 * rnd(x, y, S, 110);
            if (gx < 1 || gx >= 15 || gy < 1 || gy >= 15) return mul(rgb(72, 48, 22), f);
            if (gy >= 5 && gy < 6) return mul(rgb(60, 40, 18), f);
            return mul(rgb(162, 114, 50), ((int) gy) % 4 == 0 ? f * 0.86 : f);
        });

        int[][] t = new int[Block.COUNT * 3 + Block.COUNT][];
        t[Block.COUNT * 3 + Block.FURNACE] = furnaceOff;
        t[Block.COUNT * 3 + Block.FURNACE_LIT] = furnaceSide;
        t[Block.COUNT * 3 + Block.TABLE] = tableSide;
        t[Block.COUNT * 3 + Block.CHEST] = chestSide;
        set(t, Block.CHEST, chestPlain, chestTop, chestTop);
        set(t, Block.FARMLAND, dirt, farmTop, dirt);
        for (int s = 0; s < 3; s++) set(t, Block.WHEAT + s, wheat[s], wheat[s], wheat[s]);
        set(t, Block.TNT, tntSide, tntTop, tntTop);
        set(t, Block.BED, bedSide, bedTop, planks);
        set(t, Block.SAPLING, sapling, sapling, sapling);
        set(t, Block.BIRCH_SAPLING, birchSapling, birchSapling, birchSapling);
        set(t, Block.COAL_ORE, coalOre, coalOre, coalOre);
        set(t, Block.IRON_ORE, ironOre, ironOre, ironOre);
        set(t, Block.GOLD_ORE, goldOre, goldOre, goldOre);
        set(t, Block.CRYSTAL_ORE, crystalOre, crystalOre, crystalOre);
        set(t, Block.GRAVEL, gravel, gravel, gravel);
        set(t, Block.SANDSTONE, sandstoneSide, sandstoneTop, sandstoneTop);
        set(t, Block.GLASS, glass, glass, glass);
        set(t, Block.TORCH, torch, torch, torch);
        set(t, Block.TABLE, tablePlain, tableTop, planks);
        set(t, Block.FURNACE, furnacePlain, furnaceTop, furnaceTop);
        set(t, Block.FURNACE_LIT, furnacePlain, furnaceTop, furnaceTop);
        set(t, Block.BIRCH_LOG, birchSide, birchTop, birchTop);
        set(t, Block.BIRCH_LEAVES, birchLeaves, birchLeaves, birchLeaves);
        set(t, Block.CACTUS, cactusSide, cactusTop, cactusTop);
        set(t, Block.TALL_GRASS, tallGrass, tallGrass, tallGrass);
        set(t, Block.FLOWER_YELLOW, flowerYellow, flowerYellow, flowerYellow);
        set(t, Block.FLOWER_RED, flowerRed, flowerRed, flowerRed);
        set(t, Block.ICE, ice, ice, ice);
        set(t, Block.LAVA, lava, lava, lava);
        set(t, Block.WOOL, wool, wool, wool);
        set(t, Block.STONE_BRICK, stoneBrick, stoneBrick, stoneBrick);
        set(t, Block.IRON_BLOCK, ironBlock, ironBlock, ironBlock);
        set(t, Block.GOLD_BLOCK, goldBlock, goldBlock, goldBlock);
        set(t, Block.BEDROCK, bedrock, bedrock, bedrock);
        for (int l = 0; l < 7; l++) set(t, Block.WATER_FLOW + l, water, water, water);

        // porta de madeira: tábuas verticais com moldura; embaixo a maçaneta, em cima uma janela
        final int doorC = rgb(150, 112, 62);
        int[] doorLower = make(S, (gx, gy, x, y) -> {
            double f = 0.9 + 0.14 * rnd(x, y, S, 80);
            boolean frame = gx < 2 || gx > 14 || gy > 14;
            if (frame) f *= 0.72;
            else if (((int) gx) % 4 == 1) f *= 0.82; // juntas entre as tábuas
            if (gx > 11.5 && gx < 13.5 && gy > 6 && gy < 8.5) return rgb(60, 56, 52); // maçaneta
            if (!frame && (gy > 7 && gy < 8.2)) f *= 0.8; // travessa
            return mul(doorC, f);
        });
        int[] doorUpper = make(S, (gx, gy, x, y) -> {
            if (gx >= 3.5 && gx < 12.5 && gy >= 3.5 && gy < 10.5 && !(gx >= 7.5 && gx < 8.5) && !(gy >= 6.5 && gy < 7.5))
                return 0; // vidro da janela (buraco)
            double f = 0.9 + 0.14 * rnd(x, y, S, 81);
            boolean frame = gx < 2 || gx > 14 || gy < 2;
            if (frame) f *= 0.72;
            else if (((int) gx) % 4 == 1 && (gy >= 10.5 || gy < 3.5)) f *= 0.82;
            return mul(doorC, f);
        });
        set(t, Block.DOOR_TEX_LOWER, doorLower, doorLower, doorLower);
        set(t, Block.DOOR_TEX_UPPER, doorUpper, doorUpper, doorUpper);
        int[] birchDoorLower = birchWood(S, doorLower), birchDoorUpper = birchWood(S, doorUpper);
        set(t, Block.BIRCH_DOOR_TEX_LOWER, birchDoorLower, birchDoorLower, birchDoorLower);
        set(t, Block.BIRCH_DOOR_TEX_UPPER, birchDoorUpper, birchDoorUpper, birchDoorUpper);
        set(t, Block.AIR, stone, stone, stone);
        set(t, Block.GRASS, grassSide, grassTop, dirt);
        set(t, Block.DIRT, dirt, dirt, dirt);
        set(t, Block.STONE, stone, stone, stone);
        set(t, Block.COBBLE, cobble, cobble, cobble);
        set(t, Block.SAND, sand, sand, sand);
        set(t, Block.LOG, logSide, logTop, logTop);
        set(t, Block.LEAVES, leaves, leaves, leaves);
        set(t, Block.PLANKS, planks, planks, planks);
        // tábuas de bétula: o mesmo desenho, com a madeira clara e amarelada da bétula
        int[] birchPlanks = make(S, (gx, gy, x, y) -> {
            int c = planksF[y * S + x];
            double l = (((c >> 16) & 255) * 0.30 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 130.0;
            return mul(rgb(214, 192, 136), l);
        });
        set(t, Block.BIRCH_PLANKS, birchPlanks, birchPlanks, birchPlanks);
        set(t, Block.BRICK, brick, brick, brick);
        set(t, Block.SNOW, snow, snow, snow);
        set(t, Block.WATER, water, water, water);
        return t;
    }

    /** Minério: a textura da pedra com manchas coloridas. */
    private static int[] ore(int S, int[] stone, int color, int seed) {
        final int n = 5;
        final double[] cx = new double[n], cy = new double[n];
        for (int i = 0; i < n; i++) {
            cx[i] = 2.5 + World.hash(i, 0, seed) * 11;
            cy[i] = 2.5 + World.hash(i, 1, seed) * 11;
        }
        return make(S, (gx, gy, x, y) -> {
            for (int i = 0; i < n; i++) {
                double dx = gx - cx[i], dy = gy - cy[i];
                double d = Math.sqrt(dx * dx * 1.3 + dy * dy);
                if (d < 1.8) {
                    double f = 0.85 + 0.3 * rnd(x, y, S, seed + i);
                    if (dx + dy < -0.6) f *= 1.2; // brilho
                    return mul(color, f);
                }
            }
            return stone[y * S + x];
        });
    }

    /** Muda: um caule fino com um tufo de folhas. */
    private static int[] sapling(int S, int leaf, int trunk) {
        return make(S, (gx, gy, x, y) -> {
            if (gx >= 7.4 && gx < 8.6 && gy >= 8) return mul(trunk, 0.9 + 0.2 * rnd(x, y, S, 105));
            double dx = gx - 8, dy = gy - 6;
            double d = dx * dx / 16 + dy * dy / 12;
            if (d < 1 && World.hash(x * 16 / S, y * 16 / S, 106) > 0.22) return mul(leaf, 0.8 + 0.4 * rnd(x, y, S, 107));
            if (gy >= 10 && gy < 12 && Math.abs(dx) > 1 && Math.abs(dx) < 3.4) return mul(leaf, 0.95);
            return 0;
        });
    }

    /** Trigo: hastes que crescem a cada fase; na última ficam douradas, com as espigas em cima. */
    private static int[] wheat(int S, final int stage) {
        final int h = stage == 0 ? 5 : stage == 1 ? 9 : 13;
        final int stalk = stage == 2 ? rgb(204, 172, 62) : rgb(74, 150, 48), ear = rgb(230, 196, 74);
        return make(S, (gx, gy, x, y) -> {
            int col = (int) gx, row = (int) gy;
            int sc = col - col % 3 + 1; // coluna da haste deste trio
            int top = 16 - (h - (int) (World.hash(sc, stage, 120) * 3));
            if (row < top) return 0;
            double f = 0.86 + 0.28 * rnd(x, y, S, 121);
            if (col == sc) return mul(stage == 2 && row < top + 4 ? ear : stalk, f);
            if (stage == 2 && row < top + 4 && (row - top) % 2 == 1) return mul(ear, f * 0.9);   // grãos
            if (stage == 1 && row == top + 3 && col == sc - 1) return mul(stalk, f * 0.9);       // folhinha
            return 0;
        });
    }

    private static int[] flower(int S, int petal, int center) {
        return make(S, (gx, gy, x, y) -> {
            double dx = gx - 8, dy = gy - 6;
            double d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1.1) return center;
            if (d < 2.8) return mul(petal, 0.9 + 0.2 * rnd(x, y, S, 70));
            if (gx >= 7.5 && gx < 8.6 && gy >= 8) return rgb(70, 130, 45);
            if (gy >= 11 && gy < 12.5 && gx >= 8.6 && gx < 10.8) return rgb(80, 150, 50);
            return 0;
        });
    }

    private static int[] metalBlock(int S, int c) {
        return make(S, (gx, gy, x, y) -> {
            double f = 0.95 + 0.06 * rnd(x, y, S, 71);
            if (gx < 1 || gy < 1) f *= 1.15;
            else if (gx > 15 || gy > 15) f *= 0.7;
            else if (Math.abs(gx - gy) < 0.6 && gx > 3 && gx < 7) f *= 1.2;
            return mul(c, f);
        });
    }

    private static int[] make(int S, Px p) {
        int[] r = new int[S * S];
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
                r[y * S + x] = p.at((x + 0.5) * 16.0 / S, (y + 0.5) * 16.0 / S, x, y);
        return r;
    }

    /** Ruído por pixel: mistura variação "grossa" (grade 16x16) com variação fina em texturas maiores. */
    private static double rnd(int x, int y, int S, int seed) {
        double coarse = World.hash(x * 16 / S, y * 16 / S, seed);
        if (S <= 16) return coarse;
        return coarse * 0.6 + World.hash(x, y, seed + 1000 * S) * 0.4;
    }

    private static void set(int[][] t, int b, int[] side, int[] top, int[] bottom) {
        t[b * 3] = side;
        t[b * 3 + 1] = top;
        t[b * 3 + 2] = bottom;
    }

    /** Ícone sempre a partir da textura de 16px da fonte atual (imagens ou geradas). */
    private static BufferedImage image16(int[] t, double shade) {
        BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
        for (int i = 0; i < 256; i++) {
            int c = t[i];
            img.setRGB(i & 15, i >> 4, (c >>> 24) == 0 ? 0 : mul(c, shade));
        }
        return img;
    }

    private static final BufferedImage[] CUBES = new BufferedImage[Block.COUNT];

    /**
     * Ícone isométrico 64x64 do bloco (barra, inventário). Desenha cada caixa do bloco com as faces
     * visíveis (topo, frente +Z e direita +X), da mais distante para a mais próxima — assim escadas
     * e lajes aparecem com o formato certo. A porta vira uma figura plana das duas metades.
     */
    static synchronized BufferedImage cube(int b) {
        if (CUBES[b] != null) return CUBES[b];
        int[][] t16 = get(16);
        int s = 64;
        BufferedImage img = new BufferedImage(s, s, BufferedImage.TYPE_INT_ARGB);
        java.awt.Graphics2D g = img.createGraphics();
        g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                java.awt.RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
        if (Block.isDoor(b)) {
            // porta: as duas metades de frente, uma sobre a outra
            int wood = Block.doorWood(b);
            g.drawImage(image16(t16[Block.doorTexUpper(wood) * 6 + 4], 1.0), 16, 0, 32, 32, null);
            g.drawImage(image16(t16[Block.doorTexLower(wood) * 6 + 4], 1.0), 16, 32, 32, 32, null);
        } else {
            float[][] boxes = Block.boxes(b);
            if (boxes == null) boxes = new float[][] { { 0, 0, 0, 1, 1, 1 } };
            boxes = boxes.clone();
            // de trás para a frente (o observador está do lado +X, +Z, em cima)
            java.util.Arrays.sort(boxes, (p, q) -> Float.compare(p[0] + p[2] + p[1] * 0.5f, q[0] + q[2] + q[1] * 0.5f));
            for (float[] c : boxes) {
                face(g, t16[b * 6 + 2], 1.0, c, 2, s);
                face(g, t16[b * 6 + 4], 0.78, c, 4, s);
                face(g, t16[b * 6], 0.58, c, 0, s);
            }
        }
        g.dispose();
        CUBES[b] = img;
        return img;
    }

    /** Projeção isométrica do ponto (x,y,z) do bloco (0..1) no ícone de tamanho s. */
    private static double[] iso(double x, double y, double z, int s) {
        return new double[] { s / 2.0 + (x - z) * s / 2.0, (x + z) * s / 4.0 + (1 - y) * s / 2.0 };
    }

    /** Desenha a parte da textura que cabe na face da caixa c (face 2 topo, 4 frente +Z, 0 direita +X). */
    private static void face(java.awt.Graphics2D g, int[] tex, double shade, float[] c, int f, int s) {
        float x0 = c[0], y0 = c[1], z0 = c[2], x1 = c[3], y1 = c[4], z1 = c[5];
        int cx0, cy0, cx1, cy1; // recorte da textura (em pixels de 16)
        double[] o, pu, pv;     // canto superior esquerdo do recorte e os vizinhos na direção u e v
        if (f == 2) {           // topo: u = x, v da textura cresce com z
            cx0 = Math.round(x0 * 16); cx1 = Math.round(x1 * 16); cy0 = Math.round(z0 * 16); cy1 = Math.round(z1 * 16);
            o = iso(x0, y1, z0, s); pu = iso(x1, y1, z0, s); pv = iso(x0, y1, z1, s);
        } else if (f == 4) {    // frente (+Z): u = x, linha 0 da textura em cima
            cx0 = Math.round(x0 * 16); cx1 = Math.round(x1 * 16); cy0 = Math.round((1 - y1) * 16); cy1 = Math.round((1 - y0) * 16);
            o = iso(x0, y1, z1, s); pu = iso(x1, y1, z1, s); pv = iso(x0, y0, z1, s);
        } else {                // direita (+X): u = 1 - z
            cx0 = Math.round((1 - z1) * 16); cx1 = Math.round((1 - z0) * 16); cy0 = Math.round((1 - y1) * 16); cy1 = Math.round((1 - y0) * 16);
            o = iso(x1, y1, z1, s); pu = iso(x1, y1, z0, s); pv = iso(x1, y0, z1, s);
        }
        int w = cx1 - cx0, h = cy1 - cy0;
        if (w <= 0 || h <= 0) return;
        BufferedImage sub = image16(tex, shade).getSubimage(cx0, cy0, w, h);
        g.drawImage(sub, new java.awt.geom.AffineTransform((pu[0] - o[0]) / w, (pu[1] - o[1]) / w,
                (pv[0] - o[0]) / h, (pv[1] - o[1]) / h, o[0], o[1]), null);
    }

    static int rgb(int r, int g, int b) {
        return 0xFF000000 | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
    }

    static int mul(int c, double f) {
        return rgb((int) (((c >> 16) & 255) * f), (int) (((c >> 8) & 255) * f), (int) ((c & 255) * f));
    }

    private static int mixRgb(int a, int b, double k) {
        return rgb((int) (((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k),
                (int) (((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k),
                (int) ((a & 255) + ((b & 255) - (a & 255)) * k));
    }

    private static int clamp(int v) {
        return v < 0 ? 0 : (v > 255 ? 255 : v);
    }

    private Textures() {}

    /** A mesma madeira na cor da bétula (clara e amarelada); metal e vidro, sem cor, ficam como estão. */
    private static int[] birchWood(int S, int[] src) {
        int[] out = new int[src.length];
        for (int k = 0; k < src.length; k++) {
            int c = src[k], a = c >>> 24, r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
            int mx = Math.max(r, Math.max(g, b)), mn = Math.min(r, Math.min(g, b));
            if (a == 0 || mx - mn < 24) { out[k] = c; continue; } // transparente ou cinza (vidro, ferragem)
            double l = (r * 0.30 + g * 0.59 + b * 0.11) / 120.0;
            int nr = (int) Math.min(255, 206 * l), ng = (int) Math.min(255, 186 * l), nb = (int) Math.min(255, 128 * l);
            out[k] = a << 24 | nr << 16 | ng << 8 | nb;
        }
        return out;
    }

}
