//! Itens de exploração: balde de água e de lava, vara de pescar e barco.

use crate::block::{self, AIR, LAVA, LIQUID, WATER};
use crate::inventory::Stack;
use crate::physics::Player;
use crate::ui::Ui;
use crate::{Game, Loaded};

pub const BUCKET: i32 = 308;
pub const WATER_BUCKET: i32 = 309;
pub const LAVA_BUCKET: i32 = 310;
pub const ROD: i32 = 311;
pub const BOAT: i32 = 312;

/// A boia lançada pela vara de pescar.
pub struct Fishing {
    pub p: [f64; 3],
    v: [f64; 3],
    in_water: bool,
    /// segundos até o peixe morder
    wait: f64,
    /// tempo que resta para puxar depois da mordida
    pub bite: f64,
}

pub struct Boat {
    pub body: Player,
    pub yaw: f64,
}

impl Boat {
    pub fn new(x: f64, y: f64, z: f64, yaw: f64) -> Boat {
        let mut body = Player::body(0.6, 0.45);
        (body.x, body.y, body.z) = (x, y, z);
        Boat { body, yaw }
    }

    /// "x;y;z;direção" (linhas "barco.N" do meta.properties)
    pub fn save(&self) -> String {
        format!("{:.2};{:.2};{:.2};{:.2}", self.body.x, self.body.y, self.body.z, self.yaw)
    }

    pub fn load(s: &str) -> Option<Boat> {
        let v: Vec<f64> = s.split(';').filter_map(|n| n.trim().parse().ok()).collect();
        (v.len() == 4).then(|| Boat::new(v[0], v[1], v[2], v[3]))
    }

    fn ray_hit(&self, o: [f64; 3], d: [f64; 3], reach: f64) -> Option<f64> {
        let mut t = 0.0;
        while t < reach {
            let p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
            if (p[0] - self.body.x).abs() < 0.8 && (p[2] - self.body.z).abs() < 0.8 && p[1] > self.body.y - 0.1 && p[1] < self.body.y + 0.7 {
                return Some(t);
            }
            t += 0.05;
        }
        None
    }
}

impl Game {
    fn view_ray(&self) -> ([f64; 3], [f64; 3]) {
        let e = self.eye();
        let f = self.forward();
        ([e[0] as f64, e[1] as f64, e[2] as f64], [f[0] as f64, f[1] as f64, f[2] as f64])
    }

    /// A primeira água parada ou lava na linha do olhar, antes de qualquer bloco sólido.
    fn aimed_liquid(&self, reach: f64) -> Option<([i32; 3], u8)> {
        let (o, d) = self.view_ray();
        let mut t = 0.0;
        while t < reach {
            let c = [(o[0] + d[0] * t).floor() as i32, (o[1] + d[1] * t).floor() as i32, (o[2] + d[2] * t).floor() as i32];
            let b = self.get(c[0], c[1], c[2]);
            if b == WATER || b == LAVA {
                return Some((c, b));
            }
            if block::solid(b) {
                return None;
            }
            t += 0.05;
        }
        None
    }

    /// Troca um item da mão por outro (o balde cheio e o vazio).
    fn swap_held(&mut self, to: i32) {
        if self.creative {
            return;
        }
        let st = self.inv.s[self.slot];
        if st.count <= 1 {
            self.inv.s[self.slot] = Stack::new(to, 1, 0);
        } else {
            self.inv.take_one(self.slot);
            if self.inv.add(to, 1, 0) > 0 {
                self.throw_stack(Stack::new(to, 1, 0));
            }
        }
    }

