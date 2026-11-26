//! O mundo: pedaços de 16 x 64 x 16 e o gerador de terreno, traduzido linha por linha do World.java
//! (mesma semente e mesmo tamanho de bioma = mesmo mundo do jogo Java).

use crate::block::{self, *};
use crate::noise::{fbm, hash, hash3, noise, noise3, JavaRandom};
use std::collections::HashMap;

/// Altura dos pedaços na memória.
pub const SY: i32 = 128;
/// Altura e nível do mar do mundo clássico (o mesmo do jogo Java).
pub const CLASSIC_SY: i32 = 64;
pub const SEA: i32 = 24;
/// Quantos blocos os mundos novos ganham embaixo da terra: o terreno inteiro sobe isso.
pub const DEEP: i32 = 64;
pub const VOLUME: usize = 16 * 16 * SY as usize;
pub const CLASSIC_VOLUME: usize = 16 * 16 * CLASSIC_SY as usize;

pub const PLAINS: i32 = 0;
pub const FOREST: i32 = 1;
pub const BIRCH_FOREST: i32 = 2;
pub const DESERT: i32 = 3;
pub const TUNDRA: i32 = 4;
pub const MOUNTAINS: i32 = 5;
pub const ICE_FIELD: i32 = 6;
pub const BIOME_NAMES: [&str; 7] = ["Planície", "Floresta", "Bosque de bétulas", "Deserto", "Tundra", "Montanhas", "Campo de gelo"];

/// Índice de um bloco no pedaço (igual ao Chunk.idx do Java).
#[inline]
pub fn idx(lx: i32, y: i32, lz: i32) -> usize {
    ((lx << 11) | (lz << 7) | y) as usize
}

/// O contrário do idx: (lx, y, lz).
#[inline]
pub fn coords(i: usize) -> (i32, i32, i32) {
    ((i >> 11) as i32, (i & 127) as i32, ((i >> 7) & 15) as i32)
}

/// Índice no formato clássico (64 de altura) dos arquivos do Java, e a volta.
fn classic_index(lx: i32, y: i32, lz: i32) -> usize {
    ((lx << 10) | (lz << 6) | y) as usize
}
fn from_classic(i: usize) -> usize {
    idx((i >> 10) as i32, (i & 63) as i32, ((i >> 6) & 15) as i32)
}

#[derive(Clone)]
pub struct Chunk {
    pub cx: i32,
    pub cz: i32,
    pub blocks: Vec<u8>,
    /// y do bloco mais alto que tapa a luz em cada coluna (lx*16+lz), -1 se nenhum
    pub sky_top: [i8; 256],
    /// direção dos blocos que têm frente (fornalha, baú...): índice -> 0..3
    pub rot: HashMap<u16, u8>,
    /// luz de tochas e lava (0-15) de cada célula
    pub light: Vec<u8>,
    /// veio de um arquivo (e não do gerador): a água corrente salva precisa ser reavaliada
    pub from_store: bool,
}

impl Chunk {
    pub fn new(cx: i32, cz: i32) -> Self {
        Chunk { cx, cz, blocks: vec![AIR; VOLUME], sky_top: [-1; 256], rot: HashMap::new(), light: vec![0; VOLUME], from_store: false }
    }

    pub fn compute_sky(&mut self) {
        for lx in 0..16 {
            for lz in 0..16 {
                let mut y = SY - 1;
                while y >= 0 && !block::opaque_cube(self.blocks[idx(lx, y, lz)]) {
                    y -= 1;
                }
                self.sky_top[(lx * 16 + lz) as usize] = y as i8;
            }
        }
    }

