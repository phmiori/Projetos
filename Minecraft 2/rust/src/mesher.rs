//! Malha 3D de um pedaço, traduzida do Mesher.java. Usa o mesmo formato de vértice (três u32), então
//! os shaders são os mesmos do GLRenderer do Java.
//!   a: posição em 1/16 de bloco — bits 0-8 x | 9-19 y | 20-28 z
//!   b: bits 0-9 camada | 10-13 luz do céu | 14-17 luz de tocha | 18-21 marcas (1 brilha, 2 planta)
//!      | 22-25 superfície da água | 26 bit alto da camada
//!   c: bits 0-4 u | 5-9 v | 10-12 face | 13-14 oclusão | 15-16 canto

use crate::block::{self, *};
use crate::world::{idx, Chunk, SY};
use std::sync::Arc;

pub const FLAG_EMISSIVE: u32 = 1;
pub const FLAG_PLANT: u32 = 2;
const POS_BIAS: i32 = 64;

const N: [[i32; 3]; 6] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const R: [[i32; 3]; 6] = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0]];
const U: [[i32; 3]; 6] = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];
const SR: [i32; 4] = [-1, 1, 1, -1];
const SU: [i32; 4] = [-1, -1, 1, 1];
const CROSS_Q: [[[i32; 2]; 2]; 4] = [[[0, 0], [1, 1]], [[1, 1], [0, 0]], [[1, 0], [0, 1]], [[0, 1], [1, 0]]];
const FACE_DIR: [i32; 6] = [3, 1, -1, -1, 0, 2];
const DIR_FACE: [usize; 4] = [4, 1, 5, 0];
const DIR_X: [i32; 4] = [0, -1, 0, 1];
const DIR_Z: [i32; 4] = [1, 0, -1, 0];

pub struct Mesh {
    pub cx: i32,
    pub cz: i32,
    pub opaque: Vec<u32>,
    pub water: Vec<u32>,
}

/// O pedaço e seus 8 vizinhos (índice (dx+1)*3 + dz+1).
pub struct Region {
    pub c: [Arc<Chunk>; 9],
    pub cx: i32,
    pub cz: i32,
}

impl Region {
    #[inline]
    fn of(&self, x: i32, z: i32) -> Option<&Chunk> {
        let dx = (x >> 4) - self.cx + 1;
        let dz = (z >> 4) - self.cz + 1;
        if !(0..=2).contains(&dx) || !(0..=2).contains(&dz) {
            return None;
        }
        Some(&self.c[(dx * 3 + dz) as usize])
    }
    #[inline]
    fn at(&self, x: i32, y: i32, z: i32) -> u8 {
        if y < 0 || y >= SY {
            return AIR;
        }
        match self.of(x, z) {
            Some(c) => c.blocks[idx(x & 15, y, z & 15)],
            None => AIR,
        }
    }
    #[inline]
    fn occluder(&self, x: i32, y: i32, z: i32) -> i32 {
        let b = self.at(x, y, z);
        if b == AIR {
            return 0;
        }
        let s = block::shape(b);
        (s == CUBE || s == CUTOUT) as i32
    }
    fn rotation(&self, x: i32, y: i32, z: i32) -> i32 {
        match self.of(x, z) {
            Some(c) if (0..SY).contains(&y) => *c.rot.get(&(idx(x & 15, y, z & 15) as u16)).unwrap_or(&0) as i32,
            _ => 0,
        }
    }
    fn sky0(&self, x: i32, y: i32, z: i32) -> i32 {
        if y >= SY {
            return 15;
        }
        let c = match self.of(x, z) {
            Some(c) => c,
            None => return 15,
        };
        let top = c.sky_top[((x & 15) * 16 + (z & 15)) as usize] as i32;
        if y > top {
            return 15;
        }
        (15 - (top - y + 1) * 3).max(0)
    }
    fn blk(&self, x: i32, y: i32, z: i32) -> i32 {
        if !(0..SY).contains(&y) {
            return 0;
        }
        match self.of(x, z) {
            Some(c) => c.light[idx(x & 15, y, z & 15)] as i32,
            None => 0,
        }
    }

    /// Luz do céu com o "vazamento" de lado do Java: embaixo de saliências a luz entra um ou dois blocos.
    fn sky(&self, x: i32, y: i32, z: i32) -> i32 {
        let mut s = self.sky0(x, y, z);
        if s >= 11 {
            return s;
        }
        for f in 0..4 {
            let (dx, dz) = (DIR_X[f], DIR_Z[f]);
            if block::opaque_cube(self.at(x + dx, y, z + dz)) {
                continue;
            }
            s = s.max(self.sky0(x + dx, y, z + dz) - 4);
            if s < 8 && !block::opaque_cube(self.at(x + 2 * dx, y, z + 2 * dz)) {
                s = s.max(self.sky0(x + 2 * dx, y, z + 2 * dz) - 7);
            }
        }
        s
    }
}

