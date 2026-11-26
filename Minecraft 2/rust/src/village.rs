//! Vilas: o desenho (casas, ferraria, biblioteca, plantações, ruas, sino), os moradores que aparecem nelas e as
//! trocas por esmeralda. Tudo sai da semente, então cada pedaço desenha a sua parte sem depender dos vizinhos.

use crate::block::{self, *};
use crate::inventory::{Stack, SIZE};
use crate::mob;
use crate::noise::hash;
use crate::ui::{rgba, Ui};
use crate::world::{idx, Chunk, Generator, CHERRY, DESERT, PLAINS, SY, TUNDRA};
use crate::{items, Game, Screen};

/// Tamanho (em pedaços) da região que pode ter uma vila.
const REGION: i32 = 14;
/// Até onde a vila chega a partir do centro.
const REACH: i32 = 30;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    House,
    Smithy,
    Library,
    Farm,
}

#[derive(Clone, Copy, Debug)]
pub struct Building {
    pub kind: Kind,
    /// centro do terreno e altura dos pés
    pub x: i32,
    pub z: i32,
    pub y: i32,
    /// para que lado fica a porta (0 +Z, 1 -X, 2 -Z, 3 +X): o lado da rua
    pub front: usize,
}

#[derive(Clone, Debug)]
pub struct Village {
    pub region: (i32, i32),
    pub x: i32,
    #[allow(dead_code)]
    pub y: i32,
    pub z: i32,
    pub biome: i32,
    pub buildings: Vec<Building>,
}

impl Generator {
    /// A vila desta região, se houver uma (só nos mundos novos).
    pub fn village(&self, rx: i32, rz: i32) -> Option<Village> {
        if !self.modern || hash(rx, rz, self.seed.wrapping_add(300)) > 0.42 {
            return None;
        }
        // tenta alguns lugares da região até achar um terreno razoavelmente plano
        for attempt in 0..6 {
            let at = |k: i32| 40 + (hash(rx + attempt * 31, rz, self.seed.wrapping_add(k)) * (REGION * 16 - 80) as f64) as i32;
            let (x, z) = (rx * REGION * 16 + at(301), rz * REGION * 16 + at(302));
            let y = self.height_at(x, z);
            if y <= self.sea() + 1 {
                continue;
            }
            let biome = self.biome_at(x, z, y - 1);
            if ![PLAINS, DESERT, TUNDRA, CHERRY].contains(&biome) {
                continue;
            }
            let (mut lo, mut hi) = (y, y);
            for dx in [-22, -11, 0, 11, 22] {
                for dz in [-22, -11, 0, 11, 22] {
                    let h = self.height_at(x + dx, z + dz);
                    (lo, hi) = (lo.min(h), hi.max(h));
                }
            }
            if lo <= self.sea() || hi - lo > 8 || hi + 10 >= self.build_top() {
                continue;
            }
            // doze lotes: oito ao longo da rua leste-oeste e quatro na norte-sul
            let mut lots: Vec<(i32, i32, usize)> = Vec::new();
            for sx in [-19, -9, 9, 19] {
                lots.push((sx, -8, 0));
                lots.push((sx, 8, 2));
            }
            for sz in [-19, 19] {
                lots.push((-8, sz, 3));
                lots.push((8, sz, 1));
            }
            let mut buildings = Vec::new();
            for (i, (dx, dz, front)) in lots.into_iter().enumerate() {
                let roll = hash(rx * 17 + i as i32, rz * 13, self.seed.wrapping_add(303));
                let kind = match i {
                    0 => Kind::Smithy,
                    3 => Kind::Library,
                    1 | 6 => Kind::Farm,
                    _ if roll < 0.12 => continue,
                    _ if roll < 0.3 => Kind::Farm,
                    _ => Kind::House,
                };
                let (bx, bz) = (x + dx, z + dz);
                let by = self.height_at(bx, bz);
                if by <= self.sea() || (by - y).abs() > 5 {
                    continue;
                }
                buildings.push(Building { kind, x: bx, z: bz, y: by, front });
            }
            return Some(Village { region: (rx, rz), x, y, z, biome, buildings });
        }
        None
    }