    /// Luz das fontes (lava, tochas) espalhada só dentro deste pedaço (Chunk.lightInside do Java);
    /// a que passa para os vizinhos é tratada pelo mundo quando o pedaço entra.
    pub fn light_inside(&mut self) {
        self.light.iter_mut().for_each(|l| *l = 0);
        let mut queue: Vec<usize> = Vec::new();
        for i in 0..VOLUME {
            let l = block::light(self.blocks[i]);
            if l > 0 {
                self.light[i] = l;
                queue.push(i);
            }
        }
        let mut head = 0;
        while head < queue.len() {
            let i = queue[head];
            head += 1;
            let l = self.light[i] as i32 - 1;
            if l <= 0 {
                continue;
            }
            let (lx, y, lz) = coords(i);
            for (dx, dy, dz) in [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)] {
                let (nx, ny, nz) = (lx + dx, y + dy, lz + dz);
                if !(0..16).contains(&nx) || !(0..16).contains(&nz) || !(0..SY).contains(&ny) {
                    continue;
                }
                let j = idx(nx, ny, nz);
                if block::opaque_cube(self.blocks[j]) || self.light[j] as i32 >= l {
                    continue;
                }
                self.light[j] = l as u8;
                queue.push(j);
            }
        }
    }

    /// Pedaço pronto para entrar no mundo: teto de luz do céu e luz de tochas.
    pub fn prepare(&mut self) {
        self.compute_sky();
        self.light_inside();
    }

    pub fn recompute_sky_column(&mut self, lx: i32, lz: i32) {
        let mut y = SY - 1;
        while y >= 0 && !block::opaque_cube(self.blocks[idx(lx, y, lz)]) {
            y -= 1;
        }
        self.sky_top[(lx * 16 + lz) as usize] = y as i8;
    }

    /// Grava o pedaço (gzip: versão, direções, blocos). Se nada passa de 64 de altura, sai no formato do
    /// Chunk.toBytes do Java (versão 1); os mundos fundos usam a versão 2, com os 128 de altura.
    pub fn to_bytes(&self) -> Vec<u8> {
        use std::io::Write;
        let classic = self.blocks.chunks(SY as usize).all(|col| col[CLASSIC_SY as usize..].iter().all(|&b| b == AIR));
        let mut raw = Vec::with_capacity(VOLUME + 16);
        raw.push(if classic { 1u8 } else { 2u8 });
        let rots: Vec<(usize, u8)> = self.rot.iter().filter(|(i, r)| **r != 0 && (!classic || coords(**i as usize).1 < CLASSIC_SY)).map(|(i, r)| (*i as usize, *r)).collect();
        raw.extend_from_slice(&(rots.len() as i32).to_be_bytes());
        for (i, r) in rots {
            let i = if classic {
                let (lx, y, lz) = coords(i);
                classic_index(lx, y, lz)
            } else {
                i
            };
            raw.extend_from_slice(&(i as u16).to_be_bytes());
            raw.push(r);
        }
        if classic {
            for col in self.blocks.chunks(SY as usize) {
                raw.extend_from_slice(&col[..CLASSIC_SY as usize]);
            }
        } else {
            raw.extend_from_slice(&self.blocks);
        }
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        enc.write_all(&raw).unwrap();
        enc.finish().unwrap()
    }

    /// Lê um pedaço salvo (worlds/<mundo>/chunks/cx_cz.dat), do Java (versão 1) ou de um mundo fundo (versão 2).
    pub fn from_bytes(cx: i32, cz: i32, data: &[u8]) -> Option<Chunk> {
        use std::io::Read;
        let mut raw = Vec::new();
        flate2::read::GzDecoder::new(data).read_to_end(&mut raw).ok()?;
        let classic = match raw.first() {
            Some(1) => true,
            Some(2) => false,
            _ => return None,
        };
        let volume = if classic { CLASSIC_VOLUME } else { VOLUME };
        let n = i32::from_be_bytes(raw.get(1..5)?.try_into().ok()?);
        if n < 0 || n as usize > volume {
            return None;
        }
        let mut p = 5;
        let mut c = Chunk::new(cx, cz);
        for _ in 0..n {
            let i = u16::from_be_bytes(raw.get(p..p + 2)?.try_into().ok()?) as usize;
            let r = *raw.get(p + 2)?;
            p += 3;
            if i < volume && r != 0 {
                c.rot.insert(if classic { from_classic(i) } else { i } as u16, r);
            }
        }
        let blocks = raw.get(p..p + volume)?;
        if classic {
            for (col, old) in c.blocks.chunks_mut(SY as usize).zip(blocks.chunks(CLASSIC_SY as usize)) {
                col[..CLASSIC_SY as usize].copy_from_slice(old);
            }
        } else {
            c.blocks.copy_from_slice(blocks);
        }
        c.from_store = true;
        Some(c)
    }
}