    /// Botão direito com balde, vara ou barco na mão. Retorna true se usou o clique.
    pub fn use_tool_item(&mut self) -> bool {
        let held = self.inv.s[self.slot].id;
        match held {
            BUCKET => {
                if let Some((c, b)) = self.aimed_liquid(5.0) {
                    self.set(c[0], c[1], c[2], AIR, 0);
                    self.swap_held(if b == LAVA { LAVA_BUCKET } else { WATER_BUCKET });
                    crate::sound::play("coletar", 0.8);
                }
                true
            }
            WATER_BUCKET | LAVA_BUCKET => {
                let Some(h) = self.aim else { return true };
                let [x, y, z] = h.prev;
                let there = self.get(x, y, z);
                if there == AIR || matches!(block::shape(there), LIQUID | block::CROSS) {
                    self.set(x, y, z, if held == LAVA_BUCKET { LAVA } else { WATER }, 0);
                    self.swap_held(BUCKET);
                    crate::sound::play("colocar", 0.8);
                }
                true
            }
            ROD => {
                self.use_rod();
                true
            }
            BOAT => {
                // em cima da água ou do bloco mirado
                let spot = match self.aimed_liquid(6.0) {
                    Some((c, b)) if b == WATER => Some([c[0] as f64 + 0.5, c[1] as f64 + 0.9, c[2] as f64 + 0.5]),
                    _ => self.aim.map(|h| [h.prev[0] as f64 + 0.5, h.prev[1] as f64 + 0.05, h.prev[2] as f64 + 0.5]),
                };
                if let Some(p) = spot {
                    let boat = Boat::new(p[0], p[1], p[2], self.player.yaw);
                    if !boat.body.collides(&Loaded(&self.chunks)) {
                        self.ex.boats.push(boat);
                        crate::sound::play("quebrar_madeira", 0.6);
                        if !self.creative {
                            self.inv.take_one(self.slot);
                        }
                    }
                }
                true
            }
            _ => false,
        }
    }

    // ------------------------------------------------------------------ pesca
    fn use_rod(&mut self) {
        if let Some(f) = self.ex.fishing.take() {
            if f.bite > 0.0 {
                let roll = self.rng.next();
                let item = if roll < 0.72 { 208 } else if roll < 0.8 { 247 } else if roll < 0.87 { 249 } else if roll < 0.94 { 240 } else if roll < 0.97 { 296 } else { 200 };
                // o prêmio vem voando na sua direção
                let (dx, dy, dz) = (self.player.x - f.p[0], self.player.y + 1.0 - f.p[1], self.player.z - f.p[2]);
                self.spawn_drop(Stack::new(item, 1, 0), f.p, [dx * 1.3, dy * 1.3 + 4.0, dz * 1.3], 0.3);
                self.add_xp(3);
                if !self.creative && self.inv.use_tool(self.slot) {
                    self.notice("Sua vara quebrou!".into());
                }
            }
            crate::sound::play("arco_tensao", 0.5);
            return;
        }
        let (o, d) = self.view_ray();
        let wait = 4.0 + self.rng.next() * 10.0;
        self.ex.fishing = Some(Fishing { p: [o[0] + d[0] * 0.6, o[1] - 0.2 + d[1] * 0.6, o[2] + d[2] * 0.6], v: [d[0] * 11.0, d[1] * 11.0 + 3.0, d[2] * 11.0], in_water: false, wait, bite: 0.0 });
        crate::sound::play("arco_disparo", 0.5);
    }

    fn tick_fishing(&mut self, dt: f64) {
        let Some(mut f) = self.ex.fishing.take() else { return };
        let far = (f.p[0] - self.player.x).powi(2) + (f.p[2] - self.player.z).powi(2) > 24.0 * 24.0;
        if far || self.inv.s[self.slot].id != ROD {
            return;
        }
        let cell = |p: [f64; 3]| self.get(p[0].floor() as i32, p[1].floor() as i32, p[2].floor() as i32);
        if block::is_water(cell(f.p)) {
            f.in_water = true;
        }
        if f.in_water {
            // boia na superfície
            let below = block::is_water(cell([f.p[0], f.p[1] + 0.06, f.p[2]]));
            f.v = [0.0; 3];
            if below {
                f.p[1] += dt * 1.2;
            }
            if f.bite > 0.0 {
                f.bite -= dt;
                if f.bite <= 0.0 {
                    f.wait = 4.0 + self.rng.next() * 8.0; // escapou
                }
            } else {
                f.wait -= dt * if self.ex.weather.raining() { 1.5 } else { 1.0 };
                if f.wait <= 0.0 {
                    f.bite = 1.4;
                    self.hit_bits(f.p, 0xBFE4FF, 14);
                    self.sfx("drop", f.p, 1.0);
                    self.notice("Fisgou! Clique com o botão direito".into());
                }
            }
        } else {
            f.v[1] -= 20.0 * dt;
            let next = [f.p[0] + f.v[0] * dt, f.p[1] + f.v[1] * dt, f.p[2] + f.v[2] * dt];
            if block::solid(cell(next)) {
                f.v = [0.0; 3];
            } else {
                f.p = next;
            }
        }
        self.ex.fishing = Some(f);
    }

