/** Algo que se move no mundo com gravidade e colisão de caixa (jogador e criaturas). */
class Entity {
    double x, y, z, vx, vy, vz;
    boolean onGround, inWater, inLava, hitWall;
    double fallDist;    // quanto já caiu desde que saiu do chão
    double landedFall;  // queda do último pouso (lida e zerada por quem usa)
    final double hw, h; // meia largura e altura da caixa

    Entity(double hw, double h) {
        this.hw = hw;
        this.h = h;
    }

    /** Move pela velocidade atual, colidindo com os blocos, em passos pequenos para não atravessar nada. */
    void move(double dt, World w, boolean flying) {
        boolean wasOnGround = onGround;
        onGround = false;
        hitWall = false;
        double ddx = vx * dt, ddy = vy * dt, ddz = vz * dt;
        if (flying || inWater) fallDist = 0;
        else if (ddy < 0) fallDist -= ddy;
        double maxD = Math.max(Math.abs(ddx), Math.max(Math.abs(ddy), Math.abs(ddz)));
        int steps = Math.max(1, (int) Math.ceil(maxD / 0.25));
        for (int i = 0; i < steps; i++) {
            moveAxis(1, ddy / steps, w, false);
            boolean canStep = (wasOnGround || onGround) && !flying;
            moveAxis(0, ddx / steps, w, canStep);
            moveAxis(2, ddz / steps, w, canStep);
        }
    }

    void updateFluids(World w) {
        int bx = (int) Math.floor(x), bz = (int) Math.floor(z);
        int b = w.get(bx, (int) Math.floor(y + 0.4), bz);
        inWater = Block.isWater(b);
        inLava = b == Block.LAVA || w.get(bx, (int) Math.floor(y + 0.05), bz) == Block.LAVA;
    }

    private static final double EPS = 1e-4, STEP = 0.55;

    /**
     * Anda d no eixo (0 x, 1 y, 2 z). Se bater, encosta exatamente na caixa que bloqueou
     * (cubos, lajes, escadas, portas). No chão, sobe sozinho degraus de até meio bloco.
     */
    private void moveAxis(int axis, double d, World w, boolean canStep) {
        if (d == 0) return;
        double nx = x + (axis == 0 ? d : 0), ny = y + (axis == 1 ? d : 0), nz = z + (axis == 2 ? d : 0);
        double limit = blockingLimit(nx, ny, nz, w, axis, d > 0);
        if (Double.isNaN(limit)) { x = nx; y = ny; z = nz; return; }

        if (axis != 1 && canStep) {
            // degrau: o topo do que bloqueou está a no máximo meio bloco acima dos pés?
            double top = highestTop(nx, ny, nz, w);
            double rise = top - y;
            if (rise > 0 && rise <= STEP && !collides(nx, top + EPS, nz, w) && !collides(x, top + EPS, z, w)) {
                x = nx; z = nz; y = top + EPS;
                return;
            }
        }
        double size = axis == 1 ? (d > 0 ? h : 0) : hw;
        double p = d > 0 ? limit - size - EPS : limit + (axis == 1 ? 0 : hw) + EPS;
        double tx = axis == 0 ? p : x, ty = axis == 1 ? p : y, tz = axis == 2 ? p : z;
        if (axis == 1) {
            if (d < 0) {
                onGround = true;
                if (fallDist > 0) { landedFall = fallDist; fallDist = 0; }
            }
            vy = 0;
        } else {
            hitWall = true;
            if (axis == 0) vx = 0; else vz = 0;
        }
        if (!collides(tx, ty, tz, w)) { x = tx; y = ty; z = tz; }
    }