/// Gerador: só depende da semente e do tamanho dos biomas, então pode rodar em qualquer thread.
#[derive(Clone)]
pub struct Generator {
    pub seed: i32,
    pub biome_scale: f64,
    /// blocos a mais embaixo da terra: 0 nos mundos clássicos (iguais aos do Java), DEEP nos novos
    pub lift: i32,
}

impl Generator {
    /// Nível do mar deste mundo.
    pub fn sea(&self) -> i32 {
        SEA + self.lift
    }

    /// Até onde se pode construir (y abaixo disto).
    pub fn build_top(&self) -> i32 {
        CLASSIC_SY + self.lift
    }

    pub fn height_at(&self, x: i32, z: i32) -> i32 {
        let base = fbm(x as f64 / 96.0, z as f64 / 96.0, 5, self.seed);
        let mountains = fbm(x as f64 / 220.0, z as f64 / 220.0, 3, self.seed.wrapping_add(101));
        let h = (SEA + 3) as f64 + (base - 0.5) * 34.0 + (mountains - 0.52).max(0.0) * 70.0;
        let hi = h as i32;
        self.lift + if hi < 2 { 2 } else { hi.min(CLASSIC_SY - 10) }
    }

    pub fn temperature(&self, x: i32, z: i32) -> f64 {
        let s = 260.0 * self.biome_scale;
        fbm(x as f64 / s, z as f64 / s, 3, self.seed.wrapping_add(11))
    }

    pub fn biome_at(&self, x: i32, z: i32, top: i32) -> i32 {
        if top >= 46 + self.lift {
            return MOUNTAINS;
        }
        let t = self.temperature(x, z);
        let s = 210.0 * self.biome_scale;
        let m = fbm(x as f64 / s, z as f64 / s, 3, self.seed.wrapping_add(12));
        if t > 0.58 && m < 0.5 {
            return DESERT;
        }
        if t < 0.43 {
            return if top < self.sea() - 3 { ICE_FIELD } else { TUNDRA };
        }
        if m > 0.56 {
            return if t > 0.5 { BIRCH_FOREST } else { FOREST };
        }
        PLAINS
    }

    fn sd(&self, k: i32) -> i32 {
        self.seed.wrapping_add(k)
    }

    /// Gera o terreno, as cavernas, a decoração e o iglu de um pedaço.
    /// Ponto de nascimento (World.findSpawn do Java): terra firme mais perto da origem, {x, y, z} dos pés.
    pub fn find_spawn(&self) -> [f64; 3] {
        let mut cache: HashMap<(i32, i32), Chunk> = HashMap::new();
        for r in 0..600i32 {
            for dx in -r..=r {
                for dz in -r..=r {
                    if dx.abs() != r && dz.abs() != r {
                        continue;
                    }
                    if self.height_at(dx, dz) < self.sea() + 2 {
                        continue; // água ou praia baixa: nem vale gerar
                    }
                    let c = cache.entry((dx >> 4, dz >> 4)).or_insert_with(|| self.generate(dx >> 4, dz >> 4));
                    let (lx, lz) = (dx & 15, dz & 15);
                    let mut top = -1;
                    for y in (0..SY).rev() {
                        let b = c.blocks[idx(lx, y, lz)];
                        if b == AIR || block::shape(b) == CROSS {
                            continue;
                        }
                        if (b == GRASS || b == SNOW || b == SAND) && y >= self.sea() {
                            top = y;
                        }
                        break;
                    }
                    if top >= 0 {
                        let above = if top + 1 < SY { c.blocks[idx(lx, top + 1, lz)] } else { AIR };
                        if above == AIR || block::shape(above) == CROSS {
                            return [dx as f64 + 0.5, top as f64 + 1.01, dz as f64 + 0.5];
                        }
                    }
                }
            }
        }
        [0.5, (self.build_top() - 1) as f64, 0.5]
    }

