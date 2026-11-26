//! Física do jogador, traduzida do Entity.java e do Player.java: gravidade, pulo, colisão com caixas
//! (cubos, lajes, escadas), subida sozinha de degraus de meio bloco, nado e voo.

use crate::block::{self, CROSS, LIQUID};

/// O que a física precisa saber do mundo.
pub trait Blocks {
    fn get(&self, x: i32, y: i32, z: i32) -> u8;
}

pub const HW: f64 = 0.3;
pub const H: f64 = 1.8;
pub const EYE: f64 = 1.62;
const EPS: f64 = 1e-4;
const STEP: f64 = 0.55;
const CRAWL_H: f64 = 0.6;

/// Corpo com física (o jogador e os itens soltos no chão), como o Entity do Java.
#[derive(Default, Clone)]
pub struct Player {
    /// meia largura e altura da caixa
    pub hw: f64,
    pub h: f64,
    /// quanto já caiu desde que saiu do chão, e a queda do último pouso (para o dano)
    pub fall_dist: f64,
    pub landed_fall: f64,
    pub sprinting: bool,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub vx: f64,
    pub vy: f64,
    pub vz: f64,
    pub yaw: f64,
    pub pitch: f64,
    pub flying: bool,
    pub on_ground: bool,
    pub in_water: bool,
    pub in_lava: bool,
    pub head_in_water: bool,
    pub hit_wall: bool,
    /// nadando na horizontal (caixa baixa, segue a direção do olhar)
    pub crawl_swim: bool,
    /// agachado: anda devagar e não cai das beiradas
    pub sneaking: bool,
}

#[derive(Default, Clone, Copy)]
pub struct Input {
    pub fwd: bool,
    pub back: bool,
    pub left: bool,
    pub right: bool,
    pub jump: bool,
    pub sneak: bool,
    pub sprint: bool,
}

fn solid(b: u8) -> bool {
    b != block::AIR && block::shape(b) != LIQUID && block::shape(b) != CROSS
}

#[inline]
fn fl(v: f64) -> i32 {
    v.floor() as i32
}

impl Player {
    /// O jogador (0,6 de largura, 1,8 de altura).
    pub fn new() -> Player {
        Player::body(HW, H)
    }

    pub fn body(hw: f64, h: f64) -> Player {
        Player { hw, h, ..Default::default() }
    }

    /// Altura dos olhos (baixa quando nada na horizontal).
    pub fn eye(&self) -> f64 {
        if self.crawl_swim { 0.4 } else if self.sneaking { EYE - 0.2 } else { EYE }
    }

