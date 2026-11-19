//! Partículas (Particles.java): pedacinhos coloridos que saltam do bloco batido ou quebrado (com as cores da
//! textura dele), respingos, sangue, a fumaça e as fagulhas das explosões e a fumacinha do pavio. São
//! quadradinhos virados para a câmera.

use crate::block;
use crate::textures::Atlas;
use crate::Game;
use std::sync::OnceLock;

const MAX: usize = 1500;

pub struct Particle {
    p: [f32; 3],
    v: [f32; 3],
    life: f32,
    size: f32,
    gravity: f32,
    color: [f32; 3],
    /// fagulha: brilha sozinha
    spark: bool,
}

/// Algumas cores opacas da face da frente de cada textura (para os pedacinhos dos blocos).
static PALETTE: OnceLock<Vec<Vec<[f32; 3]>>> = OnceLock::new();

pub fn set_palette(a: &Atlas) {
    let layer = (a.size * a.size * 4) as usize;
    let textures = a.layers as usize / 6;
    let mut out = Vec::with_capacity(textures);
    for t in 0..textures {
        let o = (t * 6 + 4) * layer;
        let px = &a.pixels[o..o + layer];
        let opaque: Vec<[f32; 3]> = px.chunks(4).filter(|c| c[3] >= 128).map(|c| [c[0] as f32 / 255.0, c[1] as f32 / 255.0, c[2] as f32 / 255.0]).collect();
        let step = (opaque.len() / 24).max(1);
        out.push(opaque.into_iter().step_by(step).take(24).collect());
    }
    let _ = PALETTE.set(out);
}

fn rgb(c: u32) -> [f32; 3] {
    [((c >> 16) & 255) as f32 / 255.0, ((c >> 8) & 255) as f32 / 255.0, (c & 255) as f32 / 255.0]
}

impl Game {
    fn particle(&mut self, p: [f64; 3], v: [f64; 3], life: f64, size: f64, gravity: f64, color: [f32; 3], spark: bool) {
        let q = Particle {
            p: [p[0] as f32, p[1] as f32, p[2] as f32],
            v: [v[0] as f32, v[1] as f32, v[2] as f32],
            life: life as f32,
            size: size as f32,
            gravity: gravity as f32,
            color,
            spark,
        };
        if self.particles.len() < MAX {
            self.particles.push(q);
        } else {
            let i = (self.rng.next() * MAX as f64) as usize % MAX; // cheio: troca uma qualquer
            self.particles[i] = q;
        }
    }

    fn r(&mut self) -> f64 {
        self.rng.next()
    }

    /// Pedaços do bloco (cores tiradas da textura dele) saltando da célula.
    pub fn block_bits(&mut self, b: u8, x: i32, y: i32, z: i32, n: usize) {
        let Some(pal) = PALETTE.get().and_then(|p| p.get(block::texture(b) as usize)) else { return };
        if pal.is_empty() {
            return;
        }
        let pal = pal.clone();
        for _ in 0..n {
            let c = pal[(self.r() * pal.len() as f64) as usize % pal.len()];
            let p = [x as f64 + self.r(), y as f64 + self.r(), z as f64 + self.r()];
            let v = [(p[0] - x as f64 - 0.5) * 3.0 + (self.r() - 0.5), 1.5 + self.r() * 2.5, (p[2] - z as f64 - 0.5) * 3.0 + (self.r() - 0.5)];
            let (life, size) = (0.4 + self.r() * 0.5, 0.05 + self.r() * 0.05);
            self.particle(p, v, life, size, 18.0, c, false);
        }
    }

    /// Respingos de uma cor só (flecha acertando uma criatura, adubo no trigo).
    pub fn hit_bits(&mut self, p: [f64; 3], color: u32, n: usize) {
        for _ in 0..n {
            let q = [p[0] + (self.r() - 0.5) * 0.3, p[1] + (self.r() - 0.5) * 0.3, p[2] + (self.r() - 0.5) * 0.3];
            let v = [(self.r() - 0.5) * 3.5, 1.0 + self.r() * 2.5, (self.r() - 0.5) * 3.5];
            let (life, size) = (0.3 + self.r() * 0.4, 0.04 + self.r() * 0.04);
            self.particle(q, v, life, size, 18.0, rgb(color), false);
        }
    }