    pub fn generate(&self, cx: i32, cz: i32) -> Chunk {
        let mut c = Chunk::new(cx, cz);
        let (x0, z0) = (cx * 16, cz * 16);
        let mut heights = [0i32; 256];
        let mut biomes = [0i32; 256];
        for lx in 0..16 {
            for lz in 0..16 {
                let base = idx(lx, 0, lz);
                let (h, b) = self.column(x0 + lx, z0 + lz, &mut c.blocks[base..base + SY as usize]);
                heights[(lx * 16 + lz) as usize] = h;
                biomes[(lx * 16 + lz) as usize] = b;
            }
        }
        self.decorate(&mut c, &heights, &biomes);
        if let Some(s) = self.igloo_site(cx, cz) {
            self.build_igloo(&mut c, s);
        }
        c.prepare();
        c
    }

    /// Coluna (x, z): pedra, minérios, solo, água, gelo e cavernas. Devolve (altura, bioma).
    fn column(&self, x: i32, z: i32, out: &mut [u8]) -> (i32, i32) {
        let h = self.height_at(x, z);
        let top = h - 1;
        let biome = self.biome_at(x, z, top);
        let sea = self.sea();
        let mut beach = top <= sea + 1;
        if beach && top >= sea - 1 && (biome == TUNDRA || biome == ICE_FIELD) {
            beach = false;
        }
        let gravel_floor = top < sea - 1 && noise(x as f64 / 9.0, z as f64 / 9.0, self.sd(70)) > 0.62;
        for v in out.iter_mut() {
            *v = AIR;
        }
        for y in 0..=top {
            let depth = top - y;
            let b = if y == 0 || (y == 1 && hash(x, z, self.sd(3)) < 0.5) {
                BEDROCK
            } else if depth == 0 {
                if gravel_floor {
                    GRAVEL
                } else if beach || biome == DESERT || (biome == ICE_FIELD && top < sea - 1) {
                    SAND
                } else if biome == TUNDRA {
                    SNOW
                } else if biome == MOUNTAINS {
                    if top >= 49 + self.lift + (hash(x, z, self.sd(5)) * 3.0) as i32 { SNOW } else { STONE }
                } else {
                    GRASS
                }
            } else if depth < 4 {
                if gravel_floor && depth < 2 {
                    GRAVEL
                } else if beach || (biome == ICE_FIELD && top < sea - 1 && depth < 2) {
                    SAND
                } else if biome == DESERT {
                    if depth < 3 { SAND } else { SANDSTONE }
                } else if biome == MOUNTAINS {
                    STONE
                } else {
                    DIRT
                }
            } else {
                self.ore(x, y, z)
            };
            out[y as usize] = b;
        }
        for y in h..sea {
            out[y as usize] = if (biome == TUNDRA || biome == ICE_FIELD) && y == sea - 1 { ICE } else { WATER };
        }
        if biome == ICE_FIELD && self.channel(x, z) < 0.035 {
            if noise(x as f64 / 5.0, z as f64 / 5.0, self.sd(155)) * 0.75 + hash(x, z, self.sd(156)) * 0.25 <= 0.66 {
                out[(sea - 1) as usize] = WATER;
            }
        }
        if (biome == ICE_FIELD || biome == TUNDRA) && top < sea - 1 {
            self.ice_field(x, z, top, out);
        }
        // cavernas
        let can_open = top >= sea + 3;
        let deep = self.lift > 0;
        let lava_level = if deep { 10 } else { 5 };
        for y in 2..=top {
            let depth = top - y;
            if depth < 5 && !can_open {
                continue;
            }
            let b = out[y as usize];
            if b == BEDROCK || block::is_water(b) {
                continue;
            }
            let (fx, fy, fz) = (x as f64, y as f64, z as f64);
            let a = noise3(fx / 22.0, fy / 12.0, fz / 22.0, self.sd(20)) - 0.5;
            let cc = noise3(fx / 22.0, fy / 12.0, fz / 22.0, self.sd(21)) - 0.5;
            let mut open = a * a + cc * cc < 0.0028;
            open = open || (y < 28 + self.lift && noise3(fx / 34.0, fy / 16.0, fz / 34.0, self.sd(22)) > 0.8);
            if !open && deep && y < sea - 20 {
                // lá embaixo: salões grandes e uma segunda rede de túneis, que descem até a lava
                open = noise3(fx / 52.0, fy / 24.0, fz / 52.0, self.sd(23)) > 0.785;
                if !open {
                    let d = noise3(fx / 30.0, fy / 18.0, fz / 30.0, self.sd(24)) - 0.5;
                    let e = noise3(fx / 30.0, fy / 18.0, fz / 30.0, self.sd(25)) - 0.5;
                    open = d * d + e * e < 0.0022;
                }
            }
            if open {
                out[y as usize] = if y <= lava_level { LAVA } else { AIR };
            }
        }
        (h, biome)
    }

