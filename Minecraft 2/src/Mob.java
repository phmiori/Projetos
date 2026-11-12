/** Criatura do mundo: animais pacíficos e monstros noturnos. */
final class Mob extends Entity {
    static final int PIG = 0, SHEEP = 1, CHICKEN = 2, ZOMBIE = 3, SPIDER = 4, FISH = 5;
    static final String[] NAMES = { "Porco", "Ovelha", "Galinha", "Morto-vivo", "Aranha", "Peixe" };
    private static final double[][] SIZE = { { 0.42, 0.95 }, { 0.42, 1.2 }, { 0.2, 0.75 }, { 0.3, 1.95 }, { 0.6, 0.8 }, { 0.2, 0.35 } };
    private static final double[] MAX_HP = { 10, 8, 4, 20, 16, 3 };
    private static final double[] SPEED = { 1.5, 1.3, 1.6, 2.7, 3.6, 1.5 };

    final int type;
    private static int nextId = 1;
    int id = nextId++; // identifica a criatura na rede
    double health, yaw, hurt, walk, aiTimer, dirX, dirZ, attackCd, flee, burn;
    double idleSound = 2 + Math.random() * 8; // segundos até o próximo som da criatura
    static final String[] SOUNDS = { "porco", "ovelha", "galinha", "morto_vivo", "aranha", null };
    boolean wantsAttack; // encostou no jogador e pode atacar neste quadro

    Mob(int type, double x, double y, double z) {
        super(SIZE[type][0], SIZE[type][1]);
        this.type = type;
        this.x = x; this.y = y; this.z = z;
        health = MAX_HP[type];
        yaw = Math.random() * Math.PI * 2;
    }

    boolean hostile() { return type == ZOMBIE || type == SPIDER; }

    double attackDamage() { return type == ZOMBIE ? 3 : 2; }

    void update(double dt, World w, Player p, boolean canTarget, java.util.Random r) {
        if (type == FISH) { swim(dt, w, p, r); return; }
        updateFluids(w);
        hurt -= dt;
        attackCd -= dt;
        aiTimer -= dt;
        flee -= dt;
        wantsAttack = false;

        double px = p.x - x, pz = p.z - z, py = p.y - y;
        double dist = Math.sqrt(px * px + pz * pz);
        double tx = 0, tz = 0, speed = SPEED[type];

        if (hostile() && canTarget && dist < 18 && Math.abs(py) < 8) {
            tx = px / Math.max(dist, 0.01);
            tz = pz / Math.max(dist, 0.01);
            double reach = type == SPIDER ? 1.5 : 1.3;
            if (dist < reach && Math.abs(py) < 1.7) {
                tx = tz = 0;
                if (attackCd <= 0) { wantsAttack = true; attackCd = 1.0; }
            }
        } else if (flee > 0) {
            tx = -px / Math.max(dist, 0.01);
            tz = -pz / Math.max(dist, 0.01);
            speed *= 1.9;
        } else {
            if (aiTimer <= 0) {
                aiTimer = 2 + r.nextDouble() * 4;
                if (r.nextDouble() < 0.4) { dirX = dirZ = 0; }
                else {
                    double a = r.nextDouble() * Math.PI * 2;
                    dirX = Math.sin(a);
                    dirZ = Math.cos(a);
                }
            }
            tx = dirX;
            tz = dirZ;
            speed *= 0.6;
        }

        if (tx != 0 || tz != 0) {
            double target = Math.atan2(tx, tz), diff = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
            yaw += diff * Math.min(1, dt * 8);
        }
        double k = Math.min(1, dt * (onGround || inWater ? 8 : 2));
        vx += (tx * speed - vx) * k;
        vz += (tz * speed - vz) * k;

        if (inWater || inLava) {
            vy += (2.2 - vy) * Math.min(1, dt * 3); // boia
        } else {
            vy -= 28 * dt;
            if (vy < -50) vy = -50;
        }
        if (hitWall && (tx != 0 || tz != 0)) {
            if (type == SPIDER) vy = 3.5;           // escala paredes
            else if (onGround || inWater) vy = 7.6; // pula um degrau (ou sai da água)
        }
        move(dt, w, false);
        walk += Math.sqrt(vx * vx + vz * vz) * dt;

        if (landedFall > 4) damage(Math.floor(landedFall - 3));
        landedFall = 0;
        if (inLava) damage(4 * dt);
    }

    private double dirY, outOfWater;

