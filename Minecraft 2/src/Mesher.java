/**
 * Monta a malha 3D de um pedaço (chunk) de 16 x 64 x 16 blocos.
 *
 * Só as faces visíveis entram. Cada vértice são três ints:
 *   a: posição em 1/16 de bloco — bits 0-8 x | 9-19 y | 20-28 z
 *   b: bits 0-9 camada da textura | 10-13 luz do céu | 14-17 luz de tocha | 18-21 marcas (1 brilha, 2 planta)
 *      | 22-25 superfície da água (0 cheia, 1..8 = nível 0..7)
 *   c: bits 0-4 u | 5-9 v (coordenada na textura, em 1/16) | 10-12 face | 13-14 oclusão | 15-16 canto
 * Faces 0-5 são as do cubo; 6 e 7 são os dois planos cruzados de plantas e tochas.
 * Blocos com formato (escadas, lajes, portas) são feitos de caixas; cada caixa tem suas faces.
 * Pode rodar em várias threads ao mesmo tempo (só lê o mundo).
 */
final class Mesher {
    static final int SIZE = 16;
    static final int INTS_PER_VERTEX = 3;
    static final int FLAG_EMISSIVE = 1, FLAG_PLANT = 2;

    /** Resultado: opacos (inclui folhas, vidro, plantas, lava e formatos) e água, separada porque é transparente. */
    static final class Mesh {
        final int cx, cz, version;
        final int[] opaque, water;
        final int opaqueCount, waterCount; // em ints (12 por face)

        Mesh(int cx, int cz, int version, IntList o, IntList w) {
            this.cx = cx;
            this.cz = cz;
            this.version = version;
            opaque = o.data;
            opaqueCount = o.size;
            water = w.data;
            waterCount = w.size;
        }
    }

    static final class IntList {
        int[] data = new int[12288];
        int size;

        void add(int a, int b, int c) {
            if (size + 3 > data.length) data = java.util.Arrays.copyOf(data, data.length * 2);
            data[size++] = a;
            data[size++] = b;
            data[size++] = c;
        }
    }

    // faces: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z  — normal, "direita" e "cima" vistos de fora (sentido anti-horário)
    static final int[][] N = { { 1, 0, 0 }, { -1, 0, 0 }, { 0, 1, 0 }, { 0, -1, 0 }, { 0, 0, 1 }, { 0, 0, -1 } };
    static final int[][] R = { { 0, 0, -1 }, { 0, 0, 1 }, { 1, 0, 0 }, { 1, 0, 0 }, { 1, 0, 0 }, { -1, 0, 0 } };
    static final int[][] U = { { 0, 1, 0 }, { 0, 1, 0 }, { 0, 0, -1 }, { 0, 0, 1 }, { 0, 1, 0 }, { 0, 1, 0 } };
    private static final int[] SR = { -1, 1, 1, -1 }, SU = { -1, -1, 1, 1 }; // cantos: inf-esq, inf-dir, sup-dir, sup-esq

    // planos cruzados: {x,z} dos cantos de baixo (esquerdo, direito) de cada lado
    private static final int[][][] CROSS = {
            { { 0, 0 }, { 1, 1 } }, { { 1, 1 }, { 0, 0 } },
            { { 1, 0 }, { 0, 1 } }, { { 0, 1 }, { 1, 0 } } };