    pub fn update<W: Blocks>(&mut self, dt: f64, i: Input, w: &W) {
        let (sy, cy) = (self.yaw.sin(), self.yaw.cos());
        let (mut mx, mut mz) = (0.0, 0.0);
        if i.fwd { mx += sy; mz += cy; }
        if i.back { mx -= sy; mz -= cy; }
        if i.right { mx -= cy; mz += sy; }
        if i.left { mx += cy; mz -= sy; }
        let len: f64 = (mx * mx + mz * mz).sqrt();
        if len > 0.0 {
            mx /= len;
            mz /= len;
        }

        self.update_fluids(w);
        // nado na horizontal: começa correndo para frente com a cabeça na água; a caixa fica baixa e o corpo segue
        // o olhar. Continua mesmo sem o sprint, até parar de nadar (soltar as teclas de movimento) ou sair da água
        let starts = i.sprint && i.fwd && block::is_water(w.get(fl(self.x), fl(self.y + EYE), fl(self.z)));
        let want_crawl = !self.flying && self.in_water && (starts || (self.crawl_swim && len > 0.0));
        if want_crawl && !self.crawl_swim && self.h == H {
            self.crawl_swim = true;
            self.h = CRAWL_H;
        } else if !want_crawl && self.crawl_swim && overlapping(self.x, self.y, self.z, self.hw, H, w).is_empty() {
            self.crawl_swim = false;
            self.h = H;
        }
        self.head_in_water = block::is_water(w.get(fl(self.x), fl(self.y + self.eye()), fl(self.z)));
        let swimming = self.in_water || block::is_water(w.get(fl(self.x), fl(self.y + 0.05), fl(self.z)));

        self.sneaking = i.sneak && !self.flying && !self.in_water;
        let sprinting = i.sprint && i.fwd && len > 0.0 && !self.sneaking;
        self.sprinting = sprinting;
        let mut speed = if self.flying { if i.sprint { 22.0 } else { 11.0 } } else if sprinting || self.crawl_swim { 5.8 } else { 4.3 };
        if self.sneaking {
            speed = 1.4;
        }
        if (self.in_water || self.in_lava) && !self.flying {
            speed *= if self.in_lava { 0.35 } else if self.crawl_swim { 0.75 } else { 0.55 };
        }
        let (mx, mz) = if self.crawl_swim { (mx * self.pitch.cos(), mz * self.pitch.cos()) } else { (mx, mz) };
        // gelo: pouca aderência, então demora para pegar velocidade e para parar
        let ice = self.on_ground && !self.in_water && self.on_ice(w);
        let accel = if ice { if len > 0.0 { 2.5 } else { 0.7 } } else if self.on_ground || self.flying || self.in_water { 12.0 } else { 3.0 };
        let k = (accel * dt).min(1.0);
        self.vx += (mx * speed - self.vx) * k;
        self.vz += (mz * speed - self.vz) * k;

        if self.flying {
            let ty = (if i.jump { speed } else { 0.0 }) - (if i.sneak { speed } else { 0.0 });
            self.vy += (ty - self.vy) * (10.0 * dt).min(1.0);
        } else if self.crawl_swim {
            self.vy += (self.pitch.sin() * speed - self.vy) * (6.0 * dt).min(1.0);
        } else if swimming || self.in_lava {
            self.vy -= 9.0 * dt;
            self.vy *= (1.0 - 3.0 * dt).max(0.0);
            if i.jump {
                self.vy = (self.vy + 25.0 * dt).min(3.6);
            }
            // sai da água sozinho só quando a parede é o bloco da superfície (por cima dele não tem água nem bloco)
            if self.hit_wall && len > 0.0 {
                let (ax, az) = (fl(self.x + mx * (self.hw + 0.3)), fl(self.z + mz * (self.hw + 0.3)));
                let wy = fl(self.y + 0.4);
                let above = w.get(ax, wy + 1, az);
                if solid(w.get(ax, wy, az)) && !solid(above) && !block::is_water(above) {
                    self.vy = self.vy.max(7.8);
                }
            }
        } else {
            self.vy -= 28.0 * dt;
            if i.jump && self.on_ground {
                self.vy = 8.4;
            }
            if self.vy < -55.0 {
                self.vy = -55.0;
            }
        }

        // escada de mão: encostado nela, sobe andando para frente ou pulando; agachado, para; senão desce devagar
        if !self.flying && self.on_ladder(w) {
            self.vy = if i.jump || (self.hit_wall && len > 0.0) { 3.2 } else if i.sneak { 0.0 } else { self.vy.max(-2.2) };
            self.fall_dist = 0.0;
        }
        let flying = self.flying;
        self.do_move(dt, w, flying);
        let top = (crate::world::SY + 30) as f64;
        if self.y > top {
            self.y = top;
            self.vy = self.vy.min(0.0);
        }
    }

    fn on_ladder<W: Blocks>(&self, w: &W) -> bool {
        let e = 0.08;
        (fl(self.x - self.hw - e)..=fl(self.x + self.hw + e))
            .any(|x| (fl(self.z - self.hw - e)..=fl(self.z + self.hw + e)).any(|z| [0.05, 0.9].iter().any(|dy| block::info(w.get(x, fl(self.y + dy), z)).kind == block::K_LADDER)))
    }

    /// Há gelo logo abaixo dos pés?
    pub fn on_ice<W: Blocks>(&self, w: &W) -> bool {
        matches!(w.get(fl(self.x), fl(self.y - 0.05), fl(self.z)), block::ICE | block::PACKED_ICE | block::BLUE_ICE)
    }