    /// As vilas que podem alcançar o quadrado de blocos dado.
    pub fn villages_near(&self, x0: i32, z0: i32, x1: i32, z1: i32) -> Vec<Village> {
        let r = REGION * 16;
        let mut out = Vec::new();
        for rx in (x0 - REACH).div_euclid(r)..=(x1 + REACH).div_euclid(r) {
            for rz in (z0 - REACH).div_euclid(r)..=(z1 + REACH).div_euclid(r) {
                if let Some(v) = self.village(rx, rz) {
                    if v.x + REACH >= x0 && v.x - REACH <= x1 && v.z + REACH >= z0 && v.z - REACH <= z1 {
                        out.push(v);
                    }
                }
            }
        }
        out
    }

    /// Desenha no pedaço a parte das vilas que cai nele.
    pub fn build_villages(&self, c: &mut Chunk) {
        let (x0, z0) = (c.cx * 16, c.cz * 16);
        for v in self.villages_near(x0, z0, x0 + 15, z0 + 15) {
            let mut s = Stamp { c, x0, z0 };
            self.roads(&mut s, &v);
            for b in &v.buildings {
                self.building(&mut s, &v, b);
            }
        }
    }

    fn roads(&self, s: &mut Stamp, v: &Village) {
        for t in -26i32..=26 {
            for w in -1..=1 {
                for (x, z) in [(v.x + t, v.z + w), (v.x + w, v.z + t)] {
                    if !s.inside(x, z) {
                        continue;
                    }
                    let h = self.height_at(x, z);
                    if h <= self.sea() {
                        s.put(x, self.sea() - 1, z, 8); // pinguela de tábuas sobre a água
                        continue;
                    }
                    if matches!(s.get(x, h - 1, z), GRASS | DIRT | SNOW | SAND) {
                        s.put(x, h - 1, z, PATH);
                        if block::shape(s.get(x, h, z)) == CROSS {
                            s.put(x, h, z, AIR);
                        }
                    }
                }
            }
        }
        // sino num suporte no meio, com fardos de feno do lado, e postes com tochas
        let h = self.height_at(v.x + 3, v.z + 3);
        s.foundation(v.x + 3, h - 1, v.z + 3, 4);
        s.put(v.x + 3, h, v.z + 3, LOG);
        s.put(v.x + 3, h + 1, v.z + 3, BELL);
        let h2 = self.height_at(v.x - 3, v.z + 3);
        s.put(v.x - 3, h2, v.z + 3, HAY);
        s.put(v.x - 4, h2, v.z + 3, HAY);
        s.put(v.x - 3, h2 + 1, v.z + 3, HAY);
        for (dx, dz) in [(-3, -3), (3, -3), (-14, 3), (14, -3), (-3, 14), (3, -14), (-24, -3), (24, 3), (3, 24), (-3, -24)] {
            let (x, z) = (v.x + dx, v.z + dz);
            let h = self.height_at(x, z);
            if h > self.sea() {
                s.put(x, h, z, LOG);
                s.put(x, h + 1, z, LOG);
                s.put(x, h + 2, z, TORCH);
            }
        }
    }

