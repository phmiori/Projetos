import java.util.HashMap;
import java.util.Map;

/**
 * Mão em primeira pessoa, em 3D: o braço do personagem (manga da camisa + mão) e o que ele segura.
 * Blocos viram um cubo pequeno com as texturas de verdade; itens, plantas e tocha viram a figura
 * de 16x16 com espessura (cada pixel é uma pecinha). Tudo em coordenadas da câmera
 * (x direita, y cima, a câmera olha para -z) e desenhado por cima da cena.
 */
final class Hand {
    /** Modelos dos itens, no espaço do próprio item (centrado na origem, tamanho 1): x,y,z,r,g,b. */
    private static final Map<Integer, float[]> MODELS = new HashMap<>();

    private static final Map<Integer, float[]> DROP_MODELS = new HashMap<>();

    static synchronized void reload() {
        MODELS.clear();
        DROP_MODELS.clear();
        TOOL_MODELS.clear();
    }

    /**
     * Modelo leve para os itens soltos no chão: nos blocos, 4x4 quadradinhos por face em vez de 16x16
     * (16 vezes menos triângulos; numa miniatura girando não se nota). Os outros itens usam o modelo normal.
     */
    static synchronized float[] dropModel(int item) {
        if (!isCubeItem(item)) return model(item);
        float[] m = DROP_MODELS.get(item);
        if (m == null) {
            m = cubeModel(item, 4);
            DROP_MODELS.put(item, m);
        }
        return m;
    }

    /** Escreve os triângulos (x,y,z,r,g,b) do braço e do item em out. Retorna quantos floats escreveu. */
    static float[] build(float[] out, int[] count, Persona persona, int item, double walkDist, double swing, double light, double charge) {
        // arco: a figura muda conforme a corda é puxada (charge 0..1; 0 = solto)
        float[] m = item <= 0 ? null : item == Items.BOW ? bowModel(charge <= 0 ? 0 : 1 + Math.min(2, (int) (charge * 3)))
                : Items.isTool(item) ? toolModel(item) : model(item);
        int need = 2 * 36 * 6 + (m != null ? m.length : 0);
        if (out.length < need) out = new float[need + 1024];
        int o = 0;

        // animação: balanço ao andar e golpe ao bater/quebrar/colocar
        double phase = walkDist * 2.4;
        double bobX = Math.sin(phase) * 0.025, bobY = -Math.abs(Math.cos(phase)) * 0.03;
        double sw = swing > 0 ? Math.sin((1 - swing / 0.3) * Math.PI) : 0;
        double[] arm = Tf.identity();
        arm = Tf.mul(arm, Tf.translate(0.5 + bobX - sw * 0.12, -0.52 + bobY - sw * 0.08, -0.38 - sw * 0.16));
        arm = Tf.mul(arm, Tf.rotY(0.32 + sw * 0.3));
        arm = Tf.mul(arm, Tf.rotX(0.14 - sw * 0.9));

        int shirt = Persona.SHIRT[persona.shirt], skin = Persona.SKIN[persona.skin];
        o = box(out, o, arm, -0.1, -0.1, -0.48, 0.1, 0.1, 0.0, shirt, light);   // manga
        o = box(out, o, arm, -0.095, -0.095, -0.72, 0.095, 0.095, -0.48, skin, light); // mão

        if (item > 0) {
            double[] t;
            if (item == Items.BOW) {
                // arco: em pé na frente da mão; ao puxar, vem para o meio da tela e treme quando está no máximo
                double c = Math.max(0, Math.min(1, charge));
                double shake = c >= 1 ? Math.sin(System.nanoTime() / 2.5e7) * 0.004 : 0;
                t = Tf.mul(arm, Tf.translate(-0.06 - c * 0.17 + shake, 0.26 + c * 0.03, -0.66 + c * 0.07));
                t = Tf.mul(t, Tf.rotY(0.35 - c * 0.3));
                t = Tf.mul(t, Tf.rotX(-0.15));
                t = Tf.mul(t, Tf.scale(0.62));
            } else if (Items.isBlock(item) && Block.shape(item) != Block.CROSS) {
                t = Tf.mul(arm, Tf.translate(-0.02, 0.18, -0.64));
                t = Tf.mul(t, Tf.rotY(0.75));
                t = Tf.mul(t, Tf.scale(0.27));
            } else if (!Items.isTool(item)) {
                // tocha, flores, comida: em pé na mão, de frente para a câmera
                t = Tf.mul(arm, Tf.translate(-0.04, 0.24, -0.66));
                t = Tf.mul(t, Tf.rotY(0.35));
                t = Tf.mul(t, Tf.rotX(-0.15));
                t = Tf.mul(t, Tf.scale(0.55));
            } else {
                // ferramenta: o cabo (canto de baixo à esquerda do desenho) fica dentro da mão,
                // e a ponta sobe para a esquerda, em direção ao centro da tela, inclinada para longe
                // empunhada: o cabo atravessa o punho fechado (o pomo sobra embaixo da mão) e a figura
                // fica no plano do braço, com a ponta para a frente e para cima
                t = Tf.mul(arm, Tf.translate(0, 0.0, -0.6));          // centro do punho
                t = Tf.mul(t, Tf.rotY(-Math.PI / 2 + 0.8));           // de lado, meio virada para a câmera
                t = Tf.mul(t, Tf.rotZ(Math.PI / 2 - 0.5));            // inclinação para a frente
                t = Tf.mul(t, Tf.scale(0.7));
                t = Tf.mul(t, Tf.translate(0.28, 0.28, 0));           // ponto do cabo que fica dentro da mão
            }
            // tocha e lava brilham sozinhas
            double itemLight = Items.isBlock(item) && Block.light(item) > 0 ? 1.0 : light;
            for (int i = 0; i < m.length; i += 6) {
                double x = m[i], y = m[i + 1], z = m[i + 2];
                out[o++] = (float) (t[0] * x + t[1] * y + t[2] * z + t[3]);
                out[o++] = (float) (t[4] * x + t[5] * y + t[6] * z + t[7]);
                out[o++] = (float) (t[8] * x + t[9] * y + t[10] * z + t[11]);
                out[o++] = (float) (m[i + 3] * itemLight);
                out[o++] = (float) (m[i + 4] * itemLight);
                out[o++] = (float) (m[i + 5] * itemLight);
            }
        }
        count[0] = o / 6;
        return out;
    }