    pub fn update_fluids<W: Blocks>(&mut self, w: &W) {
        let (bx, bz) = (fl(self.x), fl(self.z));
        let b = w.get(bx, fl(self.y + 0.4), bz);
        self.in_water = block::is_water(b);
        self.in_lava = b == block::LAVA || w.get(bx, fl(self.y + 0.05), bz) == block::LAVA;
    }

    /// Move pela velocidade atual, colidindo com os blocos, em passos pequenos para não atravessar nada.
    pub fn do_move<W: Blocks>(&mut self, dt: f64, w: &W, flying: bool) {
        let was_on_ground = self.on_ground;
        self.on_ground = false;
        self.hit_wall = false;
        let (ddx, ddy, ddz) = (self.vx * dt, self.vy * dt, self.vz * dt);
        if flying || self.in_water {
            self.fall_dist = 0.0;
        } else if ddy < 0.0 {
            self.fall_dist -= ddy;
        }
        let max_d = ddx.abs().max(ddy.abs()).max(ddz.abs());
        let steps = ((max_d / 0.25).ceil() as i32).max(1);
        for _ in 0..steps {
            self.move_axis(1, ddy / steps as f64, w, false);
            let can_step = (was_on_ground || self.on_ground) && !flying;
            for (axis, d) in [(0, ddx / steps as f64), (2, ddz / steps as f64)] {
                // agachado no chão: não dá o passo que deixaria o corpo no ar
                if self.sneaking && (was_on_ground || self.on_ground) {
                    let (nx, nz) = (self.x + if axis == 0 { d } else { 0.0 }, self.z + if axis == 2 { d } else { 0.0 });
                    if overlapping(nx, self.y - 0.56, nz, self.hw, self.h, w).is_empty() {
                        continue;
                    }
                }
                self.move_axis(axis, d, w, can_step);
            }
        }
    }

    fn move_axis<W: Blocks>(&mut self, axis: usize, d: f64, w: &W, can_step: bool) {
        if d == 0.0 {
            return;
        }
        let nx = self.x + if axis == 0 { d } else { 0.0 };
        let ny = self.y + if axis == 1 { d } else { 0.0 };
        let nz = self.z + if axis == 2 { d } else { 0.0 };
        let boxes = overlapping(nx, ny, nz, self.hw, self.h, w);
        if boxes.is_empty() {
            self.x = nx;
            self.y = ny;
            self.z = nz;
            return;
        }
        let limit = boxes
            .iter()
            .map(|c| if d > 0.0 { c[axis] } else { c[axis + 3] })
            .fold(f64::NAN, |best, v| if best.is_nan() || (if d > 0.0 { v < best } else { v > best }) { v } else { best });

        if axis != 1 && can_step {
            // degrau de até meio bloco: sobe sozinho
            let top = boxes.iter().map(|c| c[4]).fold(-1e9, f64::max);
            let rise = top - self.y;
            if rise > 0.0 && rise <= STEP && overlapping(nx, top + EPS, nz, self.hw, self.h, w).is_empty() && overlapping(self.x, top + EPS, self.z, self.hw, self.h, w).is_empty() {
                self.x = nx;
                self.z = nz;
                self.y = top + EPS;
                return;
            }
        }
        let size = if axis == 1 { if d > 0.0 { self.h } else { 0.0 } } else { self.hw };
        let p = if d > 0.0 { limit - size - EPS } else { limit + if axis == 1 { 0.0 } else { self.hw } + EPS };
        let tx = if axis == 0 { p } else { self.x };
        let ty = if axis == 1 { p } else { self.y };
        let tz = if axis == 2 { p } else { self.z };
        if axis == 1 {
            if d < 0.0 {
                self.on_ground = true;
                if self.fall_dist > 0.0 {
                    self.landed_fall = self.fall_dist;
                    self.fall_dist = 0.0;
                }
            }
            self.vy = 0.0;
        } else {
            self.hit_wall = true;
            if axis == 0 { self.vx = 0.0 } else { self.vz = 0.0 }
        }
        if overlapping(tx, ty, tz, self.hw, self.h, w).is_empty() {
            self.x = tx;
            self.y = ty;
            self.z = tz;
        }
    }
}