    /** Peixe: nada em 3D só dentro da água; fora dela cai, se debate e vai perdendo vida. */
    private void swim(double dt, World w, Player p, java.util.Random r) {
        hurt -= dt;
        aiTimer -= dt;
        flee -= dt;
        wantsAttack = false;
        boolean water = Block.isWater(w.get((int) Math.floor(x), (int) Math.floor(y + 0.15), (int) Math.floor(z)));
        inWater = water;
        if (water) {
            outOfWater = 0;
            if (flee > 0) { // foge do jogador
                double dx = x - p.x, dz = z - p.z, l = Math.max(0.01, Math.sqrt(dx * dx + dz * dz));
                dirX = dx / l; dirZ = dz / l; dirY = 0;
            } else if (aiTimer <= 0) {
                aiTimer = 1.5 + r.nextDouble() * 3;
                double a = r.nextDouble() * Math.PI * 2;
                dirX = Math.sin(a); dirZ = Math.cos(a); dirY = (r.nextDouble() - 0.5) * 0.6;
                if (r.nextDouble() < 0.25) { dirX = dirZ = dirY = 0; } // às vezes fica parado
            }
            // não sai da água: se o ponto à frente não for água, vira para o outro lado
            int ax = (int) Math.floor(x + dirX * 0.6), ay = (int) Math.floor(y + 0.15 + dirY * 0.6), az = (int) Math.floor(z + dirZ * 0.6);
            if ((dirX != 0 || dirZ != 0 || dirY != 0) && !Block.isWater(w.get(ax, ay, az))) {
                dirX = -dirX; dirZ = -dirZ; dirY = -dirY * 0.5;
                aiTimer = 0.8;
            }
            double speed = SPEED[FISH] * (flee > 0 ? 2.2 : 1);
            double k = Math.min(1, dt * 4);
            vx += (dirX * speed - vx) * k;
            vy += (dirY * speed - vy) * k;
            vz += (dirZ * speed - vz) * k;
            if (dirX != 0 || dirZ != 0) {
                double target = Math.atan2(dirX, dirZ), diff = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
                yaw += diff * Math.min(1, dt * 6);
            }
            move(dt, w, true);
        } else {
            vy -= 28 * dt;
            if (onGround && r.nextDouble() < dt * 3) { // debate
                vy = 4;
                vx = (r.nextDouble() - 0.5) * 3;
                vz = (r.nextDouble() - 0.5) * 3;
                yaw += (r.nextDouble() - 0.5) * 2;
            }
            vx *= Math.max(0, 1 - dt * 2);
            vz *= Math.max(0, 1 - dt * 2);
            move(dt, w, false);
            outOfWater += dt;
            if (outOfWater > 1) { outOfWater = 0; damage(1); }
        }
        landedFall = 0;
        walk += Math.sqrt(vx * vx + vz * vz) * dt * 3;
    }

    void damage(double d) {
        health -= d;
        hurt = 0.35;
        if (!hostile()) flee = 4;
    }

    /** Itens que a criatura deixa ao morrer: pares {item, quantidade}. */
    int[] drops(java.util.Random r) {
        switch (type) {
            case PIG: return new int[] { Items.RAW_MEAT, 1 + r.nextInt(2) };
            case SHEEP: return new int[] { Block.WOOL, 1, Items.RAW_MEAT, 1 };
            case CHICKEN: return new int[] { Items.RAW_MEAT, 1 };
            case FISH: return new int[] { Items.RAW_FISH, 1 };
            default:
                if (r.nextDouble() < 0.06) return new int[] { Items.IRON_INGOT, 1 };
                if (r.nextDouble() < 0.4) return new int[] { Items.COAL, 1 + r.nextInt(2) };
                return new int[0];
        }
    }

    // ------------------------------------------------------------------ modelo

    /** Caixa do modelo, em coordenadas locais (frente = +z). leg: 0 nenhuma, 1/2 balança em fases opostas. */
    private static final class Box {
        final double cx, cy, cz, sx, sy, sz;
        final int color, leg;
        final boolean glow;
        Box(double cx, double cy, double cz, double sx, double sy, double sz, int color, int leg, boolean glow) {
            this.cx = cx; this.cy = cy; this.cz = cz; this.sx = sx; this.sy = sy; this.sz = sz;
            this.color = color; this.leg = leg; this.glow = glow;
        }
    }

    private static Box b(double cx, double cy, double cz, double sx, double sy, double sz, int c) {
        return new Box(cx, cy, cz, sx, sy, sz, c, 0, false);
    }

    private static Box leg(double cx, double cy, double cz, double sx, double sy, double sz, int c, int phase) {
        return new Box(cx, cy, cz, sx, sy, sz, c, phase, false);
    }

    private static Box eye(double cx, double cy, double cz, double s, int c) {
        return new Box(cx, cy, cz, s, s * 0.7, 0.02, c, 0, true);
    }