    // ------------------------------------------------------------------ modelos

    /** Modelo 3D do item (centrado na origem, tamanho 1): x,y,z,r,g,b. Usado também na mão dos outros jogadores. */
    static float[] itemModel(int item) {
        return model(item);
    }

    /** Arco na fase de puxada dada (0 a 3), guardado junto dos outros modelos com chave negativa. */
    private static synchronized float[] bowModel(int stage) {
        float[] m = MODELS.get(-1 - stage);
        if (m == null) {
            m = flatModel(Items.bowPixels(stage));
            MODELS.put(-1 - stage, m);
        }
        return m;
    }

    private static final Map<Integer, float[]> TOOL_MODELS = new HashMap<>();

    /** Ferramenta em 3D para a mão em primeira pessoa: bem mais grossa, com as laterais sombreadas. */
    private static synchronized float[] toolModel(int item) {
        float[] m = TOOL_MODELS.get(item);
        if (m == null) {
            m = flatModel(Items.pixels16(item), 3.0);
            TOOL_MODELS.put(item, m);
        }
        return m;
    }

    /** O item é um bloco desenhado como cubo (e não uma figura plana)? */
    static boolean isCubeItem(int item) {
        return Items.isBlock(item) && Block.shape(item) != Block.CROSS && !Block.isDoor(item);
    }

    private static synchronized float[] model(int item) {
        float[] m = MODELS.get(item);
        if (m == null) {
            if (Items.isBlock(item) && Block.isDoor(item)) m = flatModel(doorPixels());
            else m = Items.isBlock(item) && Block.shape(item) != Block.CROSS ? cubeModel(item, 16) : flatModel(Items.pixels16(item));
            MODELS.put(item, m);
        }
        return m;
    }

    // faces na mesma ordem do mundo: +X, -X, +Y, -Y, +Z, -Z (normal, direita e cima vistos de fora)
    private static final int[][] N = { { 1, 0, 0 }, { -1, 0, 0 }, { 0, 1, 0 }, { 0, -1, 0 }, { 0, 0, 1 }, { 0, 0, -1 } };
    private static final int[][] R = { { 0, 0, -1 }, { 0, 0, 1 }, { 1, 0, 0 }, { 1, 0, 0 }, { 1, 0, 0 }, { -1, 0, 0 } };
    private static final int[][] U = { { 0, 1, 0 }, { 0, 1, 0 }, { 0, 0, -1 }, { 0, 0, 1 }, { 0, 1, 0 }, { 0, 1, 0 } };
    private static final double[] FACE_SHADE = { 0.8, 0.8, 1.0, 0.5, 0.65, 0.65 };