/// Caixas sólidas (no mundo) que o corpo tocaria na posição dada.
fn overlapping<W: Blocks>(px: f64, py: f64, pz: f64, hw: f64, h: f64, w: &W) -> Vec<[f64; 6]> {
    let mut out = Vec::new();
    let (ax0, ax1, ay0, ay1, az0, az1) = (px - hw, px + hw, py, py + h, pz - hw, pz + hw);
    for bx in fl(ax0)..=fl(ax1) {
        for by in fl(ay0) - 1..=fl(ay1) {
            for bz in fl(az0)..=fl(az1) {
                let b = w.get(bx, by, bz);
                if !solid(b) {
                    continue;
                }
                let info = &block::table().blocks[b as usize];
                let full = [([0.0f32, 0.0, 0.0, 1.0, 1.0, 1.0], 0u16)];
                let boxes: &[([f32; 6], u16)] = if info.boxes.is_empty() { &full } else { &info.boxes };
                for (c, _) in boxes {
                    let (cx0, cy0, cz0) = (bx as f64 + c[0] as f64, by as f64 + c[1] as f64, bz as f64 + c[2] as f64);
                    let (cx1, cy1, cz1) = (bx as f64 + c[3] as f64, by as f64 + c[4] as f64, bz as f64 + c[5] as f64);
                    if ax0 < cx1 && ax1 > cx0 && ay0 < cy1 && ay1 > cy0 && az0 < cz1 && az1 > cz0 {
                        out.push([cx0, cy0, cz0, cx1, cy1, cz1]);
                    }
                }
            }
        }
    }
    out
}

impl Player {
    /// A caixa do corpo está dentro de algum bloco sólido?
    pub fn collides<W: Blocks>(&self, w: &W) -> bool {
        !overlapping(self.x, self.y, self.z, self.hw, self.h, w).is_empty()
    }

