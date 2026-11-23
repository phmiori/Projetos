/** Jogador em primeira pessoa. */
final class Player extends Entity {
    static final double HW = 0.3, H = 1.8, EYE = 1.62;
    static final double MAX_HEALTH = 20, MAX_AIR = 10, MAX_FOOD = 20;

    double yaw, pitch;
    boolean flying, headInWater;

    // sobrevivência
    double health = MAX_HEALTH, air = MAX_AIR, food = MAX_FOOD;
    double walkDist;      // para balançar o braço ao andar
    boolean sprinting;

    Player() {
        super(HW, H);
    }

    void update(double dt, boolean fwd, boolean back, boolean left, boolean right,
                boolean jump, boolean sneak, boolean sprint, World w) {
        double sy = Math.sin(yaw), cy = Math.cos(yaw);
        double mx = 0, mz = 0;
        if (fwd) { mx += sy; mz += cy; }
        if (back) { mx -= sy; mz -= cy; }
        // direita da câmera = frente x cima = (-cos(yaw), 0, sin(yaw))
        if (right) { mx -= cy; mz += sy; }
        if (left) { mx += cy; mz -= sy; }
        double len = Math.sqrt(mx * mx + mz * mz);
        if (len > 0) { mx /= len; mz /= len; }

        updateFluids(w);
        headInWater = Block.isWater(w.get((int) Math.floor(x), (int) Math.floor(y + EYE), (int) Math.floor(z)));
        // na superfície o corpo boia com os pés na água: ainda conta como nadando
        boolean swimming = inWater || Block.isWater(w.get((int) Math.floor(x), (int) Math.floor(y + 0.05), (int) Math.floor(z)));

        sprinting = sprint && fwd && len > 0;
        double speed = flying ? (sprint ? 22 : 11) : (sprinting ? 5.8 : 4.3);
        if ((inWater || inLava) && !flying) speed *= inLava ? 0.35 : 0.55;
        double accel = (onGround || flying || inWater) ? 12 : 3;
        double k = Math.min(1, accel * dt);
        vx += (mx * speed - vx) * k;
        vz += (mz * speed - vz) * k;

        if (flying) {
            double ty = (jump ? speed : 0) - (sneak ? speed : 0);
            vy += (ty - vy) * Math.min(1, 10 * dt);
        } else if (swimming || inLava) {
            vy -= 9 * dt;
            vy *= Math.max(0, 1 - 3 * dt);
            if (jump) vy = Math.min(vy + 25 * dt, 3.6);
            // nadando contra a margem (pulando ou andando para ela): impulso para subir o degrau e sair
            if (hitWall && (jump || len > 0)) vy = Math.max(vy, 7.8);
        } else {
            vy -= 28 * dt;
            if (jump && onGround) vy = 8.4;
            if (vy < -55) vy = -55;
        }

        move(dt, w, flying);
        if (len > 0) walkDist += Math.sqrt(vx * vx + vz * vz) * dt;
        if (y > World.SY + 30) { y = World.SY + 30; vy = Math.min(vy, 0); }
    }
}