    fn building(&self, s: &mut Stamp, v: &Village, b: &Building) {
        // (parede, canto, telhado, piso) de cada bioma
        let (wall, post, roof, floor) = match v.biome {
            DESERT => (SANDSTONE, SANDSTONE, SANDSTONE, SANDSTONE),
            TUNDRA => (8u8, LOG, SNOW, 8),
            CHERRY => (CHERRY_PLANKS, CHERRY_LOG, 9, 8),
            _ => (8, LOG, 4, 8),
        };
        let wall = if b.kind == Kind::Smithy { 4 } else if b.kind == Kind::Library && v.biome != DESERT { 171 } else { wall };
        // coordenadas do lote: a (de lado) e d (da frente, na direção da rua, para trás)
        let into: (i32, i32) = [(0, -1), (1, 0), (0, 1), (-1, 0)][b.front]; // da porta para dentro
        let side = (into.1.abs(), into.0.abs());
        let at = |a: i32, d: i32| (b.x + side.0 * a + into.0 * (d - 3), b.z + side.1 * a + into.1 * (d - 3));
        let y = b.y;
        // abre o espaço e faz o alicerce
        for a in -4..=4 {
            for d in -1..=7 {
                let (x, z) = at(a, d);
                let edge = a.abs() == 4 || d == -1 || d == 7;
                for dy in 0..8 {
                    if !edge || dy < 3 {
                        s.put(x, y + dy, z, AIR);
                    }
                }
                s.foundation(x, y - 1, z, 7);
                let ground = if v.biome == DESERT { SAND } else if v.biome == TUNDRA { SNOW } else { GRASS };
                s.put(x, y - 1, z, if edge { ground } else if a == 0 && d < 0 { PATH } else { ground });
            }
        }
        let (px, pz) = at(0, -1);
        s.put(px, y - 1, pz, PATH);
        if b.kind == Kind::Farm {
            // canteiros cercados de troncos, com um canal de água no meio
            let crops = [167u8, 219, 222, 225];
            for a in -3..=3i32 {
                for d in 0..=6 {
                    let (x, z) = at(a, d);
                    if a.abs() == 3 || d == 0 || d == 6 {
                        s.put(x, y - 1, z, LOG);
                    } else if a == 0 {
                        s.put(x, y - 1, z, WATER);
                    } else {
                        s.put(x, y - 1, z, FARMLAND);
                        let row = (hash(b.x + a / 2, b.z, self.seed.wrapping_add(310)) * 4.0) as usize;
                        let stage = (hash(x, z, self.seed.wrapping_add(311)) * 3.0) as u8;
                        s.put(x, y, z, crops[row.min(3)] + stage.min(2));
                    }
                }
            }
            return;
        }
        // casa: piso, paredes com janelas, porta e telhado em degraus
        for a in -3..=3i32 {
            for d in 0..=6i32 {
                let (x, z) = at(a, d);
                let (side_wall, end_wall) = (a.abs() == 3, d == 0 || d == 6);
                s.put(x, y - 1, z, if side_wall || end_wall { 4 } else { floor });
                for dy in 0..3 {
                    if side_wall && end_wall {
                        s.put(x, y + dy, z, post);
                    } else if side_wall || end_wall {
                        let window = dy == 1 && ((side_wall && (d == 2 || d == 4)) || (end_wall && a.abs() == 2) || (d == 6 && a == 0));
                        s.put(x, y + dy, z, if window { GLASS } else { wall });
                    }
                }
                s.put(x, y + 3, z, if side_wall || end_wall { post } else { roof });
            }
        }
        for step in 0..3 {
            for a in -3 + step..=3 - step {
                for d in step..=6 - step {
                    let (x, z) = at(a, d);
                    s.put(x, y + 4 + step, z, roof);
                }
            }
        }
        let face = (0..4).find(|&f| DIR_X[f] == into.0 && DIR_Z[f] == into.1).unwrap_or(0) as u8;
        let (x, z) = at(0, 0);
        s.put(x, y, z, block::variant(K_DOOR, 0, face, 0, 0));
        s.put(x, y + 1, z, block::variant(K_DOOR, 0, face, 0, 1));
        let (x, z) = at(0, 3);
        s.put(x, y + 2, z, AIR);
        let mut put = |a: i32, d: i32, dy: i32, blk: u8| {
            let (x, z) = at(a, d);
            s.put(x, y + dy, z, blk);
        };
        put(-2, 1, 0, TORCH);
        put(2, 5, 0, TORCH);
        match b.kind {
            Kind::House => {
                put(-2, 5, 0, BED);
                put(2, 1, 0, TABLE);
                put(-2, 4, 0, CHEST);
            }
            Kind::Smithy => {
                put(-2, 5, 0, FURNACE);
                put(-1, 5, 0, FURNACE);
                put(0, 5, 0, 32); // bigorna improvisada: bloco de ferro
                put(2, 2, 0, CHEST);
                put(-2, 3, 0, TABLE);
            }
            Kind::Library => {
                for a in -2..=1 {
                    put(a, 5, 0, 171);
                    put(a, 5, 1, HAY);
                }
                put(-2, 3, 0, TABLE);
                put(2, 3, 0, BED);
            }
            Kind::Farm => {}
        }
    }