    /// Encosta em algum bloco do tipo b (com uma folguinha)? Para o cacto espetar.
    pub fn touching<W: Blocks>(&self, w: &W, b: u8) -> bool {
        let e = 0.05;
        for bx in fl(self.x - self.hw - e)..=fl(self.x + self.hw + e) {
            for by in fl(self.y - e)..=fl(self.y + self.h) {
                for bz in fl(self.z - self.hw - e)..=fl(self.z + self.hw + e) {
                    if w.get(bx, by, bz) == b {
                        return true;
                    }
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Piscina: água de y=0 a y=9 (superfície em y=10), chão de pedra em y=-1; um pilar de pedra em x>=5.
    struct Pool {
        pillar_top: i32,
    }
    impl Blocks for Pool {
        fn get(&self, x: i32, y: i32, _z: i32) -> u8 {
            if y < 0 || (x >= 5 && y <= self.pillar_top) {
                block::STONE
            } else if y <= 9 {
                block::WATER
            } else {
                block::AIR
            }
        }
    }

    fn run(w: &Pool, p: &mut Player, i: Input, secs: f64) {
        for _ in 0..(secs * 60.0) as i32 {
            p.update(1.0 / 60.0, i, w);
        }
    }

    fn swimmer() -> Player {
        let mut p = Player::new();
        p.x = 0.5;
        p.z = 0.5;
        p.y = 4.0;
        p.yaw = std::f64::consts::FRAC_PI_2; // olhando para +X
        p
    }

    #[test]
    fn parede_funda_nao_e_escalada() {
        let w = Pool { pillar_top: 6 }; // topo do pilar bem abaixo da superfície
        let mut p = swimmer();
        p.y = 1.0;
        run(&w, &mut p, Input { fwd: true, ..Default::default() }, 3.0);
        assert!(p.y < 6.0, "subiu a parede submersa: y={}", p.y);
    }

    #[test]
    fn parede_da_superficie_sai_da_agua() {
        let w = Pool { pillar_top: 9 }; // o pilar chega na superfície
        let mut p = swimmer();
        p.y = 8.0;
        run(&w, &mut p, Input { fwd: true, jump: true, ..Default::default() }, 3.0);
        assert!(p.y > 9.5, "não saiu da água: y={}", p.y);
    }

    #[test]
    fn gelo_escorrega() {
        struct Floor(u8);
        impl Blocks for Floor {
            fn get(&self, _x: i32, y: i32, _z: i32) -> u8 {
                if y < 0 { self.0 } else { block::AIR }
            }
        }
        let slide = |floor: u8| {
            let w = Floor(floor);
            let mut p = Player::new();
            p.y = 0.0;
            p.yaw = std::f64::consts::FRAC_PI_2;
            for _ in 0..60 {
                p.update(1.0 / 60.0, Input { fwd: true, ..Default::default() }, &w);
            }
            for _ in 0..30 {
                p.update(1.0 / 60.0, Input::default(), &w);
            }
            p.vx.abs()
        };
        assert!(slide(block::STONE) < 0.01);
        assert!(slide(block::ICE) > 0.5, "gelo não escorrega");
    }

    #[test]
    fn nado_horizontal_segue_o_olhar_e_abaixa_a_caixa() {
        let w = Pool { pillar_top: -1 };
        let mut p = swimmer();
        p.pitch = -0.6; // olhando para baixo
        let y0 = p.y;
        run(&w, &mut p, Input { fwd: true, sprint: true, ..Default::default() }, 0.8);
        assert!(p.crawl_swim && p.h < 1.0);
        assert!(p.y < y0 - 0.5, "não desceu olhando para baixo: y={}", p.y);
        // soltou o sprint mas continua andando: segue na horizontal
        run(&w, &mut p, Input { fwd: true, ..Default::default() }, 0.5);
        assert!(p.crawl_swim && p.h < 1.0);
        // parou de nadar: volta ao normal
        run(&w, &mut p, Input::default(), 0.5);
        assert!(!p.crawl_swim && p.h == H);
    }
}

#[cfg(test)]
mod testes_exploracao {
    use super::*;

    /// chão só até x = 2; uma parede em z = 3 com uma escada de mão encostada nela (célula z = 2)
    struct Cenario;
    impl Blocks for Cenario {
        fn get(&self, x: i32, y: i32, z: i32) -> u8 {
            if y == 9 && x <= 2 {
                block::STONE
            } else if y >= 10 && y < 16 && z == 3 {
                block::STONE
            } else if y >= 10 && y < 16 && z == 2 && x == 0 {
                block::LADDER // face +Z: encostada na parede
            } else {
                block::AIR
            }
        }
    }

    fn andar(p: &mut Player, i: Input, secs: f64) {
        for _ in 0..(secs * 60.0) as i32 {
            p.update(1.0 / 60.0, i, &Cenario);
        }
    }

    #[test]
    fn agachado_nao_cai_da_beirada() {
        let mut p = Player::new();
        (p.x, p.y, p.z, p.yaw) = (1.5, 10.01, -4.5, std::f64::consts::FRAC_PI_2); // olhando para +X
        andar(&mut p, Input { fwd: true, sneak: true, ..Default::default() }, 4.0);
        assert!(p.y > 9.9 && p.x < 3.4 && p.x > 2.5, "caiu ou não chegou na beirada: {} {}", p.x, p.y);
        andar(&mut p, Input { fwd: true, ..Default::default() }, 1.0);
        assert!(p.y < 9.0, "em pé devia cair: {}", p.y);
    }

    #[test]
    fn escada_de_mao_sobe_e_segura() {
        let mut p = Player::new();
        (p.x, p.y, p.z, p.yaw) = (0.5, 10.01, 1.0, 0.0); // olhando para a parede (+Z)
        andar(&mut p, Input { fwd: true, ..Default::default() }, 1.6);
        assert!(p.y > 13.0, "não subiu: {}", p.y);
        let y = p.y;
        andar(&mut p, Input { sneak: true, ..Default::default() }, 1.0);
        assert!((p.y - y).abs() < 0.4, "agachado devia parar: {} -> {}", y, p.y);
    }
}