    /** Monta a malha do pedaço (cx, cz), ou devolve null se algum dos 8 vizinhos ainda não está carregado. */
    static Mesh build(World w, int cx, int cz, int version) {
        Chunk[] nb = new Chunk[9];
        for (int dx = -1; dx <= 1; dx++)
            for (int dz = -1; dz <= 1; dz++) {
                Chunk c = w.chunk(cx + dx, cz + dz);
                if (c == null) return null;
                nb[(dx + 1) * 3 + dz + 1] = c;
            }
        final Region B = new Region(nb, cx, cz);
        final byte[] center = nb[4].blocks;
        IntList opaque = new IntList(), water = new IntList();
        int x0 = cx * SIZE, z0 = cz * SIZE;
        int[] occ = new int[4], sky = new int[4], blk = new int[4];
        int[] p0 = new int[3], p1 = new int[3];
        for (int lx = 0; lx < SIZE; lx++)
            for (int lz = 0; lz < SIZE; lz++) {
                int x = x0 + lx, z = z0 + lz;
                for (int y = 0; y < World.SY; y++) {
                    int b = center[Chunk.idx(lx, y, lz)] & 0xFF;
                    if (b == Block.AIR) continue;
                    int shape = Block.shape(b);
                    int flags = Block.light(b) > 0 && b != Block.TORCH && b != Block.FURNACE_LIT ? FLAG_EMISSIVE : 0;
                    int ox = lx * 16, oy = y * 16, oz = lz * 16; // canto do bloco, em 1/16

                    if (shape == Block.CROSS) {
                        int s = B.sky(x, y, z), l = B.blk(x, y, z);
                        int b2 = L(Block.texture(b) * 6 + 4) | s << 10 | l << 14 | FLAG_PLANT << 18;
                        // tocha na parede: base encostada na parede e topo inclinado para fora
                        int bdx = 0, bdz = 0, tdx = 0, tdz = 0, lift = 0;
                        if (Block.isWallTorch(b)) {
                            int f = Block.wallTorchFacing(b);
                            bdx = Block.DIR_X[f] * 7; bdz = Block.DIR_Z[f] * 7;
                            tdx = Block.DIR_X[f] * 3; tdz = Block.DIR_Z[f] * 3;
                            lift = 4;
                        }
                        for (int q = 0; q < 4; q++) {
                            int f = q < 2 ? 6 : 7;
                            int[] a = CROSS[q][0], c = CROSS[q][1];
                            opaque.add(pos(ox + a[0] * 16 + bdx, oy + lift, oz + a[1] * 16 + bdz), b2, uv(0, 0, f, 0, 0));
                            opaque.add(pos(ox + c[0] * 16 + bdx, oy + lift, oz + c[1] * 16 + bdz), b2, uv(16, 0, f, 0, 1));
                            opaque.add(pos(ox + c[0] * 16 + tdx, oy + 16 + lift, oz + c[1] * 16 + tdz), b2, uv(16, 16, f, 0, 2));
                            opaque.add(pos(ox + a[0] * 16 + tdx, oy + 16 + lift, oz + a[1] * 16 + tdz), b2, uv(0, 16, f, 0, 3));
                        }
                        continue;
                    }

                    if (shape == Block.MODEL) {
                        // escadas, lajes, portas: cada caixa com suas faces, luz da própria célula, sem oclusão
                        int s = B.sky(x, y, z), l = B.blk(x, y, z);
                        int mrot = Block.rotatable(b) ? w.rotation(x, y, z) : 0; // a cama
                        for (float[] box : Block.renderBoxes(w, x, y, z, b)) {
                            int texBlock = box.length > 6 ? (int) box[6] : b; // lajes empilhadas: textura de cada metade
                            p0[0] = Math.round(box[0] * 16); p0[1] = Math.round(box[1] * 16); p0[2] = Math.round(box[2] * 16);
                            p1[0] = Math.round(box[3] * 16); p1[1] = Math.round(box[4] * 16); p1[2] = Math.round(box[5] * 16);
                            for (int f = 0; f < 6; f++) {
                                int[] n = N[f];
                                int axis = n[0] != 0 ? 0 : n[1] != 0 ? 1 : 2;
                                boolean onEdge = n[axis] > 0 ? p1[axis] == 16 : p0[axis] == 0;
                                if (onEdge && Block.opaqueCube(B.at(x + n[0], y + n[1], z + n[2]))) continue;
                                int lf = mrot == 0 ? f : localFace(f, mrot);
                                int layer = texBlock * 6 + lf;
                                for (int k = 0; k < 4; k++) {
                                    int[] c = boxCorner(f, k, p0, p1);
                                    int[] r = R[lf], u = U[lf];
                                    if (mrot != 0) { // o canto, visto no desenho original do bloco
                                        int[] q = unrotate(c[0] - 8, c[2] - 8, mrot);
                                        c = new int[] { q[0] + 8, c[1], q[1] + 8 };
                                    }
                                    int tu = (c[0] - 8) * r[0] + (c[1] - 8) * r[1] + (c[2] - 8) * r[2] + 8;
                                    int tv = (c[0] - 8) * u[0] + (c[1] - 8) * u[1] + (c[2] - 8) * u[2] + 8;
                                    opaque.add(pos(ox + c[0], oy + c[1], oz + c[2]), L(layer) | s << 10 | l << 14, uv(tu, tv, f, 0, k));
                                }
                            }
                        }
                        continue;
                    }

                    int rot = Block.rotatable(b) ? w.rotation(x, y, z) : 0;
                    for (int f = 0; f < 6; f++) {
                        int[] n = N[f];
                        int nbk = B.at(x + n[0], y + n[1], z + n[2]);
                        if (!visible(b, nbk)) continue;
                        int[] r = R[f], u = U[f];
                        int fx = x + n[0], fy = y + n[1], fz = z + n[2];
                        for (int k = 0; k < 4; k++) {
                            int sr = SR[k], su = SU[k];
                            int ax = fx + sr * r[0], ay = fy + sr * r[1], az = fz + sr * r[2];
                            int bx = fx + su * u[0], by = fy + su * u[1], bz = fz + su * u[2];
                            int qx = ax + su * u[0], qy = ay + su * u[1], qz = az + su * u[2];
                            int s1 = B.occluder(ax, ay, az), s2 = B.occluder(bx, by, bz), c = B.occluder(qx, qy, qz);
                            occ[k] = (s1 == 1 && s2 == 1) ? 3 : s1 + s2 + c;
                            // luz suave: média das células livres que encostam no canto
                            int ns = B.sky(fx, fy, fz), nl = B.blk(fx, fy, fz), cnt = 1;
                            if (s1 == 0) { ns += B.sky(ax, ay, az); nl += B.blk(ax, ay, az); cnt++; }
                            if (s2 == 0) { ns += B.sky(bx, by, bz); nl += B.blk(bx, by, bz); cnt++; }
                            if (c == 0 && !(s1 == 1 && s2 == 1)) { ns += B.sky(qx, qy, qz); nl += B.blk(qx, qy, qz); cnt++; }
                            sky[k] = (ns + cnt / 2) / cnt;
                            blk[k] = (nl + cnt / 2) / cnt;
                        }
                        int layer = b * 6 + (rot == 0 ? f : localFace(f, rot)); // uma textura por face
                        IntList out = Block.isWater(b) ? water : opaque;
                        // altura da superfície da água: 0 = cheia (há água em cima), 1..8 = nível 0..7
                        int surface = 0;
                        if (Block.isWater(b) && !Block.isWater(B.at(x, y + 1, z))) surface = Block.waterLevel(b) + 1;
                        // escolhe a diagonal dos triângulos para a sombra dos cantos não ficar torta
                        int start = occ[0] + occ[2] > occ[1] + occ[3] ? 1 : 0;
                        for (int i = 0; i < 4; i++) {
                            int k = (start + i) & 3;
                            int px = (1 + n[0] + SR[k] * r[0] + SU[k] * u[0]) * 8;
                            int py = (1 + n[1] + SR[k] * r[1] + SU[k] * u[1]) * 8;
                            int pz = (1 + n[2] + SR[k] * r[2] + SU[k] * u[2]) * 8;
                            out.add(pos(ox + px, oy + py, oz + pz),
                                    L(layer) | sky[k] << 10 | blk[k] << 14 | flags << 18 | surface << 22,
                                    rot != 0 && (f == 2 || f == 3) ? topUv(f, k, rot, occ[k]) : uv(SR[k] > 0 ? 16 : 0, SU[k] > 0 ? 16 : 0, f, occ[k], k));
                        }
                    }
                }
            }
        return new Mesh(cx, cz, version, opaque, water);
    }