    private static final Box[][] MODELS = new Box[6][];
    static {
        int pink = 0xF0A6B0, pinkD = 0xD27C8A;
        MODELS[PIG] = new Box[] {
                leg(-0.2, 0.18, 0.3, 0.22, 0.36, 0.22, pinkD, 1), leg(0.2, 0.18, 0.3, 0.22, 0.36, 0.22, pinkD, 2),
                leg(-0.2, 0.18, -0.3, 0.22, 0.36, 0.22, pinkD, 2), leg(0.2, 0.18, -0.3, 0.22, 0.36, 0.22, pinkD, 1),
                b(0, 0.6, 0, 0.62, 0.5, 1.0, pink),
                b(0, 0.7, 0.62, 0.5, 0.48, 0.42, pink),
                b(0, 0.62, 0.86, 0.26, 0.17, 0.08, pinkD),
                eye(-0.13, 0.78, 0.84, 0.08, 0x202020), eye(0.13, 0.78, 0.84, 0.08, 0x202020) };
        int wool = 0xEDEDE6, face = 0xC8B8A6, legC = 0x8A7E72;
        MODELS[SHEEP] = new Box[] {
                leg(-0.18, 0.24, 0.3, 0.2, 0.48, 0.2, legC, 1), leg(0.18, 0.24, 0.3, 0.2, 0.48, 0.2, legC, 2),
                leg(-0.18, 0.24, -0.3, 0.2, 0.48, 0.2, legC, 2), leg(0.18, 0.24, -0.3, 0.2, 0.48, 0.2, legC, 1),
                b(0, 0.8, 0, 0.76, 0.6, 1.05, wool),
                b(0, 0.95, 0.62, 0.38, 0.4, 0.38, face),
                b(0, 1.1, 0.58, 0.46, 0.14, 0.34, wool),
                eye(-0.1, 0.98, 0.815, 0.07, 0x202020), eye(0.1, 0.98, 0.815, 0.07, 0x202020) };
        int white = 0xF4F4F0;
        MODELS[CHICKEN] = new Box[] {
                leg(-0.08, 0.13, 0, 0.06, 0.26, 0.06, 0xE0A020, 1), leg(0.08, 0.13, 0, 0.06, 0.26, 0.06, 0xE0A020, 2),
                b(0, 0.42, -0.02, 0.36, 0.32, 0.46, white),
                b(-0.2, 0.44, -0.02, 0.04, 0.22, 0.34, 0xE6E6E0), b(0.2, 0.44, -0.02, 0.04, 0.22, 0.34, 0xE6E6E0),
                b(0, 0.64, 0.2, 0.24, 0.3, 0.2, white),
                b(0, 0.62, 0.34, 0.12, 0.08, 0.1, 0xF0A020),
                b(0, 0.82, 0.2, 0.06, 0.08, 0.14, 0xD02828),
                eye(-0.08, 0.7, 0.305, 0.05, 0x202020), eye(0.08, 0.7, 0.305, 0.05, 0x202020) };
        int skin = 0x93A890, rag = 0x5E4A66, pants = 0x3E3A36;
        MODELS[ZOMBIE] = new Box[] {
                leg(-0.13, 0.4, 0, 0.24, 0.8, 0.26, pants, 1), leg(0.13, 0.4, 0, 0.24, 0.8, 0.26, pants, 2),
                b(0, 1.16, 0, 0.52, 0.72, 0.3, rag),
                b(0, 0.86, 0.01, 0.53, 0.12, 0.31, 0x4A3A52),
                b(-0.36, 1.38, 0.26, 0.18, 0.18, 0.62, skin), b(0.36, 1.38, 0.26, 0.18, 0.18, 0.62, skin),
                b(-0.36, 1.38, -0.02, 0.2, 0.2, 0.08, rag), b(0.36, 1.38, -0.02, 0.2, 0.2, 0.08, rag),
                b(0, 1.76, 0, 0.48, 0.48, 0.48, skin),
                b(0, 1.98, -0.02, 0.5, 0.06, 0.5, 0x6E7E6A),
                eye(-0.11, 1.8, 0.245, 0.1, 0xFF3020), eye(0.11, 1.8, 0.245, 0.1, 0xFF3020),
                b(0, 1.64, 0.245, 0.18, 0.05, 0.02, 0x3A2A2A) };
        int sp = 0x2E2626, spH = 0x3C3030;
        java.util.List<Box> spider = new java.util.ArrayList<>();
        spider.add(b(0, 0.48, -0.3, 0.8, 0.52, 0.85, sp));
        spider.add(b(0, 0.46, 0.32, 0.54, 0.44, 0.44, spH));
        spider.add(eye(-0.13, 0.54, 0.545, 0.09, 0xFF2020));
        spider.add(eye(0.13, 0.54, 0.545, 0.09, 0xFF2020));
        spider.add(eye(-0.06, 0.6, 0.545, 0.06, 0xFF2020));
        spider.add(eye(0.06, 0.6, 0.545, 0.06, 0xFF2020));
        for (int side = -1; side <= 1; side += 2)
            for (int i = 0; i < 4; i++)
                spider.add(leg(side * 0.62, 0.36, 0.3 - i * 0.22, 0.85, 0.08, 0.08, 0x241C1C, (i % 2) + 1));
        MODELS[SPIDER] = spider.toArray(new Box[0]);
        int scale = 0xE48A3A, belly = 0xF2D2A0, fin = 0xC0602A;
        MODELS[FISH] = new Box[] {
                b(0, 0.18, 0, 0.18, 0.22, 0.5, scale),
                b(0, 0.1, 0.02, 0.16, 0.06, 0.4, belly),
                leg(0, 0.18, -0.33, 0.04, 0.24, 0.16, fin, 1),
                b(0, 0.33, -0.02, 0.03, 0.08, 0.18, fin),
                eye(-0.091, 0.22, 0.17, 0.05, 0x101010), eye(0.091, 0.22, 0.17, 0.05, 0x101010) };
    }