    fn ore(&self, x: i32, y: i32, z: i32) -> u8 {
        let cluster = hash3(x >> 1, y >> 1, z >> 1, self.sd(30));
        if hash3(x, y, z, self.sd(31)) < 0.6 {
            // como no Java: a chance só soma quando a altura passa no teste (o && para antes)
            let mut p = 0.0;
            // até que altura cada minério aparece: nos mundos fundos, espalhados pela profundidade nova
            let heights = if self.lift > 0 { [24, 48, 96, 124] } else { [14, 24, 42, 56] };
            for (max_y, chance, ore) in [(heights[0], 0.0018, CRYSTAL_ORE), (heights[1], 0.0035, GOLD_ORE), (heights[2], 0.010, IRON_ORE), (heights[3], 0.016, COAL_ORE)] {
                if y <= max_y {
                    p += chance;
                    if cluster < p {
                        return ore;
                    }
                }
            }
            if cluster > 0.994 {
                return GRAVEL;
            }
        }
        STONE
    }

    // ------------------------------------------------------------------ campo de gelo

    fn channel(&self, x: i32, z: i32) -> f64 {
        let (fx, fz) = (x as f64, z as f64);
        let a = (fbm(fx / 46.0, fz / 46.0, 2, self.sd(160)) - 0.5).abs();
        let b = (fbm(fx / 23.0 + 50.0, fz / 23.0, 2, self.sd(161)) - 0.5).abs() * 1.6;
        a.min(b) - 0.012 * noise(fx / 5.0, fz / 5.0, self.sd(162))
    }

    fn ice_field(&self, x: i32, z: i32, top: i32, out: &mut [u8]) {
        let (fx, fz) = (x as f64, z as f64);
        let sea = self.sea();
        let t = self.temperature(x, z);
        let cold = ((0.43 - t) / 0.02).clamp(0.0, 1.0);
        let mut deep = ((sea - 1 - top) as f64 / 8.0).clamp(0.0, 1.0);
        deep = deep * deep * (3.0 - 2.0 * deep);
        let rise = (2.5 + fbm(fx / 30.0, fz / 30.0, 3, self.sd(163)) * 4.5) * cold * deep;
        let r = rise + (noise(fx / 4.0, fz / 4.0, self.sd(164)) - 0.5) * 0.6 * cold * deep;
        let top_y = sea - 1 + (r + 0.5).floor() as i32; // Math.round do Java
        if top_y <= sea - 1 {
            return;
        }
        let c = self.channel(x, z);
        const W: f64 = 0.035;
        let carve = rise >= 2.5;
        if carve && c < W {
            return;
        }
        let undercut = carve && top_y >= sea + 2 && c < W + 0.012;
        let streak = noise(fx / 2.5, fz / 2.5, self.sd(165)) > 0.68;
        for y in (top + 1).max(sea - 3)..=top_y {
            if undercut && y == sea {
                continue;
            }
            let b = if y == top_y {
                SNOW
            } else if y == top_y - 1 && hash(x, z, self.sd(166)) < 0.6 {
                SNOW
            } else if y <= sea || streak {
                BLUE_ICE
            } else {
                PACKED_ICE
            };
            out[y as usize] = b;
        }
        if undercut && out[(sea + 1) as usize] != AIR && hash3(x, sea, z, self.sd(167)) < 0.55 {
            out[sea as usize] = ICICLE;
        }
    }

    // ------------------------------------------------------------------ iglu