#[inline]
fn l(layer: i32) -> u32 {
    ((layer & 1023) | ((layer >> 10) << 26)) as u32
}
#[inline]
fn pos(x: i32, y: i32, z: i32) -> u32 {
    ((x + POS_BIAS) | (y << 9) | ((z + POS_BIAS) << 20)) as u32
}
#[inline]
fn uv(u: i32, v: i32, face: i32, occ: i32, corner: i32) -> u32 {
    (u | v << 5 | face << 10 | occ << 13 | corner << 15) as u32
}

fn local_face(f: usize, rot: i32) -> usize {
    let d = FACE_DIR[f];
    if d < 0 { f } else { DIR_FACE[((d - rot) & 3) as usize] }
}

fn unrotate(mut x: i32, mut z: i32, rot: i32) -> (i32, i32) {
    for _ in 0..rot {
        let t = x;
        x = z;
        z = -t;
    }
    (x, z)
}

fn top_uv(f: usize, k: usize, rot: i32, occ: i32) -> u32 {
    let (r, u) = (R[f], U[f]);
    let cx = SR[k] * r[0] + SU[k] * u[0];
    let cz = SR[k] * r[2] + SU[k] * u[2];
    let (qx, qz) = unrotate(cx, cz, rot);
    uv(
        if qx * r[0] + qz * r[2] > 0 { 16 } else { 0 },
        if qx * u[0] + qz * u[2] > 0 { 16 } else { 0 },
        f as i32,
        occ,
        k as i32,
    )
}

fn random_rot(x: i32, y: i32, z: i32) -> i32 {
    let mut h = x.wrapping_mul(73856093) ^ y.wrapping_mul(19349663) ^ z.wrapping_mul(83492791);
    h ^= (h as u32 >> 13) as i32;
    h = h.wrapping_mul(0x5bd1e995);
    h ^= (h as u32 >> 15) as i32;
    h & 3
}

fn visible(b: u8, nb: u8) -> bool {
    if nb == AIR {
        return true;
    }
    if block::is_water(b) && block::is_water(nb) {
        return block::water_level(nb) > block::water_level(b);
    }
    let (s, ns) = (block::shape(b), block::shape(nb));
    if s == LIQUID || s == CUTOUT {
        return nb != b && ns != CUBE;
    }
    ns != CUBE
}

#[inline]
fn add(v: &mut Vec<u32>, a: u32, b: u32, c: u32) {
    v.push(a);
    v.push(b);
    v.push(c);
}

