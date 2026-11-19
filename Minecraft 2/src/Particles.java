import java.util.Random;

/**
 * Partículas: pedacinhos coloridos que saltam de um bloco ao ser batido ou quebrado, e a fumaça das
 * explosões. São quadradinhos virados para a câmera, guardados em vetores fixos (sem criar objetos).
 */
final class Particles {
    private static final int MAX = 1500;
    private final float[] x = new float[MAX], y = new float[MAX], z = new float[MAX];
    private final float[] vx = new float[MAX], vy = new float[MAX], vz = new float[MAX];
    private final float[] life = new float[MAX], size = new float[MAX], gravity = new float[MAX];
    private final int[] color = new int[MAX];
    private int count;
    private final Random rnd = new Random();

    void clear() {
        count = 0;
    }

    private void add(double px, double py, double pz, double ax, double ay, double az, double seconds, double s, double g, int rgb) {
        int i = count < MAX ? count++ : rnd.nextInt(MAX); // cheio: troca uma qualquer
        x[i] = (float) px; y[i] = (float) py; z[i] = (float) pz;
        vx[i] = (float) ax; vy[i] = (float) ay; vz[i] = (float) az;
        life[i] = (float) seconds; size[i] = (float) s; gravity[i] = (float) g; color[i] = rgb;
    }

    /** Pedaços do bloco (cores tiradas da textura dele) saltando da célula. */
    void blockBits(int block, int bx, int by, int bz, int n) {
        int[] tex = Textures.get(16)[Block.texture(block) * 6 + 4];
        for (int k = 0; k < n; k++) {
            int c = 0;
            for (int tries = 0; tries < 6 && (c >>> 24) < 128; tries++) c = tex[rnd.nextInt(tex.length)];
            if ((c >>> 24) < 128) continue;
            double px = bx + rnd.nextDouble(), py = by + rnd.nextDouble(), pz = bz + rnd.nextDouble();
            add(px, py, pz, (px - bx - 0.5) * 3 + (rnd.nextDouble() - 0.5), 1.5 + rnd.nextDouble() * 2.5, (pz - bz - 0.5) * 3 + (rnd.nextDouble() - 0.5),
                    0.4 + rnd.nextDouble() * 0.5, 0.05 + rnd.nextDouble() * 0.05, 18, c & 0xFFFFFF);
        }
    }

    /** Sangue da mordida do tubarão: gotas vermelhas de vários tons que se espalham e afundam devagar na água. */
    void blood(double px, double py, double pz) {
        int[] tones = { 0x8A0E0E, 0xB01818, 0x6A0808, 0xC42A20 };
        for (int k = 0; k < 22; k++)
            add(px + (rnd.nextDouble() - 0.5) * 0.5, py + (rnd.nextDouble() - 0.5) * 0.5, pz + (rnd.nextDouble() - 0.5) * 0.5,
                    (rnd.nextDouble() - 0.5) * 2.4, (rnd.nextDouble() - 0.3) * 1.6, (rnd.nextDouble() - 0.5) * 2.4,
                    0.8 + rnd.nextDouble() * 0.9, 0.06 + rnd.nextDouble() * 0.07, 2.5, tones[rnd.nextInt(tones.length)]);
    }

    /** Respingos de uma cor só (flecha acertando uma criatura). */
    void hitBits(double px, double py, double pz, int rgb, int n) {
        for (int k = 0; k < n; k++)
            add(px + (rnd.nextDouble() - 0.5) * 0.3, py + (rnd.nextDouble() - 0.5) * 0.3, pz + (rnd.nextDouble() - 0.5) * 0.3,
                    (rnd.nextDouble() - 0.5) * 3.5, 1 + rnd.nextDouble() * 2.5, (rnd.nextDouble() - 0.5) * 3.5,
                    0.3 + rnd.nextDouble() * 0.4, 0.04 + rnd.nextDouble() * 0.04, 18, rgb);
    }

    /** Fumaça e fagulhas de uma explosão. */
    void explosion(double px, double py, double pz, double power) {
        int n = (int) (power * 45);
        for (int k = 0; k < n; k++) {
            double a = rnd.nextDouble() * Math.PI * 2, b = (rnd.nextDouble() - 0.5) * Math.PI, sp = 1 + rnd.nextDouble() * power * 2.5;
            double dx = Math.cos(a) * Math.cos(b), dy = Math.sin(b), dz = Math.sin(a) * Math.cos(b);
            boolean spark = rnd.nextInt(4) == 0;
            int grey = 60 + rnd.nextInt(140);
            int c = spark ? (0xFF0000 | (120 + rnd.nextInt(120)) << 8 | 0x20) : (grey << 16 | grey << 8 | grey);
            add(px + dx * 0.5, py + dy * 0.5, pz + dz * 0.5, dx * sp, dy * sp + 1, dz * sp,
                    0.5 + rnd.nextDouble() * 1.1, spark ? 0.08 : 0.16 + rnd.nextDouble() * 0.2, spark ? 9 : -1.2, c);
        }
    }

