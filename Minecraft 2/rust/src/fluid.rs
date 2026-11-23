//! Água corrente, traduzida do World.java: a cada 0,2 s a água cai, escorre para o desnível mais perto
//! (até 4 blocos; sem desnível, espalha até 7 blocos perdendo altura) e seca quando perde a fonte.
//! Só as células perto de onde algo mudou são olhadas.

use crate::block::{self, AIR, CROSS};
use crate::world::SY;
use crate::Game;

const HX: [i32; 4] = [1, -1, 0, 0];
const HZ: [i32; 4] = [0, 0, 1, -1]; // h ^ 1 = o lado oposto

/// Ar, plantas e tochas: a água ocupa o lugar (e leva as plantas embora).
fn flowable(b: u8) -> bool {
    b == AIR || block::shape(b) == CROSS
}

/// Bloco de água do nível dado (0 = fonte, 1..7 = corrente).
fn water_of_level(l: i32) -> u8 {
    if l <= 0 { block::WATER } else { block::WATER_FLOW + (l - 1) as u8 }
}

impl Game {
    pub fn schedule_fluid(&mut self, x: i32, y: i32, z: i32) {
        if (0..SY).contains(&y) && self.fluid_set.insert((x, y, z)) {
            self.fluid_queue.push((x, y, z));
        }
    }

    pub fn water_around(&self, x: i32, y: i32, z: i32) -> bool {
        [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)].iter().any(|(dx, dy, dz)| block::is_water(self.get(x + dx, y + dy, z + dz)))
    }

    pub fn tick_fluids(&mut self, dt: f64) {
        self.fluid_timer += dt;
        if self.fluid_timer < 0.2 || self.fluid_queue.is_empty() {
            return;
        }
        self.fluid_timer = 0.0;
        let n = self.fluid_queue.len().min(6000);
        let batch: Vec<(i32, i32, i32)> = self.fluid_queue.drain(..n).collect();
        for k in &batch {
            self.fluid_set.remove(k);
        }
        for (x, y, z) in batch {
            self.update_fluid(x, y, z);
        }
    }

    fn update_fluid(&mut self, x: i32, y: i32, z: i32) {
        if !self.chunks.contains_key(&(x >> 4, z >> 4)) {
            return;
        }
        let b = self.get(x, y, z);
        let level = block::water_level(b);
        if level < 0 {
            // célula livre ao lado de água: enche se alguma água chega até aqui
            if flowable(b) {
                let want = self.support_level(x, y, z);
                if want <= 7 {
                    self.set(x, y, z, water_of_level(want), 0);
                }
            }
            return;
        }
        if level > 0 {
            // água corrente precisa de algo que a alimente; senão vai secando
            let want = self.support_level(x, y, z);
            if want > 7 {
                self.set(x, y, z, AIR, 0);
                return;
            }
            if want != level {
                self.set(x, y, z, water_of_level(want), 0);
                return;
            }
        }
        let below = self.get(x, y - 1, z);
        if flowable(below) {
            self.set(x, y - 1, z, water_of_level(1), 0); // cai
        } else if !block::is_water(below) || level == 0 {
            let next = level + 1;
            if next > 7 {
                return;
            }
            let dirs = self.flow_dirs(x, y, z);
            for h in 0..4 {
                if dirs & (1 << h) == 0 {
                    continue;
                }
                let (nx, nz) = (x + HX[h], z + HZ[h]);
                if flowable(self.get(nx, y, nz)) {
                    self.set(nx, y, nz, water_of_level(next), 0);
                }
            }
        }
    }

    /// Nível que esta célula teria pela água em volta (99 = nenhuma água chega).
    fn support_level(&self, x: i32, y: i32, z: i32) -> i32 {
        if block::is_water(self.get(x, y + 1, z)) {
            return 1; // água caindo de cima
        }
        let mut best = 99;
        for h in 0..4 {
            let (nx, nz) = (x + HX[h], z + HZ[h]);
            let l = block::water_level(self.get(nx, y, nz));
            if l < 0 || l + 1 >= best {
                continue;
            }
            let under = self.get(nx, y - 1, nz);
            // água caindo (ar ou mais água embaixo) não espalha para o lado; só a apoiada em chão ou a fonte
            if l > 0 && (flowable(under) || block::is_water(under)) {
                continue;
            }
            // e só se este lado é um dos caminhos que ela escolheu (o do desnível mais perto)
            if self.flow_dirs(nx, y, nz) & (1 << (h ^ 1)) == 0 {
                continue;
            }
            best = l + 1;
        }
        best
    }

    fn drop_below(&self, x: i32, y: i32, z: i32) -> bool {
        if y <= 0 {
            return false;
        }
        let b = self.get(x, y - 1, z);
        flowable(b) || block::is_water(b)
    }

    fn passable(&self, x: i32, y: i32, z: i32) -> bool {
        let b = self.get(x, y, z);
        flowable(b) || block::water_level(b) > 0
    }

    fn drop_distance(&self, x: i32, y: i32, z: i32, from: usize, dist: i32) -> i32 {
        if self.drop_below(x, y, z) {
            return dist;
        }
        if dist >= 4 {
            return 99;
        }
        let mut best = 99;
        for h in 0..4 {
            if h == from {
                continue;
            }
            let (nx, nz) = (x + HX[h], z + HZ[h]);
            if !self.passable(nx, y, nz) {
                continue;
            }
            best = best.min(self.drop_distance(nx, y, nz, h ^ 1, dist + 1));
        }
        best
    }

    /// Para quais lados a água de (x, y, z) escorre: o desnível mais perto; sem desnível, todos os lados livres.
    fn flow_dirs(&self, x: i32, y: i32, z: i32) -> u8 {
        let below = if y > 0 { self.get(x, y - 1, z) } else { block::BEDROCK };
        if flowable(below) || block::water_level(below) > 0 {
            return 0;
        }
        let (mut best, mut mask, mut open) = (99, 0u8, 0u8);
        for h in 0..4 {
            let (nx, nz) = (x + HX[h], z + HZ[h]);
            if !self.passable(nx, y, nz) && !block::is_water(self.get(nx, y, nz)) {
                continue;
            }
            open |= 1 << h;
            let d = self.drop_distance(nx, y, nz, h ^ 1, 1);
            if d < best {
                best = d;
                mask = 1 << h;
            } else if d == best && d < 99 {
                mask |= 1 << h;
            }
        }
        if best == 99 { open } else { mask }
    }
}
