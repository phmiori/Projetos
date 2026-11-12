/** Outro jogador no multijogador: posição recebida pela rede, desenho do boneco e nome. */
final class Remote {
    final int id;
    final String name;
    final Persona persona;
    Net.Connection conn;            // só no anfitrião: a conexão desse amigo
    final Player body = new Player(); // posição atual (também usada pelas criaturas como alvo)

    // estado alvo vindo da rede; o desenho desliza até ele para não "teleportar"
    double tx, ty, tz, tyaw, tpitch;
    double walk, swing, speed;
    int held;
    boolean hasState;

    Remote(int id, String name, Persona persona) {
        this.id = id;
        this.name = name;
        this.persona = persona;
    }

    void setTarget(double x, double y, double z, double yaw, double pitch, boolean swinging, int held) {
        tx = x; ty = y; tz = z; tyaw = yaw; tpitch = pitch;
        if (swinging && swing <= 0) swing = 0.3;
        this.held = held;
        if (!hasState) { body.x = x; body.y = y; body.z = z; body.yaw = yaw; hasState = true; }
    }

    void update(double dt) {
        double k = Math.min(1, dt * 12);
        double ox = body.x, oz = body.z;
        body.x += (tx - body.x) * k;
        body.y += (ty - body.y) * k;
        body.z += (tz - body.z) * k;
        double dy = Math.atan2(Math.sin(tyaw - body.yaw), Math.cos(tyaw - body.yaw));
        body.yaw += dy * k;
        body.pitch += (tpitch - body.pitch) * k;
        double moved = Math.sqrt((body.x - ox) * (body.x - ox) + (body.z - oz) * (body.z - oz));
        walk += moved;
        speed += ((dt > 0 ? moved / dt : 0) - speed) * Math.min(1, dt * 8);
        swing = Math.max(0, swing - dt);
    }

    // ------------------------------------------------------------------ modelo

    /** Um "pixel" do boneco: o corpo tem 32 de altura, como uma figura de 1,8 bloco. */
    private static final double P = 1.8 / 32;
    private static final int BOXES = 34;

    int modelFloats() {
        return BOXES * 36 * 6 + (held > 0 ? Hand.itemModel(held).length : 0);
    }

