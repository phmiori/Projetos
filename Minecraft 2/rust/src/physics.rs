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

#[derive(Default)]
pub struct Player {
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
        self.head_in_water = block::is_water(w.get(fl(self.x), fl(self.y + EYE), fl(self.z)));
        let swimming = self.in_water || block::is_water(w.get(fl(self.x), fl(self.y + 0.05), fl(self.z)));

        let sprinting = i.sprint && i.fwd && len > 0.0;
        let mut speed = if self.flying { if i.sprint { 22.0 } else { 11.0 } } else if sprinting { 5.8 } else { 4.3 };
        if (self.in_water || self.in_lava) && !self.flying {
            speed *= if self.in_lava { 0.35 } else { 0.55 };
        }
        let accel = if self.on_ground || self.flying || self.in_water { 12.0 } else { 3.0 };
        let k = (accel * dt).min(1.0);
        self.vx += (mx * speed - self.vx) * k;
        self.vz += (mz * speed - self.vz) * k;

        if self.flying {
            let ty = (if i.jump { speed } else { 0.0 }) - (if i.sneak { speed } else { 0.0 });
            self.vy += (ty - self.vy) * (10.0 * dt).min(1.0);
        } else if swimming || self.in_lava {
            self.vy -= 9.0 * dt;
            self.vy *= (1.0 - 3.0 * dt).max(0.0);
            if i.jump {
                self.vy = (self.vy + 25.0 * dt).min(3.6);
            }
            if self.hit_wall && (i.jump || len > 0.0) {
                self.vy = self.vy.max(7.8);
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

        self.do_move(dt, w);
        let top = (crate::world::SY + 30) as f64;
        if self.y > top {
            self.y = top;
            self.vy = self.vy.min(0.0);
        }
    }

    fn update_fluids<W: Blocks>(&mut self, w: &W) {
        let (bx, bz) = (fl(self.x), fl(self.z));
        let b = w.get(bx, fl(self.y + 0.4), bz);
        self.in_water = block::is_water(b);
        self.in_lava = b == block::LAVA || w.get(bx, fl(self.y + 0.05), bz) == block::LAVA;
    }

    fn do_move<W: Blocks>(&mut self, dt: f64, w: &W) {
        let was_on_ground = self.on_ground;
        self.on_ground = false;
        self.hit_wall = false;
        let (ddx, ddy, ddz) = (self.vx * dt, self.vy * dt, self.vz * dt);
        let max_d = ddx.abs().max(ddy.abs()).max(ddz.abs());
        let steps = ((max_d / 0.25).ceil() as i32).max(1);
        for _ in 0..steps {
            self.move_axis(1, ddy / steps as f64, w, false);
            let can_step = (was_on_ground || self.on_ground) && !self.flying;
            self.move_axis(0, ddx / steps as f64, w, can_step);
            self.move_axis(2, ddz / steps as f64, w, can_step);
        }
    }

    fn move_axis<W: Blocks>(&mut self, axis: usize, d: f64, w: &W, can_step: bool) {
        if d == 0.0 {
            return;
        }
        let nx = self.x + if axis == 0 { d } else { 0.0 };
        let ny = self.y + if axis == 1 { d } else { 0.0 };
        let nz = self.z + if axis == 2 { d } else { 0.0 };
        let boxes = overlapping(nx, ny, nz, w);
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
            if rise > 0.0 && rise <= STEP && overlapping(nx, top + EPS, nz, w).is_empty() && overlapping(self.x, top + EPS, self.z, w).is_empty() {
                self.x = nx;
                self.z = nz;
                self.y = top + EPS;
                return;
            }
        }
        let size = if axis == 1 { if d > 0.0 { H } else { 0.0 } } else { HW };
        let p = if d > 0.0 { limit - size - EPS } else { limit + if axis == 1 { 0.0 } else { HW } + EPS };
        let tx = if axis == 0 { p } else { self.x };
        let ty = if axis == 1 { p } else { self.y };
        let tz = if axis == 2 { p } else { self.z };
        if axis == 1 {
            if d < 0.0 {
                self.on_ground = true;
            }
            self.vy = 0.0;
        } else {
            self.hit_wall = true;
            if axis == 0 { self.vx = 0.0 } else { self.vz = 0.0 }
        }
        if overlapping(tx, ty, tz, w).is_empty() {
            self.x = tx;
            self.y = ty;
            self.z = tz;
        }
    }
}

/// Caixas sólidas (no mundo) que o corpo tocaria na posição dada.
fn overlapping<W: Blocks>(px: f64, py: f64, pz: f64, w: &W) -> Vec<[f64; 6]> {
    let mut out = Vec::new();
    let (ax0, ax1, ay0, ay1, az0, az1) = (px - HW, px + HW, py, py + H, pz - HW, pz + HW);
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