    /**
     * Escreve os triângulos do modelo (x,y,z,r,g,b por vértice) em out a partir de o.
     * light: 0..1 (luz do lugar onde está). Retorna o novo índice.
     */
    int writeModel(float[] out, int o, double light) {
        double cy = Math.cos(yaw), sy = Math.sin(yaw);
        double swing = Math.sin(walk * 5.5) * Math.min(1, Math.sqrt(vx * vx + vz * vz) / 1.5);
        boolean red = hurt > 0;
        for (Box bx : MODELS[type]) {
            double ox = 0, oz = 0;
            double angle = bx.leg == 0 ? 0 : (bx.leg == 1 ? 1 : -1) * swing * 0.7;
            boolean spiderLeg = type == SPIDER && bx.leg != 0;
            if (spiderLeg) { oz = Math.sin(walk * 7 + bx.cz * 9) * 0.12 * Math.min(1, swing * 3 + 0.05); angle = 0; }
            double hx = bx.sx / 2, hy = bx.sy / 2, hz = bx.sz / 2;
            // 8 cantos da caixa, com a perna girando em volta do topo
            double[][] c = new double[8][3];
            for (int i = 0; i < 8; i++) {
                double lx = (i & 1) == 0 ? -hx : hx, ly = (i & 2) == 0 ? -hy : hy, lz = (i & 4) == 0 ? -hz : hz;
                if (angle != 0) {
                    double py = ly - hy; // pivô no topo
                    double ny = py * Math.cos(angle) - lz * Math.sin(angle), nz = py * Math.sin(angle) + lz * Math.cos(angle);
                    ly = ny + hy;
                    lz = nz;
                }
                double mx = bx.cx + lx + ox, my = bx.cy + ly, mz = bx.cz + lz + oz;
                c[i][0] = x + mx * cy + mz * sy;
                c[i][1] = y + my;
                c[i][2] = z - mx * sy + mz * cy;
            }
            int[][] faces = { { 1, 3, 7, 5 }, { 0, 4, 6, 2 }, { 2, 6, 7, 3 }, { 0, 1, 5, 4 }, { 4, 5, 7, 6 }, { 0, 2, 3, 1 } };
            double[] shade = { 0.8, 0.8, 1.0, 0.55, 0.7, 0.7 };
            for (int f = 0; f < 6; f++) {
                double l = bx.glow ? 1.0 : shade[f] * light;
                double r = ((bx.color >> 16) & 255) / 255.0 * l, g = ((bx.color >> 8) & 255) / 255.0 * l, b = (bx.color & 255) / 255.0 * l;
                if (red) { r = r * 0.5 + 0.5 * l; g *= 0.45; b *= 0.45; }
                int[] q = faces[f];
                int[] tri = { q[0], q[1], q[2], q[2], q[3], q[0] };
                for (int t : tri) {
                    out[o++] = (float) c[t][0]; out[o++] = (float) c[t][1]; out[o++] = (float) c[t][2];
                    out[o++] = (float) r; out[o++] = (float) g; out[o++] = (float) b;
                }
            }
        }
        return o;
    }

    int modelFloats() {
        return MODELS[type].length * 36 * 6;
    }
}