    pub fn igloo_site(&self, cx: i32, cz: i32) -> Option<[i32; 3]> {
        if hash(cx, cz, self.sd(90)) >= 0.02 {
            return None;
        }
        let x = cx * 16 + 5 + (hash(cx, cz, self.sd(91)) * 6.0) as i32;
        let z = cz * 16 + 5 + (hash(cx, cz, self.sd(92)) * 4.0) as i32;
        let (mut lo, mut hi) = (i32::MAX, i32::MIN);
        for dx in -4..=4 {
            for dz in -4..=6 {
                let h = self.height_at(x + dx, z + dz);
                if h - 1 <= self.sea() + 1 || h + 6 >= self.build_top() {
                    return None;
                }
                if self.biome_at(x + dx, z + dz, h - 1) != TUNDRA {
                    return None;
                }
                lo = lo.min(h);
                hi = hi.max(h);
            }
        }
        if hi - lo > 2 {
            return None;
        }
        Some([x, hi, z])
    }

    /// O baú do iglu fica nesta posição? (é enchido na primeira vez que alguém o abre)
    pub fn igloo_chest(&self, x: i32, y: i32, z: i32) -> bool {
        self.igloo_site(x >> 4, z >> 4).map_or(false, |s| x == s[0] && y == s[1] && z == s[2] - 3)
    }