    /**
     * O bloco com as texturas de verdade, um quadradinho colorido por pixel. Para escadas e lajes,
     * cada caixa do formato recebe só a parte da textura que lhe cabe (como no mundo).
     */
    private static float[] cubeModel(int b, int res) {
        final int cell = 16 / res; // pixels da textura por quadradinho
        int[][] tex = Textures.get(16);
        float[][] boxes = Block.boxes(b);
        if (boxes == null) boxes = new float[][] { { 0, 0, 0, 1, 1, 1 } };
        float[] buf = new float[boxes.length * 6 * res * res * 36];
        int o = 0;
        for (float[] box : boxes)
            for (int f = 0; f < 6; f++) {
                int[] t = tex[b * 6 + f];
                int[] n = N[f], r = R[f], up = U[f];
                int na = axis(n), ra = axis(r), ua = axis(up);
                // faixa da textura (u, v de 0 a 1) que esta caixa ocupa nesta face
                double ua0 = 0.5 + (box[ra] - 0.5) * r[ra], ub0 = 0.5 + (box[ra + 3] - 0.5) * r[ra];
                double va0 = 0.5 + (box[ua] - 0.5) * up[ua], vb0 = 0.5 + (box[ua + 3] - 0.5) * up[ua];
                double uMin = Math.min(ua0, ub0), uMax = Math.max(ua0, ub0), vMin = Math.min(va0, vb0), vMax = Math.max(va0, vb0);
                double plane = n[na] > 0 ? box[na + 3] : box[na];
                for (int ty = 0; ty < res; ty++)
                    for (int tx = 0; tx < res; tx++) {
                        double u0 = tx / (double) res, u1 = (tx + 1) / (double) res, v0 = 1 - (ty + 1) / (double) res, v1 = 1 - ty / (double) res;
                        double uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
                        if (uc < uMin || uc > uMax || vc < vMin || vc > vMax) continue;
                        // cor média dos pixels opacos deste quadradinho
                        int n2 = 0, cr = 0, cg = 0, cb = 0;
                        for (int py = 0; py < cell; py++)
                            for (int px = 0; px < cell; px++) {
                                int p = t[(ty * cell + py) * 16 + tx * cell + px];
                                if ((p >>> 24) < 128) continue;
                                n2++; cr += (p >> 16) & 255; cg += (p >> 8) & 255; cb += p & 255;
                            }
                        if (n2 * 2 < cell * cell) continue;
                        int c = 0xFF000000 | (cr / n2) << 16 | (cg / n2) << 8 | (cb / n2);
                        double[][] q = { point(na, plane, ra, r, u0, ua, up, v0), point(na, plane, ra, r, u1, ua, up, v0),
                                point(na, plane, ra, r, u1, ua, up, v1), point(na, plane, ra, r, u0, ua, up, v1) };
                        o = quad(buf, o, q, c, FACE_SHADE[f]);
                    }
            }
        return java.util.Arrays.copyOf(buf, o);
    }

    private static int axis(int[] v) {
        return v[0] != 0 ? 0 : v[1] != 0 ? 1 : 2;
    }

    /** Ponto da face (coordenadas do bloco 0..1, centralizadas em 0) a partir de u, v da textura. */
    private static double[] point(int na, double plane, int ra, int[] r, double u, int ua, int[] up, double v) {
        double[] p = new double[3];
        p[na] = plane;
        p[ra] = 0.5 + (u - 0.5) * r[ra];
        p[ua] = 0.5 + (v - 0.5) * up[ua];
        return new double[] { p[0] - 0.5, p[1] - 0.5, p[2] - 0.5 };
    }

    /** Porta na mão: as duas metades lado a lado numa figura 16x16 (8 de largura, 16 de altura). */
    private static int[] doorPixels() {
        int[][] tex = Textures.get(16);
        int[] up = tex[Block.DOOR_TEX_UPPER * 6 + 4], low = tex[Block.DOOR_TEX_LOWER * 6 + 4];
        int[] px = new int[256];
        for (int y = 0; y < 16; y++)
            for (int x = 4; x < 12; x++) {
                int sx = (x - 4) * 2, sy = (y % 8) * 2;
                px[y * 16 + x] = (y < 8 ? up : low)[sy * 16 + sx];
            }
        return px;
    }

    /** Figura 16x16 com espessura de 1 pixel: frente, verso e as bordas onde o vizinho é transparente. */
    private static float[] flatModel(int[] px) { return flatModel(px, 0.5); }