pub fn build(reg: &Region) -> Mesh {
    let (cx, cz) = (reg.cx, reg.cz);
    let center = &reg.c[4];
    let mut opaque = Vec::with_capacity(24576);
    let mut water = Vec::new();
    let (x0, z0) = (cx * 16, cz * 16);
    let mut occ = [0i32; 4];
    let mut sky = [0i32; 4];
    let mut blk = [0i32; 4];
    for lx in 0..16 {
        for lz in 0..16 {
            let (x, z) = (x0 + lx, z0 + lz);
            for y in 0..SY {
                let b = center.blocks[idx(lx, y, lz)];
                if b == AIR {
                    continue;
                }
                let shape = block::shape(b);
                let flags = if block::light(b) > 0 && b != TORCH && b != FURNACE_LIT { FLAG_EMISSIVE } else { 0 };
                let (ox, oy, oz) = (lx * 16, y * 16, lz * 16);

                if shape == CROSS {
                    let s = reg.sky(x, y, z) as u32;
                    let bl = reg.blk(x, y, z) as u32;
                    let b2 = l(block::texture(b) as i32 * 6 + 4) | s << 10 | bl << 14 | FLAG_PLANT << 18;
                    for q in 0..4 {
                        let f = if q < 2 { 6 } else { 7 };
                        let (a, c) = (CROSS_Q[q][0], CROSS_Q[q][1]);
                        add(&mut opaque, pos(ox + a[0] * 16, oy, oz + a[1] * 16), b2, uv(0, 0, f, 0, 0));
                        add(&mut opaque, pos(ox + c[0] * 16, oy, oz + c[1] * 16), b2, uv(16, 0, f, 0, 1));
                        add(&mut opaque, pos(ox + c[0] * 16, oy + 16, oz + c[1] * 16), b2, uv(16, 16, f, 0, 2));
                        add(&mut opaque, pos(ox + a[0] * 16, oy + 16, oz + a[1] * 16), b2, uv(0, 16, f, 0, 3));
                    }
                    continue;
                }

                if shape == MODEL {
                    // escadas, lajes, portas, cama: caixas com a luz da própria célula (cercas e painéis ainda
                    // sem as ligações com os vizinhos)
                    let s = reg.sky(x, y, z) as u32;
                    let bl = reg.blk(x, y, z) as u32;
                    for (bx, tex) in &block::table().blocks[b as usize].boxes {
                        let p0 = [(bx[0] * 16.0).round() as i32, (bx[1] * 16.0).round() as i32, (bx[2] * 16.0).round() as i32];
                        let p1 = [(bx[3] * 16.0).round() as i32, (bx[4] * 16.0).round() as i32, (bx[5] * 16.0).round() as i32];
                        for f in 0..6 {
                            let n = N[f];
                            let axis = if n[0] != 0 { 0 } else if n[1] != 0 { 1 } else { 2 };
                            let on_edge = if n[axis] > 0 { p1[axis] == 16 } else { p0[axis] == 0 };
                            if on_edge && block::opaque_cube(reg.at(x + n[0], y + n[1], z + n[2])) {
                                continue;
                            }
                            let layer = *tex as i32 * 6 + f as i32;
                            for k in 0..4 {
                                let mut c = [0i32; 3];
                                for i in 0..3 {
                                    let m = n[i] + SR[k] * R[f][i] + SU[k] * U[f][i];
                                    c[i] = if m > 0 { p1[i] } else { p0[i] };
                                }
                                let (r, u) = (R[f], U[f]);
                                let tu = (c[0] - 8) * r[0] + (c[1] - 8) * r[1] + (c[2] - 8) * r[2] + 8;
                                let tv = (c[0] - 8) * u[0] + (c[1] - 8) * u[1] + (c[2] - 8) * u[2] + 8;
                                add(&mut opaque, pos(ox + c[0], oy + c[1], oz + c[2]), l(layer) | s << 10 | bl << 14, uv(tu, tv, f as i32, 0, k as i32));
                            }
                        }
                    }
                    continue;
                }

                let rot = if block::table().blocks[b as usize].rotatable { reg.rotation(x, y, z) } else { 0 };
                let top_rot = if rot == 0 && (b == GRASS || b == SAND) { random_rot(x, y, z) } else { rot };
                for f in 0..6 {
                    let n = N[f];
                    let nbk = reg.at(x + n[0], y + n[1], z + n[2]);
                    if !visible(b, nbk) {
                        continue;
                    }
                    let (r, u) = (R[f], U[f]);
                    let (fx, fy, fz) = (x + n[0], y + n[1], z + n[2]);
                    for k in 0..4 {
                        let (sr, su) = (SR[k], SU[k]);
                        let (ax, ay, az) = (fx + sr * r[0], fy + sr * r[1], fz + sr * r[2]);
                        let (bx, by, bz) = (fx + su * u[0], fy + su * u[1], fz + su * u[2]);
                        let (qx, qy, qz) = (ax + su * u[0], ay + su * u[1], az + su * u[2]);
                        let s1 = reg.occluder(ax, ay, az);
                        let s2 = reg.occluder(bx, by, bz);
                        let c = reg.occluder(qx, qy, qz);
                        occ[k] = if s1 == 1 && s2 == 1 { 3 } else { s1 + s2 + c };
                        let mut ns = reg.sky(fx, fy, fz);
                        let mut nl = reg.blk(fx, fy, fz);
                        let mut cnt = 1;
                        if s1 == 0 {
                            ns += reg.sky(ax, ay, az);
                            nl += reg.blk(ax, ay, az);
                            cnt += 1;
                        }
                        if s2 == 0 {
                            ns += reg.sky(bx, by, bz);
                            nl += reg.blk(bx, by, bz);
                            cnt += 1;
                        }
                        if c == 0 && !(s1 == 1 && s2 == 1) {
                            ns += reg.sky(qx, qy, qz);
                            nl += reg.blk(qx, qy, qz);
                            cnt += 1;
                        }
                        sky[k] = (ns + cnt / 2) / cnt;
                        blk[k] = (nl + cnt / 2) / cnt;
                    }
                    let lf = if rot == 0 { f } else { local_face(f, rot) };
                    let layer = block::texture(b) as i32 * 6 + lf as i32;
                    let out = if block::is_water(b) { &mut water } else { &mut opaque };
                    let surface = if block::is_water(b) && !block::is_water(reg.at(x, y + 1, z)) { block::water_level(b) + 1 } else { 0 };
                    let start = if occ[0] + occ[2] > occ[1] + occ[3] { 1 } else { 0 };
                    for i in 0..4 {
                        let k = (start + i) & 3;
                        let px = (1 + n[0] + SR[k] * r[0] + SU[k] * u[0]) * 8;
                        let py = (1 + n[1] + SR[k] * r[1] + SU[k] * u[1]) * 8;
                        let pz = (1 + n[2] + SR[k] * r[2] + SU[k] * u[2]) * 8;
                        let bb = l(layer) | (sky[k] as u32) << 10 | (blk[k] as u32) << 14 | flags << 18 | (surface as u32) << 22;
                        let cc = if top_rot != 0 && (f == 2 || f == 3) {
                            top_uv(f, k, top_rot, occ[k])
                        } else {
                            uv(if SR[k] > 0 { 16 } else { 0 }, if SU[k] > 0 { 16 } else { 0 }, f as i32, occ[k], k as i32)
                        };
                        add(out, pos(ox + px, oy + py, oz + pz), bb, cc);
                    }
                }
            }
        }
    }
    Mesh { cx, cz, opaque, water }
}
