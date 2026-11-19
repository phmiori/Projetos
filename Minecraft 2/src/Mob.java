/** Criatura do mundo: animais da fazenda, animais selvagens, pássaros, peixes e monstros. */
final class Mob extends Entity {
    static final int PIG = 0, SHEEP = 1, CHICKEN = 2, ZOMBIE = 3, SPIDER = 4, FISH = 5, COW = 6, CREEPER = 7, SKELETON = 8;
    static final int WOLF = 9, FOX = 10, DEER = 11, RABBIT = 12, BEAR = 13, BIRD = 14, TROPICAL = 15, SALMON = 16, SHARK = 17;
    static final int TIGER = 18, WHITE_TIGER = 19, CAT = 20, SCORPION = 21, EMPEROR = 22;
    static final int POLAR_BEAR = 23, PENGUIN = 24, MUSKOX = 25, NARWHAL = 26;
    static final int TYPES = 27;
    static final String[] NAMES = { "Porco", "Ovelha", "Galinha", "Morto-vivo", "Aranha", "Peixe", "Vaca", "Creeper", "Esqueleto",
            "Lobo", "Raposa", "Cervo", "Coelho", "Urso", "Pássaro", "Peixe tropical", "Salmão", "Tubarão",
            "Tigre-de-bengala", "Tigre-de-bengala branco", "Gato", "Escorpião amarelo", "Escorpião-imperador",
            "Urso-polar", "Pinguim", "Boi-almiscarado", "Narval" };
    private static final double[][] SIZE = { { 0.42, 0.95 }, { 0.42, 1.2 }, { 0.2, 0.75 }, { 0.3, 1.95 }, { 0.6, 0.8 }, { 0.2, 0.35 },
            { 0.45, 1.35 }, { 0.3, 1.7 }, { 0.3, 1.95 },
            { 0.3, 0.85 }, { 0.25, 0.65 }, { 0.36, 1.55 }, { 0.2, 0.5 }, { 0.55, 1.35 }, { 0.15, 0.3 }, { 0.15, 0.3 }, { 0.2, 0.32 }, { 0.6, 0.9 },
            { 0.42, 1.25 }, { 0.42, 1.25 }, { 0.18, 0.5 }, { 0.3, 0.35 }, { 1.1, 1.8 },
            { 0.6, 1.4 }, { 0.2, 0.84 }, { 0.5, 1.3 }, { 0.6, 0.9 } };
    private static final double[] MAX_HP = { 10, 8, 4, 20, 16, 3, 10, 20, 20, 12, 8, 12, 4, 30, 3, 3, 4, 25, 30, 30, 8, 8, 40, 30, 6, 20, 20 };
    private static final double[] SPEED = { 1.5, 1.3, 1.6, 2.7, 3.6, 1.5, 1.3, 2.4, 2.3, 2.6, 2.8, 3.0, 2.4, 2.2, 4.5, 1.6, 2.0, 3.2, 3.0, 3.0, 2.2, 2.6, 2.0,
            2.3, 1.1, 1.6, 2.2 };
    /** Lobo domesticado: vida maior. */
    static final double TAMED_HP = 20;
    /** Creeper: quanto tempo o pavio queima antes de explodir, e a força da explosão. */
    static final double FUSE_TIME = 1.5, CREEPER_POWER = 3.2;

    final int type;
    private static int nextId = 1;
    int id = nextId++; // identifica a criatura na rede
    /** Uma criatura salva volta com o mesmo id (que decide a pelagem/cor); os novos ids não podem repetir. */
    static void reserveId(int used) { if (used >= nextId) nextId = used + 1; }
    static double maxHealth(int type) { return MAX_HP[type]; }
    double health, yaw, hurt, walk, aiTimer, dirX, dirZ, attackCd, flee, burn;
    double idleSound = 2 + Math.random() * 8; // segundos até o próximo som da criatura
    static final String[] SOUNDS = { "porco", "ovelha", "galinha", "morto_vivo", "aranha", null, "vaca", null, "esqueleto",
            "lobo", "raposa", null, null, "urso", "passaro", null, null, null, "rugido", "rugido", "miau", "aranha", "aranha",
            "urso", "pinguim", "boi", null };

    // ---- lobo (domesticável), urso e pássaro ----
    boolean tamed, sitting;   // lobo: tem dono / está sentado esperando
    String ownerName = "";    // nome do dono (salvo com o mundo)
    Player owner;             // o dono, se estiver no mundo agora (o jogo preenche a cada quadro)
    Mob target;               // lobo domesticado: monstro que está atacando
    boolean wantsBite;        // lobo domesticado: mordeu o alvo neste quadro
    double angry;             // lobo selvagem e urso: segundos de raiva depois de apanhar
    boolean flying;           // pássaro: no ar (senão está pousado)
    private boolean landing;
    private double cruise;

    /** Variação de cor de pássaros e peixes tropicais (vem do id, então é igual no anfitrião e nos amigos). */
    int variant() { return Math.floorMod(id, 3); }

    boolean swimmer() { return type == FISH || type == TROPICAL || type == SALMON || type == SHARK || type == NARWHAL; }

    boolean bear() { return type == BEAR || type == POLAR_BEAR; }

    /** Revida quando apanha (fica bravo um tempo): lobo, ursos, tigres e o boi-almiscarado. */
    boolean fighter() { return type == WOLF || bear() || tiger() || type == MUSKOX; }

    /** Ataca jogadores: monstros, tubarão e lobo/urso com raiva. */
    boolean attacksPlayer() {
        return hostile() || type == SHARK || scorpion() || (fighter() && angry > 0 && !tamed);
    }

    boolean tiger() { return type == TIGER || type == WHITE_TIGER; }

    boolean scorpion() { return type == SCORPION || type == EMPEROR; }


    /** Número extra que vai pela rede: pavio, arco, ou o estado do lobo/urso/pássaro. */
    float netAnim() {
        if (type == CREEPER) return (float) fuse;
        if (type == SKELETON) return (float) aim;
        if (fighter()) return (tamed ? 1 : 0) + (sitting ? 2 : 0) + (angry > 0 ? 4 : 0);
        if (type == BIRD) return flying ? 1 : 0;
        return 0;
    }

    void applyNetAnim(float a) {
        if (type == CREEPER) fuse = a;
        else if (type == SKELETON) aim = a;
        else if (fighter()) { int f = (int) a; tamed = (f & 1) != 0; sitting = (f & 2) != 0; angry = (f & 4) != 0 ? 1 : 0; }
        else if (type == BIRD) flying = a > 0.5f;
    }
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

    double attackDamage() {
        return type == ZOMBIE || type == WOLF ? 3 : bear() ? 5 : type == SHARK || type == MUSKOX ? 4 : tiger() || type == EMPEROR ? 6 : 2;
    }