    fn near_igloo(&self, x: i32, z: i32) -> bool {
        for cx in (x - 7) >> 4..=(x + 7) >> 4 {
            for cz in (z - 10) >> 4..=(z + 7) >> 4 {
                if let Some(s) = self.igloo_site(cx, cz) {
                    if (x - s[0]).abs() <= 7 && z >= s[2] - 7 && z <= s[2] + 10 {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn dome_dist(dx: i32, dy: i32, dz: i32) -> f64 {
        let (dx, dy, dz) = (dx as f64, dy as f64, dz as f64);
        (dx * dx + dy * 1.2 * dy * 1.2 + dz * dz).sqrt()
    }

    fn build_igloo(&self, c: &mut Chunk, s: [i32; 3]) {
        let (ox, fy, oz) = (s[0] - c.cx * 16, s[1], s[2] - c.cz * 16);
        for dx in -4i32..=4 {
            for dz in -4..=6 {
                let tunnel = dz >= 3 && dx.abs() <= 1;
                if !tunnel && Self::dome_dist(dx, 0, dz) >= 4.6 {
                    continue;
                }
                let (lx, lz) = (ox + dx, oz + dz);
                for y in fy..(fy + 9).min(SY) {
                    c.blocks[idx(lx, y, lz)] = AIR;
                }
                let mut y = fy - 1;
                while y >= 1.max(fy - 5) {
                    let i = idx(lx, y, lz);
                    let b = c.blocks[i];
                    if b == AIR || block::is_water(b) || block::is_leaves(b) || block::shape(b) == CROSS {
                        c.blocks[i] = SNOW;
                    } else {
                        break;
                    }
                    y -= 1;
                }
            }
        }
        for dx in -4..=4 {
            for dz in -4..=4 {
                for dy in 0..=4 {
                    let d = Self::dome_dist(dx, dy, dz);
                    let i = idx(ox + dx, fy + dy, oz + dz);
                    if d < 3.3 {
                        c.blocks[i] = AIR;
                    } else if d < 4.4 {
                        c.blocks[i] = SNOW;
                    }
                    if dy == 0 && d < 3.3 {
                        c.blocks[idx(ox + dx, fy - 1, oz + dz)] = WOOL;
                    }
                }
            }
        }
        for dz in 3..=6 {
            for dy in 0..=1 {
                c.blocks[idx(ox, fy + dy, oz + dz)] = AIR;
                if dz >= 5 {
                    c.blocks[idx(ox - 1, fy + dy, oz + dz)] = SNOW;
                    c.blocks[idx(ox + 1, fy + dy, oz + dz)] = SNOW;
                }
            }
            if dz >= 5 {
                for dx in -1..=1 {
                    c.blocks[idx(ox + dx, fy + 2, oz + dz)] = SNOW;
                }
            }
        }
        c.blocks[idx(ox - 4, fy + 1, oz)] = ICE;
        c.blocks[idx(ox + 4, fy + 1, oz)] = ICE;
        let mut put = |lx: i32, y: i32, lz: i32, b: u8, rot: u8| {
            let i = idx(lx, y, lz);
            c.blocks[i] = b;
            if rot != 0 {
                c.rot.insert(i as u16, rot);
            } else {
                c.rot.remove(&(i as u16));
            }
        };
        put(ox, fy, oz - 3, CHEST, 0);
        put(ox + 2, fy, oz - 2, FURNACE, 1);
        put(ox - 2, fy, oz - 2, TABLE, 3);
        put(ox - 2, fy, oz, BED, 0);
        put(ox + 2, fy, oz + 1, TORCH, 0);
    }

    // ------------------------------------------------------------------ árvores e plantas

    fn column_random(&self, x: i32, z: i32) -> JavaRandom {
        let h = (x as i64).wrapping_mul(0x9E3779B97F4A7C15u64 as i64)
            ^ (z as i64).wrapping_mul(0xC2B2AE3D27D4EB4Fu64 as i64)
            ^ ((self.seed as i64) << 21)
            ^ 0x5DEECE66D;
        JavaRandom::new(h)
    }

    fn tree_chance(biome: i32) -> f64 {
        match biome {
            FOREST => 0.05,
            BIRCH_FOREST => 0.045,
            TUNDRA => 0.006,
            MOUNTAINS => 0.003,
            _ => 0.004,
        }
    }

    fn decorate(&self, c: &mut Chunk, heights: &[i32; 256], biomes: &[i32; 256]) {
        let (x0, z0) = (c.cx * 16, c.cz * 16);
        let terrain = c.blocks.clone();
        let mut tmp = vec![AIR; SY as usize];
        for x in x0 - 2..x0 + 18 {
            for z in z0 - 2..z0 + 18 {
                let inside = x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
                let mut r = self.column_random(x, z);
                let roll = r.next_double();
                let (h, biome);
                let col: &[u8];
                if inside {
                    let i = ((x - x0) * 16 + (z - z0)) as usize;
                    h = heights[i];
                    biome = biomes[i];
                    let base = idx(x - x0, 0, z - z0);
                    col = &terrain[base..base + SY as usize];
                } else {
                    h = self.height_at(x, z);
                    biome = self.biome_at(x, z, h - 1);
                    if roll >= Self::tree_chance(biome) {
                        continue;
                    }
                    self.column(x, z, &mut tmp);
                    col = &tmp;
                }
                let top = h - 1;
                if top + 6 >= self.build_top() || col[(top + 1) as usize] != AIR {
                    continue;
                }
                let b = col[top as usize];
                if b == GRASS || (b == SNOW && biome == TUNDRA) {
                    if roll < Self::tree_chance(biome) {
                        if self.near_igloo(x, z) {
                            continue;
                        }
                        let birch = biome == BIRCH_FOREST || (biome == FOREST && r.next_double() < 0.2);
                        Self::place_tree(c, x, top + 1, z, &mut r, birch);
                    } else if inside && b == GRASS {
                        let grass_p = if biome == PLAINS { 0.16 } else { 0.08 };
                        let flower_p = if biome == PLAINS { 0.025 } else { 0.01 };
                        let k = r.next_double();
                        let pi = idx(x - x0, top + 1, z - z0);
                        if k < flower_p {
                            c.blocks[pi] = if r.next_bool() { FLOWER_YELLOW } else { FLOWER_RED };
                        } else if k < flower_p + grass_p {
                            c.blocks[pi] = TALL_GRASS;
                        }
                    }
                } else if inside && b == SAND && biome == DESERT && roll < 0.006 {
                    let hgt = 1 + r.next_int(3);
                    for i in 1..=hgt {
                        c.blocks[idx(x - x0, top + i, z - z0)] = CACTUS;
                    }
                }
            }
        }
    }

    fn place_tree(c: &mut Chunk, x: i32, y: i32, z: i32, r: &mut JavaRandom, birch: bool) {
        let (log, leaf) = if birch { (BIRCH_LOG, BIRCH_LEAVES) } else { (LOG, LEAVES) };
        let (x0, z0) = (c.cx * 16, c.cz * 16);
        let h = if birch { 5 } else { 4 } + r.next_int(3);
        let top = y + h;
        for dy in -2..=1 {
            let rad: i32 = if dy < 0 { 2 } else { 1 };
            for dx in -rad..=rad {
                for dz in -rad..=rad {
                    let (dx, dz): (i32, i32) = (dx, dz);
                    let corner = dx.abs() == rad && dz.abs() == rad;
                    if corner && (dy == 1 || r.next_int(2) == 0) {
                        continue;
                    }
                    let (px, py, pz) = (x + dx - x0, top + dy, z + dz - z0);
                    if px < 0 || px > 15 || pz < 0 || pz > 15 || py < 0 || py >= SY {
                        continue;
                    }
                    let i = idx(px, py, pz);
                    if c.blocks[i] == AIR {
                        c.blocks[i] = leaf;
                    }
                }
            }
        }
        let (tx, tz) = (x - x0, z - z0);
        if !(0..=15).contains(&tx) || !(0..=15).contains(&tz) {
            return;
        }
        let mut i = 0;
        while i < h && y + i < SY {
            c.blocks[idx(tx, y + i, tz)] = log;
            i += 1;
        }
        if y - 1 >= 0 && c.blocks[idx(tx, y - 1, tz)] == GRASS {
            c.blocks[idx(tx, y - 1, tz)] = DIRT;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mundo_fundo_tem_cavernas_ate_la_embaixo() {
        let flat = Generator { seed: 12345, biome_scale: 2.0, lift: 0 };
        let deep = Generator { seed: 12345, biome_scale: 2.0, lift: DEEP };
        assert_eq!(deep.height_at(37, -80), flat.height_at(37, -80) + DEEP);
        let mut air = [0usize; 8]; // por faixa de 10 blocos de altura
        let (mut lava_top, mut crystal_top, mut iron_top, mut cells) = (0, 0, 0, 0usize);
        for cx in -8..8 {
            for cz in -8..8 {
                let c = deep.generate(cx, cz);
                for (i, &b) in c.blocks.iter().enumerate() {
                    let y = coords(i).1;
                    if (2..82).contains(&y) {
                        if b == AIR {
                            air[(y as usize - 2) / 10] += 1;
                        }
                        cells += 1;
                    }
                    match b {
                        LAVA => lava_top = lava_top.max(y),
                        CRYSTAL_ORE => crystal_top = crystal_top.max(y),
                        IRON_ORE => iron_top = iron_top.max(y),
                        _ => {}
                    }
                }
            }
        }
        let share: Vec<f64> = air.iter().map(|&a| a as f64 / (cells as f64 / 8.0) * 100.0).collect();
        println!("% de ar por faixa de 10 blocos, de baixo para cima: {share:.1?}");
        assert!(share[1..6].iter().all(|&s| s > 3.0 && s < 35.0), "{share:?}");
        assert!(lava_top <= 10 && crystal_top <= 24 && iron_top > 80 && iron_top <= 96, "{lava_top} {crystal_top} {iron_top}");
    }

    #[test]
    fn pedaco_grava_no_formato_do_java_quando_cabe() {
        for (lift, version) in [(0, 1u8), (DEEP, 2u8)] {
            let g = Generator { seed: 7, biome_scale: 2.0, lift };
            let mut c = g.generate(3, -2);
            c.rot.insert(idx(15, 40, 9) as u16, 2);
            let bytes = c.to_bytes();
            let mut raw = Vec::new();
            std::io::Read::read_to_end(&mut flate2::read::GzDecoder::new(&bytes[..]), &mut raw).unwrap();
            assert_eq!(raw[0], version);
            if version == 1 {
                assert_eq!(raw.len(), 5 + 3 + CLASSIC_VOLUME);
                // posição no arquivo igual à do Chunk.idx do Java
                assert_eq!(u16::from_be_bytes([raw[5], raw[6]]), (15 << 10 | 9 << 6 | 40) as u16);
            }
            let back = Chunk::from_bytes(3, -2, &bytes).unwrap();
            assert!(back.blocks == c.blocks && back.rot == c.rot);
        }
    }
}