    /// Sangue da mordida do tubarão: gotas vermelhas que se espalham e afundam devagar.
    pub fn blood(&mut self, p: [f64; 3]) {
        let tones = [0x8A0E0E, 0xB01818, 0x6A0808, 0xC42A20];
        for _ in 0..22 {
            let q = [p[0] + (self.r() - 0.5) * 0.5, p[1] + (self.r() - 0.5) * 0.5, p[2] + (self.r() - 0.5) * 0.5];
            let v = [(self.r() - 0.5) * 2.4, (self.r() - 0.3) * 1.6, (self.r() - 0.5) * 2.4];
            let (life, size) = (0.8 + self.r() * 0.9, 0.06 + self.r() * 0.07);
            let c = tones[(self.r() * 4.0) as usize % 4];
            self.particle(q, v, life, size, 2.5, rgb(c), false);
        }
    }

    /// Fumaça e fagulhas de uma explosão.
    pub fn explosion_bits(&mut self, p: [f64; 3], power: f64) {
        for _ in 0..(power * 45.0) as usize {
            let a = self.r() * std::f64::consts::TAU;
            let b = (self.r() - 0.5) * std::f64::consts::PI;
            let sp = 1.0 + self.r() * power * 2.5;
            let d = [a.cos() * b.cos(), b.sin(), a.sin() * b.cos()];
            let spark = self.r() < 0.25;
            let grey = (60.0 + self.r() * 140.0) as u32;
            let c = if spark { 0xFF0000 | ((120.0 + self.r() * 120.0) as u32) << 8 | 0x20 } else { grey << 16 | grey << 8 | grey };
            let life = 0.5 + self.r() * 1.1;
            let size = if spark { 0.08 } else { 0.16 + self.r() * 0.2 };
            self.particle([p[0] + d[0] * 0.5, p[1] + d[1] * 0.5, p[2] + d[2] * 0.5], [d[0] * sp, d[1] * sp + 1.0, d[2] * sp], life, size, if spark { 9.0 } else { -1.2 }, rgb(c), spark);
        }
    }

    /// Fumacinha subindo (pavio aceso).
    pub fn smoke(&mut self, p: [f64; 3]) {
        let grey = (150.0 + self.r() * 90.0) as u32;
        let q = [p[0] + (self.r() - 0.5) * 0.3, p[1], p[2] + (self.r() - 0.5) * 0.3];
        self.particle(q, [0.0, 0.6, 0.0], 0.7, 0.08, -1.0, rgb(grey << 16 | grey << 8 | grey), false);
    }

    pub fn update_particles(&mut self, dt: f64) {
        let d = dt as f32;
        let mut ps = std::mem::take(&mut self.particles);
        ps.retain_mut(|q| {
            q.life -= d;
            if q.life <= 0.0 {
                return false;
            }
            q.v[1] -= q.gravity * d;
            let n = [q.p[0] + q.v[0] * d, q.p[1] + q.v[1] * d, q.p[2] + q.v[2] * d];
            if block::opaque_cube(self.get(n[0].floor() as i32, n[1].floor() as i32, n[2].floor() as i32)) {
                q.v[0] *= 0.3; // bateu: para onde está
                q.v[2] *= 0.3;
                q.v[1] = 0.0;
            } else {
                q.p = n;
            }
            true
        });
        self.particles = ps;
    }

    /// Quadradinhos de frente para a câmera, com a luz de onde estão.
    pub fn draw_particles(&self, ui: &mut crate::ui::Ui, daylight: f32) {
        let (cy, sy, cp, sp) = (self.player.yaw.cos() as f32, self.player.yaw.sin() as f32, self.player.pitch.cos() as f32, self.player.pitch.sin() as f32);
        let (r, u) = ([-cy, 0.0, sy], [-sp * sy, cp, -sp * cy]);
        for q in &self.particles {
            let (bx, by, bz) = (q.p[0].floor() as i32, q.p[1].floor() as i32, q.p[2].floor() as i32);
            let l = if q.spark {
                1.0
            } else {
                let sky = self.sky_light(bx, by, bz) as f32 / 15.0 * (0.13 + 0.87 * daylight);
                let blk = (self.block_light(bx, by, bz) as f32 / 15.0).powf(1.5);
                (sky.max(blk) * 0.95 + 0.05).min(1.0)
            };
            let s = q.size * (q.life * 4.0).min(1.0); // encolhe no fim
            let c = [q.color[0] * l, q.color[1] * l, q.color[2] * l, 1.0];
            let p = q.p;
            let v = |a: f32, b: f32| [p[0] + r[0] * a + u[0] * b, p[1] + u[1] * b, p[2] + r[2] * a + u[2] * b];
            ui.solid_quad([v(-s, -s), v(s, -s), v(s, s), v(-s, s)], c);
        }
    }
}