    /** Canto k da face f de uma caixa (em 1/16, relativo ao bloco). */
    private static int[] boxCorner(int f, int k, int[] p0, int[] p1) {
        int[] n = N[f], r = R[f], u = U[f];
        int[] c = new int[3];
        for (int i = 0; i < 3; i++) {
            int m = n[i] + SR[k] * r[i] + SU[k] * u[i]; // -1 ou +1 em cada eixo
            c[i] = m > 0 ? p1[i] : p0[i];
        }
        return c;
    }

    /** Direção (0 +Z, 1 -X, 2 -Z, 3 +X) de cada face lateral, e a face de cada direção. */
    private static final int[] FACE_DIR = { 3, 1, -1, -1, 0, 2 }, DIR_FACE = { 4, 1, 5, 0 };

    /** Qual face da textura aparece na face f de um bloco virado para rot (a frente da textura é a +Z). */
    private static int localFace(int f, int rot) {
        int d = FACE_DIR[f];
        return d < 0 ? f : DIR_FACE[(d - rot) & 3];
    }

    /** Ponto (x, z) em relação ao centro do bloco, desfeita a rotação rot: onde ele ficava na textura original. */
    private static int[] unrotate(int x, int z, int rot) {
        for (int i = 0; i < rot; i++) { int t = x; x = z; z = -t; }
        return new int[] { x, z };
    }