    /** Boneco do personagem com as cores escolhidas e o item na mão direita. Retorna o novo índice em out. */
    int writeModel(float[] out, int o, double light) {
        int skin = Persona.SKIN[persona.skin], hair = Persona.HAIR[persona.hair];
        int shirt = Persona.SHIRT[persona.shirt], pants = Persona.PANTS[persona.pants];
        int skinD = mul(skin, 0.82), shirtD = mul(shirt, 0.78), pantsD = mul(pants, 0.8), hairD = mul(hair, 0.8);
        int shoe = 0x3A2A1C, white = 0xF4F4F4, iris = 0x3B5BA8, mouth = mul(skin, 0.6);

        // balanço: pernas e braços vão e voltam ao andar (mais forte correndo); golpe no braço direito
        double amount = Math.min(1, speed / 4.0);
        double phase = walk * 2.6;
        double legSwing = Math.sin(phase) * 0.75 * amount;
        double sw = swing > 0 ? Math.sin((1 - swing / 0.3) * Math.PI) : 0;
        double rightArm = legSwing - sw * 1.6;           // o direito também dá o golpe
        double leftArm = -legSwing;
        if (held > 0 && sw == 0) rightArm = rightArm * 0.5 - 0.35; // segurando algo: braço um pouco para a frente

        double[] base = Hand.Tf.mul(Hand.Tf.translate(body.x, body.y, body.z), Hand.Tf.rotY(body.yaw));

        // pernas (x local +: esquerda do boneco; -: direita), com sapatos
        for (int side = -1; side <= 1; side += 2) {
            double a = side < 0 ? legSwing : -legSwing;
            double[] t = limb(base, side * 2 * P, 12 * P, a);
            o = box(out, o, t, -2 * P, -12 * P, -2 * P, 2 * P, 0.3 * P, 2 * P, side < 0 ? pants : pantsD, light);
            o = box(out, o, t, -2.05 * P, -12 * P, -2.3 * P, 2.05 * P, -10 * P, 2.05 * P, shoe, light);
        }
        // tronco: camisa, cinto, gola
        o = box(out, o, base, -4 * P, 12 * P, -2 * P, 4 * P, 24 * P, 2 * P, shirt, light);
        o = box(out, o, base, -4.05 * P, 12 * P, -2.05 * P, 4.05 * P, 13.2 * P, 2.05 * P, 0x3A2A20, light);
        o = box(out, o, base, -1.2 * P, 22.6 * P, 2.0 * P, 1.2 * P, 24 * P, 2.15 * P, skinD, light);
        o = box(out, o, base, -4.05 * P, 23.3 * P, -2.05 * P, 4.05 * P, 24.05 * P, 2.05 * P, shirtD, light);
        // braços: manga curta da camisa e o resto com a cor da pele
        double[] armR = limb(base, -6 * P, 22 * P, rightArm), armL = limb(base, 6 * P, 22 * P, leftArm);
        for (double[] t : new double[][] { armR, armL }) {
            o = box(out, o, t, -2 * P, -4 * P, -2 * P, 2 * P, 2 * P, 2 * P, shirt, light);
            o = box(out, o, t, -1.9 * P, -10 * P, -1.9 * P, 1.9 * P, -4 * P, 1.9 * P, skin, light);
            o = box(out, o, t, -1.95 * P, -10.6 * P, -1.95 * P, 1.95 * P, -9.4 * P, 1.95 * P, skinD, light);
        }
        // cabeça: gira com o olhar (para cima e para baixo)
        double[] head = Hand.Tf.mul(base, Hand.Tf.translate(0, 24 * P, 0));
        head = Hand.Tf.mul(head, Hand.Tf.rotX(-Math.max(-1.2, Math.min(1.2, body.pitch)) * 0.8));
        o = box(out, o, head, -4 * P, 0, -4 * P, 4 * P, 8 * P, 4 * P, skin, light);
        // cabelo: topo, nuca, laterais e franja
        o = box(out, o, head, -4.25 * P, 6.3 * P, -4.25 * P, 4.25 * P, 8.4 * P, 4.25 * P, hair, light);
        o = box(out, o, head, -4.25 * P, 2.5 * P, -4.25 * P, 4.25 * P, 6.4 * P, -3.2 * P, hairD, light);
        o = box(out, o, head, -4.25 * P, 4.5 * P, -4.25 * P, -3.4 * P, 6.4 * P, 2.5 * P, hairD, light);
        o = box(out, o, head, 3.4 * P, 4.5 * P, -4.25 * P, 4.25 * P, 6.4 * P, 2.5 * P, hairD, light);
        o = box(out, o, head, -4.25 * P, 5.6 * P, 3.6 * P, 1.5 * P, 6.4 * P, 4.25 * P, hair, light);
        // rosto (na frente, +z local)
        double f = 4 * P, f2 = 4.12 * P;
        for (int side = -1; side <= 1; side += 2) {
            double ex = side * 2 * P;
            o = box(out, o, head, ex - 1.1 * P, 3.4 * P, f, ex + 1.1 * P, 4.5 * P, f2, white, light);
            double ix = ex - side * 0.45 * P; // íris virada para o centro
            o = box(out, o, head, ix - 0.55 * P, 3.4 * P, f2 - 0.02 * P, ix + 0.55 * P, 4.5 * P, f2 + 0.06 * P, iris, light);
            o = box(out, o, head, ex - 1.2 * P, 4.9 * P, f, ex + 1.2 * P, 5.3 * P, f2, hairD, light); // sobrancelha
        }
        o = box(out, o, head, -0.6 * P, 2.4 * P, f, 0.6 * P, 3.4 * P, 4.5 * P, skinD, light);          // nariz
        o = box(out, o, head, -1.5 * P, 1.3 * P, f, 1.5 * P, 1.8 * P, f2, mouth, light);              // boca

        // item na mão direita
        if (held > 0 && Items.exists(held)) {
            double[] t = Hand.Tf.mul(armR, Hand.Tf.translate(0, -10 * P, 1.2 * P));
            if (Hand.isCubeItem(held)) {
                t = Hand.Tf.mul(t, Hand.Tf.translate(0, -0.1, 0.14));
                t = Hand.Tf.mul(t, Hand.Tf.rotY(0.6));
                t = Hand.Tf.mul(t, Hand.Tf.scale(0.36));
            } else {
                // figura plana quase de lado (meio virada para fora, para aparecer também de frente),
                // com o cabo na mão e a ponta para a frente e para cima
                t = Hand.Tf.mul(t, Hand.Tf.rotY(-Math.PI / 2 + 0.5));
                t = Hand.Tf.mul(t, Hand.Tf.scale(0.85));
                t = Hand.Tf.mul(t, Hand.Tf.translate(0.3, 0.3, 0));
            }
            boolean glow = Items.isBlock(held) && Block.light(held) > 0;
            float[] m = Hand.itemModel(held);
            for (int i = 0; i < m.length; i += 6) {
                double x = m[i], y = m[i + 1], z = m[i + 2];
                out[o++] = (float) (t[0] * x + t[1] * y + t[2] * z + t[3]);
                out[o++] = (float) (t[4] * x + t[5] * y + t[6] * z + t[7]);
                out[o++] = (float) (t[8] * x + t[9] * y + t[10] * z + t[11]);
                double l = glow ? 1 : light;
                out[o++] = (float) (m[i + 3] * l);
                out[o++] = (float) (m[i + 4] * l);
                out[o++] = (float) (m[i + 5] * l);
            }
        }
        return o;
    }