    /** Caixas sólidas (em coordenadas do mundo) que a caixa do corpo tocaria na posição dada. */
    private java.util.List<double[]> overlapping(double px, double py, double pz, World w) {
        java.util.List<double[]> out = new java.util.ArrayList<>();
        double ax0 = px - hw, ax1 = px + hw, ay0 = py, ay1 = py + h, az0 = pz - hw, az1 = pz + hw;
        int x0 = (int) Math.floor(ax0), x1 = (int) Math.floor(ax1);
        int y0 = (int) Math.floor(ay0) - 1, y1 = (int) Math.floor(ay1); // -1: cercas de baixo têm 1,5 de altura
        int z0 = (int) Math.floor(az0), z1 = (int) Math.floor(az1);
        for (int bx = x0; bx <= x1; bx++)
            for (int by = y0; by <= y1; by++)
                for (int bz = z0; bz <= z1; bz++) {
                    int b = w.get(bx, by, bz);
                    if (!Block.solid(b)) continue;
                    float[][] boxes = Block.collisionBoxes(w, bx, by, bz, b);
                    if (boxes == null) boxes = FULL;
                    for (float[] c : boxes) {
                        double cx0 = bx + c[0], cy0 = by + c[1], cz0 = bz + c[2], cx1 = bx + c[3], cy1 = by + c[4], cz1 = bz + c[5];
                        if (ax0 < cx1 && ax1 > cx0 && ay0 < cy1 && ay1 > cy0 && az0 < cz1 && az1 > cz0)
                            out.add(new double[] { cx0, cy0, cz0, cx1, cy1, cz1 });
                    }
                }
        return out;
    }

    private static final float[][] FULL = { { 0, 0, 0, 1, 1, 1 } };

    /** Onde o movimento para: a face mais próxima das caixas que bloqueiam (NaN = nada bloqueia). */
    private double blockingLimit(double px, double py, double pz, World w, int axis, boolean positive) {
        double best = Double.NaN;
        for (double[] c : overlapping(px, py, pz, w)) {
            double v = positive ? c[axis] : c[axis + 3];
            if (Double.isNaN(best) || (positive ? v < best : v > best)) best = v;
        }
        return best;
    }

    private double highestTop(double px, double py, double pz, World w) {
        double top = -1e9;
        for (double[] c : overlapping(px, py, pz, w)) top = Math.max(top, c[4]);
        return top;
    }

    boolean collides(double x, double y, double z, World w) {
        return !overlapping(x, y, z, w).isEmpty();
    }

    /** Encosta em algum bloco do tipo b (com uma folguinha)? Usado para o cacto espetar. */
    boolean touching(World w, int b) {
        double e = 0.05;
        int x0 = (int) Math.floor(x - hw - e), x1 = (int) Math.floor(x + hw + e);
        int y0 = (int) Math.floor(y - e), y1 = (int) Math.floor(y + h);
        int z0 = (int) Math.floor(z - hw - e), z1 = (int) Math.floor(z + hw + e);
        for (int bx = x0; bx <= x1; bx++)
            for (int by = y0; by <= y1; by++)
                for (int bz = z0; bz <= z1; bz++)
                    if (w.get(bx, by, bz) == b) return true;
        return false;
    }

    boolean intersects(int bx, int by, int bz) {
        return x - hw < bx + 1 && x + hw > bx && y < by + 1 && y + h > by && z - hw < bz + 1 && z + hw > bz;
    }

    /** Distância ao longo do raio até a caixa, ou -1 se não acerta (para bater em criaturas). */
    double rayHit(double ox, double oy, double oz, double dx, double dy, double dz) {
        double[] lo = { x - hw, y, z - hw }, hi = { x + hw, y + h, z + hw }, o = { ox, oy, oz }, d = { dx, dy, dz };
        double tmin = 0, tmax = 1e9;
        for (int i = 0; i < 3; i++) {
            if (Math.abs(d[i]) < 1e-9) {
                if (o[i] < lo[i] || o[i] > hi[i]) return -1;
            } else {
                double t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
                tmin = Math.max(tmin, Math.min(t1, t2));
                tmax = Math.min(tmax, Math.max(t1, t2));
                if (tmin > tmax) return -1;
            }
        }
        return tmin;
    }
}