    /// Perto de uma vila não nascem árvores nem plantas altas.
    pub fn near_village(&self, villages: &[Village], x: i32, z: i32) -> bool {
        villages.iter().any(|v| {
            let (dx, dz) = ((x - v.x).abs(), (z - v.z).abs());
            (dx <= 28 && dz <= 4) || (dz <= 28 && dx <= 4) || v.buildings.iter().any(|b| (x - b.x).abs() <= 7 && (z - b.z).abs() <= 7)
        })
    }
}

/// Escreve blocos em coordenadas do mundo, só dentro deste pedaço.
struct Stamp<'a> {
    c: &'a mut Chunk,
    x0: i32,
    z0: i32,
}

impl Stamp<'_> {
    fn inside(&self, x: i32, z: i32) -> bool {
        x >= self.x0 && x < self.x0 + 16 && z >= self.z0 && z < self.z0 + 16
    }
    fn get(&self, x: i32, y: i32, z: i32) -> u8 {
        if !self.inside(x, z) || !(0..SY).contains(&y) {
            return AIR;
        }
        self.c.blocks[idx(x - self.x0, y, z - self.z0)]
    }
    fn put(&mut self, x: i32, y: i32, z: i32, b: u8) {
        if self.inside(x, z) && (0..SY).contains(&y) {
            self.c.blocks[idx(x - self.x0, y, z - self.z0)] = b;
        }
    }
    /// Enche de terra o vão embaixo (ar, água, plantas), para nada ficar flutuando.
    fn foundation(&mut self, x: i32, from: i32, z: i32, depth: i32) {
        for y in (from - depth..from).rev() {
            let b = self.get(x, y, z);
            if b == AIR || block::is_water(b) || block::shape(b) == CROSS || block::is_leaves(b) {
                self.put(x, y, z, DIRT);
            } else {
                break;
            }
        }
    }
}

// ---------------------------------------------------------------------- trocas

/// (item que você dá, quantos, item que recebe, quantos)
pub type Trade = (i32, i32, i32, i32);

pub const PROFESSIONS: [&str; 5] = ["Fazendeiro", "Bibliotecário", "Ferreiro", "Açougueiro", "Clérigo"];
pub const EMERALD: i32 = 296;

pub fn trades(profession: usize) -> &'static [Trade] {
    const E: i32 = EMERALD;
    match profession {
        // trigo, cenoura e batata viram esmeralda; esmeralda vira comida
        0 => &[(238, 20, E, 1), (297, 22, E, 1), (298, 26, E, 1), (E, 1, 239, 6), (E, 1, 205, 4), (E, 3, 307, 3)],
        1 => &[(201, 15, E, 1), (248, 12, E, 1), (E, 1, 18, 4), (E, 1, 19, 8), (E, 4, 311, 1), (E, 8, 432, 1)],
        2 => &[(201, 15, E, 1), (202, 4, E, 1), (E, 3, 308, 1), (E, 5, 313, 1), (E, 7, 230, 1), (E, 9, 218, 1)],
        3 => &[(245, 14, E, 1), (241, 7, E, 1), (206, 10, E, 1), (E, 1, 246, 5), (E, 1, 207, 3), (E, 1, 242, 4)],
        _ => &[(249, 12, E, 1), (210, 8, E, 1), (203, 3, E, 1), (E, 1, 303, 8), (E, 6, 314, 1), (E, 2, 204, 1)],
    }
}

fn count(g: &Game, id: i32) -> i32 {
    g.inv.s[..SIZE].iter().filter(|s| s.id == id).map(|s| s.count).sum()
}

