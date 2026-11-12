/** Criatura do mundo: animais pacíficos e monstros noturnos. */
final class Mob extends Entity {
    static final int PIG = 0, SHEEP = 1, CHICKEN = 2, ZOMBIE = 3, SPIDER = 4, FISH = 5, COW = 6, CREEPER = 7, SKELETON = 8;
    static final int TYPES = 9;
    static final String[] NAMES = { "Porco", "Ovelha", "Galinha", "Morto-vivo", "Aranha", "Peixe", "Vaca", "Creeper", "Esqueleto" };
    private static final double[][] SIZE = { { 0.42, 0.95 }, { 0.42, 1.2 }, { 0.2, 0.75 }, { 0.3, 1.95 }, { 0.6, 0.8 }, { 0.2, 0.35 },
            { 0.45, 1.35 }, { 0.3, 1.7 }, { 0.3, 1.95 } };
    private static final double[] MAX_HP = { 10, 8, 4, 20, 16, 3, 10, 20, 20 };
    private static final double[] SPEED = { 1.5, 1.3, 1.6, 2.7, 3.6, 1.5, 1.3, 2.4, 2.3 };
    /** Creeper: quanto tempo o pavio queima antes de explodir, e a força da explosão. */
    static final double FUSE_TIME = 1.5, CREEPER_POWER = 3.2;

    final int type;
    private static int nextId = 1;
    int id = nextId++; // identifica a criatura na rede
    double health, yaw, hurt, walk, aiTimer, dirX, dirZ, attackCd, flee, burn;
    double idleSound = 2 + Math.random() * 8; // segundos até o próximo som da criatura
    static final String[] SOUNDS = { "porco", "ovelha", "galinha", "morto_vivo", "aranha", null, "vaca", null, "esqueleto" };
    boolean wantsAttack; // encostou no jogador e pode atacar neste quadro
    double fuse;          // creeper: há quanto tempo o pavio está aceso (0 = apagado)
    boolean fuseStarted;  // creeper: acabou de acender (para tocar o som uma vez)
    boolean exploding;    // creeper: o pavio acabou; quem cuida das criaturas faz a explosão
    /** Esqueleto: tempo puxando o arco até soltar, e a força/dano da flecha. */
    static final double AIM_TIME = 1.1, ARROW_SPEED = 24, ARROW_DAMAGE = 3;
    double aim;           // esqueleto: há quanto tempo está mirando (0 = arco abaixado)
    boolean wantsShoot;   // esqueleto: soltou a flecha neste quadro
    private double shotCd;

    Mob(int type, double x, double y, double z) {
        super(SIZE[type][0], SIZE[type][1]);
        this.type = type;
        this.x = x; this.y = y; this.z = z;
        health = MAX_HP[type];
        yaw = Math.random() * Math.PI * 2;
    }

    boolean hostile() { return type == ZOMBIE || type == SPIDER || type == CREEPER || type == SKELETON; }

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