    void update(double dt, World w, Player p, boolean canTarget, java.util.Random r) {
        if (swimmer()) { swim(dt, w, p, canTarget, r); return; }
        if (type == BIRD) { fly(dt, w, p, r); return; }
        updateFluids(w);
        hurt -= dt;
        attackCd -= dt;
        aiTimer -= dt;
        flee -= dt;
        angry -= dt;
        wantsAttack = false;
        wantsBite = false;

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
        // bichos ariscos fogem de quem chega perto
        if ((type == DEER || type == RABBIT || type == FOX || type == CAT) && dist < (type == DEER ? 10 : 6) && Math.abs(py) < 4) flee = Math.max(flee, 1.5);
        // tigre defende o território: quem chega muito perto vira presa
        if (tiger() && canTarget && dist < 5 && Math.abs(py) < 3) angry = Math.max(angry, 12);
        if (type == WOLF && tamed) {
            // lobo domesticado: sentado espera; senão ataca monstros perto do dono ou segue o dono
            if (sitting) {
                tx = tz = 0;
            } else if (target != null && target.health > 0) {
                double ddx = target.x - x, ddz = target.z - z, dd = Math.max(0.01, Math.sqrt(ddx * ddx + ddz * ddz));
                tx = ddx / dd; tz = ddz / dd;
                speed *= 1.35;
                if (dd < 1.4 + target.hw && Math.abs(target.y - y) < 1.6 && attackCd <= 0) { wantsBite = true; attackCd = 0.8; }
            } else if (owner != null) {
                double ddx = owner.x - x, ddz = owner.z - z, dd = Math.max(0.01, Math.sqrt(ddx * ddx + ddz * ddz));
                if ((dd > 24 || Math.abs(owner.y - y) > 12) && w.isLoaded((int) Math.floor(owner.x), (int) Math.floor(owner.z))) {
                    // ficou muito para trás: aparece do lado do dono
                    double a = r.nextDouble() * Math.PI * 2;
                    x = owner.x + Math.sin(a) * 1.5; y = owner.y + 0.2; z = owner.z + Math.cos(a) * 1.5;
                    vx = vy = vz = 0;
                    if (collides(x, y, z, w)) { x = owner.x; z = owner.z; }
                } else if (dd > 3) {
                    tx = ddx / dd; tz = ddz / dd;
                    if (dd > 7) speed *= 1.7;
                }
            }
        } else if (hunting) {
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
        } else if (attacksPlayer() && canTarget && dist < 18 && Math.abs(py) < 8) {
            tx = px / Math.max(dist, 0.01);
            tz = pz / Math.max(dist, 0.01);
            if (!hostile()) speed *= 1.4; // lobo e urso com raiva correm
            double reach = type == SPIDER ? 1.5 : bear() || tiger() ? 1.9 : type == MUSKOX ? 1.6 : type == EMPEROR ? 3.4 : 1.3;
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
        if (type == RABBIT && onGround && (tx != 0 || tz != 0)) vy = 5.2; // coelho anda aos pulos
        move(dt, w, false);
        walk += Math.sqrt(vx * vx + vz * vz) * dt;

        if (landedFall > 4) damage(Math.floor(landedFall - 3));
        landedFall = 0;
        if (inLava) damage(4 * dt);
    }

    private double dirY, outOfWater;

    /**
     * Peixes e tubarão: nadam em 3D só dentro da água; fora dela caem, se debatem e vão perdendo vida.
     * O tubarão persegue quem está na água por perto e morde.
     */
    private void swim(double dt, World w, Player p, boolean canTarget, java.util.Random r) {
        hurt -= dt;
        aiTimer -= dt;
        flee -= dt;
        attackCd -= dt;
        wantsAttack = false;
        boolean water = Block.isWater(w.get((int) Math.floor(x), (int) Math.floor(y + 0.15), (int) Math.floor(z)));
        inWater = water;
        double look = type == SHARK ? 1.6 : type == NARWHAL ? 1.8 : 0.6; // quanto à frente confere se ainda é água
        if (water) {
            outOfWater = 0;
            double dx = p.x - x, dy = p.y + 0.6 - y, dz = p.z - z, d3 = Math.sqrt(dx * dx + dy * dy + dz * dz);
            boolean preyInWater = Block.isWater(w.get((int) Math.floor(p.x), (int) Math.floor(p.y + 0.5), (int) Math.floor(p.z)));
            if (type == SHARK && canTarget && preyInWater && d3 < 16) {
                dirX = dx / d3; dirY = dy / d3; dirZ = dz / d3; // vem atrás de quem está nadando
                if (d3 < 1.9 && attackCd <= 0) { wantsAttack = true; attackCd = 1.2; }
            } else if (flee > 0 && type != SHARK) { // foge do jogador
                double ex = x - p.x, ez = z - p.z, l = Math.max(0.01, Math.sqrt(ex * ex + ez * ez));
                dirX = ex / l; dirZ = ez / l; dirY = 0;
            } else if (aiTimer <= 0) {
                aiTimer = 1.5 + r.nextDouble() * 3;
                double a = r.nextDouble() * Math.PI * 2;
                dirX = Math.sin(a); dirZ = Math.cos(a); dirY = (r.nextDouble() - 0.5) * 0.6;
                if (r.nextDouble() < (type == SHARK ? 0.05 : 0.25)) { dirX = dirZ = dirY = 0; } // às vezes fica parado
            }
            // não sai da água: se o ponto à frente não for água, vira para o outro lado
            int ax = (int) Math.floor(x + dirX * look), ay = (int) Math.floor(y + 0.15 + dirY * look), az = (int) Math.floor(z + dirZ * look);
            if ((dirX != 0 || dirZ != 0 || dirY != 0) && !Block.isWater(w.get(ax, ay, az))) {
                if (type == SHARK && dirY > 0) dirY = 0; // tubarão não pula para fora: fica na superfície
                else { dirX = -dirX; dirZ = -dirZ; dirY = -dirY * 0.5; aiTimer = 0.8; }
            }
            double speed = SPEED[type] * (flee > 0 ? 2.2 : 1) * (type == SHARK && wantsAttack ? 0.6 : 1);
            double k = Math.min(1, dt * (type == SHARK ? 2 : 4));
            vx += (dirX * speed - vx) * k;
            vy += (dirY * speed - vy) * k;
            vz += (dirZ * speed - vz) * k;
            if (dirX != 0 || dirZ != 0) {
                double target = Math.atan2(dirX, dirZ), diff = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
                yaw += diff * Math.min(1, dt * (type == SHARK ? 3 : 6));
            }
            move(dt, w, true);
        } else {
            vy -= 28 * dt;
            if (onGround && r.nextDouble() < dt * 3) { // debate
                vy = type == SHARK ? 2 : 4;
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
        walk += (Math.sqrt(vx * vx + vz * vz) + 0.6) * dt * 3;
    }

    /**
     * Pássaro: pousado, anda aos pulinhos e levanta voo quando alguém chega perto (ou de vez em quando).
     * No ar, plana alguns blocos acima do chão, desvia do que bater e às vezes desce para pousar.
     */
    private void fly(double dt, World w, Player p, java.util.Random r) {
        hurt -= dt;
        aiTimer -= dt;
        flee -= dt;
        wantsAttack = false;
        updateFluids(w);
        double px = p.x - x, pz = p.z - z, dist = Math.sqrt(px * px + pz * pz);
        if (!flying) {
            if (dist < 5 || flee > 0 || inWater || r.nextDouble() < dt * 0.07) {
                flying = true; landing = false; vy = 5; aiTimer = 0;
            } else {
                if (aiTimer <= 0) { // pulinhos para lá e para cá
                    aiTimer = 0.6 + r.nextDouble() * 1.5;
                    double a = r.nextDouble() * Math.PI * 2;
                    boolean hop = r.nextDouble() < 0.5;
                    dirX = hop ? Math.sin(a) : 0; dirZ = hop ? Math.cos(a) : 0;
                    if (hop && onGround) vy = 3;
                    if (hop) yaw = a;
                }
                double k = Math.min(1, dt * 6);
                vx += (dirX * 0.8 - vx) * k;
                vz += (dirZ * 0.8 - vz) * k;
                if (onGround) { dirX *= 0.9; dirZ *= 0.9; }
                vy -= 28 * dt;
                move(dt, w, false);
                walk += Math.sqrt(vx * vx + vz * vz) * dt;
                landedFall = 0;
                return;
            }
        }
        // no ar
        if (aiTimer <= 0) {
            aiTimer = 2 + r.nextDouble() * 3;
            double a = r.nextDouble() * Math.PI * 2;
            if (flee > 0 || dist < 7) a = Math.atan2(-px, -pz) + (r.nextDouble() - 0.5) * 1.2; // para longe de quem assustou
            dirX = Math.sin(a); dirZ = Math.cos(a);
            cruise = 5 + r.nextDouble() * 9;
            landing = flee <= 0 && dist > 10 && r.nextDouble() < 0.3;
        }
        int bx = (int) Math.floor(x), bz = (int) Math.floor(z), ground = (int) Math.floor(y) - 30;
        for (int yy = (int) Math.floor(y); yy > (int) Math.floor(y) - 30; yy--)
            if (Block.solid(w.get(bx, yy, bz)) || Block.isLeaves(w.get(bx, yy, bz)) || Block.isWater(w.get(bx, yy, bz))) { ground = yy; break; }
        double want = landing ? ground + 1 : ground + 1 + cruise;
        want = Math.min(want, World.SY + 6);
        vy += (Math.max(-4, Math.min(4, (want - y) * 1.2)) - vy) * Math.min(1, dt * 2.5);
        double speed = SPEED[BIRD] * (landing ? 0.5 : 1) * (flee > 0 ? 1.4 : 1);
        double k = Math.min(1, dt * 2);
        vx += (dirX * speed - vx) * k;
        vz += (dirZ * speed - vz) * k;
        double target = Math.atan2(vx, vz), diff = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
        yaw += diff * Math.min(1, dt * 5);
        move(dt, w, false);
        if (hitWall) { dirX = -dirX; dirZ = -dirZ; vy = 3; } // bateu: dá meia-volta e sobe
        walk += dt * (landing ? 2.5 : 4); // bater de asas
        landedFall = 0;
        if (landing && onGround) { flying = false; landing = false; vx = vz = 0; aiTimer = 1; }
        if (inWater) { vy = 4; landing = false; }
    }

    void damage(double d) {
        health -= d;
        hurt = 0.35;
        if (fighter()) {
            if (tamed) sitting = false; // o lobo domesticado levanta para se defender
            else angry = 25;            // lobo selvagem e urso revidam
        } else if (!hostile() && type != SHARK && !scorpion()) flee = 4;
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
            case WOLF: return tamed ? new int[0] : pairs(Items.BONE, r.nextInt(2));
            case FOX: return pairs(Items.LEATHER, r.nextInt(2));
            case DEER: return pairs(Items.RAW_MEAT, 1 + r.nextInt(3), Items.LEATHER, r.nextInt(3));
            case RABBIT: return new int[] { Items.RAW_MEAT, 1 };
            case BEAR: return pairs(Items.RAW_MEAT, 2 + r.nextInt(3), Items.LEATHER, 1 + r.nextInt(2));
            case POLAR_BEAR: return pairs(Items.RAW_MEAT, 1 + r.nextInt(2), Items.RAW_FISH, 1 + r.nextInt(2), Items.LEATHER, 1 + r.nextInt(2));
            case PENGUIN: return pairs(Items.FEATHER, 1 + r.nextInt(2), Items.RAW_FISH, r.nextInt(2));
            case MUSKOX: return pairs(Items.RAW_MEAT, 2 + r.nextInt(2), Items.LEATHER, 1 + r.nextInt(2), Block.WOOL, r.nextInt(2));
            case NARWHAL: return pairs(Items.RAW_FISH, 2 + r.nextInt(3), Items.BONE, 1);
            case BIRD: return pairs(Items.FEATHER, 1 + r.nextInt(2));
            case TROPICAL: return new int[] { Items.RAW_FISH, 1 };
            case SALMON: return new int[] { Items.RAW_FISH, 1 + r.nextInt(2) };
            case SHARK: return pairs(Items.RAW_FISH, 3 + r.nextInt(3), Items.BONE, r.nextInt(2));
            case TIGER: case WHITE_TIGER: return pairs(Items.RAW_MEAT, 1 + r.nextInt(3), Items.LEATHER, 1 + r.nextInt(2));
            case CAT: return pairs(Items.STRING, r.nextInt(2));
            case SCORPION: return pairs(Items.STRING, r.nextInt(2));
            case EMPEROR: return pairs(Items.STRING, 1 + r.nextInt(2), Items.BONE, r.nextInt(2), Items.GUNPOWDER, r.nextInt(2));
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
        int wool = 0xEDEDE6, woolL = 0xF8F8F2, woolD = 0xD6D6CC, woolS = 0xC4C2B8;
        int face = 0xC8B8A6, faceD = 0xA8957F, faceL = 0xDCCDBB, legC = 0x8A7E72, hoofS = 0x4A423A, earIn = 0xE0A8A0, nose = 0x6A4A44;
        java.util.List<Box> sh = new java.util.ArrayList<>();
        // pernas: tufo de lã na coxa, canela escura, joelho e casco (balançam no quadril)
        double[][] shLegs = { { -0.2, 0.3, 1 }, { 0.2, 0.3, 2 }, { -0.2, -0.3, 2 }, { 0.2, -0.3, 1 } };
        for (double[] sl : shLegs) {
            int ph = (int) sl[2];
            sh.add(legp(sl[0], 0.43, sl[1], 0.27, 0.14, 0.27, woolD, ph, 0.5));
            sh.add(legp(sl[0], 0.3, sl[1], 0.17, 0.26, 0.17, legC, ph, 0.5));
            sh.add(legp(sl[0], 0.3, sl[1] + 0.09, 0.15, 0.08, 0.02, faceD, ph, 0.5));
            sh.add(legp(sl[0], 0.07, sl[1] + 0.005, 0.18, 0.14, 0.18, faceD, ph, 0.5));
            sh.add(legp(sl[0], 0.025, sl[1] + 0.01, 0.19, 0.05, 0.19, hoofS, ph, 0.5));
        }
        // corpo: miolo de lã, barriga, camadas fofas e tufos em volta
        sh.add(b(0, 0.8, 0, 0.76, 0.6, 1.05, wool));
        sh.add(b(0, 0.52, 0, 0.6, 0.06, 0.9, woolS));
        sh.add(b(0, 0.86, 0, 0.84, 0.4, 0.9, woolL));
        sh.add(b(0, 0.72, -0.04, 0.82, 0.3, 0.98, wool));
        sh.add(b(0, 1.12, -0.02, 0.6, 0.08, 0.8, woolL));
        sh.add(b(0, 1.16, -0.1, 0.4, 0.05, 0.4, woolL));
        sh.add(b(0, 0.9, -0.54, 0.64, 0.46, 0.08, woolD));
        sh.add(b(0, 0.8, 0.54, 0.6, 0.42, 0.06, woolD));
        sh.add(b(0.405, 0.95, 0.15, 0.04, 0.22, 0.3, woolD)); sh.add(b(-0.405, 0.7, -0.15, 0.04, 0.2, 0.3, woolD));
        sh.add(b(-0.405, 0.95, 0.2, 0.04, 0.18, 0.26, woolL)); sh.add(b(0.405, 0.68, -0.2, 0.04, 0.2, 0.26, woolL));
        sh.add(b(0.25, 1.15, 0.28, 0.2, 0.06, 0.2, woolD)); sh.add(b(-0.22, 1.16, -0.3, 0.22, 0.06, 0.18, woolD));
        sh.add(b(0, 0.9, -0.6, 0.18, 0.18, 0.1, woolL));                     // rabinho de lã
        // pescoço de lã e cabeça comprida com focinho
        sh.add(b(0, 0.92, 0.55, 0.5, 0.42, 0.2, woolL));
        sh.add(b(0, 0.98, 0.66, 0.4, 0.3, 0.12, wool));
        sh.add(b(0, 0.95, 0.76, 0.32, 0.34, 0.36, face));
        sh.add(b(0, 0.82, 0.88, 0.2, 0.18, 0.18, faceL));                    // focinho
        sh.add(b(0, 0.8, 0.975, 0.16, 0.12, 0.01, nose));
        sh.add(b(-0.04, 0.82, 0.98, 0.03, 0.04, 0.01, 0x2A1A18)); sh.add(b(0.04, 0.82, 0.98, 0.03, 0.04, 0.01, 0x2A1A18));
        sh.add(b(0, 0.75, 0.975, 0.14, 0.015, 0.01, 0x2A1A18));
        sh.add(b(0, 1.03, 0.945, 0.12, 0.2, 0.01, faceL));                   // listra da testa
        sh.add(b(-0.165, 0.92, 0.76, 0.01, 0.2, 0.26, faceD)); sh.add(b(0.165, 0.92, 0.76, 0.01, 0.2, 0.26, faceD)); // bochechas
        sh.add(b(0, 1.15, 0.72, 0.34, 0.1, 0.28, woolL));                    // topete de lã
        sh.add(b(0, 1.22, 0.7, 0.22, 0.06, 0.18, wool));
        for (double ex : new double[] { -0.1, 0.1 }) {
            sh.add(b(ex, 1.0, 0.945, 0.1, 0.08, 0.01, 0xF2F2EA));
            sh.add(eye(ex, 1.0, 0.953, 0.06, 0x202020));
            sh.add(b(ex, 1.06, 0.945, 0.11, 0.02, 0.01, faceD));
        }
        // orelhas abertas para os lados, com o interior rosado
        for (int side = -1; side <= 1; side += 2) {
            sh.add(b(side * 0.25, 1.02, 0.72, 0.16, 0.07, 0.14, face));
            sh.add(b(side * 0.33, 0.99, 0.72, 0.08, 0.06, 0.12, faceD));
            sh.add(b(side * 0.25, 1.015, 0.73, 0.1, 0.06, 0.08, earIn));
        }
        MODELS[SHEEP] = sh.toArray(new Box[0]);
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

    // ------------------------------------------------------------------ modelos dos bichos selvagens
    /** Lobo sentado, e as versões com coleira (domesticado); cervo macho com galhada. */
    private static final Box[] WOLF_SIT, WOLF_TAMED, WOLF_SIT_TAMED, DEER_STAG;
    /** Cores trocadas por variante: índices 1, 2 e 3 do modelo viram as cores da paleta [variante][índice-1]. */
    private static final int[][] BIRD_COLORS = { { 0x3A6AD8, 0x22448E, 0xE8E4D8 }, { 0xD02828, 0x8E1A1A, 0xC84A3A }, { 0xF0D030, 0x8A7A22, 0xF8EC98 } };
    private static final int[][] TROPICAL_COLORS = { { 0xF0D020, 0x2050D0, 0xF8F8F0 }, { 0xF07020, 0xFAFAF4, 0x202020 }, { 0x20B0D0, 0xF0E040, 0x204090 } };
    /** Asas (5 e 6) giram em volta do ombro; caudas de peixe (7) balançam para os lados. */
    private static final int WING_L = 5, WING_R = 6, TAIL = 7;

    private static Box wing(double cx, double cy, double cz, double sx, double sy, double sz, int c, int side, double shoulder) {
        return new Box(cx, cy, cz, sx, sy, sz, c, side > 0 ? WING_L : WING_R, false, shoulder);
    }

    private static Box tail(double cx, double cy, double cz, double sx, double sy, double sz, int c, double pivotZ) {
        return new Box(cx, cy, cz, sx, sy, sz, c, TAIL, false, pivotZ);
    }

    /** Cabeça do lobo (dy, dz deslocam: o lobo sentado ergue a cabeça). */
    private static void wolfHead(java.util.List<Box> l, double dy, double dz, int fur, int furD, int furL, int dark) {
        l.add(b(0, 0.8 + dy, 0.53 + dz, 0.28, 0.24, 0.24, fur));                        // crânio
        l.add(b(0, 0.9 + dy, 0.6 + dz, 0.18, 0.04, 0.1, furD));                         // testa
        l.add(b(-0.15, 0.75 + dy, 0.5 + dz, 0.05, 0.16, 0.16, furL)); l.add(b(0.15, 0.75 + dy, 0.5 + dz, 0.05, 0.16, 0.16, furL)); // juba das bochechas
        l.add(b(0, 0.745 + dy, 0.7 + dz, 0.14, 0.12, 0.16, furL));                      // focinho
        l.add(b(0, 0.81 + dy, 0.7 + dz, 0.12, 0.02, 0.15, furD));
        l.add(b(0, 0.785 + dy, 0.785 + dz, 0.07, 0.05, 0.02, 0x141414));                // nariz
        l.add(b(0, 0.69 + dy, 0.71 + dz, 0.12, 0.02, 0.13, dark));                      // boca
        l.add(b(0, 0.67 + dy, 0.66 + dz, 0.1, 0.03, 0.12, furL));                       // queixo
        for (int s = -1; s <= 1; s += 2) {
            l.add(eye(s * 0.075, 0.85 + dy, 0.652 + dz, 0.05, 0xE0B030));               // olhos cor de âmbar
            l.add(b(s * 0.075, 0.85 + dy, 0.657 + dz, 0.015, 0.028, 0.004, 0x101010));
            l.add(b(s * 0.075, 0.885 + dy, 0.651 + dz, 0.07, 0.018, 0.01, furD));        // sobrancelha
            l.add(b(s * 0.085, 0.96 + dy, 0.5 + dz, 0.08, 0.1, 0.05, furD));             // orelha
            l.add(b(s * 0.085, 0.955 + dy, 0.526 + dz, 0.045, 0.06, 0.005, 0xC89A94));
            l.add(b(s * 0.085, 1.02 + dy, 0.5 + dz, 0.05, 0.04, 0.04, dark));
        }
    }

    static {
        int fur = 0x8E9096, furD = 0x5E6066, furL = 0xD4D4D6, ruff = 0xB4B6BA, dark = 0x2E2E34, collar = 0xC42424, tag = 0xE8C040;
        // ---- lobo em pé ----
        java.util.List<Box> wf = new java.util.ArrayList<>();
        double[][] wLegs = { { -0.11, 0.28, 1, 0 }, { 0.11, 0.28, 2, 0 }, { -0.11, -0.3, 2, 1 }, { 0.11, -0.3, 1, 1 } };
        for (double[] lg : wLegs) {
            int ph = (int) lg[2];
            double lx = lg[0], lz = lg[1];
            if (lg[3] == 0) { // dianteiras
                wf.add(legp(lx, 0.36, lz, 0.12, 0.2, 0.13, fur, ph, 0.5));
                wf.add(legp(lx, 0.17, lz, 0.09, 0.22, 0.1, furD, ph, 0.5));
            } else {          // traseiras: coxa forte e jarrete
                wf.add(legp(lx, 0.4, lz, 0.15, 0.24, 0.2, fur, ph, 0.52));
                wf.add(legp(lx, 0.18, lz - 0.04, 0.09, 0.22, 0.1, furD, ph, 0.52));
            }
            wf.add(legp(lx, 0.035, lz + 0.02, 0.11, 0.07, 0.14, furD, ph, 0.5));
            wf.add(legp(lx - 0.025, 0.02, lz + 0.09, 0.03, 0.03, 0.03, dark, ph, 0.5));
            wf.add(legp(lx + 0.025, 0.02, lz + 0.09, 0.03, 0.03, 0.03, dark, ph, 0.5));
        }
        wf.add(b(0, 0.55, -0.04, 0.32, 0.3, 0.7, fur));                    // tronco
        wf.add(b(0, 0.6, 0.24, 0.38, 0.38, 0.3, fur));                     // ombros
        wf.add(b(0, 0.64, 0.32, 0.42, 0.34, 0.18, ruff));                  // juba do peito
        wf.add(b(0, 0.395, 0.0, 0.24, 0.03, 0.56, furL));                  // barriga
        wf.add(b(0, 0.705, -0.06, 0.24, 0.03, 0.5, furD));                 // sela escura
        wf.add(b(-0.165, 0.52, -0.1, 0.01, 0.18, 0.4, furD)); wf.add(b(0.165, 0.52, -0.1, 0.01, 0.18, 0.4, furD));
        wf.add(b(0, 0.64, -0.44, 0.11, 0.11, 0.16, fur));                  // cauda caída
        wf.add(b(0, 0.56, -0.55, 0.12, 0.13, 0.14, furD));
        wf.add(b(0, 0.47, -0.62, 0.1, 0.12, 0.1, dark));
        wf.add(b(0, 0.72, 0.42, 0.22, 0.2, 0.14, fur));                    // pescoço
        wolfHead(wf, 0, 0, fur, furD, furL, dark);
        MODELS[WOLF] = wf.toArray(new Box[0]);
        WOLF_TAMED = join(MODELS[WOLF], new Box[] { b(0, 0.655, 0.45, 0.27, 0.07, 0.17, collar), b(0, 0.6, 0.54, 0.05, 0.06, 0.02, tag) });
        // ---- lobo sentado ----
        java.util.List<Box> ws = new java.util.ArrayList<>();
        for (int s = -1; s <= 1; s += 2) {
            ws.add(b(s * 0.12, 0.035, 0.0, 0.11, 0.07, 0.18, furD));           // patas de trás
            ws.add(b(s * 0.13, 0.18, -0.16, 0.14, 0.24, 0.3, fur));             // coxas dobradas
            ws.add(b(s * 0.11, 0.24, 0.22, 0.09, 0.44, 0.1, furD));             // pernas da frente esticadas
            ws.add(b(s * 0.11, 0.035, 0.25, 0.11, 0.07, 0.14, furD));
            ws.add(b(s * 0.11 - 0.025, 0.02, 0.32, 0.03, 0.03, 0.03, dark)); ws.add(b(s * 0.11 + 0.025, 0.02, 0.32, 0.03, 0.03, 0.03, dark));
        }
        ws.add(b(0, 0.25, -0.15, 0.3, 0.3, 0.3, fur));                     // quadril no chão
        ws.add(b(0, 0.45, -0.02, 0.32, 0.34, 0.32, fur));
        ws.add(b(0, 0.6, 0.12, 0.36, 0.36, 0.26, fur));                    // peito erguido
        ws.add(b(0, 0.66, 0.2, 0.42, 0.3, 0.16, ruff));
        ws.add(b(0, 0.42, 0.13, 0.24, 0.3, 0.02, furL));                   // peito claro
        ws.add(b(0, 0.05, -0.38, 0.11, 0.09, 0.3, fur));                   // cauda no chão
        ws.add(b(0, 0.05, -0.56, 0.1, 0.09, 0.08, dark));
        ws.add(b(0, 0.8, 0.26, 0.2, 0.2, 0.14, fur));                      // pescoço
        wolfHead(ws, 0.1, -0.16, fur, furD, furL, dark);
        WOLF_SIT = ws.toArray(new Box[0]);
        WOLF_SIT_TAMED = join(WOLF_SIT, new Box[] { b(0, 0.745, 0.31, 0.27, 0.07, 0.17, collar), b(0, 0.69, 0.4, 0.05, 0.06, 0.02, tag) });

        // ---- raposa ----
        int or = 0xD8682A, orD = 0xA84A1C, wht = 0xF2EEE6, blk = 0x2A1E18;
        java.util.List<Box> fx = new java.util.ArrayList<>();
        double[][] fLegs = { { -0.08, 0.2, 1 }, { 0.08, 0.2, 2 }, { -0.08, -0.2, 2 }, { 0.08, -0.2, 1 } };
        for (double[] lg : fLegs) {
            int ph = (int) lg[2];
            fx.add(legp(lg[0], 0.25, lg[1], 0.09, 0.12, 0.1, or, ph, 0.32));
            fx.add(legp(lg[0], 0.11, lg[1], 0.07, 0.18, 0.07, blk, ph, 0.32));      // meias pretas
            fx.add(legp(lg[0], 0.025, lg[1] + 0.015, 0.08, 0.05, 0.1, blk, ph, 0.32));
        }
        fx.add(b(0, 0.38, 0, 0.24, 0.22, 0.54, or));
        fx.add(b(0, 0.27, 0.02, 0.18, 0.02, 0.44, wht));                   // barriga
        fx.add(b(0, 0.36, 0.26, 0.18, 0.18, 0.04, wht));                   // peito branco
        fx.add(b(0, 0.495, -0.02, 0.16, 0.02, 0.44, orD));
        fx.add(b(0, 0.4, -0.36, 0.16, 0.16, 0.22, or));                    // cauda peluda com ponta branca
        fx.add(b(0, 0.36, -0.5, 0.19, 0.19, 0.14, or));
        fx.add(b(0, 0.34, -0.6, 0.15, 0.15, 0.08, wht));
        fx.add(b(0, 0.46, 0.3, 0.16, 0.16, 0.1, or));                      // pescoço
        fx.add(b(0, 0.52, 0.38, 0.24, 0.2, 0.18, or));                     // cabeça
        fx.add(b(-0.1, 0.47, 0.4, 0.06, 0.1, 0.14, wht)); fx.add(b(0.1, 0.47, 0.4, 0.06, 0.1, 0.14, wht));
        fx.add(b(0, 0.47, 0.52, 0.1, 0.08, 0.14, wht));                    // focinho fino
        fx.add(b(0, 0.515, 0.52, 0.08, 0.02, 0.13, or));
        fx.add(b(0, 0.49, 0.592, 0.04, 0.035, 0.01, blk));
        for (int s = -1; s <= 1; s += 2) {
            fx.add(eye(s * 0.06, 0.56, 0.472, 0.04, 0xD8A020));
            fx.add(b(s * 0.06, 0.56, 0.476, 0.01, 0.026, 0.004, 0x101010));
            fx.add(b(s * 0.075, 0.66, 0.37, 0.08, 0.11, 0.04, or));          // orelhas pontudas
            fx.add(b(s * 0.075, 0.65, 0.392, 0.04, 0.07, 0.005, wht));
            fx.add(b(s * 0.075, 0.725, 0.37, 0.06, 0.04, 0.04, blk));
        }
        MODELS[FOX] = fx.toArray(new Box[0]);

        // ---- cervo (fêmea) e macho com galhada ----
        int br = 0x9A6A40, brD = 0x6E4A2A, brL = 0xC89A68, bel = 0xE4D2B4, hoof = 0x2A2018, ant = 0xCDB890;
        java.util.List<Box> dr = new java.util.ArrayList<>();
        double[][] dLegs = { { -0.13, 0.36, 1, 0 }, { 0.13, 0.36, 2, 0 }, { -0.13, -0.36, 2, 1 }, { 0.13, -0.36, 1, 1 } };
        for (double[] lg : dLegs) {
            int ph = (int) lg[2];
            double lx = lg[0], lz = lg[1];
            if (lg[3] == 0) dr.add(legp(lx, 0.82, lz, 0.12, 0.22, 0.14, br, ph, 0.95));
            else dr.add(legp(lx, 0.82, lz, 0.15, 0.28, 0.2, br, ph, 0.95));
            dr.add(legp(lx, 0.42, lz - (lg[3] == 1 ? 0.03 : 0), 0.075, 0.62, 0.075, brD, ph, 0.95)); // canela fina
            dr.add(legp(lx, 0.6, lz + 0.04, 0.08, 0.06, 0.02, brL, ph, 0.95));                       // joelho
            dr.add(legp(lx, 0.04, lz + 0.01, 0.08, 0.08, 0.1, hoof, ph, 0.95));                       // casco
        }
        dr.add(b(0, 1.0, 0, 0.4, 0.38, 0.92, br));
        dr.add(b(0, 0.81, 0, 0.32, 0.03, 0.78, bel));
        dr.add(b(0, 1.195, -0.04, 0.26, 0.02, 0.7, brD));
        for (double sz2 : new double[] { -0.2, 0.0, 0.2 }) { // pintinhas claras nas costas
            dr.add(b(-0.12, 1.192, sz2, 0.04, 0.01, 0.04, brL)); dr.add(b(0.12, 1.192, sz2 + 0.1, 0.04, 0.01, 0.04, brL));
        }
        dr.add(b(0, 1.0, -0.465, 0.26, 0.26, 0.02, bel));                  // traseiro claro
        dr.add(b(0, 1.12, -0.49, 0.08, 0.14, 0.06, br));                   // rabinho
        dr.add(b(0, 1.08, -0.523, 0.06, 0.1, 0.01, 0xFFFFFF));
        dr.add(b(0, 1.22, 0.42, 0.2, 0.3, 0.2, br));                       // pescoço comprido
        dr.add(b(0, 1.42, 0.5, 0.18, 0.24, 0.18, br));
        dr.add(b(0, 1.28, 0.525, 0.12, 0.28, 0.02, bel));
        dr.add(b(0, 1.58, 0.6, 0.22, 0.22, 0.26, br));                     // cabeça
        dr.add(b(0, 1.52, 0.76, 0.14, 0.14, 0.16, brL));                   // focinho
        dr.add(b(0, 1.53, 0.845, 0.1, 0.07, 0.02, 0x1E1814));
        dr.add(b(0, 1.465, 0.8, 0.1, 0.015, 0.08, brD));
        for (int s = -1; s <= 1; s += 2) {
            dr.add(b(s * 0.111, 1.62, 0.66, 0.008, 0.08, 0.09, 0xF0E8DC)); // olhos dos lados
            dr.add(b(s * 0.115, 1.62, 0.665, 0.006, 0.055, 0.06, 0x101010));
            dr.add(b(s * 0.15, 1.7, 0.55, 0.14, 0.07, 0.04, br));           // orelhas
            dr.add(b(s * 0.15, 1.7, 0.572, 0.1, 0.045, 0.005, 0xD8A8A0));
        }
        MODELS[DEER] = dr.toArray(new Box[0]);
        java.util.List<Box> st = new java.util.ArrayList<>(dr);
        for (int s = -1; s <= 1; s += 2) {
            st.add(b(s * 0.07, 1.74, 0.58, 0.04, 0.12, 0.04, ant));
            st.add(b(s * 0.11, 1.86, 0.56, 0.04, 0.14, 0.04, ant));
            st.add(b(s * 0.16, 1.96, 0.52, 0.04, 0.12, 0.04, ant));
            st.add(b(s * 0.2, 2.06, 0.5, 0.04, 0.12, 0.04, ant));
            st.add(b(s * 0.13, 1.95, 0.62, 0.03, 0.1, 0.03, ant));          // pontas da galhada
            st.add(b(s * 0.19, 2.08, 0.58, 0.03, 0.08, 0.03, ant));
            st.add(b(s * 0.24, 2.14, 0.47, 0.03, 0.08, 0.03, ant));
            st.add(b(s * 0.14, 2.0, 0.46, 0.03, 0.08, 0.03, ant));
        }
        DEER_STAG = st.toArray(new Box[0]);

        // ---- coelho ----
        int rb = 0x9C8670, rbD = 0x7A6650, rbL = 0xD8CCB8;
        java.util.List<Box> rab = new java.util.ArrayList<>();
        for (int s = -1; s <= 1; s += 2) {
            int ph = s < 0 ? 1 : 2;
            rab.add(legp(s * 0.06, 0.07, 0.12, 0.05, 0.12, 0.06, rb, ph, 0.14));
            rab.add(legp(s * 0.09, 0.09, -0.08, 0.08, 0.14, 0.16, rb, 3 - ph, 0.16));    // coxa de trás
            rab.add(legp(s * 0.09, 0.02, -0.02, 0.07, 0.04, 0.17, rbD, 3 - ph, 0.16));    // pé comprido
        }
        rab.add(b(0, 0.2, -0.03, 0.22, 0.2, 0.32, rb));
        rab.add(b(0, 0.105, 0.0, 0.16, 0.02, 0.24, rbL));
        rab.add(b(0, 0.24, -0.2, 0.09, 0.09, 0.06, 0xF6F4F0));             // rabinho de algodão
        rab.add(b(0, 0.3, 0.15, 0.16, 0.15, 0.15, rb));
        rab.add(b(0, 0.27, 0.23, 0.08, 0.06, 0.03, rbL));
        rab.add(b(0, 0.285, 0.247, 0.03, 0.02, 0.01, 0xD07878));
        for (int s = -1; s <= 1; s += 2) {
            rab.add(b(s * 0.081, 0.32, 0.17, 0.005, 0.04, 0.04, 0x101010));
            rab.add(b(s * 0.04, 0.45, 0.12, 0.045, 0.18, 0.03, rb));        // orelhas compridas
            rab.add(b(s * 0.04, 0.45, 0.136, 0.025, 0.14, 0.005, 0xE0A8A8));
            rab.add(b(s * 0.04, 0.55, 0.12, 0.04, 0.03, 0.03, rbD));
        }
        MODELS[RABBIT] = rab.toArray(new Box[0]);

        // ---- urso ----
        int be = 0x5A3A22, beD = 0x3E2716, beL = 0x7A5434, muz = 0xA67C52, claw = 0xD8D0C0;
        java.util.List<Box> bear = new java.util.ArrayList<>();
        double[][] bLegs = { { -0.24, 0.5, 1, 0 }, { 0.24, 0.5, 2, 0 }, { -0.24, -0.48, 2, 1 }, { 0.24, -0.48, 1, 1 } };
        for (double[] lg : bLegs) {
            int ph = (int) lg[2];
            double lx = lg[0], lz = lg[1];
            bear.add(legp(lx, 0.62, lz, lg[3] == 0 ? 0.26 : 0.3, 0.38, lg[3] == 0 ? 0.28 : 0.36, be, ph, 0.82));
            bear.add(legp(lx, 0.25, lz, 0.22, 0.4, 0.24, beD, ph, 0.82));
            bear.add(legp(lx, 0.05, lz + 0.03, 0.24, 0.1, 0.3, beD, ph, 0.82));
            for (int t = -1; t <= 1; t++) bear.add(legp(lx + t * 0.06, 0.03, lz + 0.19, 0.03, 0.04, 0.06, claw, ph, 0.82)); // garras
        }
        bear.add(b(0, 0.9, -0.02, 0.82, 0.7, 1.4, be));
        bear.add(b(0, 1.28, 0.36, 0.6, 0.16, 0.4, be));                    // corcova
        bear.add(b(0, 0.545, 0, 0.66, 0.03, 1.1, beD));
        bear.add(b(0, 1.255, -0.1, 0.5, 0.02, 0.9, beL));
        bear.add(b(-0.411, 0.95, 0.1, 0.01, 0.4, 0.9, beL)); bear.add(b(0.411, 0.95, 0.1, 0.01, 0.4, 0.9, beL));
        bear.add(b(0, 0.95, -0.73, 0.7, 0.56, 0.08, beD));
        bear.add(b(0, 1.02, -0.78, 0.12, 0.1, 0.06, beD));
        bear.add(b(0, 1.05, 0.75, 0.5, 0.46, 0.2, be));                    // pescoço grosso
        bear.add(b(0, 1.08, 0.92, 0.5, 0.44, 0.36, be));                   // cabeça
        bear.add(b(0, 1.29, 0.92, 0.4, 0.04, 0.3, beL));
        bear.add(b(0, 0.98, 1.14, 0.24, 0.2, 0.16, muz));                  // focinho
        bear.add(b(0, 1.04, 1.225, 0.12, 0.08, 0.02, 0x14100C));
        bear.add(b(0, 0.9, 1.18, 0.18, 0.02, 0.1, beD));
        for (int s = -1; s <= 1; s += 2) {
            bear.add(eye(s * 0.12, 1.16, 1.102, 0.05, 0x101010));
            bear.add(b(s * 0.2, 1.33, 0.86, 0.12, 0.12, 0.06, be));         // orelhas redondas
            bear.add(b(s * 0.2, 1.33, 0.893, 0.07, 0.07, 0.005, beD));
        }
        MODELS[BEAR] = bear.toArray(new Box[0]);

        // ---- pássaro (cores 1, 2 e 3 mudam com a variante: azul, vermelho, amarelo) ----
        int P = 1, S = 2, B = 3, beak = 0xE8B040, legB = 0xD08A40;
        java.util.List<Box> bd = new java.util.ArrayList<>();
        for (int s = -1; s <= 1; s += 2) {
            bd.add(b(s * 0.03, 0.04, 0.0, 0.015, 0.08, 0.015, legB));
            bd.add(b(s * 0.03, 0.005, 0.025, 0.02, 0.01, 0.05, legB));
        }
        bd.add(b(0, 0.15, 0, 0.13, 0.12, 0.22, P));
        bd.add(b(0, 0.11, 0.02, 0.11, 0.06, 0.18, B));                     // peito
        bd.add(b(0, 0.215, -0.02, 0.1, 0.01, 0.16, S));
        bd.add(b(0, 0.24, 0.1, 0.11, 0.1, 0.1, P));                        // cabeça
        bd.add(b(0, 0.3, 0.08, 0.03, 0.04, 0.05, P));                      // topete
        bd.add(b(0, 0.235, 0.17, 0.035, 0.03, 0.05, beak));                // bico
        bd.add(b(0, 0.222, 0.165, 0.03, 0.01, 0.04, 0xB08020));
        for (int s = -1; s <= 1; s += 2) {
            bd.add(b(s * 0.056, 0.255, 0.12, 0.005, 0.028, 0.028, 0xF4F4F0));
            bd.add(b(s * 0.059, 0.255, 0.125, 0.004, 0.018, 0.018, 0x101010));
        }
        bd.add(b(0, 0.17, -0.15, 0.08, 0.02, 0.12, S));                    // cauda
        bd.add(b(0, 0.165, -0.21, 0.1, 0.015, 0.06, S));
        for (int s = -1; s <= 1; s += 2) {                                 // asas abertas (giram no ombro)
            double sh = s * 0.065;
            bd.add(wing(sh + s * 0.1, 0.17, -0.01, 0.2, 0.02, 0.14, S, s, sh));
            bd.add(wing(sh + s * 0.24, 0.17, -0.03, 0.1, 0.016, 0.1, S, s, sh));
            bd.add(wing(sh + s * 0.1, 0.182, 0.03, 0.18, 0.005, 0.03, B, s, sh));
        }
        MODELS[BIRD] = bd.toArray(new Box[0]);

        // ---- peixe tropical (alto e fino, listrado; cores pela variante) ----
        int F = 3;
        java.util.List<Box> tp = new java.util.ArrayList<>();
        tp.add(b(0, 0.16, 0, 0.07, 0.2, 0.22, P));
        tp.add(b(0, 0.16, 0.13, 0.065, 0.14, 0.06, P));
        tp.add(b(0, 0.16, 0.05, 0.075, 0.205, 0.03, S)); tp.add(b(0, 0.16, -0.05, 0.075, 0.2, 0.03, S)); // listras
        tp.add(b(0, 0.29, -0.01, 0.02, 0.07, 0.14, F));                    // nadadeira de cima
        tp.add(b(0, 0.04, -0.03, 0.02, 0.05, 0.1, F));
        tp.add(b(-0.04, 0.13, 0.05, 0.02, 0.04, 0.05, F)); tp.add(b(0.04, 0.13, 0.05, 0.02, 0.04, 0.05, F));
        tp.add(tail(0, 0.16, -0.16, 0.02, 0.16, 0.08, F, -0.11));
        tp.add(b(0, 0.14, 0.165, 0.03, 0.015, 0.01, 0x303030));
        for (int s = -1; s <= 1; s += 2) {
            tp.add(b(s * 0.036, 0.19, 0.12, 0.005, 0.045, 0.045, 0xFFFFFF));
            tp.add(b(s * 0.039, 0.19, 0.122, 0.004, 0.025, 0.025, 0x101010));
        }
        MODELS[TROPICAL] = tp.toArray(new Box[0]);

        // ---- salmão ----
        int sb = 0x9AA6B0, sbD = 0x5E6E80, pinkS = 0xE07A6A;
        java.util.List<Box> sl = new java.util.ArrayList<>();
        sl.add(b(0, 0.15, 0, 0.12, 0.14, 0.42, sb));
        sl.add(b(-0.061, 0.14, 0, 0.005, 0.06, 0.36, pinkS)); sl.add(b(0.061, 0.14, 0, 0.005, 0.06, 0.36, pinkS));
        sl.add(b(0, 0.085, 0, 0.1, 0.02, 0.36, 0xE8E4DC));
        sl.add(b(0, 0.225, 0, 0.08, 0.01, 0.36, sbD));
        for (double sz2 : new double[] { -0.1, 0.0, 0.1 }) sl.add(b(0, 0.231, sz2, 0.03, 0.004, 0.02, 0x30404E)); // pintas
        sl.add(b(0, 0.15, 0.24, 0.1, 0.12, 0.08, 0x8A96A2));               // cabeça
        sl.add(b(0, 0.105, 0.27, 0.07, 0.03, 0.04, 0x6E7A86));
        sl.add(b(0, 0.25, 0.02, 0.02, 0.06, 0.1, sbD));
        sl.add(b(0, 0.23, -0.14, 0.015, 0.03, 0.04, sbD));
        sl.add(b(0, 0.15, -0.22, 0.05, 0.07, 0.06, sb));
        sl.add(tail(0, 0.15, -0.29, 0.02, 0.18, 0.1, sbD, -0.24));
        sl.add(b(-0.065, 0.1, 0.14, 0.02, 0.03, 0.06, sbD)); sl.add(b(0.065, 0.1, 0.14, 0.02, 0.03, 0.06, sbD));
        for (int s = -1; s <= 1; s += 2) {
            sl.add(b(s * 0.051, 0.17, 0.25, 0.005, 0.035, 0.035, 0xF0F0E8));
            sl.add(b(s * 0.054, 0.17, 0.252, 0.004, 0.02, 0.02, 0x101010));
        }
        MODELS[SALMON] = sl.toArray(new Box[0]);

        // ---- tubarão ----
        int gr = 0x6E7A86, grD = 0x55606C, sw = 0xE6E8EA, gum = 0x8A3A40, tooth = 0xF4F4F0;
        java.util.List<Box> sk = new java.util.ArrayList<>();
        sk.add(b(0, 0.45, 0.25, 0.62, 0.6, 0.9, gr));
        sk.add(b(0, 0.44, -0.35, 0.5, 0.5, 0.5, gr));
        sk.add(b(0, 0.43, -0.7, 0.32, 0.34, 0.3, gr));
        sk.add(b(0, 0.43, -0.92, 0.18, 0.2, 0.2, grD));
        sk.add(b(0, 0.43, 0.82, 0.5, 0.46, 0.3, gr));                      // cabeça
        sk.add(b(0, 0.42, 1.04, 0.34, 0.3, 0.16, gr));                     // focinho
        sk.add(b(0, 0.755, 0.2, 0.4, 0.02, 1.0, grD));                     // dorso escuro
        sk.add(b(0, 0.15, 0.3, 0.5, 0.02, 1.2, sw));                       // barriga branca
        sk.add(b(0, 0.19, 0.88, 0.4, 0.04, 0.36, sw));
        sk.add(b(-0.311, 0.3, 0.25, 0.01, 0.2, 0.88, 0xC8CCD0)); sk.add(b(0.311, 0.3, 0.25, 0.01, 0.2, 0.88, 0xC8CCD0));
        for (int i = 0; i < 4; i++) { // guelras
            sk.add(b(-0.312, 0.47, 0.5 + i * 0.06, 0.01, 0.2, 0.015, grD)); sk.add(b(0.312, 0.47, 0.5 + i * 0.06, 0.01, 0.2, 0.015, grD));
        }
        sk.add(b(0, 0.85, 0.18, 0.06, 0.2, 0.36, grD));                    // barbatana famosa
        sk.add(b(0, 0.98, 0.12, 0.05, 0.14, 0.22, grD));
        sk.add(b(0, 1.08, 0.06, 0.04, 0.08, 0.1, grD));
        sk.add(b(0, 0.66, -0.62, 0.04, 0.08, 0.1, grD));
        for (int s = -1; s <= 1; s += 2) {
            sk.add(b(s * 0.42, 0.24, 0.4, 0.3, 0.04, 0.24, grD));          // nadadeiras do peito
            sk.add(b(s * 0.6, 0.2, 0.33, 0.16, 0.03, 0.14, grD));
            sk.add(b(s * 0.18, 0.2, -0.42, 0.12, 0.03, 0.1, grD));
            sk.add(b(s * 0.252, 0.52, 0.86, 0.01, 0.06, 0.06, 0x101418));  // olho
            sk.add(b(s * 0.17, 0.29, 0.9, 0.02, 0.04, 0.03, tooth));
        }
        sk.add(b(0, 0.27, 0.92, 0.32, 0.03, 0.16, gum));                   // boca
        for (int t = -2; t <= 2; t++) sk.add(b(t * 0.06, 0.29, 1.0, 0.03, 0.04, 0.02, tooth));
        sk.add(tail(0, 0.6, -1.08, 0.05, 0.24, 0.12, grD, -0.98));         // cauda em duas pontas
        sk.add(tail(0, 0.82, -1.16, 0.04, 0.24, 0.1, grD, -0.98));
        sk.add(tail(0, 0.3, -1.07, 0.05, 0.16, 0.1, grD, -0.98));
        MODELS[SHARK] = sk.toArray(new Box[0]);
    }

    // ---- tigres, gato e escorpiões: o mesmo desenho com cores diferentes (índices 1 a 4 do modelo) ----
    /** Tigre: pelo, listras, partes claras (barriga, focinho) e olhos. */
    private static final int[] TIGER_COLORS = { 0xE07A1E, 0x1A1410, 0xF4EEE0, 0xC8D040 };
    private static final int[] WHITE_TIGER_COLORS = { 0xF2EEE6, 0x2E2824, 0xFFFFFF, 0x5AA8E8 };
    /** Gato (pela variante): laranja rajado, preto e cinza. */
    private static final int[][] CAT_COLORS = { { 0xD8902E, 0xA0601A, 0xF4E6CC, 0x78D040 }, { 0x2A2A2E, 0x18181C, 0x404046, 0xE8C030 },
            { 0x9A9AA0, 0x66666C, 0xE8E8EC, 0x60B0E8 } };
    /** Escorpião: carapaça, juntas/partes escuras, partes claras e ferrão. */
    private static final int[] SCORPION_COLORS = { 0xE8C040, 0xB08820, 0xF6DC80, 0x4A3410 };
    private static final int[] EMPEROR_COLORS = { 0x1C1E26, 0x0E0F14, 0x34405A, 0x6A2418 };

    private int[] palette() {
        switch (type) {
            case BIRD: return BIRD_COLORS[variant()];
            case TROPICAL: return TROPICAL_COLORS[variant()];
            case CAT: return CAT_COLORS[variant()];
            case TIGER: return TIGER_COLORS;
            case WHITE_TIGER: return WHITE_TIGER_COLORS;
            case SCORPION: return SCORPION_COLORS;
            case EMPEROR: return EMPEROR_COLORS;
            default: return null;
        }
    }

    /** Escorpião em escala s (o imperador é o mesmo desenho bem maior). */
    private static Box[] scorpionModel(double s) {
        int C = 1, J = 2, L = 3, T = 4;
        java.util.List<Box> l = new java.util.ArrayList<>();
        // pernas: 4 de cada lado, com coxa subindo, joelho alto e pé no chão (andam como as da aranha)
        double[] lz = { 0.14, 0.04, -0.06, -0.16 }, fan = { 0.06, 0.02, -0.02, -0.06 };
        for (int side = -1; side <= 1; side += 2)
            for (int i = 0; i < 4; i++) {
                double z = lz[i] * s;
                l.add(leg(side * 0.2 * s, 0.19 * s, z, 0.14 * s, 0.035 * s, 0.035 * s, J, i + 1));
                l.add(leg(side * 0.28 * s, 0.17 * s, z + fan[i] * s, 0.035 * s, 0.06 * s, 0.035 * s, C, i + 1));       // joelho
                l.add(leg(side * 0.31 * s, 0.09 * s, z + fan[i] * 1.5 * s, 0.03 * s, 0.14 * s, 0.03 * s, J, i + 1));
                l.add(leg(side * 0.33 * s, 0.015 * s, z + fan[i] * 2 * s, 0.04 * s, 0.025 * s, 0.05 * s, L, i + 1));    // pé
            }
        // corpo: placas do abdômen com sulcos, e a cabeça (prossoma) com olhos em cima
        l.add(b(0, 0.14 * s, 0, 0.3 * s, 0.12 * s, 0.36 * s, C));
        for (double z : new double[] { -0.12, -0.04, 0.04, 0.12 }) {
            l.add(b(0, 0.203 * s, z * s, 0.28 * s, 0.008 * s, 0.025 * s, J));
            l.add(b(-0.152 * s, 0.14 * s, z * s, 0.006 * s, 0.1 * s, 0.025 * s, J)); l.add(b(0.152 * s, 0.14 * s, z * s, 0.006 * s, 0.1 * s, 0.025 * s, J));
        }
        l.add(b(0, 0.083 * s, 0, 0.24 * s, 0.01 * s, 0.3 * s, L));                     // barriga clara
        l.add(b(0, 0.15 * s, 0.24 * s, 0.26 * s, 0.1 * s, 0.14 * s, C));
        l.add(b(0, 0.202 * s, 0.24 * s, 0.2 * s, 0.006 * s, 0.1 * s, J));
        for (int side = -1; side <= 1; side += 2) {
            l.add(b(side * 0.03 * s, 0.206 * s, 0.27 * s, 0.025 * s, 0.012 * s, 0.025 * s, 0x101010)); // olhos do meio
            l.add(b(side * 0.1 * s, 0.2 * s, 0.3 * s, 0.015 * s, 0.01 * s, 0.015 * s, 0x101010));      // olhos dos lados
            l.add(b(side * 0.05 * s, 0.12 * s, 0.33 * s, 0.03 * s, 0.03 * s, 0.04 * s, J));             // quelíceras
        }
        // pinças: braço, antebraço, mão grossa e dois dedos
        for (int side = -1; side <= 1; side += 2) {
            l.add(b(side * 0.17 * s, 0.15 * s, 0.36 * s, 0.06 * s, 0.05 * s, 0.16 * s, C));
            l.add(b(side * 0.17 * s, 0.15 * s, 0.44 * s, 0.07 * s, 0.06 * s, 0.03 * s, J));
            l.add(b(side * 0.22 * s, 0.15 * s, 0.5 * s, 0.065 * s, 0.065 * s, 0.12 * s, C));
            l.add(b(side * 0.23 * s, 0.16 * s, 0.62 * s, 0.13 * s, 0.1 * s, 0.14 * s, C));               // mão (quela)
            l.add(b(side * 0.23 * s, 0.212 * s, 0.62 * s, 0.1 * s, 0.006 * s, 0.1 * s, L));
            l.add(b(side * 0.195 * s, 0.165 * s, 0.73 * s, 0.035 * s, 0.045 * s, 0.1 * s, J));          // dedos
            l.add(b(side * 0.26 * s, 0.16 * s, 0.72 * s, 0.03 * s, 0.035 * s, 0.08 * s, J));
        }
        // cauda curvada por cima das costas, segmento por segmento, até o ferrão
        double[][] tail = { { 0.17, -0.26, 0.12 }, { 0.24, -0.34, 0.11 }, { 0.34, -0.38, 0.1 }, { 0.45, -0.36, 0.1 }, { 0.54, -0.3, 0.09 } };
        for (double[] sg : tail) {
            l.add(b(0, sg[0] * s, sg[1] * s, sg[2] * s, 0.1 * s, 0.1 * s, C));
            l.add(b(0, sg[0] * s + 0.051 * s, sg[1] * s, sg[2] * 0.7 * s, 0.006 * s, 0.06 * s, J));
        }
        l.add(b(0, 0.58 * s, -0.2 * s, 0.1 * s, 0.09 * s, 0.11 * s, L));                 // bulbo do veneno
        l.add(b(0, 0.55 * s, -0.12 * s, 0.035 * s, 0.045 * s, 0.08 * s, T));            // ferrão
        l.add(b(0, 0.51 * s, -0.08 * s, 0.02 * s, 0.035 * s, 0.04 * s, T));
        return l.toArray(new Box[0]);
    }

    /** Tigre (as cores vêm da paleta: laranja ou branco). */
    private static Box[] tigerModel() {
        int P = 1, S = 2, L = 3, E = 4, nose = 0xC8787A, mouth = 0x2A1A16;
        java.util.List<Box> l = new java.util.ArrayList<>();
        double[][] legs = { { -0.18, 0.5, 1, 0 }, { 0.18, 0.5, 2, 0 }, { -0.18, -0.5, 2, 1 }, { 0.18, -0.5, 1, 1 } };
        for (double[] lg : legs) {
            int ph = (int) lg[2];
            double x = lg[0], z = lg[1];
            if (lg[3] == 0) { // dianteiras fortes
                l.add(legp(x, 0.6, z, 0.2, 0.3, 0.22, P, ph, 0.8));
                l.add(legp(x, 0.28, z, 0.16, 0.36, 0.17, P, ph, 0.8));
                l.add(legp(x, 0.62, z, 0.205, 0.04, 0.225, S, ph, 0.8));
                l.add(legp(x, 0.4, z, 0.165, 0.035, 0.175, S, ph, 0.8));
            } else {          // traseiras: coxa grande listrada
                l.add(legp(x, 0.62, z, 0.24, 0.36, 0.32, P, ph, 0.82));
                l.add(legp(x, 0.28, z - 0.05, 0.15, 0.36, 0.17, P, ph, 0.82));
                l.add(legp(x, 0.7, z, 0.245, 0.04, 0.325, S, ph, 0.82));
                l.add(legp(x, 0.56, z + 0.04, 0.245, 0.035, 0.2, S, ph, 0.82));
                l.add(legp(x, 0.36, z - 0.05, 0.155, 0.03, 0.175, S, ph, 0.82));
            }
            l.add(legp(x, 0.05, z + 0.03, 0.2, 0.1, 0.24, L, ph, 0.8));   // pata clara
            for (int t = -1; t <= 1; t++) l.add(legp(x + t * 0.055, 0.04, z + 0.155, 0.04, 0.06, 0.02, P, ph, 0.8)); // dedos
        }
        l.add(b(0, 0.82, 0, 0.5, 0.46, 1.3, P));                          // tronco
        l.add(b(0, 0.86, 0.48, 0.54, 0.5, 0.34, P));                      // ombros
        l.add(b(0, 0.585, 0.02, 0.42, 0.03, 1.1, L));                     // barriga
        l.add(b(0, 0.75, 0.62, 0.44, 0.36, 0.08, L));                     // peito
        double[] sz = { -0.56, -0.38, -0.2, -0.02, 0.16, 0.34, 0.52 };
        for (int k = 0; k < sz.length; k++) { // listras: atravessam as costas e descem pelos lados em comprimentos diferentes
            double z = sz[k], len = 0.14 + (k % 3) * 0.05;
            l.add(b(0, 1.052, z, 0.36, 0.01, 0.05, S));
            l.add(b(-0.252, 1.05 - len / 2 - 0.02, z + 0.02, 0.01, len, 0.045, S));
            l.add(b(0.252, 1.05 - len / 2 - 0.02, z - 0.02, 0.01, len, 0.045, S));
            if (k % 2 == 0) { l.add(b(-0.252, 0.72, z + 0.06, 0.01, 0.1, 0.035, S)); l.add(b(0.252, 0.74, z - 0.05, 0.01, 0.08, 0.035, S)); }
        }
        // cauda comprida, caída e com a ponta subindo; anéis escuros e ponta preta
        l.add(b(0, 0.95, -0.7, 0.1, 0.1, 0.14, P)); l.add(b(0, 0.95, -0.66, 0.105, 0.105, 0.03, S));
        l.add(b(0, 0.86, -0.82, 0.09, 0.09, 0.14, P)); l.add(b(0, 0.86, -0.84, 0.095, 0.095, 0.03, S));
        l.add(b(0, 0.74, -0.92, 0.09, 0.12, 0.1, P)); l.add(b(0, 0.74, -0.92, 0.095, 0.03, 0.105, S));
        l.add(b(0, 0.66, -1.0, 0.08, 0.1, 0.1, P));
        l.add(b(0, 0.62, -1.07, 0.09, 0.1, 0.08, S));
        // pescoço e cabeça grande
        l.add(b(0, 0.96, 0.7, 0.36, 0.34, 0.2, P));
        l.add(b(0, 1.02, 0.86, 0.44, 0.38, 0.34, P));
        l.add(b(-0.235, 0.94, 0.84, 0.06, 0.2, 0.24, L)); l.add(b(0.235, 0.94, 0.84, 0.06, 0.2, 0.24, L)); // bochechas peludas
        l.add(b(-0.268, 0.96, 0.84, 0.01, 0.04, 0.16, S)); l.add(b(0.268, 0.96, 0.84, 0.01, 0.04, 0.16, S));
        l.add(b(0, 0.9, 1.06, 0.24, 0.16, 0.14, L));                      // focinho
        l.add(b(0, 1.0, 1.05, 0.1, 0.06, 0.12, P));                       // ponte do nariz
        l.add(b(0, 0.96, 1.135, 0.1, 0.06, 0.02, nose));
        l.add(b(0, 0.84, 1.1, 0.16, 0.02, 0.06, mouth));
        l.add(b(0, 0.81, 1.0, 0.16, 0.04, 0.12, L));                      // queixo
        for (int side = -1; side <= 1; side += 2) {
            l.add(b(side * 0.07, 0.89, 1.135, 0.03, 0.03, 0.01, mouth));    // pintinhas dos bigodes
            l.add(b(side * 0.17, 0.9, 1.1, 0.14, 0.006, 0.006, 0xF8F8F8)); // bigodes
            l.add(b(side * 0.11, 1.07, 1.031, 0.12, 0.08, 0.01, L));        // contorno claro do olho
            l.add(eye(side * 0.11, 1.07, 1.036, 0.06, E));
            l.add(b(side * 0.11, 1.07, 1.041, 0.015, 0.045, 0.005, 0x101010));
            l.add(b(side * 0.08, 1.19, 0.96, 0.03, 0.02, 0.14, S));         // listras da testa
            l.add(b(side * 0.16, 1.24, 0.8, 0.12, 0.1, 0.06, P));           // orelhas
            l.add(b(side * 0.16, 1.24, 0.769, 0.12, 0.1, 0.01, S));
            l.add(b(side * 0.16, 1.235, 0.763, 0.05, 0.05, 0.005, L));      // pinta branca atrás da orelha
            l.add(b(side * 0.16, 1.235, 0.832, 0.07, 0.06, 0.005, 0xD8A8A0));
        }
        l.add(b(0, 1.2, 0.95, 0.04, 0.02, 0.18, S));
        return l.toArray(new Box[0]);
    }

    /** Gato (cores pela variante). */
    private static Box[] catModel() {
        int P = 1, S = 2, L = 3, E = 4;
        java.util.List<Box> l = new java.util.ArrayList<>();
        double[][] legs = { { -0.07, 0.18, 1 }, { 0.07, 0.18, 2 }, { -0.07, -0.2, 2 }, { 0.07, -0.2, 1 } };
        for (double[] lg : legs) {
            int ph = (int) lg[2];
            l.add(legp(lg[0], 0.13, lg[1], 0.07, 0.24, 0.07, P, ph, 0.26));
            l.add(legp(lg[0], 0.16, lg[1], 0.072, 0.02, 0.072, S, ph, 0.26));
            l.add(legp(lg[0], 0.02, lg[1] + 0.01, 0.08, 0.04, 0.09, L, ph, 0.26));
        }
        l.add(b(0, 0.31, 0, 0.2, 0.18, 0.48, P));
        l.add(b(0, 0.215, 0.02, 0.16, 0.02, 0.4, L));
        for (double z : new double[] { -0.15, -0.05, 0.05, 0.15 }) {
            l.add(b(0, 0.403, z, 0.14, 0.01, 0.03, S));
            l.add(b(-0.101, 0.33, z, 0.005, 0.1, 0.025, S)); l.add(b(0.101, 0.33, z, 0.005, 0.1, 0.025, S));
        }
        l.add(b(0, 0.4, -0.28, 0.05, 0.05, 0.1, P));                      // rabo erguido
        l.add(b(0, 0.5, -0.33, 0.05, 0.18, 0.05, P));
        l.add(b(0, 0.5, -0.33, 0.055, 0.02, 0.055, S));
        l.add(b(0, 0.62, -0.3, 0.05, 0.06, 0.08, P));
        l.add(b(0, 0.64, -0.25, 0.05, 0.05, 0.04, S));
        l.add(b(0, 0.42, 0.28, 0.2, 0.17, 0.16, P));                      // cabeça
        l.add(b(0, 0.38, 0.37, 0.09, 0.06, 0.04, L));
        l.add(b(0, 0.405, 0.392, 0.03, 0.02, 0.01, 0xD07878));
        l.add(b(0, 0.506, 0.3, 0.03, 0.005, 0.08, S));
        for (int side = -1; side <= 1; side += 2) {
            l.add(eye(side * 0.05, 0.45, 0.362, 0.04, E));
            l.add(b(side * 0.05, 0.45, 0.366, 0.008, 0.03, 0.004, 0x101010)); // pupila fina
            l.add(b(side * 0.06, 0.535, 0.27, 0.05, 0.06, 0.03, P));          // orelhas
            l.add(b(side * 0.06, 0.57, 0.27, 0.03, 0.025, 0.03, P));
            l.add(b(side * 0.06, 0.53, 0.287, 0.03, 0.035, 0.004, 0xE0A0A0));
            l.add(b(side * 0.09, 0.38, 0.37, 0.08, 0.005, 0.005, 0xF4F4F4)); // bigodes
            l.add(b(side * 0.09, 0.37, 0.37, 0.08, 0.005, 0.005, 0xF4F4F4));
        }
        return l.toArray(new Box[0]);
    }

    static {
        MODELS[TIGER] = tigerModel();
        MODELS[WHITE_TIGER] = tigerModel();
        MODELS[CAT] = catModel();
        MODELS[SCORPION] = scorpionModel(1.0);
        MODELS[EMPEROR] = scorpionModel(5.0);
        MODELS[POLAR_BEAR] = polarBearModel();
        MODELS[PENGUIN] = penguinModel();
        MODELS[MUSKOX] = muskoxModel();
        MODELS[NARWHAL] = narwhalModel();
    }

    /** Urso-polar: mais comprido que o urso pardo, cabeça baixa e pescoço longo, traseiro mais alto. */
    private static Box[] polarBearModel() {
        int fur = 0xF4F0E4, sh = 0xDCD6C4, li = 0xFFFFF8, blk = 0x141414;
        java.util.List<Box> l = new java.util.ArrayList<>();
        double[][] legs = { { -0.25, 0.52, 1, 0 }, { 0.25, 0.52, 2, 0 }, { -0.25, -0.56, 2, 1 }, { 0.25, -0.56, 1, 1 } };
        for (double[] lg : legs) {
            int ph = (int) lg[2];
            double lx = lg[0], lz = lg[1];
            boolean back = lg[3] == 1;
            l.add(legp(lx, back ? 0.68 : 0.64, lz, back ? 0.32 : 0.27, back ? 0.42 : 0.36, back ? 0.38 : 0.3, fur, ph, 0.86));
            l.add(legp(lx, 0.27, lz, 0.24, 0.44, 0.26, fur, ph, 0.86));
            l.add(legp(lx, 0.05, lz + 0.04, 0.29, 0.1, 0.34, sh, ph, 0.86));          // pata larga
            for (int t = -1; t <= 1; t++) l.add(legp(lx + t * 0.07, 0.03, lz + 0.21, 0.035, 0.04, 0.05, blk, ph, 0.86));
        }
        l.add(b(0, 0.93, -0.02, 0.8, 0.66, 1.42, fur));                           // tronco
        l.add(b(0, 1.0, -0.62, 0.78, 0.62, 0.36, fur));                            // traseiro alto
        l.add(b(0, 0.585, 0, 0.66, 0.03, 1.2, sh));                                // barriga
        l.add(b(0, 1.265, -0.2, 0.52, 0.02, 1.0, li));                             // costas claras
        l.add(b(-0.401, 0.95, -0.05, 0.01, 0.42, 1.1, sh)); l.add(b(0.401, 0.95, -0.05, 0.01, 0.42, 1.1, sh));
        l.add(b(0, 1.04, -0.83, 0.16, 0.14, 0.06, fur));                           // rabinho
        l.add(b(0, 1.0, 0.8, 0.48, 0.42, 0.36, fur));                              // pescoço comprido
        l.add(b(0, 0.96, 1.05, 0.42, 0.36, 0.34, fur));                            // cabeça
        l.add(b(0, 1.145, 1.0, 0.34, 0.02, 0.26, li));
        l.add(b(0, 0.88, 1.29, 0.24, 0.2, 0.24, li));                              // focinho comprido
        l.add(b(0, 0.94, 1.415, 0.13, 0.08, 0.02, blk));                           // nariz preto
        l.add(b(0, 0.79, 1.33, 0.18, 0.02, 0.12, sh));
        l.add(b(0, 0.8, 1.36, 0.14, 0.01, 0.04, blk));                             // boca
        for (int s = -1; s <= 1; s += 2) {
            l.add(eye(s * 0.13, 1.03, 1.222, 0.045, blk));
            l.add(b(s * 0.16, 1.17, 0.96, 0.09, 0.08, 0.06, fur));                 // orelhas pequenas
            l.add(b(s * 0.16, 1.17, 0.993, 0.05, 0.045, 0.005, sh));
        }
        return l.toArray(new Box[0]);
    }

    /** Pinguim-imperador: costas pretas, barriga branca, manchas amarelas no pescoço e bico com faixa laranja. */
    private static Box[] penguinModel() {
        int blk = 0x1C1E24, bk2 = 0x2C3038, wh = 0xF4F4F0, yel = 0xF0B030, pale = 0xF8E6A0, foot = 0xE08A30;
        java.util.List<Box> l = new java.util.ArrayList<>();
        for (int s = -1; s <= 1; s += 2) {
            int ph = s < 0 ? 1 : 2;
            l.add(legp(s * 0.08, 0.06, 0.0, 0.08, 0.08, 0.08, blk, ph, 0.12));
            l.add(legp(s * 0.08, 0.015, 0.05, 0.11, 0.03, 0.15, foot, ph, 0.12));  // pés laranja
        }
        l.add(b(0, 0.38, 0, 0.36, 0.52, 0.32, blk));                               // corpo
        l.add(b(0, 0.32, -0.01, 0.38, 0.3, 0.3, blk));                             // barriga mais larga embaixo
        l.add(b(0, 0.34, 0.162, 0.28, 0.44, 0.01, wh));                            // peito branco
        l.add(b(0, 0.31, 0.152, 0.32, 0.26, 0.012, wh));
        l.add(b(0, 0.57, 0.163, 0.22, 0.07, 0.01, pale));                          // amarelinho do peito
        l.add(b(0, 0.62, -0.17, 0.2, 0.3, 0.02, bk2));                             // nuca
        l.add(b(0, 0.13, -0.19, 0.12, 0.06, 0.08, blk));                           // rabinho
        for (int s = -1; s <= 1; s += 2) {                                         // nadadeiras
            l.add(b(s * 0.2, 0.4, 0.0, 0.04, 0.32, 0.14, blk));
            l.add(b(s * 0.2, 0.26, 0.0, 0.035, 0.08, 0.1, blk));
            l.add(b(s * 0.222, 0.38, 0.0, 0.005, 0.26, 0.1, wh));                  // lado de dentro claro
        }
        l.add(b(0, 0.73, 0.02, 0.26, 0.22, 0.26, blk));                            // cabeça
        for (int s = -1; s <= 1; s += 2) {
            l.add(b(s * 0.131, 0.69, 0.02, 0.005, 0.09, 0.12, yel));               // manchas amarelas
            l.add(b(s * 0.131, 0.64, 0.06, 0.005, 0.05, 0.08, pale));
            l.add(eye(s * 0.07, 0.76, 0.152, 0.03, 0x101010));
        }
        l.add(b(0, 0.7, 0.2, 0.06, 0.045, 0.11, 0x2A2A2A));                        // bico
        l.add(b(0, 0.682, 0.2, 0.05, 0.012, 0.09, 0xE07A20));                      // faixa laranja do bico
        return l.toArray(new Box[0]);
    }

    /** Boi-almiscarado: pelo comprido que quase arrasta, chifres curvados para baixo e uma "sela" clara. */
    private static Box[] muskoxModel() {
        int fur = 0x3A2A1E, dark = 0x2A1E14, shag = 0x4A3626, cream = 0xC8B48C, sock = 0x9A8A6E, hoof = 0x1A1410,
                horn = 0xD8CCB0, tip = 0x5A5048, face = 0x241A12;
        java.util.List<Box> l = new java.util.ArrayList<>();
        double[][] legs = { { -0.22, 0.42, 1 }, { 0.22, 0.42, 2 }, { -0.22, -0.42, 2 }, { 0.22, -0.42, 1 } };
        for (double[] lg : legs) {
            int ph = (int) lg[2];
            l.add(legp(lg[0], 0.3, lg[1], 0.17, 0.4, 0.19, sock, ph, 0.5));        // pernas curtas e claras
            l.add(legp(lg[0], 0.05, lg[1], 0.18, 0.1, 0.2, hoof, ph, 0.5));
        }
        l.add(b(0, 0.86, 0, 0.84, 0.64, 1.26, fur));                               // tronco
        l.add(b(0, 1.2, 0.3, 0.66, 0.16, 0.5, fur));                               // corcova
        l.add(b(0, 1.205, -0.12, 0.5, 0.03, 0.5, cream));                          // sela clara
        // saia de pelo comprido dos lados, na frente e atrás (as pernas aparecem embaixo)
        for (int s = -1; s <= 1; s += 2) {
            l.add(b(s * 0.44, 0.56, 0, 0.05, 0.5, 1.22, dark));
            for (double z : new double[] { -0.4, -0.1, 0.2, 0.48 }) l.add(b(s * 0.468, 0.48 + (z * 10 % 2) * 0.03, z, 0.01, 0.4, 0.08, shag));
        }
        l.add(b(0, 0.56, -0.64, 0.82, 0.5, 0.05, dark));
        l.add(b(0, 0.58, 0.63, 0.82, 0.46, 0.05, dark));
        l.add(b(0, 0.95, -0.66, 0.1, 0.12, 0.04, dark));                           // rabinho
        // cabeça baixa com barba
        l.add(b(0, 0.84, 0.82, 0.38, 0.38, 0.34, face));
        l.add(b(0, 0.58, 0.84, 0.34, 0.24, 0.3, dark));                            // barba
        l.add(b(0, 0.72, 1.03, 0.28, 0.22, 0.1, sock));                            // focinho claro
        l.add(b(0, 0.76, 1.082, 0.14, 0.06, 0.01, hoof));                          // nariz
        l.add(b(0, 1.05, 0.84, 0.46, 0.09, 0.2, horn));                            // base dos chifres na testa
        for (int s = -1; s <= 1; s += 2) {
            l.add(b(s * 0.28, 1.0, 0.82, 0.12, 0.09, 0.13, horn));                 // chifre descendo e virando para a frente
            l.add(b(s * 0.34, 0.9, 0.86, 0.08, 0.14, 0.1, horn));
            l.add(b(s * 0.33, 0.8, 0.92, 0.07, 0.08, 0.08, horn));
            l.add(b(s * 0.31, 0.74, 0.97, 0.05, 0.06, 0.06, tip));
            l.add(eye(s * 0.13, 0.88, 0.992, 0.04, 0x0C0A08));
        }
        return l.toArray(new Box[0]);
    }

    /** Narval: baleia cinza pintada, barriga clara e a presa comprida em espiral saindo da boca. */
    private static Box[] narwhalModel() {
        int gr = 0x8A96A0, grD = 0x5A646E, spot = 0x46505A, belly = 0xE6E8EA, ivory = 0xEDE6D2, ring = 0xC8BEA4;
        java.util.List<Box> l = new java.util.ArrayList<>();
        l.add(b(0, 0.45, 0.1, 0.7, 0.62, 1.3, gr));                                // corpo
        l.add(b(0, 0.43, 0.95, 0.6, 0.54, 0.4, gr));                               // cabeça
        l.add(b(0, 0.48, 1.2, 0.48, 0.44, 0.14, gr));                              // testa redonda ("melão")
        l.add(b(0, 0.44, -0.72, 0.5, 0.46, 0.36, gr));
        l.add(b(0, 0.43, -1.04, 0.3, 0.28, 0.3, grD));
        l.add(b(0, 0.13, 0.1, 0.56, 0.02, 1.5, belly));                            // barriga
        l.add(b(0, 0.18, 0.95, 0.46, 0.04, 0.36, belly));
        double[][] spots = { { -0.18, 0.4 }, { 0.12, 0.1 }, { -0.05, -0.25 }, { 0.2, -0.5 }, { -0.2, -0.1 }, { 0.05, 0.6 } };
        for (double[] sp : spots) l.add(b(sp[0], 0.762, sp[1], 0.14, 0.006, 0.12, spot));
        for (int s = -1; s <= 1; s += 2) {
            l.add(b(s * 0.352, 0.5, 0.2, 0.006, 0.12, 0.14, spot));
            l.add(b(s * 0.301, 0.46, 0.98, 0.01, 0.05, 0.05, 0x101418));         // olho
            l.add(b(s * 0.42, 0.24, 0.72, 0.22, 0.04, 0.18, grD));               // nadadeiras
        }
        l.add(b(0, 0.775, -0.2, 0.06, 0.03, 0.6, grD));                            // crista baixa nas costas
        // presa em espiral: anéis alternados que afinam até a ponta
        for (int i = 0; i < 9; i++) {
            double sz = 0.07 - i * 0.005;
            l.add(b(0.06, 0.42, 1.3 + i * 0.16, sz, sz, 0.16, i % 2 == 0 ? ivory : ring));
        }
        l.add(tail(0, 0.43, -1.3, 0.72, 0.05, 0.22, grD, -1.2));                  // cauda horizontal
        l.add(tail(0, 0.43, -1.22, 0.3, 0.09, 0.14, gr, -1.2));
        return l.toArray(new Box[0]);
    }


    /** O desenho certo para o estado atual (esqueleto mirando, lobo sentado/domesticado, cervo macho...). */
    private Box[] currentModel() {
        if (type == SKELETON && aim > 0.05) return SKELETON_AIM;
        if (type == WOLF) return sitting ? (tamed ? WOLF_SIT_TAMED : WOLF_SIT) : (tamed ? WOLF_TAMED : MODELS[WOLF]);
        if (type == DEER && Math.floorMod(id, 2) == 0) return DEER_STAG;
        return MODELS[type];
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
        int[] palette = palette();
        // asas: batendo no voo, dobradas para baixo quando pousado; caudas de peixe balançam para os lados
        double wingA = type == BIRD ? (flying ? Math.sin(walk * 7) * 0.9 + 0.15 : -1.35) : 0;
        double tailA = Math.sin(walk * 5) * (type == SHARK || type == NARWHAL ? 0.3 : 0.45);
        // lobo/urso parados também respiram um pouco: sem isso, as pernas só balançam andando
        for (Box bx : currentModel()) {
            double ox = 0, oz = 0;
            int mode = 0; // 0 nada, 1 perna (gira no eixo x), 2 asa (gira no eixo z), 3 cauda (gira no eixo y)
            double angle = 0;
            if (bx.leg == 1 || bx.leg == 2) { angle = (bx.leg == 1 ? 1 : -1) * swing * 0.7; mode = 1; }
            else if (bx.leg == WING_L || bx.leg == WING_R) { angle = bx.leg == WING_L ? wingA : -wingA; mode = 2; }
            else if (bx.leg == TAIL) { angle = tailA; mode = 3; }
            else if (bx.leg != 0) mode = 1;
            boolean spiderLeg = (type == SPIDER || scorpion()) && bx.leg >= 1 && bx.leg <= 4;
            if (spiderLeg) { oz = Math.sin(walk * 7 + bx.leg * 2.0) * 0.12 * Math.min(1, swing * 3 + 0.05); angle = 0; }
            double hx = bx.sx / 2 * swell, hy = bx.sy / 2, hz = bx.sz / 2 * swell;
            // 8 cantos da caixa, com a perna girando em volta do topo
            double[][] c = CORNERS;
            for (int i = 0; i < 8; i++) {
                double lx = (i & 1) == 0 ? -hx : hx, ly = (i & 2) == 0 ? -hy : hy, lz = (i & 4) == 0 ? -hz : hz;
                if (mode == 2 && angle != 0) { // asa: gira em volta do ombro (x = piv), no plano x-y
                    double rx = bx.cx + lx - bx.piv, ca = Math.cos(angle), sa = Math.sin(angle);
                    double nx = rx * ca - ly * sa, ny = rx * sa + ly * ca;
                    lx = nx + bx.piv - bx.cx;
                    ly = ny;
                } else if (mode == 3 && angle != 0) { // cauda: gira em volta de z = piv, no plano x-z
                    double rz = bx.cz + lz - bx.piv, rx = bx.cx + lx, ca = Math.cos(angle), sa = Math.sin(angle);
                    double nx = rx * ca + rz * sa, nz = -rx * sa + rz * ca;
                    lx = nx - bx.cx;
                    lz = nz + bx.piv - bx.cz;
                } else if (mode == 1 && angle != 0) {
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
            int col = bx.color;
            if (palette != null && col >= 1 && col <= palette.length) col = palette[col - 1];
            for (int f = 0; f < 6; f++) {
                double l = bx.glow ? 1.0 : FACE_SHADE[f] * light;
                double r = ((col >> 16) & 255) / 255.0 * l, g = ((col >> 8) & 255) / 255.0 * l, b = (col & 255) / 255.0 * l;
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
        return currentModel().length * 36 * 6;
    }

    // tabelas fixas do desenho (criadas uma vez, para não gerar lixo a cada quadro; só a thread do jogo usa)
    private static final double[][] CORNERS = new double[8][3];
    private static final double[] FACE_SHADE = { 0.8, 0.8, 1.0, 0.55, 0.7, 0.7 };
    private static final int[][] FACE_TRIS = { { 1, 3, 7, 7, 5, 1 }, { 0, 4, 6, 6, 2, 0 }, { 2, 6, 7, 7, 3, 2 },
            { 0, 1, 5, 5, 4, 0 }, { 4, 5, 7, 7, 6, 4 }, { 0, 2, 3, 3, 1, 0 } };
}
