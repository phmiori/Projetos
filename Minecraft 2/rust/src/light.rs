//! Luz de tochas e lava entre pedaços (World.spillLight e World.relight do Java): cada pedaço calcula a
//! sua luz sozinho; quando ele entra no mundo a luz passa pelas bordas, e quando um bloco que brilha ou que
//! tapa a luz muda, a região em volta (raio 15) é refeita.

use crate::block;
use crate::world::{idx, Chunk, SY};
use crate::Game;
use std::sync::Arc;

const D6: [(i32, i32, i32); 6] = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)];

impl Game {
    pub fn block_light(&self, x: i32, y: i32, z: i32) -> u8 {
        if !(0..SY).contains(&y) {
            return 0;
        }
        self.chunks.get(&(x >> 4, z >> 4)).map_or(0, |c| c.light[idx(x & 15, y, z & 15)])
    }

    fn chunk_mut(&mut self, cx: i32, cz: i32) -> Option<&mut Chunk> {
        self.chunks.get_mut(&(cx, cz)).map(Arc::make_mut)
    }

    /// Espalha a luz a partir da fila (busca em largura, perde 1 por bloco), só dentro da caixa.
    fn light_bfs(&mut self, mut queue: Vec<(i32, i32, i32)>, lo: [i32; 3], hi: [i32; 3]) {
        let mut head = 0;
        while head < queue.len() {
            let (x, y, z) = queue[head];
            head += 1;
            let l = self.block_light(x, y, z) as i32 - 1;
            if l <= 0 {
                continue;
            }
            for (dx, dy, dz) in D6 {
                let (nx, ny, nz) = (x + dx, y + dy, z + dz);
                if nx < lo[0] || nx > hi[0] || ny < lo[1] || ny > hi[1] || nz < lo[2] || nz > hi[2] {
                    continue;
                }
                let k = (nx >> 4, nz >> 4);
                let Some(c) = self.chunks.get(&k) else { continue };
                let j = idx(nx & 15, ny, nz & 15);
                if block::opaque_cube(c.blocks[j]) || c.light[j] as i32 >= l {
                    continue;
                }
                if let Some(c) = self.chunk_mut(k.0, k.1) {
                    c.light[j] = l as u8;
                }
                self.dirty.insert(k);
                queue.push((nx, ny, nz));
            }
        }
    }

    /// Um pedaço acabou de entrar: a luz da borda dele passa para os vizinhos, e a deles para ele.
    pub fn spill_light(&mut self, cx: i32, cz: i32) {
        let mut queue = Vec::new();
        let Some(c) = self.chunks.get(&(cx, cz)) else { return };
        let c = c.clone();
        let (x0, z0) = (cx * 16, cz * 16);
        for d in 0..4 {
            let (ncx, ncz) = (cx + [1, -1, 0, 0][d], cz + [0, 0, 1, -1][d]);
            let Some(n) = self.chunks.get(&(ncx, ncz)) else { continue };
            for t in 0..16 {
                for y in 0..SY {
                    let (lx, lz) = (if d == 0 { 15 } else if d == 1 { 0 } else { t }, if d == 2 { 15 } else if d == 3 { 0 } else { t });
                    let (nlx, nlz) = (if d == 0 { 0 } else if d == 1 { 15 } else { t }, if d == 2 { 0 } else if d == 3 { 15 } else { t });
                    if c.light[idx(lx, y, lz)] > 1 {
                        queue.push((x0 + lx, y, z0 + lz));
                    }
                    if n.light[idx(nlx, y, nlz)] > 1 {
                        queue.push((ncx * 16 + nlx, y, ncz * 16 + nlz));
                    }
                }
            }
        }
        if !queue.is_empty() {
            self.light_bfs(queue, [x0 - 16, 0, z0 - 16], [x0 + 31, SY - 1, z0 + 31]);
        }
    }

    /// Refaz a luz de blocos numa caixa de raio 15 em volta de (x, y, z).
    pub fn relight(&mut self, x: i32, y: i32, z: i32) {
        let r = 15;
        let (x0, x1, z0, z1) = (x - r, x + r, z - r, z + r);
        let (y0, y1) = ((y - r).max(0), (y + r).min(SY - 1));
        let mut queue = Vec::new();
        // apaga a luz da caixa e anota as fontes que estão nela
        for pcx in x0 >> 4..=x1 >> 4 {
            for pcz in z0 >> 4..=z1 >> 4 {
                let Some(c) = self.chunk_mut(pcx, pcz) else { continue };
                let lx0 = x0.max(pcx * 16) - pcx * 16;
                let lx1 = x1.min(pcx * 16 + 15) - pcx * 16;
                let lz0 = z0.max(pcz * 16) - pcz * 16;
                let lz1 = z1.min(pcz * 16 + 15) - pcz * 16;
                for lx in lx0..=lx1 {
                    for lz in lz0..=lz1 {
                        for yy in y0..=y1 {
                            let i = idx(lx, yy, lz);
                            let l = block::light(c.blocks[i]);
                            c.light[i] = l;
                            if l > 0 {
                                queue.push((pcx * 16 + lx, yy, pcz * 16 + lz));
                            }
                        }
                    }
                }
                self.dirty.insert((pcx, pcz));
            }
        }
        // luz que entra pelas bordas da caixa, vinda de fora
        for xx in x0 - 1..=x1 + 1 {
            let x_edge = xx < x0 || xx > x1;
            for zz in z0 - 1..=z1 + 1 {
                let z_edge = zz < z0 || zz > z1;
                if x_edge || z_edge {
                    for yy in y0 - 1..=y1 + 1 {
                        if self.block_light(xx, yy, zz) > 1 {
                            queue.push((xx, yy, zz));
                        }
                    }
                } else {
                    if y0 - 1 >= 0 && self.block_light(xx, y0 - 1, zz) > 1 {
                        queue.push((xx, y0 - 1, zz));
                    }
                    if y1 + 1 < SY && self.block_light(xx, y1 + 1, zz) > 1 {
                        queue.push((xx, y1 + 1, zz));
                    }
                }
            }
        }
        self.light_bfs(queue, [x0, y0, z0], [x1, y1, z1]);
    }

    /// Há luz de bloco em volta (3 x 3 x 3)?
    pub fn near_light(&self, x: i32, y: i32, z: i32) -> bool {
        (-1..=1).any(|dx| (-1..=1).any(|dy| (-1..=1).any(|dz| self.block_light(x + dx, y + dy, z + dz) > 0)))
    }
}