        fuseStarted = false;
        if (type == CREEPER) {
            // chega perto, para e acende o pavio; se o jogador fugir a tempo, o pavio apaga
            boolean close = canTarget && dist < 3 && Math.abs(py) < 3;
            if (close) {
                if (fuse == 0) fuseStarted = true;
                fuse += dt;
                if (fuse >= FUSE_TIME) exploding = true;
            } else if (fuse > 0 && dist > 5) {
                fuse = Math.max(0, fuse - dt * 2);
            } else if (fuse > 0) {
                fuse += dt;
                if (fuse >= FUSE_TIME) exploding = true;
            }
        }
        boolean face = false; // olhar para o alvo em vez de para onde anda
        wantsShoot = false;
        boolean hunting = type == SKELETON && canTarget && dist < 22 && Math.abs(py) < 10;
        if (!hunting) aim = 0;
        if (hunting) {
            // esqueleto: mantém distância (5 a 11 blocos), anda de lado e só atira com o alvo à vista
            double ux = px / Math.max(dist, 0.01), uz = pz / Math.max(dist, 0.01);
            boolean sees = dist < 16 && w.lineOfSight(x, y + 1.5, z, p.x, p.y + 1.1, p.z);
            if (aiTimer <= 0) { aiTimer = 1 + r.nextDouble() * 2; dirX = r.nextInt(3) - 1; dirZ = 0; }
            if (!sees || dist > 11) { tx = ux; tz = uz; }          // sem visão ou longe: chega mais perto
            else if (dist < 5) { tx = -ux; tz = -uz; }             // perto demais: recua
            else if (aim < 0.5) { tx = -uz * dirX * 0.5; tz = ux * dirX * 0.5; } // anda de lado; para ao puxar o arco
            shotCd -= dt;
            if (sees) {
                face = true;
                if (shotCd <= 0) aim += dt;
                if (aim >= AIM_TIME) { wantsShoot = true; aim = 0; shotCd = 0.8 + r.nextDouble(); }
            } else {
                aim = Math.max(0, aim - dt * 2);
            }
        } else if (type == CREEPER && fuse > 0) {
            tx = tz = 0; // parado enquanto incha
            yaw = Math.atan2(px, pz);
        } else if (hostile() && canTarget && dist < 18 && Math.abs(py) < 8) {
            tx = px / Math.max(dist, 0.01);
            tz = pz / Math.max(dist, 0.01);
            double reach = type == SPIDER ? 1.5 : 1.3;
            if (type != CREEPER && dist < reach && Math.abs(py) < 1.7) { // o creeper não bate: explode
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

        if (face || tx != 0 || tz != 0) {
            double target = face ? Math.atan2(px, pz) : Math.atan2(tx, tz), diff = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
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
            case PIG: return new int[] { Items.RAW_PORK, 1 + r.nextInt(2) };
            case SHEEP: return new int[] { Block.WOOL, 1, Items.RAW_MUTTON, 1 + r.nextInt(2) };
            case CHICKEN: return pairs(Items.RAW_CHICKEN, 1, Items.FEATHER, r.nextInt(3));
            case SPIDER: return pairs(Items.STRING, r.nextInt(3), Items.COAL, r.nextInt(4) == 0 ? 1 : 0);
            case SKELETON: return pairs(Items.BONE, r.nextInt(3), Items.ARROW, r.nextInt(2) == 0 ? 1 + r.nextInt(2) : 0);
            case FISH: return new int[] { Items.RAW_FISH, 1 };
            case COW: { // bife e, às vezes, couro (para a armadura)
                int leather = r.nextInt(3);
                return leather == 0 ? new int[] { Items.RAW_MEAT, 1 + r.nextInt(3) } : new int[] { Items.RAW_MEAT, 1 + r.nextInt(3), Items.LEATHER, leather };
            }
            case CREEPER: { int n = r.nextInt(3); return n == 0 ? new int[0] : new int[] { Items.GUNPOWDER, n }; }
            default:
                if (r.nextDouble() < 0.06) return new int[] { Items.IRON_INGOT, 1 };
                if (r.nextDouble() < 0.4) return new int[] { Items.COAL, 1 + r.nextInt(2) };
                return new int[0];
        }
    }

    /** Monta a lista {item, quantidade, ...} deixando de fora o que saiu com quantidade zero. */
    private static int[] pairs(int... p) {
        int n = 0;
        for (int i = 0; i < p.length; i += 2) if (p[i + 1] > 0) n += 2;
        int[] out = new int[n];
        for (int i = 0, o = 0; i < p.length; i += 2) if (p[i + 1] > 0) { out[o++] = p[i]; out[o++] = p[i + 1]; }
        return out;
    }

    // ------------------------------------------------------------------ modelo

    /** Caixa do modelo, em coordenadas locais (frente = +z). leg: 0 nenhuma, 1/2 balança em fases opostas. */
    private static final class Box {
        final double cx, cy, cz, sx, sy, sz;
        final int color, leg;
        final boolean glow;
        final double piv; // altura (local) do pivô da perna; NaN = topo da própria caixa
        Box(double cx, double cy, double cz, double sx, double sy, double sz, int color, int leg, boolean glow) {
            this(cx, cy, cz, sx, sy, sz, color, leg, glow, Double.NaN);
        }
        Box(double cx, double cy, double cz, double sx, double sy, double sz, int color, int leg, boolean glow, double piv) {
            this.cx = cx; this.cy = cy; this.cz = cz; this.sx = sx; this.sy = sy; this.sz = sz;
            this.color = color; this.leg = leg; this.glow = glow; this.piv = piv;
        }
    }

    /** Parte de perna que balança em volta de pivot (altura do quadril), mesmo sendo só um pedaço da perna. */
    private static Box legp(double cx, double cy, double cz, double sx, double sy, double sz, int c, int phase, double pivot) {
        return new Box(cx, cy, cz, sx, sy, sz, c, phase, false, pivot);
    }

    private static Box b(double cx, double cy, double cz, double sx, double sy, double sz, int c) {
        return new Box(cx, cy, cz, sx, sy, sz, c, 0, false);
    }

    private static Box leg(double cx, double cy, double cz, double sx, double sy, double sz, int c, int phase) {
        return new Box(cx, cy, cz, sx, sy, sz, c, phase, false);
    }

    private static Box[] join(Box[] a, Box[] b) {
        Box[] out = java.util.Arrays.copyOf(a, a.length + b.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }

    private static Box eye(double cx, double cy, double cz, double s, int c) {
        return new Box(cx, cy, cz, s, s * 0.7, 0.02, c, 0, true);
    }

    private static final Box[][] MODELS = new Box[TYPES][];
    /** Esqueleto mirando: braços erguidos, arco à frente e a flecha encaixada. */
    private static final Box[] SKELETON_AIM;
    static {
        int bone = 0xDCDCD0, boneD = 0xA9A99C, bowC = 0x7A5630;
        int boneS = 0x8E8E82, dark = 0x181818, innerD = 0x2A2A26, toothC = 0xF0F0E0;
        java.util.List<Box> bd = new java.util.ArrayList<>();
        // pernas: fêmur, joelho, tíbia, perônio, pé e dedos (balançam em volta do quadril)
        for (int side = -1; side <= 1; side += 2) {
            int ph = side < 0 ? 1 : 2;
            double lx = side * 0.1;
            bd.add(legp(lx, 0.62, 0, 0.11, 0.36, 0.11, bone, ph, 0.8));
            bd.add(legp(lx, 0.43, 0.01, 0.14, 0.1, 0.14, boneD, ph, 0.8));
            bd.add(legp(lx, 0.2, 0, 0.08, 0.36, 0.08, bone, ph, 0.8));
            bd.add(legp(lx + side * 0.05, 0.2, -0.02, 0.035, 0.34, 0.04, boneS, ph, 0.8));
            bd.add(legp(lx, 0.03, 0.06, 0.12, 0.06, 0.2, bone, ph, 0.8));
            for (int t = -1; t <= 1; t++) bd.add(legp(lx + t * 0.04, 0.025, 0.19, 0.03, 0.04, 0.08, boneD, ph, 0.8));
        }
        // pélvis e coluna
        bd.add(b(0, 0.84, 0, 0.34, 0.08, 0.16, boneD));
        bd.add(b(-0.15, 0.9, 0, 0.06, 0.12, 0.14, bone)); bd.add(b(0.15, 0.9, 0, 0.06, 0.12, 0.14, bone));
        bd.add(b(0, 0.86, -0.07, 0.1, 0.1, 0.04, boneS));
        bd.add(b(0, 1.15, -0.02, 0.08, 0.6, 0.08, bone));
        for (double vy : new double[] { 0.98, 1.08, 1.18, 1.28, 1.38 }) bd.add(b(0, vy, -0.055, 0.06, 0.04, 0.04, boneD));
        // caixa torácica: vazio escuro por dentro, esterno e quatro pares de costelas
        bd.add(b(0, 1.18, 0, 0.3, 0.36, 0.16, innerD));
        bd.add(b(0, 1.2, 0.1, 0.05, 0.36, 0.03, bone));
        for (double ry : new double[] { 1.02, 1.12, 1.22, 1.32 }) {
            double w = ry > 1.25 ? 1.0 : (ry > 1.1 ? 0.95 : 0.85);
            for (int side = -1; side <= 1; side += 2) {
                bd.add(b(side * 0.12, ry, 0.09, 0.1 * w + 0.04, 0.05, 0.035, bone));
                bd.add(b(side * 0.19 * w, ry, 0, 0.04, 0.05, 0.18, bone));
                bd.add(b(side * 0.12, ry, -0.09, 0.1 * w + 0.04, 0.05, 0.035, boneD));
            }
        }
        // ombros: clavícula, juntas e omoplatas
        bd.add(b(0, 1.44, 0, 0.5, 0.08, 0.16, bone));
        bd.add(b(-0.29, 1.42, 0, 0.12, 0.12, 0.12, boneD)); bd.add(b(0.29, 1.42, 0, 0.12, 0.12, 0.12, boneD));
        bd.add(b(-0.12, 1.3, -0.08, 0.12, 0.2, 0.03, boneS)); bd.add(b(0.12, 1.3, -0.08, 0.12, 0.2, 0.03, boneS));
        // pescoço e crânio
        bd.add(b(0, 1.52, 0, 0.08, 0.08, 0.08, boneD));
        bd.add(b(0, 1.74, 0, 0.44, 0.44, 0.44, bone));
        bd.add(b(0, 1.965, 0, 0.03, 0.01, 0.44, boneS));                      // sutura do topo
        bd.add(b(0.1, 1.9, 0.223, 0.025, 0.1, 0.01, boneS)); bd.add(b(0.13, 1.84, 0.223, 0.05, 0.025, 0.01, boneS)); // rachaduras
        bd.add(b(0, 1.84, 0.225, 0.44, 0.04, 0.02, boneD));                   // arcada
        bd.add(b(-0.1, 1.78, 0.222, 0.13, 0.13, 0.012, dark)); bd.add(b(0.1, 1.78, 0.222, 0.13, 0.13, 0.012, dark)); // órbitas
        bd.add(eye(-0.1, 1.77, 0.232, 0.045, 0x9ADCE8)); bd.add(eye(0.1, 1.77, 0.232, 0.045, 0x9ADCE8)); // brilho frio
        bd.add(b(0, 1.7, 0.222, 0.06, 0.08, 0.012, dark));                    // nariz
        bd.add(b(-0.16, 1.69, 0.23, 0.1, 0.05, 0.02, bone)); bd.add(b(0.16, 1.69, 0.23, 0.1, 0.05, 0.02, bone)); // maçãs do rosto
        bd.add(b(0, 1.6, 0.222, 0.24, 0.07, 0.012, dark));                    // boca
        for (int t = -2; t <= 2; t++) {
            bd.add(b(t * 0.045, 1.625, 0.228, 0.03, 0.035, 0.01, toothC));
            bd.add(b(t * 0.045, 1.572, 0.228, 0.03, 0.03, 0.01, toothC));
        }
        bd.add(b(-0.225, 1.76, 0, 0.012, 0.1, 0.14, boneD)); bd.add(b(0.225, 1.76, 0, 0.012, 0.1, 0.14, boneD)); // têmporas
        Box[] body = bd.toArray(new Box[0]);
        // braços soltos: úmero, cotovelo, antebraço, mão e dedos (balançam em volta do ombro); o arco fica na mão esquerda
        java.util.List<Box> id = new java.util.ArrayList<>();
        for (int side = -1; side <= 1; side += 2) {
            int ph = side < 0 ? 2 : 1;
            double ax = side * 0.29;
            id.add(legp(ax, 1.28, 0, 0.08, 0.34, 0.08, bone, ph, 1.45));
            id.add(legp(ax, 1.1, 0, 0.11, 0.08, 0.11, boneD, ph, 1.45));
            id.add(legp(ax, 0.9, 0, 0.075, 0.32, 0.075, bone, ph, 1.45));
            id.add(legp(ax, 0.72, 0.01, 0.09, 0.08, 0.06, boneD, ph, 1.45));
            for (int t = -1; t <= 1; t++) id.add(legp(ax + t * 0.03, 0.65, 0.02, 0.022, 0.1, 0.025, bone, ph, 1.45));
        }
        id.add(b(-0.29, 0.95, 0.12, 0.04, 0.5, 0.05, bowC));                  // arco: haste e pontas
        id.add(b(-0.29, 1.24, 0.14, 0.04, 0.12, 0.05, bowC)); id.add(b(-0.29, 0.66, 0.14, 0.04, 0.12, 0.05, bowC));
        id.add(b(-0.29, 0.95, 0.16, 0.05, 0.14, 0.06, 0x4A3420));
        id.add(b(-0.29, 0.95, 0.09, 0.01, 0.74, 0.01, 0xC8C8C0));
        Box[] idle = id.toArray(new Box[0]);
        // mirando: braço do arco esticado e braço da corda dobrado, com arco, corda e flecha completos
        Box[] aiming = {
                b(-0.29, 1.4, 0.1, 0.09, 0.09, 0.22, bone), b(-0.29, 1.4, 0.23, 0.11, 0.11, 0.07, boneD),
                b(-0.29, 1.4, 0.42, 0.08, 0.08, 0.3, bone), b(-0.29, 1.4, 0.6, 0.1, 0.1, 0.07, boneD),
                b(0.29, 1.4, 0.1, 0.09, 0.09, 0.22, bone), b(0.29, 1.4, 0.23, 0.11, 0.11, 0.07, boneD),
                b(0.08, 1.4, 0.2, 0.36, 0.08, 0.08, bone), b(-0.12, 1.4, 0.2, 0.09, 0.09, 0.09, boneD),
                b(-0.29, 1.4, 0.64, 0.05, 0.14, 0.06, 0x4A3420),
                b(-0.29, 1.58, 0.64, 0.04, 0.22, 0.05, bowC), b(-0.29, 1.76, 0.6, 0.04, 0.1, 0.05, bowC),
                b(-0.29, 1.22, 0.64, 0.04, 0.22, 0.05, bowC), b(-0.29, 1.04, 0.6, 0.04, 0.1, 0.05, bowC),
                b(-0.29, 1.4, 0.58, 0.01, 0.78, 0.01, 0xC8C8C0),
                b(-0.2, 1.4, 0.42, 0.025, 0.025, 0.62, 0xC8C8C0),
                b(-0.2, 1.4, 0.76, 0.045, 0.045, 0.06, 0x808080),
                b(-0.2, 1.43, 0.14, 0.01, 0.05, 0.06, 0xE0E0E0), b(-0.2, 1.4, 0.14, 0.05, 0.01, 0.06, 0xE0E0E0) };
        MODELS[SKELETON] = join(body, idle);
        SKELETON_AIM = join(body, aiming);
        int cow = 0x5A3C28, cowD = 0x3E2A1C, patch = 0xECE8E0, muzzle = 0xD8C4B4;
        int hoof = 0x2A1C12, pinkC = 0xE8B0B0, pinkD2 = 0xC98A8A, cream = 0xE8E0D0, hornTip = 0xBDB5A0;
        java.util.List<Box> cw = new java.util.ArrayList<>();
        // pernas: coxa, joelho, canela (meia clara nas duas da frente e na traseira esquerda) e casco, balançando no quadril
        double[][] cowLegs = { { -0.22, 0.38, 1 }, { 0.22, 0.38, 2 }, { -0.22, -0.38, 2 }, { 0.22, -0.38, 1 } };
        for (int li = 0; li < 4; li++) {
            double lx = cowLegs[li][0], lz = cowLegs[li][1];
            int ph = (int) cowLegs[li][2];
            boolean sock = li != 3;
            cw.add(legp(lx, 0.5, lz, 0.25, 0.2, 0.25, cow, ph, 0.6));
            cw.add(legp(lx, 0.37, lz, 0.2, 0.06, 0.2, cowD, ph, 0.6));
            cw.add(legp(lx, 0.22, lz, 0.17, 0.24, 0.17, sock ? cream : cowD, ph, 0.6));
            cw.add(legp(lx, 0.05, lz + 0.01, 0.2, 0.1, 0.2, hoof, ph, 0.6));
        }
        // tronco e manchas
        cw.add(b(0, 0.92, 0, 0.72, 0.64, 1.2, cow));
        cw.add(b(0, 1.245, 0, 0.3, 0.02, 1.0, cowD));                        // faixa da coluna
        cw.add(b(0, 1.2, 0.34, 0.5, 0.1, 0.3, cow));                          // cernelha (ombro)
        cw.add(b(0, 0.595, 0.1, 0.5, 0.02, 0.8, cream));                      // barriga clara
        cw.add(b(0.365, 0.98, -0.12, 0.02, 0.36, 0.44, patch)); cw.add(b(0.2, 1.25, -0.12, 0.34, 0.02, 0.44, patch));
        cw.add(b(-0.365, 0.9, -0.38, 0.02, 0.32, 0.36, patch)); cw.add(b(-0.2, 1.25, -0.4, 0.3, 0.02, 0.3, patch));
        cw.add(b(-0.365, 1.05, 0.3, 0.02, 0.2, 0.24, patch));
        cw.add(b(0.365, 0.82, 0.34, 0.02, 0.2, 0.22, patch));
        // cauda com tufo e úbere com tetas
        cw.add(b(0, 0.98, -0.62, 0.07, 0.5, 0.07, cowD)); cw.add(b(0, 0.7, -0.62, 0.11, 0.14, 0.11, hoof));
        cw.add(b(0, 0.58, -0.3, 0.3, 0.1, 0.3, pinkC));
        for (double tx : new double[] { -0.08, 0.08 }) for (double tz : new double[] { -0.2, -0.38 }) cw.add(b(tx, 0.5, tz, 0.05, 0.07, 0.05, pinkD2));
        // pescoço e cabeça
        cw.add(b(0, 1.1, 0.5, 0.4, 0.4, 0.3, cow));
        cw.add(b(0, 1.12, 0.74, 0.5, 0.5, 0.42, cow));
        cw.add(b(0, 1.16, 0.955, 0.14, 0.36, 0.01, patch));                  // mancha na testa
        cw.add(b(0, 1.0, 0.96, 0.34, 0.22, 0.1, muzzle));                    // focinho
        cw.add(b(-0.07, 1.0, 1.012, 0.05, 0.04, 0.01, 0x7A5A4A)); cw.add(b(0.07, 1.0, 1.012, 0.05, 0.04, 0.01, 0x7A5A4A)); // narinas
        cw.add(b(0, 0.92, 1.012, 0.2, 0.02, 0.01, 0x7A5A4A));                // boca
        for (double ex : new double[] { -0.14, 0.14 }) {
            cw.add(b(ex, 1.2, 0.953, 0.1, 0.08, 0.01, 0xF0F0F0));
            cw.add(eye(ex, 1.2, 0.96, 0.06, 0x202020));
        }
        // orelhas com o interior rosado, chifres em duas partes e topete
        for (int side = -1; side <= 1; side += 2) {
            cw.add(b(side * 0.31, 1.2, 0.62, 0.14, 0.08, 0.16, cowD));
            cw.add(b(side * 0.31, 1.2, 0.66, 0.1, 0.05, 0.1, pinkD2));
            cw.add(b(side * 0.27, 1.39, 0.72, 0.1, 0.08, 0.1, cream));
            cw.add(b(side * 0.31, 1.47, 0.72, 0.07, 0.1, 0.07, hornTip));
        }
        cw.add(b(0, 1.4, 0.7, 0.2, 0.06, 0.14, cowD));
        MODELS[COW] = cw.toArray(new Box[0]);
        int cr = 0x4EB04A, crD = 0x3A8A38, crL = 0x74C86E, crFace = 0x101410;
        MODELS[CREEPER] = new Box[] {
                leg(-0.15, 0.18, 0.2, 0.26, 0.36, 0.26, crD, 1), leg(0.15, 0.18, 0.2, 0.26, 0.36, 0.26, crD, 2),
                leg(-0.15, 0.18, -0.2, 0.26, 0.36, 0.26, crD, 2), leg(0.15, 0.18, -0.2, 0.26, 0.36, 0.26, crD, 1),
                b(0, 0.78, 0, 0.5, 0.86, 0.3, cr),
                b(0.1, 0.9, 0.005, 0.2, 0.2, 0.3, crL), b(-0.14, 0.6, 0.005, 0.16, 0.16, 0.3, crD),
                b(0, 1.46, 0, 0.5, 0.5, 0.5, cr),
                b(-0.12, 1.62, 0.005, 0.2, 0.14, 0.5, crL),
                eye(-0.12, 1.54, 0.255, 0.13, crFace), eye(0.12, 1.54, 0.255, 0.13, crFace),
                b(0, 1.36, 0.255, 0.12, 0.2, 0.02, crFace),
                b(-0.1, 1.3, 0.255, 0.08, 0.14, 0.02, crFace), b(0.1, 1.3, 0.255, 0.08, 0.14, 0.02, crFace) };
        int pink = 0xF0A6B0, pinkD = 0xD27C8A;
        int pinkL = 0xF8C0C8, pinkS = 0xE0909C, hoofP = 0x5A3A3A, snoutP = 0xE89AA6;
        java.util.List<Box> pg = new java.util.ArrayList<>();
        // pernas: coxa, canela mais escura e casco (balançam no quadril)
        double[][] pigLegs = { { -0.2, 0.3, 1 }, { 0.2, 0.3, 2 }, { -0.2, -0.3, 2 }, { 0.2, -0.3, 1 } };
        for (double[] pl : pigLegs) {
            int ph = (int) pl[2];
            pg.add(legp(pl[0], 0.3, pl[1], 0.23, 0.12, 0.23, pink, ph, 0.36));
            pg.add(legp(pl[0], 0.17, pl[1], 0.18, 0.14, 0.18, pinkD, ph, 0.36));
            pg.add(legp(pl[0], 0.04, pl[1] + 0.01, 0.2, 0.08, 0.2, hoofP, ph, 0.36));
        }
        // corpo: lombo, traseiro mais cheio, barriga clara, manchas e rabo enrolado
        pg.add(b(0, 0.6, 0, 0.62, 0.5, 1.0, pink));
        pg.add(b(0, 0.58, -0.32, 0.66, 0.46, 0.34, pink));
        pg.add(b(0, 0.355, 0, 0.5, 0.02, 0.9, pinkL));
        pg.add(b(0.316, 0.64, 0.1, 0.02, 0.2, 0.3, pinkS)); pg.add(b(0.15, 0.855, 0.1, 0.2, 0.02, 0.3, pinkS));
        pg.add(b(-0.316, 0.58, -0.3, 0.02, 0.18, 0.22, pinkS));
        pg.add(b(0, 0.66, -0.52, 0.05, 0.05, 0.07, pinkD));
        pg.add(b(0.04, 0.72, -0.55, 0.05, 0.07, 0.05, pinkD));
        pg.add(b(0, 0.78, -0.54, 0.05, 0.04, 0.05, pinkD));
        // pescoço e cabeça
        pg.add(b(0, 0.68, 0.4, 0.44, 0.4, 0.2, pink));
        pg.add(b(0, 0.7, 0.62, 0.5, 0.48, 0.42, pink));
        pg.add(b(-0.2, 0.66, 0.832, 0.08, 0.08, 0.01, 0xF4A6B0)); pg.add(b(0.2, 0.66, 0.832, 0.08, 0.08, 0.01, 0xF4A6B0)); // bochechas
        // focinho com narinas e boca
        pg.add(b(0, 0.62, 0.86, 0.26, 0.17, 0.08, pinkD));
        pg.add(b(0, 0.62, 0.9, 0.3, 0.2, 0.04, snoutP));
        pg.add(b(-0.06, 0.62, 0.925, 0.05, 0.07, 0.01, 0x8A4A56)); pg.add(b(0.06, 0.62, 0.925, 0.05, 0.07, 0.01, 0x8A4A56));
        pg.add(b(0, 0.525, 0.88, 0.2, 0.02, 0.06, 0x8A4A56));
        // olhos com branco e sobrancelha; orelhas caídas
        for (double ex : new double[] { -0.13, 0.13 }) {
            pg.add(b(ex, 0.78, 0.832, 0.1, 0.08, 0.01, 0xF4F0F0));
            pg.add(eye(ex, 0.78, 0.84, 0.08, 0x202020));
            pg.add(b(ex, 0.845, 0.832, 0.12, 0.02, 0.01, pinkD));
        }
        for (int side = -1; side <= 1; side += 2) {
            pg.add(b(side * 0.18, 0.96, 0.58, 0.14, 0.06, 0.16, pinkD));
            pg.add(b(side * 0.24, 0.9, 0.58, 0.04, 0.1, 0.14, pinkD));
            pg.add(b(side * 0.18, 0.99, 0.58, 0.08, 0.01, 0.1, pinkS));
        }
        MODELS[PIG] = pg.toArray(new Box[0]);
        int wool = 0xEDEDE6, face = 0xC8B8A6, legC = 0x8A7E72;
        MODELS[SHEEP] = new Box[] {
                leg(-0.18, 0.24, 0.3, 0.2, 0.48, 0.2, legC, 1), leg(0.18, 0.24, 0.3, 0.2, 0.48, 0.2, legC, 2),
                leg(-0.18, 0.24, -0.3, 0.2, 0.48, 0.2, legC, 2), leg(0.18, 0.24, -0.3, 0.2, 0.48, 0.2, legC, 1),
                b(0, 0.8, 0, 0.76, 0.6, 1.05, wool),
                b(0, 0.95, 0.62, 0.38, 0.4, 0.38, face),
                b(0, 1.1, 0.58, 0.46, 0.14, 0.34, wool),
                eye(-0.1, 0.98, 0.815, 0.07, 0x202020), eye(0.1, 0.98, 0.815, 0.07, 0x202020) };
        int white = 0xF4F4F0;
        int feather = 0xE6E6E0, featherD = 0xC8C8C0, beakC = 0xF0A020, beakD = 0xD08A18, legC2 = 0xE0A020, redC = 0xD02828, redD = 0xA81C1C;
        java.util.List<Box> ck = new java.util.ArrayList<>();
        // pernas: penas da coxa, canela e pé com três dedos na frente e um atrás (balançam no quadril)
        for (int side = -1; side <= 1; side += 2) {
            int ph = side < 0 ? 1 : 2;
            double lx = side * 0.08;
            ck.add(legp(lx, 0.22, 0, 0.11, 0.1, 0.13, white, ph, 0.26));
            ck.add(legp(lx, 0.11, 0, 0.05, 0.2, 0.05, legC2, ph, 0.26));
            ck.add(legp(lx, 0.17, -0.03, 0.03, 0.04, 0.03, beakD, ph, 0.26));       // esporão
            for (int t = -1; t <= 1; t++) ck.add(legp(lx + t * 0.04, 0.012, 0.07, 0.03, 0.025, 0.11, legC2, ph, 0.26));
            ck.add(legp(lx, 0.012, -0.05, 0.03, 0.025, 0.06, legC2, ph, 0.26));
        }
        // corpo: peito estufado, costas cinzentas, asas em camadas e cauda em leque
        ck.add(b(0, 0.42, -0.02, 0.36, 0.32, 0.46, white));
        ck.add(b(0, 0.38, 0.2, 0.3, 0.26, 0.06, white));
        ck.add(b(0, 0.595, -0.04, 0.3, 0.03, 0.36, feather));
        for (int side = -1; side <= 1; side += 2) {
            ck.add(b(side * 0.2, 0.46, -0.02, 0.04, 0.22, 0.34, feather));
            ck.add(b(side * 0.21, 0.4, -0.08, 0.03, 0.14, 0.26, featherD));
            ck.add(b(side * 0.215, 0.31, -0.14, 0.02, 0.06, 0.18, featherD));
        }
        ck.add(b(0, 0.6, -0.3, 0.08, 0.22, 0.06, white));
        ck.add(b(-0.07, 0.58, -0.29, 0.06, 0.18, 0.05, feather)); ck.add(b(0.07, 0.58, -0.29, 0.06, 0.18, 0.05, feather));
        ck.add(b(0, 0.72, -0.31, 0.05, 0.08, 0.05, featherD));
        // pescoço, cabeça, bico, crista, barbela e olhos
        ck.add(b(0, 0.54, 0.16, 0.18, 0.14, 0.16, white));
        ck.add(b(0, 0.64, 0.2, 0.24, 0.3, 0.2, white));
        ck.add(b(0, 0.64, 0.335, 0.1, 0.04, 0.1, beakC));
        ck.add(b(0, 0.6, 0.32, 0.08, 0.03, 0.08, beakD));
        ck.add(b(0, 0.82, 0.2, 0.06, 0.08, 0.14, redC));
        ck.add(b(0, 0.88, 0.17, 0.05, 0.06, 0.05, redC)); ck.add(b(0, 0.87, 0.24, 0.05, 0.05, 0.05, redC));
        ck.add(b(0, 0.54, 0.31, 0.05, 0.09, 0.03, redD));
        ck.add(b(-0.125, 0.62, 0.2, 0.01, 0.07, 0.07, redC)); ck.add(b(0.125, 0.62, 0.2, 0.01, 0.07, 0.07, redC));
        ck.add(eye(-0.08, 0.7, 0.305, 0.05, 0x202020)); ck.add(eye(0.08, 0.7, 0.305, 0.05, 0x202020));
        MODELS[CHICKEN] = ck.toArray(new Box[0]);
        int skin = 0x93A890, skinD = 0x7A8D77, bone2 = 0xC9D4C2, rag = 0x5E4A66, ragD = 0x4A3A52, ragL = 0x6F5878, stain = 0x3E5A3A;
        int pants = 0x3E3A36, pantsD = 0x34302C, boot = 0x26221F, hair = 0x6E7E6A, teeth = 0xDAD8C4, mouth = 0x3A2A2A;
        java.util.List<Box> z = new java.util.ArrayList<>();
        for (int side = -1; side <= 1; side += 2) {
            int ph = side < 0 ? 1 : 2;
            double lx = side * 0.13;
            z.add(legp(lx, 0.5, 0, 0.24, 0.6, 0.26, side < 0 ? pants : 0x4A4540, ph, 0.8)); // calça
            z.add(legp(lx - side * 0.1, 0.5, 0, 0.04, 0.6, 0.265, pantsD, ph, 0.8));        // vinco interno
            z.add(legp(lx, 0.1, 0.04, 0.27, 0.2, 0.34, boot, ph, 0.8));                     // bota
            z.add(legp(lx, 0.03, 0.045, 0.28, 0.06, 0.35, 0x171513, ph, 0.8));              // sola
            z.add(legp(lx, 0.2, 0.04, 0.275, 0.03, 0.345, 0x3A3530, ph, 0.8));              // borda da bota
        }
        z.add(legp(-0.13, 0.4, 0.135, 0.2, 0.11, 0.02, skin, 1, 0.8));    // joelho à mostra
        z.add(legp(-0.13, 0.43, 0.14, 0.2, 0.025, 0.02, skinD, 1, 0.8));
        z.add(legp(0.16, 0.28, 0.135, 0.06, 0.19, 0.02, skin, 2, 0.8));   // barra rasgada
        z.add(legp(-0.17, 0.62, -0.135, 0.1, 0.07, 0.02, 0x2E2B28, 1, 0.8)); // remendo nas costas
        z.add(legp(0.16, 0.3, -0.135, 0.12, 0.08, 0.02, 0x3A3632, 2, 0.8));
        // tronco
        z.add(b(0, 1.16, 0, 0.52, 0.72, 0.3, rag));
        z.add(b(0, 1.5, 0, 0.53, 0.05, 0.31, ragD));                      // gola
        z.add(b(0, 1.54, 0, 0.1, 0.05, 0.18, skinD));                     // pescoço
        z.add(b(-0.23, 1.2, 0.0, 0.04, 0.48, 0.305, 0x54425C));           // dobras laterais
        z.add(b(0.23, 1.2, 0.0, 0.04, 0.48, 0.305, 0x54425C));
        z.add(b(0.11, 1.19, 0.155, 0.22, 0.32, 0.02, skin));              // rasgo com costelas
        z.add(b(0.11, 1.34, 0.158, 0.22, 0.03, 0.01, skinD));
        for (double ry : new double[] { 1.28, 1.22, 1.16, 1.10 }) z.add(b(0.11, ry, 0.168, 0.18, 0.025, 0.01, bone2));
        z.add(b(0.11, 1.19, 0.17, 0.025, 0.26, 0.01, 0x9BAA96));
        z.add(b(-0.09, 1.1, 0.153, 0.11, 0.09, 0.01, stain));             // manchas
        z.add(b(-0.1, 1.0, 0.153, 0.05, 0.06, 0.01, stain));
        z.add(b(-0.1, 1.33, 0.153, 0.07, 0.04, 0.01, ragL));
        z.add(b(-0.1, 1.2, -0.155, 0.15, 0.2, 0.02, skin));               // costas rasgadas
        z.add(b(-0.1, 1.22, -0.168, 0.11, 0.025, 0.01, 0x9BAA96));
        z.add(b(-0.1, 1.16, -0.168, 0.11, 0.025, 0.01, 0x9BAA96));
        z.add(b(0.14, 1.1, -0.153, 0.13, 0.11, 0.01, stain));
        z.add(b(0, 1.2, -0.153, 0.04, 0.55, 0.008, 0x54425C));            // costura
        // cinto e farrapos da barra
        z.add(b(0, 0.86, 0.01, 0.53, 0.12, 0.31, ragD));
        z.add(b(0, 0.86, 0.17, 0.1, 0.09, 0.02, 0x8A7A4A));
        z.add(b(0, 0.86, 0.182, 0.05, 0.05, 0.01, ragD));
        z.add(b(-0.18, 0.78, 0.005, 0.07, 0.1, 0.31, ragD));
        z.add(b(0.12, 0.77, 0.005, 0.05, 0.12, 0.31, ragD));
        z.add(b(-0.02, 0.8, 0.005, 0.06, 0.06, 0.31, ragD));
        // braços estendidos: manga, punho, antebraço, mão e dedos
        for (int side = -1; side <= 1; side += 2) {
            double ax = side * 0.36;
            z.add(b(ax, 1.38, 0.09, 0.2, 0.2, 0.24, rag));
            z.add(b(ax, 1.485, 0.08, 0.12, 0.02, 0.14, ragL));
            z.add(b(ax, 1.38, 0.215, 0.205, 0.205, 0.04, ragD));
            z.add(b(ax, 1.38, 0.43, 0.18, 0.18, 0.38, skin));
            z.add(b(ax, 1.3, 0.43, 0.18, 0.03, 0.38, skinD));
            z.add(b(ax, 1.38, 0.66, 0.19, 0.19, 0.08, skinD));
            z.add(b(ax - 0.06, 1.44, 0.72, 0.045, 0.045, 0.1, skin));
            z.add(b(ax, 1.4, 0.73, 0.045, 0.045, 0.12, skin));
            z.add(b(ax + 0.06, 1.44, 0.72, 0.045, 0.045, 0.1, skin));
            z.add(b(ax, 1.32, 0.71, 0.05, 0.04, 0.08, skin));
        }
        // cabeça
        z.add(b(0, 1.76, 0, 0.48, 0.48, 0.48, skin));
        z.add(b(0, 1.54, 0, 0.485, 0.05, 0.485, skinD));                  // queixo
        z.add(b(-0.255, 1.76, 0, 0.04, 0.11, 0.08, skinD));               // orelhas
        z.add(b(0.255, 1.76, 0, 0.04, 0.11, 0.08, skinD));
        z.add(b(0, 1.99, -0.02, 0.5, 0.07, 0.5, hair));                   // cabelo ralo
        z.add(b(0, 1.82, -0.245, 0.5, 0.36, 0.03, hair));
        z.add(b(-0.245, 1.86, -0.1, 0.03, 0.28, 0.28, hair));
        z.add(b(0.245, 1.86, -0.1, 0.03, 0.28, 0.28, hair));
        z.add(b(0.14, 1.945, 0.245, 0.2, 0.1, 0.02, hair));
        z.add(b(-0.17, 1.96, 0.245, 0.14, 0.06, 0.02, hair));
        z.add(b(0, 1.97, 0.245, 0.08, 0.04, 0.02, hair));
        z.add(b(0, 1.86, 0.243, 0.44, 0.03, 0.01, skinD));                // sobrancelha
        z.add(b(-0.11, 1.8, 0.243, 0.15, 0.1, 0.01, 0x241A1A));           // órbitas
        z.add(b(0.11, 1.8, 0.243, 0.15, 0.1, 0.01, 0x241A1A));
        z.add(eye(-0.11, 1.8, 0.245, 0.1, 0xFF3020));
        z.add(eye(0.11, 1.8, 0.245, 0.1, 0xFF3020));
        z.add(b(0, 1.7, 0.25, 0.08, 0.07, 0.03, skinD));                  // nariz
        z.add(b(0.14, 1.68, 0.243, 0.11, 0.08, 0.01, 0x4A2A2A));          // ferida na bochecha
        z.add(b(0.14, 1.68, 0.247, 0.05, 0.03, 0.01, 0x7A3030));
        z.add(b(0, 1.62, 0.243, 0.26, 0.06, 0.01, mouth));                // boca com dentes
        for (double tx : new double[] { -0.09, -0.03, 0.03, 0.09 }) z.add(b(tx, 1.64, 0.247, 0.03, 0.03, 0.01, teeth));
        z.add(b(-0.06, 1.6, 0.247, 0.03, 0.025, 0.01, teeth));
        z.add(b(0.06, 1.6, 0.247, 0.03, 0.025, 0.01, teeth));
        MODELS[ZOMBIE] = z.toArray(new Box[0]);
        int sp = 0x2E2626, spH = 0x3C3030;
        // tarântula marrom-avermelhada: corpo alto, pernas longas com faixas escuras e cerdas
        int spM = 0x5A2A22, spLt = 0x7A3C30, spDk = 0x2A1210, spBand = 0x3A1812, spBr = 0x1A0C0A;
        java.util.List<Box> spider = new java.util.ArrayList<>();
        // abdômen alto com desenho mais claro
        spider.add(b(0, 0.74, -0.45, 0.6, 0.56, 0.8, spM));
        spider.add(b(0, 1.03, -0.45, 0.5, 0.03, 0.66, spLt));
        spider.add(b(0, 0.74, -0.45, 0.62, 0.1, 0.8, spBand));
        spider.add(b(0, 0.92, -0.45, 0.62, 0.06, 0.12, spBand));
        spider.add(b(0, 0.56, -0.45, 0.62, 0.06, 0.12, spBand));
        spider.add(b(0, 1.04, -0.35, 0.18, 0.02, 0.12, spLt));
        spider.add(b(0, 1.04, -0.55, 0.12, 0.02, 0.16, spLt));
        spider.add(b(0, 0.55, -0.9, 0.2, 0.18, 0.1, spDk));
        for (double bz : new double[] { -0.2, -0.4, -0.6, -0.78 }) {
            spider.add(b(-0.31, 0.98, bz, 0.03, 0.06, 0.02, spBr)); spider.add(b(0.31, 0.98, bz, 0.03, 0.06, 0.02, spBr));
        }
        // cefalotórax e cabeça escura
        spider.add(b(0, 0.64, 0.08, 0.5, 0.38, 0.5, spM));
        spider.add(b(0, 0.85, 0.08, 0.4, 0.04, 0.4, spLt));
        spider.add(b(0, 0.64, 0.08, 0.52, 0.08, 0.2, spBand));
        spider.add(b(0, 0.6, 0.44, 0.42, 0.3, 0.24, spDk));
        spider.add(b(0, 0.78, 0.44, 0.3, 0.04, 0.2, spM));
        for (double ex : new double[] { -0.12, 0.12 }) spider.add(eye(ex, 0.64, 0.565, 0.08, 0xC02818));
        for (double ex : new double[] { -0.05, 0.05 }) spider.add(eye(ex, 0.7, 0.565, 0.05, 0xC02818));
        spider.add(eye(-0.17, 0.7, 0.565, 0.04, 0x8A2014)); spider.add(eye(0.17, 0.7, 0.565, 0.04, 0x8A2014));
        for (int side = -1; side <= 1; side += 2) {
            spider.add(b(side * 0.09, 0.44, 0.58, 0.1, 0.18, 0.08, spBand));              // quelíceras
            spider.add(b(side * 0.09, 0.32, 0.59, 0.04, 0.12, 0.04, spBr));               // presas
            spider.add(b(side * 0.09, 0.25, 0.6, 0.02, 0.05, 0.02, 0xD8C8B0));
            spider.add(b(side * 0.24, 0.52, 0.52, 0.07, 0.08, 0.26, spM));                // pedipalpos
            spider.add(b(side * 0.24, 0.5, 0.67, 0.08, 0.1, 0.06, spDk));
            for (double bz : new double[] { 0.0, 0.18, 0.36 }) spider.add(b(side * 0.27, 0.86, bz, 0.03, 0.05, 0.02, spBr)); // cerdas
        }
        // oito pernas longas: sobem até o joelho alto e descem em degraus até o chão; as da frente apontam para frente
        double[][] seg = { // distância lateral, altura, comprimento, altura da peça, cor (0 base, 1 faixa, 2 escuro), cerda?
                { 0.36, 0.62, 0.24, 0.12, 0, 0 }, { 0.56, 0.72, 0.2, 0.12, 0, 0 }, { 0.72, 0.84, 0.14, 0.12, 1, 1 },
                { 0.82, 0.88, 0.1, 0.14, 2, 0 }, { 0.94, 0.76, 0.12, 0.18, 0, 1 }, { 1.04, 0.6, 0.12, 0.18, 1, 1 },
                { 1.14, 0.44, 0.12, 0.18, 0, 1 }, { 1.24, 0.28, 0.12, 0.18, 1, 1 }, { 1.3, 0.1, 0.1, 0.2, 2, 0 } };
        int[] segC = { spM, spBand, spDk };
        double[] legZ = { 0.3, 0.12, -0.08, -0.28 }, legFan = { 0.55, 0.18, -0.18, -0.55 };
        for (int side = -1; side <= 1; side += 2)
            for (int i = 0; i < 4; i++)
                for (double[] sg : seg) {
                    double sx = sg[0] * 0.85, lz = legZ[i] + legFan[i] * sx, th = sg[1] > 0.5 ? 0.1 : 0.08;
                    spider.add(leg(side * sx, sg[1], lz, sg[2], sg[3], th, segC[(int) sg[4]], i + 1));
                    if (sg[5] > 0) spider.add(leg(side * sx, sg[1] + sg[3] / 2 + 0.02, lz, 0.025, 0.05, 0.025, spBr, i + 1));
                }
        MODELS[SPIDER] = spider.toArray(new Box[0]);
        int scale = 0xE48A3A, belly = 0xF2D2A0, fin = 0xC0602A;
        int scaleL = 0xF0A050, scaleD = 0xB86A2A, finD = 0x9A4A1E;
        java.util.List<Box> fs = new java.util.ArrayList<>();
        // corpo afinando até o pedúnculo, com costas claras, barriga e duas faixas escuras
        fs.add(b(0, 0.18, 0.02, 0.18, 0.22, 0.3, scale));
        fs.add(b(0, 0.17, 0.2, 0.15, 0.18, 0.14, scale));
        fs.add(b(0, 0.18, -0.2, 0.14, 0.17, 0.14, scale));
        fs.add(b(0, 0.18, -0.3, 0.07, 0.1, 0.1, scaleD));
        fs.add(b(0, 0.1, 0.02, 0.16, 0.06, 0.4, belly));
        fs.add(b(0, 0.295, 0.05, 0.1, 0.02, 0.22, scaleL));
        fs.add(b(0, 0.18, -0.06, 0.186, 0.226, 0.04, scaleD));
        fs.add(b(0, 0.18, 0.1, 0.186, 0.226, 0.04, scaleD));
        // cauda em três partes (batem juntas), nadadeiras dorsal, peitorais, pélvicas e anal
        fs.add(legp(0, 0.18, -0.37, 0.03, 0.26, 0.1, fin, 1, 0.18));
        fs.add(legp(0, 0.28, -0.43, 0.03, 0.1, 0.06, finD, 1, 0.18));
        fs.add(legp(0, 0.08, -0.43, 0.03, 0.1, 0.06, finD, 1, 0.18));
        fs.add(b(0, 0.33, -0.02, 0.03, 0.08, 0.18, fin));
        fs.add(b(0, 0.345, 0.1, 0.02, 0.1, 0.04, finD));
        fs.add(b(-0.115, 0.12, 0.06, 0.03, 0.06, 0.1, fin)); fs.add(b(0.115, 0.12, 0.06, 0.03, 0.06, 0.1, fin));
        fs.add(b(-0.04, 0.04, 0.0, 0.03, 0.05, 0.06, fin)); fs.add(b(0.04, 0.04, 0.0, 0.03, 0.05, 0.06, fin));
        fs.add(b(0, 0.05, -0.15, 0.03, 0.05, 0.1, fin));
        // guelras, boca e olhos
        fs.add(b(-0.092, 0.17, 0.12, 0.01, 0.15, 0.03, scaleD)); fs.add(b(0.092, 0.17, 0.12, 0.01, 0.15, 0.03, scaleD));
        fs.add(b(0, 0.13, 0.275, 0.06, 0.02, 0.02, 0x4A2A1A));
        for (int side = -1; side <= 1; side += 2) {
            fs.add(b(side * 0.079, 0.2, 0.2, 0.02, 0.06, 0.06, 0xF4F4F0));
            fs.add(b(side * 0.087, 0.2, 0.205, 0.015, 0.035, 0.035, 0x101010));
        }
        MODELS[FISH] = fs.toArray(new Box[0]);
    }

    /**
     * Escreve os triângulos do modelo (x,y,z,r,g,b por vértice) em out a partir de o.
     * light: 0..1 (luz do lugar onde está). Retorna o novo índice.
     */
    int writeModel(float[] out, int o, double light) {
        double cy = Math.cos(yaw), sy = Math.sin(yaw);
        double swing = Math.sin(walk * 5.5) * Math.min(1, Math.sqrt(vx * vx + vz * vz) / 1.5);
        boolean red = hurt > 0;
        // creeper com o pavio aceso: pisca de branco e incha
        boolean flash = fuse > 0 && ((int) (fuse * 9)) % 2 == 0;
        double swell = fuse > 0 ? 1 + 0.18 * Math.min(1, fuse / FUSE_TIME) : 1;
        for (Box bx : type == SKELETON && aim > 0.05 ? SKELETON_AIM : MODELS[type]) {
            double ox = 0, oz = 0;
            double angle = bx.leg == 0 ? 0 : (bx.leg == 1 ? 1 : -1) * swing * 0.7;
            boolean spiderLeg = type == SPIDER && bx.leg != 0;
            if (spiderLeg) { oz = Math.sin(walk * 7 + bx.leg * 2.0) * 0.12 * Math.min(1, swing * 3 + 0.05); angle = 0; }
            double hx = bx.sx / 2 * swell, hy = bx.sy / 2, hz = bx.sz / 2 * swell;
            // 8 cantos da caixa, com a perna girando em volta do topo
            double[][] c = CORNERS;
            for (int i = 0; i < 8; i++) {
                double lx = (i & 1) == 0 ? -hx : hx, ly = (i & 2) == 0 ? -hy : hy, lz = (i & 4) == 0 ? -hz : hz;
                if (angle != 0) {
                    double pv = Double.isNaN(bx.piv) ? hy : bx.piv - bx.cy; // pivô no topo (ou no quadril)
                    double py = ly - pv;
                    double ny = py * Math.cos(angle) - lz * Math.sin(angle), nz = py * Math.sin(angle) + lz * Math.cos(angle);
                    ly = ny + pv;
                    lz = nz;
                }
                double mx = bx.cx + lx + ox, my = bx.cy + ly, mz = bx.cz + lz + oz;
                c[i][0] = x + mx * cy + mz * sy;
                c[i][1] = y + my;
                c[i][2] = z - mx * sy + mz * cy;
            }
            for (int f = 0; f < 6; f++) {
                double l = bx.glow ? 1.0 : FACE_SHADE[f] * light;
                double r = ((bx.color >> 16) & 255) / 255.0 * l, g = ((bx.color >> 8) & 255) / 255.0 * l, b = (bx.color & 255) / 255.0 * l;
                if (red) { r = r * 0.5 + 0.5 * l; g *= 0.45; b *= 0.45; }
                if (flash) { r = r * 0.35 + 0.65; g = g * 0.35 + 0.65; b = b * 0.35 + 0.65; }
                for (int t : FACE_TRIS[f]) {
                    out[o++] = (float) c[t][0]; out[o++] = (float) c[t][1]; out[o++] = (float) c[t][2];
                    out[o++] = (float) r; out[o++] = (float) g; out[o++] = (float) b;
                }
            }
        }
        return o;
    }

    int modelFloats() {
        return Math.max(MODELS[type].length, type == SKELETON ? SKELETON_AIM.length : 0) * 36 * 6;
    }

    // tabelas fixas do desenho (criadas uma vez, para não gerar lixo a cada quadro; só a thread do jogo usa)
    private static final double[][] CORNERS = new double[8][3];
    private static final double[] FACE_SHADE = { 0.8, 0.8, 1.0, 0.55, 0.7, 0.7 };
    private static final int[][] FACE_TRIS = { { 1, 3, 7, 7, 5, 1 }, { 0, 4, 6, 6, 2, 0 }, { 2, 6, 7, 7, 3, 2 },
            { 0, 1, 5, 5, 4, 0 }, { 4, 5, 7, 7, 6, 4 }, { 0, 2, 3, 3, 1, 0 } };
}