    /** Folga de 4 blocos (64/16) em x e z: algo pode sair um pouco do pedaço (tocha na parede da borda). */
    static final int POS_BIAS = 64;

    private static int pos(int x, int y, int z) {
        return (x + POS_BIAS) | y << 9 | (z + POS_BIAS) << 20;
    }

    /** Topo e base de um bloco virado: a textura gira junto. */
    private static int topUv(int f, int k, int rot, int occ) {
        int[] r = R[f], u = U[f];
        int cx = SR[k] * r[0] + SU[k] * u[0], cz = SR[k] * r[2] + SU[k] * u[2];
        int[] q = unrotate(cx, cz, rot);
        return uv(q[0] * r[0] + q[1] * r[2] > 0 ? 16 : 0, q[0] * u[0] + q[1] * u[2] > 0 ? 16 : 0, f, occ, k);
    }

    private static int uv(int u, int v, int face, int occ, int corner) {
        return u | v << 5 | face << 10 | occ << 13 | corner << 15;
    }

    private static boolean visible(int b, int nb) {
        if (nb == Block.AIR) return true;
        if (Block.isWater(b) && Block.isWater(nb)) // entre águas: só se a vizinha for mais rasa
            return Block.waterLevel(nb) > Block.waterLevel(b);
        int s = Block.shape(b), ns = Block.shape(nb);
        if (s == Block.LIQUID || s == Block.CUTOUT) return nb != b && ns != Block.CUBE;
        return ns != Block.CUBE;
    }

    /** O pedaço e seus 8 vizinhos: tudo o que a malha precisa ler, sem consultar o mundo a cada bloco. */
    private static final class Region {
        final Chunk[] c;
        final int cx, cz;

        Region(Chunk[] c, int cx, int cz) {
            this.c = c;
            this.cx = cx;
            this.cz = cz;
        }

        private Chunk of(int x, int z) {
            int dx = (x >> 4) - cx + 1, dz = (z >> 4) - cz + 1;
            if (dx < 0 || dx > 2 || dz < 0 || dz > 2) return null;
            return c[dx * 3 + dz];
        }

        /** Bloco vizinho; abaixo do mundo é rocha-mãe (não desenha o fundo). */
        int at(int x, int y, int z) {
            if (y < 0) return Block.BEDROCK;
            if (y >= World.SY) return Block.AIR;
            Chunk ch = of(x, z);
            if (ch == null) return Block.AIR;
            return ch.blocks[Chunk.idx(x & 15, y, z & 15)] & 0xFF;
        }

        /** Escurece os cantos: cubos e folhas/vidro contam; plantas, líquidos, formatos e ar não. */
        int occluder(int x, int y, int z) {
            if (y < 0 || y >= World.SY) return 0;
            Chunk ch = of(x, z);
            if (ch == null) return 0;
            int b = ch.blocks[Chunk.idx(x & 15, y, z & 15)] & 0xFF;
            if (b == Block.AIR) return 0;
            int s = Block.shape(b);
            return (s == Block.CUBE || s == Block.CUTOUT) ? 1 : 0;
        }

        int sky(int x, int y, int z) {
            if (y >= World.SY) return 15;
            Chunk ch = of(x, z);
            if (ch == null) return 15;
            int top = ch.skyTop[(x & 15) * 16 + (z & 15)];
            if (y > top) return 15;
            return Math.max(0, 15 - (top - y + 1) * 3);
        }

        int blk(int x, int y, int z) {
            if (y < 0 || y >= World.SY) return 0;
            Chunk ch = of(x, z);
            if (ch == null) return 0;
            return ch.light[Chunk.idx(x & 15, y, z & 15)];
        }
    }

    private Mesher() {}

    /** Camada de textura no vértice: 10 bits embaixo e o 11º no bit 26 (os bits 10..25 são luz, efeitos e água). */
    static int L(int layer) { return (layer & 1023) | (layer >> 10) << 26; }

}