impl Game {
    /// Põe os moradores (e o golem de ferro) nas vilas que o jogador está alcançando pela primeira vez.
    pub fn tick_villages(&mut self, dt: f64) {
        self.ex.village_timer -= dt;
        if self.ex.village_timer > 0.0 || self.is_client() {
            return;
        }
        self.ex.village_timer = 1.0;
        let (px, pz) = (self.player.x as i32, self.player.z as i32);
        for v in self.gen.villages_near(px - 48, pz - 48, px + 48, pz + 48) {
            let loaded = [(-26, -26), (26, -26), (-26, 26), (26, 26), (0, 0)].iter().all(|(dx, dz)| self.chunks.contains_key(&((v.x + dx) >> 4, (v.z + dz) >> 4)));
            if !loaded || self.ex.villages_done.contains(&v.region) {
                continue;
            }
            self.ex.villages_done.insert(v.region);
            let mut homes: Vec<[f64; 3]> = Vec::new();
            for b in &v.buildings {
                // na frente da porta (do lado da rua)
                let out = [(0, 1), (-1, 0), (0, -1), (1, 0)][b.front];
                homes.push([(b.x + out.0 * 4) as f64 + 0.5, b.y as f64 + 0.05, (b.z + out.1 * 4) as f64 + 0.5]);
            }
            for (k, h) in homes.iter().enumerate() {
                if let Some(i) = self.add_mob(mob::VILLAGER, h[0], h[1], h[2]) {
                    // a profissão vem do id: as primeiras construções garantem um de cada
                    let want = match v.buildings[k].kind {
                        Kind::Smithy => 2,
                        Kind::Library => 1,
                        Kind::Farm => 0,
                        Kind::House => k % 5,
                    };
                    while self.mobs[i].id.rem_euclid(5) as usize != want {
                        self.mobs[i].id += 1;
                    }
                    self.mob_id = self.mob_id.max(self.mobs[i].id + 1);
                    self.mobs[i].home = Some([v.x as f64, v.z as f64]);
                }
            }
            let gy = self.gen.height_at(v.x - 5, v.z - 2) as f64 + 0.05;
            if let Some(i) = self.add_mob(mob::IRON_GOLEM, v.x as f64 - 4.5, gy, v.z as f64 - 1.5) {
                self.mobs[i].home = Some([v.x as f64, v.z as f64]);
            }
            self.notice("Você encontrou uma vila!".into());
        }
    }

    pub fn open_trade(&mut self, villager: i32) {
        self.ex.trade_with = villager;
        self.screen = Screen::Trade;
        self.release_mouse = true;
    }

    fn trade_layout(&self, w: f32, h: f32) -> ([f32; 4], Vec<[f32; 4]>) {
        let k = Self::ui_scale(h as u32);
        let n = 6;
        let (pw, row) = (460.0 * k, 52.0 * k);
        let ph = 90.0 * k + n as f32 * row;
        let (px, py) = ((w - pw) / 2.0, (h - ph) / 2.0);
        let rows = (0..n).map(|i| [px + 20.0 * k, py + 58.0 * k + i as f32 * row, pw - 40.0 * k, row - 6.0 * k]).collect();
        ([px, py, pw, ph], rows)
    }

    fn trader(&self) -> Option<&mob::Mob> {
        self.mobs.iter().find(|m| m.id == self.ex.trade_with && m.t == mob::VILLAGER)
    }

    pub fn draw_trade(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        let Some(profession) = self.trader().map(|m| m.id.rem_euclid(5) as usize) else {
            self.screen = Screen::Play;
            self.grab_mouse = true;
            return;
        };
        let (p, rows) = self.trade_layout(w, h);
        ui.rect(0.0, 0.0, w, h, rgba(0, 0, 0, 90));
        ui.rect(p[0], p[1], p[2], p[3], rgba(28, 28, 34, 235));
        ui.frame(p[0], p[1], p[2], p[3], 2.0 * k, rgba(0, 0, 0, 200));
        ui.centered(22.0 * k, w / 2.0, p[1] + 36.0 * k, PROFESSIONS[profession], rgba(245, 232, 205, 255));
        let m = self.mouse;
        let mut hint = format!("Suas esmeraldas: {}   ·   E ou Esc para sair", count(self, EMERALD));
        for (r, t) in rows.iter().zip(trades(profession)) {
            let can = self.creative || count(self, t.0) >= t.1;
            let hot = m.0 >= r[0] && m.0 < r[0] + r[2] && m.1 >= r[1] && m.1 < r[1] + r[3];
            ui.rect(r[0], r[1], r[2], r[3], if !can { rgba(52, 40, 40, 220) } else if hot { rgba(86, 132, 66, 240) } else { rgba(56, 58, 68, 235) });
            let s = r[3] - 8.0 * k;
            ui.item(Stack::new(t.0, t.1, 0), r[0] + 20.0 * k, r[1] + 4.0 * k, s, k);
            ui.centered(22.0 * k, r[0] + r[2] / 2.0, r[1] + r[3] / 2.0 + 8.0 * k, "→", rgba(255, 255, 255, if can { 255 } else { 90 }));
            ui.item(Stack::new(t.2, t.3, 0), r[0] + r[2] - 20.0 * k - s, r[1] + 4.0 * k, s, k);
            if hot {
                hint = format!("{} x {}  por  {} x {}", t.1, items::name(t.0), t.3, items::name(t.2));
            }
        }
        ui.centered(14.0 * k, w / 2.0, p[1] + p[3] - 12.0 * k, &hint, rgba(215, 215, 220, 255));
    }