    // ------------------------------------------------------------------ barco
    /// O barco na mira (até 4 blocos).
    pub fn aimed_boat(&self) -> Option<usize> {
        let (o, d) = self.view_ray();
        let wall = self.aim.map_or(99.0, |h| h.t);
        self.ex.boats.iter().enumerate().filter_map(|(i, b)| b.ray_hit(o, d, 4.0f64.min(wall)).map(|t| (i, t))).min_by(|a, b| a.1.total_cmp(&b.1)).map(|a| a.0)
    }

    /// Clique num barco: o direito embarca, o esquerdo recolhe.
    pub fn click_boat(&mut self, i: usize, left: bool, right: bool) {
        if right && self.ex.riding.is_none() {
            self.ex.riding = Some(i);
            self.player.flying = false;
            self.notice("W/S rema, A/D vira, Shift sai do barco".into());
        } else if left && self.ex.riding != Some(i) {
            let b = self.ex.boats.remove(i);
            if self.ex.riding.map_or(false, |r| r > i) {
                self.ex.riding = self.ex.riding.map(|r| r - 1);
            }
            if !self.creative {
                self.spawn_drop(Stack::new(BOAT, 1, 0), [b.body.x, b.body.y + 0.3, b.body.z], [0.0, 3.0, 0.0], 0.4);
            }
        }
    }

    /// Barcos boiam; o que você está usando anda para onde aponta e leva você junto.
    pub fn tick_boats(&mut self, dt: f64, forward: f64, turn: f64, leave: bool) {
        let riding = self.ex.riding;
        for (i, b) in self.ex.boats.iter_mut().enumerate() {
            if !self.chunks.contains_key(&((b.body.x.floor() as i32) >> 4, (b.body.z.floor() as i32) >> 4)) {
                continue;
            }
            let w = Loaded(&self.chunks);
            use crate::physics::Blocks;
            let (bx, bz) = (b.body.x.floor() as i32, b.body.z.floor() as i32);
            let wet = block::is_water(w.get(bx, (b.body.y + 0.2).floor() as i32, bz));
            let on_water = wet || block::is_water(w.get(bx, (b.body.y - 0.1).floor() as i32, bz));
            let (mut f, mut t) = (0.0, 0.0);
            if riding == Some(i) {
                (f, t) = (forward, turn);
            }
            b.yaw += t * dt * 2.2;
            let top = if on_water { 8.0 } else { 1.2 };
            let k = (dt * if on_water { 1.6 } else { 6.0 }).min(1.0);
            b.body.vx += (b.yaw.sin() * f * top - b.body.vx) * k;
            b.body.vz += (b.yaw.cos() * f * top - b.body.vz) * k;
            if wet {
                b.body.vy += (1.6 - b.body.vy) * (dt * 6.0).min(1.0); // sobe até a superfície
            } else if on_water {
                b.body.vy *= (1.0 - dt * 10.0).max(0.0);
            } else {
                b.body.vy = (b.body.vy - 28.0 * dt).max(-30.0);
            }
            b.body.in_water = on_water;
            b.body.do_move(dt, &w, false);
        }
        let Some(i) = self.ex.riding else { return };
        let Some(b) = self.ex.boats.get(i) else {
            self.ex.riding = None;
            return;
        };
        (self.player.x, self.player.y, self.player.z) = (b.body.x, b.body.y + 0.15, b.body.z);
        (self.player.vx, self.player.vy, self.player.vz, self.player.fall_dist) = (0.0, 0.0, 0.0, 0.0);
        self.player.crawl_swim = false;
        self.player.h = crate::physics::H;
        self.player.head_in_water = false;
        if leave || self.health <= 0.0 {
            self.ex.riding = None;
            self.player.y += 0.7;
        }
    }

    pub fn tick_explore(&mut self, dt: f64) {
        self.ex.since_attack += dt;
        self.ex.pearl_cd -= dt;
        self.tick_fishing(dt);
    }