    /** Membro que gira no eixo x em volta do ombro/quadril (px, py) do corpo. */
    private static double[] limb(double[] base, double px, double py, double angle) {
        double[] t = Hand.Tf.mul(base, Hand.Tf.translate(px, py, 0));
        return Hand.Tf.mul(t, Hand.Tf.rotX(angle));
    }

    private static int mul(int c, double f) {
        int r = (int) Math.min(255, ((c >> 16) & 255) * f), g = (int) Math.min(255, ((c >> 8) & 255) * f),
                b = (int) Math.min(255, (c & 255) * f);
        return r << 16 | g << 8 | b;
    }

    private static final int[][] FACES = { { 1, 3, 7, 5 }, { 0, 4, 6, 2 }, { 2, 6, 7, 3 }, { 0, 1, 5, 4 }, { 4, 5, 7, 6 }, { 0, 2, 3, 1 } };
    private static final double[] SHADE = { 0.8, 0.8, 1.0, 0.55, 0.9, 0.65 };

    /** Caixa (x0..x1, y0..y1, z0..z1 no espaço de t) com sombreado por face. */
    private static int box(float[] out, int o, double[] t, double x0, double y0, double z0, double x1, double y1, double z1,
                           int color, double light) {
        double[][] c = new double[8][];
        for (int i = 0; i < 8; i++) {
            double x = (i & 1) == 0 ? x0 : x1, y = (i & 2) == 0 ? y0 : y1, z = (i & 4) == 0 ? z0 : z1;
            c[i] = new double[] { t[0] * x + t[1] * y + t[2] * z + t[3], t[4] * x + t[5] * y + t[6] * z + t[7],
                    t[8] * x + t[9] * y + t[10] * z + t[11] };
        }
        for (int f = 0; f < 6; f++) {
            double l = SHADE[f] * light;
            float r = (float) (((color >> 16) & 255) / 255.0 * l), g = (float) (((color >> 8) & 255) / 255.0 * l),
                    b = (float) ((color & 255) / 255.0 * l);
            int[] q = FACES[f];
            for (int k : new int[] { q[0], q[1], q[2], q[2], q[3], q[0] }) {
                out[o++] = (float) c[k][0]; out[o++] = (float) c[k][1]; out[o++] = (float) c[k][2];
                out[o++] = r; out[o++] = g; out[o++] = b;
            }
        }
        return o;
    }

    /** Estado salvo do amigo no mundo do anfitrião: x;y;z;yaw;pitch;vida;fome;inventário. */
    static String stateString(double x, double y, double z, double yaw, double pitch, double health, double food, String inv) {
        return x + ";" + y + ";" + z + ";" + yaw + ";" + pitch + ";" + health + ";" + food + ";" + inv;
    }
}