    /** Fumacinha subindo (pavio aceso). */
    void smoke(double px, double py, double pz) {
        int grey = 150 + rnd.nextInt(90);
        add(px + (rnd.nextDouble() - 0.5) * 0.3, py, pz + (rnd.nextDouble() - 0.5) * 0.3, 0, 0.6, 0, 0.7, 0.08, -1.0, grey << 16 | grey << 8 | grey);
    }

    void update(double dt, World w) {
        float d = (float) dt;
        for (int i = 0; i < count; i++) {
            life[i] -= d;
            if (life[i] <= 0) { // tira trocando com a última
                int l = --count;
                x[i] = x[l]; y[i] = y[l]; z[i] = z[l]; vx[i] = vx[l]; vy[i] = vy[l]; vz[i] = vz[l];
                life[i] = life[l]; size[i] = size[l]; gravity[i] = gravity[l]; color[i] = color[l];
                i--;
                continue;
            }
            vy[i] -= gravity[i] * d;
            float nx = x[i] + vx[i] * d, ny = y[i] + vy[i] * d, nz = z[i] + vz[i] * d;
            if (Block.opaqueCube(w.get((int) Math.floor(nx), (int) Math.floor(ny), (int) Math.floor(nz)))) {
                vx[i] *= 0.3f; vz[i] *= 0.3f; vy[i] = 0; // bateu: para onde está
            } else {
                x[i] = nx; y[i] = ny; z[i] = nz;
            }
        }
    }

    /** Acrescenta os quadradinhos (de frente para a câmera) aos triângulos de criaturas em r. */
    void buildMesh(GLRenderer r, World w, Player cam) {
        if (count == 0) return;
        int o = r.entityVertCount * 6, need = o + count * 36;
        if (r.entityVerts.length < need) r.entityVerts = java.util.Arrays.copyOf(r.entityVerts, need + 4096);
        float[] out = r.entityVerts;
        // direita e cima da câmera
        double cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
        float rx = (float) -cy, rz = (float) sy, ux = (float) (-sp * sy), uy = (float) cp, uz = (float) (-sp * cy);
        double daylight = w.daylight();
        for (int i = 0; i < count; i++) {
            int bx = (int) Math.floor(x[i]), by = (int) Math.floor(y[i]), bz = (int) Math.floor(z[i]);
            double sky = w.skyLight(bx, by, bz) / 15.0 * (0.13 + 0.87 * daylight);
            double blk = Math.pow(w.blockLightAt(bx, by, bz) / 15.0, 1.5);
            float light = (float) Math.min(1.0, Math.max(sky, blk) * 0.95 + 0.05);
            boolean spark = gravity[i] == 9;
            float l = spark ? 1 : light;
            float cr = ((color[i] >> 16) & 255) / 255f * l, cg = ((color[i] >> 8) & 255) / 255f * l, cb = (color[i] & 255) / 255f * l;
            float s = size[i] * Math.min(1, life[i] * 4); // encolhe no fim
            float ax = rx * s, az = rz * s, bx2 = ux * s, by2 = uy * s, bz2 = uz * s;
            float[][] c = QUAD;
            c[0][0] = x[i] - ax - bx2; c[0][1] = y[i] - by2; c[0][2] = z[i] - az - bz2;
            c[1][0] = x[i] + ax - bx2; c[1][1] = y[i] - by2; c[1][2] = z[i] + az - bz2;
            c[2][0] = x[i] + ax + bx2; c[2][1] = y[i] + by2; c[2][2] = z[i] + az + bz2;
            c[3][0] = x[i] - ax + bx2; c[3][1] = y[i] + by2; c[3][2] = z[i] - az + bz2;
            for (int t : TRI) {
                out[o++] = c[t][0]; out[o++] = c[t][1]; out[o++] = c[t][2];
                out[o++] = cr; out[o++] = cg; out[o++] = cb;
            }
        }
        r.entityVertCount = o / 6;
    }

    private static final float[][] QUAD = new float[4][3];
    private static final int[] TRI = { 0, 1, 2, 2, 3, 0 };
}