    /// Barcos, boia e linha de pesca.
    pub fn draw_explore(&self, ui: &mut Ui, daylight: f32) {
        for b in &self.ex.boats {
            let l = self.sky_light(b.body.x.floor() as i32, (b.body.y + 0.6).floor() as i32, b.body.z.floor() as i32) as f32 / 15.0 * (0.2 + 0.8 * daylight);
            let l = l.max(0.1);
            let (s, c) = (b.yaw.sin() as f32, b.yaw.cos() as f32);
            let o = [b.body.x as f32, b.body.y as f32, b.body.z as f32];
            let place = |x: f32, y: f32, z: f32| [o[0] + x * c + z * s, o[1] + y, o[2] - x * s + z * c];
            // fundo, dois lados, popa, proa e o banco
            for (x0, y0, z0, x1, y1, z1, col) in [
                (-0.55, 0.0, -0.8, 0.55, 0.14, 0.8, [0.45f32, 0.30, 0.16]),
                (-0.65, 0.1, -0.8, -0.5, 0.45, 0.8, [0.62, 0.43, 0.24]),
                (0.5, 0.1, -0.8, 0.65, 0.45, 0.8, [0.62, 0.43, 0.24]),
                (-0.55, 0.1, -0.92, 0.55, 0.45, -0.78, [0.55, 0.38, 0.21]),
                (-0.42, 0.1, 0.78, 0.42, 0.45, 0.98, [0.55, 0.38, 0.21]),
                (-0.5, 0.14, -0.25, 0.5, 0.26, 0.05, [0.7, 0.52, 0.30]),
            ] {
                cuboid(ui, &place, [x0, y0, z0], [x1, y1, z1], col, l);
            }
        }
        if let Some(f) = &self.ex.fishing {
            let at = [f.p[0] as f32, f.p[1] as f32 - if f.bite > 0.0 { 0.12 } else { 0.0 }, f.p[2] as f32];
            let place = |x: f32, y: f32, z: f32| [at[0] + x, at[1] + y, at[2] + z];
            cuboid(ui, &place, [-0.07, 0.0, -0.07], [0.07, 0.09, 0.07], [0.85, 0.15, 0.1], 1.0);
            cuboid(ui, &place, [-0.06, 0.09, -0.06], [0.06, 0.15, 0.06], [0.95, 0.95, 0.95], 1.0);
            // a linha, em pontinhos, da vara até a boia
            let (e, d) = (self.eye(), self.forward());
            let hand = [e[0] + d[0] * 0.7, e[1] - 0.25 + d[1] * 0.7, e[2] + d[2] * 0.7];
            for k in 1..24 {
                let t = k as f32 / 24.0;
                let p = [hand[0] + (at[0] - hand[0]) * t, hand[1] + (at[1] + 0.15 - hand[1]) * t - (t * (1.0 - t)) * 0.4, hand[2] + (at[2] - hand[2]) * t];
                let dot = |x: f32, y: f32, z: f32| [p[0] + x, p[1] + y, p[2] + z];
                cuboid(ui, &dot, [-0.008; 3], [0.008; 3], [0.85, 0.85, 0.85], 1.0);
            }
        }
    }
}

/// Uma caixa colorida no mundo, com a mesma sombra por face das criaturas.
fn cuboid(ui: &mut Ui, place: &dyn Fn(f32, f32, f32) -> [f32; 3], lo: [f32; 3], hi: [f32; 3], color: [f32; 3], light: f32) {
    const SHADE: [f32; 6] = [0.8, 0.8, 1.0, 0.55, 0.7, 0.7];
    const FACES: [[usize; 4]; 6] = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
    let c: [[f32; 3]; 8] = std::array::from_fn(|i| place(if i & 1 == 0 { lo[0] } else { hi[0] }, if i & 2 == 0 { lo[1] } else { hi[1] }, if i & 4 == 0 { lo[2] } else { hi[2] }));
    for (f, face) in FACES.iter().enumerate() {
        let l = SHADE[f] * light;
        ui.solid_quad([c[face[0]], c[face[1]], c[face[2]], c[face[3]]], [color[0] * l, color[1] * l, color[2] * l, 1.0]);
    }
}