    /** thick = espessura em "pixels" (1 = a figura tem a espessura de um pixel). */
    private static float[] flatModel(int[] px, double thick) {
        float[] buf = new float[256 * 6 * 6 * 6];
        int o = 0;
        double p = 1 / 16.0, th = p * thick / 2;
        for (int y = 0; y < 16; y++)
            for (int x = 0; x < 16; x++) {
                int c = px[y * 16 + x];
                if ((c >>> 24) < 128) continue;
                double x0 = x * p - 0.5, x1 = x0 + p, y1 = 0.5 - y * p, y0 = y1 - p;
                o = quad(buf, o, new double[][] { { x0, y0, th }, { x1, y0, th }, { x1, y1, th }, { x0, y1, th } }, c, 1.0);
                o = quad(buf, o, new double[][] { { x1, y0, -th }, { x0, y0, -th }, { x0, y1, -th }, { x1, y1, -th } }, c, 0.7);
                if (!opaque(px, x - 1, y))
                    o = quad(buf, o, new double[][] { { x0, y0, -th }, { x0, y0, th }, { x0, y1, th }, { x0, y1, -th } }, c, 0.8);
                if (!opaque(px, x + 1, y))
                    o = quad(buf, o, new double[][] { { x1, y0, th }, { x1, y0, -th }, { x1, y1, -th }, { x1, y1, th } }, c, 0.8);
                if (!opaque(px, x, y - 1))
                    o = quad(buf, o, new double[][] { { x0, y1, th }, { x1, y1, th }, { x1, y1, -th }, { x0, y1, -th } }, c, 0.95);
                if (!opaque(px, x, y + 1))
                    o = quad(buf, o, new double[][] { { x0, y0, -th }, { x1, y0, -th }, { x1, y0, th }, { x0, y0, th } }, c, 0.6);
            }
        return java.util.Arrays.copyOf(buf, o);
    }

    private static boolean opaque(int[] px, int x, int y) {
        return x >= 0 && y >= 0 && x < 16 && y < 16 && (px[y * 16 + x] >>> 24) >= 128;
    }

    private static int quad(float[] out, int o, double[][] q, int color, double shade) {
        float r = (float) (((color >> 16) & 255) / 255.0 * shade);
        float g = (float) (((color >> 8) & 255) / 255.0 * shade);
        float b = (float) ((color & 255) / 255.0 * shade);
        int[] order = { 0, 1, 2, 2, 3, 0 };
        for (int i : order) {
            out[o++] = (float) q[i][0]; out[o++] = (float) q[i][1]; out[o++] = (float) q[i][2];
            out[o++] = r; out[o++] = g; out[o++] = b;
        }
        return o;
    }

    /** Caixa transformada (braço). */
    private static int box(float[] out, int o, double[] t, double x0, double y0, double z0, double x1, double y1, double z1,
                           int color, double light) {
        double[][] c = new double[8][];
        for (int i = 0; i < 8; i++) {
            double x = (i & 1) == 0 ? x0 : x1, y = (i & 2) == 0 ? y0 : y1, z = (i & 4) == 0 ? z0 : z1;
            c[i] = new double[] { t[0] * x + t[1] * y + t[2] * z + t[3], t[4] * x + t[5] * y + t[6] * z + t[7],
                    t[8] * x + t[9] * y + t[10] * z + t[11] };
        }
        int[][] faces = { { 1, 3, 7, 5 }, { 0, 4, 6, 2 }, { 2, 6, 7, 3 }, { 0, 1, 5, 4 }, { 4, 5, 7, 6 }, { 0, 2, 3, 1 } };
        double[] shade = { 0.85, 0.6, 1.0, 0.5, 0.75, 0.75 };
        for (int f = 0; f < 6; f++) {
            int[] q = faces[f];
            o = quad(out, o, new double[][] { c[q[0]], c[q[1]], c[q[2]], c[q[3]] }, color, shade[f] * light);
        }
        return o;
    }

    /** Transformações 3x4 (linhas: [a b c tx; d e f ty; g h i tz]). */
    static final class Tf {
        static double[] identity() { return new double[] { 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0 }; }
        static double[] translate(double x, double y, double z) { return new double[] { 1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z }; }
        static double[] scale(double s) { return new double[] { s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0 }; }
        static double[] rotY(double a) {
            double c = Math.cos(a), s = Math.sin(a);
            return new double[] { c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0 };
        }
        static double[] rotX(double a) {
            double c = Math.cos(a), s = Math.sin(a);
            return new double[] { 1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0 };
        }
        static double[] rotZ(double a) {
            double c = Math.cos(a), s = Math.sin(a);
            return new double[] { c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0 };
        }
        /** a * b (aplica b primeiro). */
        static double[] mul(double[] a, double[] b) {
            double[] r = new double[12];
            for (int row = 0; row < 3; row++) {
                for (int col = 0; col < 3; col++)
                    r[row * 4 + col] = a[row * 4] * b[col] + a[row * 4 + 1] * b[4 + col] + a[row * 4 + 2] * b[8 + col];
                r[row * 4 + 3] = a[row * 4] * b[3] + a[row * 4 + 1] * b[7] + a[row * 4 + 2] * b[11] + a[row * 4 + 3];
            }
            return r;
        }
    }

    private Hand() {}
}