    pub fn trade_click(&mut self, w: f32, h: f32, shift: bool) {
        let Some(profession) = self.trader().map(|m| m.id.rem_euclid(5) as usize) else { return };
        let (_, rows) = self.trade_layout(w, h);
        let m = self.mouse;
        let Some(i) = rows.iter().position(|r| m.0 >= r[0] && m.0 < r[0] + r[2] && m.1 >= r[1] && m.1 < r[1] + r[3]) else { return };
        let Some(&t) = trades(profession).get(i) else { return };
        let mut done = 0;
        while self.do_trade(t) {
            done += 1;
            if !shift || done >= 64 {
                break;
            }
        }
        if done > 0 {
            crate::sound::play("coletar", 0.8);
        } else {
            self.notice(format!("Faltam itens: {} x {}", t.1, items::name(t.0)));
        }
    }

    /// Tira o que a troca pede e entrega o resultado; o que não couber na mochila cai no chão.
    pub fn do_trade(&mut self, t: Trade) -> bool {
        if !self.creative {
            if count(self, t.0) < t.1 {
                return false;
            }
            let mut left = t.1;
            for s in self.inv.s[..SIZE].iter_mut() {
                if s.id == t.0 && left > 0 {
                    let n = s.count.min(left);
                    left -= n;
                    *s = Stack::new(s.id, s.count - n, s.wear);
                }
            }
        }
        let rest = self.inv.add(t.2, t.3, 0);
        if rest > 0 {
            self.throw_stack(Stack::new(t.2, rest, 0));
        }
        self.add_xp(2);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::DEEP;

    #[test]
    fn existem_vilas_com_casas_porta_e_sino() {
        let g = Generator { seed: 12345, biome_scale: 2.0, lift: DEEP, modern: true };
        let v = g.villages_near(-1500, -1500, 1500, 1500);
        println!("VILAS {:?}", v.iter().map(|v| (v.x, v.y, v.z, v.biome, v.buildings.len())).collect::<Vec<_>>());
        assert!(v.len() >= 3, "poucas vilas: {}", v.len());
        let v = v.iter().max_by_key(|v| v.buildings.len()).unwrap();
        assert!(v.buildings.len() >= 4);
        let (mut doors, mut bells, mut beds, mut crops) = (0, 0, 0, 0);
        for cx in (v.x - 32) >> 4..=(v.x + 32) >> 4 {
            for cz in (v.z - 32) >> 4..=(v.z + 32) >> 4 {
                for &b in &g.generate(cx, cz).blocks {
                    let i = block::info(b);
                    doors += (i.kind == K_DOOR && i.half == 0) as i32;
                    bells += (b == BELL) as i32;
                    beds += (b == BED) as i32;
                    crops += matches!(b, 167..=169 | 219..=227) as i32;
                }
            }
        }
        println!("portas {doors} sinos {bells} camas {beds} plantas {crops}");
        assert!(doors >= 3 && bells == 1 && beds >= 2 && crops >= 20, "{doors} {bells} {beds} {crops}");
    }

    #[test]
    fn mundo_classico_nao_tem_vila() {
        let g = Generator { seed: 12345, biome_scale: 2.0, lift: 0, modern: false };
        assert!(g.villages_near(-2000, -2000, 2000, 2000).is_empty());
    }

    #[test]
    fn todas_as_trocas_usam_itens_que_existem() {
        for p in 0..5 {
            assert_eq!(trades(p).len(), 6);
            for t in trades(p) {
                assert!(items::exists(t.0) && items::exists(t.2) && t.1 > 0 && t.3 > 0, "{p}: {t:?}");
            }
        }
    }
}
