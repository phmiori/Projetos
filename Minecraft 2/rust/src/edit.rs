//! Mirar, quebrar e colocar blocos (traduzido do BlockGame.java/World.java), e gravar as mudanças no mesmo
//! formato do Java: o mundo editado aqui abre igualzinho no jogo Java, e vice-versa.

use crate::block::{self, *};
use crate::world::{idx, Chunk, SY};
use crate::Game;
use std::sync::Arc;

/// O que está na mira: o bloco, a célula livre antes dele (onde um bloco novo entraria) e a distância.
#[derive(Clone, Copy, Debug)]
pub struct Hit {
    pub b: [i32; 3],
    pub prev: [i32; 3],
    pub t: f64,
}

impl Game {
    pub fn get(&self, x: i32, y: i32, z: i32) -> u8 {
        if !(0..SY).contains(&y) {
            return AIR;
        }
        match self.chunks.get(&(x >> 4, z >> 4)) {
            Some(c) => c.blocks[idx(x & 15, y, z & 15)],
            None => AIR,
        }
    }

    fn loaded(&self, x: i32, z: i32) -> bool {
        self.chunks.contains_key(&(x >> 4, z >> 4))
    }

    /// Troca um bloco: refaz a luz da coluna, marca o pedaço para gravar e para redesenhar (e os vizinhos,
    /// se for na borda), e faz o que o Java faz em volta (plantas e tochas sem apoio caem, areia cai).
    pub fn set(&mut self, x: i32, y: i32, z: i32, b: u8, rot: u8) {
        if !(0..SY).contains(&y) {
            return;
        }
        let k = (x >> 4, z >> 4);
        let Some(arc) = self.chunks.get_mut(&k) else { return };
        let c: &mut Chunk = Arc::make_mut(arc);
        let (lx, lz) = (x & 15, z & 15);
        let i = idx(lx, y, lz);
        let old = c.blocks[i];
        let old_rot = c.rot.get(&(i as u16)).copied().unwrap_or(0);
        if old == b && old_rot == rot {
            return;
        }
        c.blocks[i] = b;
        if rot != 0 {
            c.rot.insert(i as u16, rot);
        } else {
            c.rot.remove(&(i as u16));
        }
        c.recompute_sky_column(lx, lz);
        self.modified.insert(k);
        // redesenha este pedaço e os vizinhos (a luz que vaza de lado e as faces da borda mudam)
        for dx in -1..=1 {
            for dz in -1..=1 {
                self.dirty.insert((k.0 + dx, k.1 + dz));
            }
        }
        // luz de tochas/lava: refaz a região se algo que brilha ou tapa a luz mudou perto de luz
        let light_change = block::light(old) > 0 || block::light(b) > 0;
        let block_change = block::opaque_cube(old) != block::opaque_cube(b) && self.near_light(x, y, z);
        if light_change || block_change {
            self.relight(x, y, z);
        }
        // água perto: ela pode escorrer para cá, secar ou mudar de nível
        if block::is_water(old) || block::is_water(b) || self.water_around(x, y, z) {
            self.schedule_fluid(x, y, z);
            for (dx, dy, dz) in [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)] {
                self.schedule_fluid(x + dx, y + dy, z + dz);
            }
        }
        if !block::solid(b) {
            // plantas e tochas sem apoio caem junto
            if y + 1 < SY && block::info(self.get(x, y + 1, z)).needs_support {
                self.set(x, y + 1, z, AIR, 0);
            }
            // pingente pendurado aqui cai
            if y > 0 && self.get(x, y - 1, z) == ICICLE {
                self.set(x, y - 1, z, AIR, 0);
            }
            // tochas presas nesta parede também caem
            for f in 0..4 {
                let (tx, tz) = (x - DIR_X[f], z - DIR_Z[f]);
                if self.get(tx, y, tz) == WALL_TORCH_BASE + f as u8 {
                    self.set(tx, y, tz, AIR, 0);
                }
            }
            // areia e cascalho em cima caem
            if y + 1 < SY && falls(self.get(x, y + 1, z)) {
                self.fall_queue.push((x, y + 1, z));
            }
        }
        if falls(b) {
            self.fall_queue.push((x, y, z));
        }
    }

    /// Areia e cascalho sem nada embaixo descem um bloco a cada 0,09 s, como no Java.
    pub fn tick_falling(&mut self, dt: f64) {
        self.fall_timer += dt;
        if self.fall_timer < 0.09 || self.fall_queue.is_empty() {
            return;
        }
        self.fall_timer = 0.0;
        let batch = std::mem::take(&mut self.fall_queue);
        for (x, y, z) in batch {
            let b = self.get(x, y, z);
            if !falls(b) || y == 0 || !self.loaded(x, z) {
                continue;
            }
            let below = self.get(x, y - 1, z);
            if below != AIR && block::shape(below) != LIQUID && block::shape(below) != CROSS {
                continue;
            }
            self.set(x, y, z, AIR, 0);
            self.set(x, y - 1, z, b, 0); // entra de novo na fila e continua caindo
        }
    }

    /// Raio DDA até `reach` (World.raycast do Java): mira sólidos, plantas e tochas; atravessa ar e água.
    pub fn raycast(&self, o: [f64; 3], d: [f64; 3], reach: f64) -> Option<Hit> {
        raycast(|x, y, z| if self.loaded(x, z) { Some(self.get(x, y, z)) } else { None }, o, d, reach)
    }

    fn replaceable(&self, x: i32, y: i32, z: i32) -> bool {
        if !(0..SY).contains(&y) || !self.loaded(x, z) {
            return false;
        }
        let b = self.get(x, y, z);
        b == AIR || block::shape(b) == LIQUID || block::shape(b) == CROSS
    }

    fn player_intersects(&self, x: i32, y: i32, z: i32) -> bool {
        let p = &self.player;
        let (hw, h) = (crate::physics::HW, crate::physics::H);
        p.x - hw < (x + 1) as f64 && p.x + hw > x as f64 && p.y < (y + 1) as f64 && p.y + h > y as f64 && p.z - hw < (z + 1) as f64 && p.z + hw > z as f64
    }

    /// Botão esquerdo: quebra o bloco mirado (no criativo é na hora, como no Java).
    pub fn break_aimed(&mut self) {
        let Some(h) = self.aim else { return };
        let [x, y, z] = h.b;
        self.destroy(x, y, z);
    }

    /// Tira o bloco (e a outra metade, se for porta). Retorna false se não pode ser quebrado aqui.
    pub fn destroy(&mut self, x: i32, y: i32, z: i32) -> bool {
        let b = self.get(x, y, z);
        if block::info(b).hardness < 0.0 {
            return false;
        }
        self.set(x, y, z, AIR, 0);
        if b == CHEST || b == FURNACE || b == FURNACE_LIT {
            self.spill_container(x, y, z, b); // o que havia dentro cai no chão
        }
        // a outra metade da porta vai junto
        let i = block::info(b);
        if i.kind == K_DOOR {
            let oy = if i.half == 0 { y + 1 } else { y - 1 };
            if block::info(self.get(x, oy, z)).kind == K_DOOR {
                self.set(x, oy, z, AIR, 0);
            }
        }
        true
    }

    /// Colocou um bloco: na sobrevivência gasta um da mão.
    fn pay(&mut self) {
        if !self.creative {
            self.inv.take_one(self.slot);
        }
    }

    /// Botão direito: abre/fecha porta, ou coloca o bloco da mão (mesmas regras do placeBlock do Java).
    pub fn use_aimed(&mut self) {
        let Some(h) = self.aim else {
            self.use_item();
            return;
        };
        let [hx, hy, hz] = h.b;
        let target = self.get(hx, hy, hz);
        let ti = block::info(target);
        if ti.kind == K_DOOR {
            let open = 1 - ti.flag;
            let other_y = if ti.half == 0 { hy + 1 } else { hy - 1 };
            self.set(hx, hy, hz, block::variant(K_DOOR, ti.mat, ti.face, open, ti.half), 0);
            if block::info(self.get(hx, other_y, hz)).kind == K_DOOR {
                self.set(hx, other_y, hz, block::variant(K_DOOR, ti.mat, ti.face, open, 1 - ti.half), 0);
            }
            return;
        }
        if target == block::TABLE {
            // bancada: abre a grade de criação 3x3
            self.at_table = true;
            self.screen = crate::Screen::Inventory;
            self.release_mouse = true;
            return;
        }
        if target == CHEST || target == FURNACE || target == FURNACE_LIT {
            self.open_container(hx, hy, hz, target);
            return;
        }
        // comida e armadura na mão: come ou veste; ovo: nasce a criatura
        if self.use_item() || self.use_egg() {
            return;
        }
        let held = block::block_of_item(self.inv.s[self.slot].id);
        if held == AIR {
            return;
        }
        let hi = block::info(held);
        let [bx, by, bz] = h.prev;
        // ponto exato do clique, para saber se foi na metade de cima
        let eye = self.eye();
        let f = self.forward();
        let hit_y = eye[1] as f64 + f[1] as f64 * h.t;
        let clicked_top = by > hy;
        let clicked_bottom = by < hy;
        let upper_half = clicked_bottom || (!clicked_top && hit_y - hit_y.floor() > 0.5);

        // laje sobre laje (pela face livre): mesmo material vira bloco inteiro; materiais diferentes ficam empilhados
        if hi.kind == K_SLAB && ti.kind == K_SLAB && ((clicked_top && ti.flag == 0) || (clicked_bottom && ti.flag == 1)) {
            let (a, m) = (ti.mat, hi.mat);
            let result = if a == m { SHAPE_MATS[m as usize] } else if ti.flag == 1 { block::mixed_slab(m, a) } else { block::mixed_slab(a, m) };
            self.set(hx, hy, hz, result, 0);
            self.pay();
            return;
        }
        // laje vertical encostando na outra metade de uma laje vertical igual: bloco inteiro
        if hi.kind == K_VSLAB && ti.kind == K_VSLAB && ti.mat == hi.mat {
            let f = ti.face as usize;
            if bx == hx - DIR_X[f] && bz == hz - DIR_Z[f] && by == hy {
                self.set(hx, hy, hz, SHAPE_MATS[hi.mat as usize], 0);
                self.pay();
                return;
            }
        }
        if !self.replaceable(bx, by, bz) {
            return;
        }
        let facing = block::facing_from_yaw(self.player.yaw);
        let side_click = by == hy && (bx != hx || bz != hz);
        let toward_hit = if side_click { (0..4).find(|&f| DIR_X[f] == hx - bx && DIR_Z[f] == hz - bz).unwrap_or(0) as u8 } else { 0 };
        if held == TORCH && side_click {
            if !block::solid(target) || block::shape(target) == MODEL {
                return; // precisa de parede firme
            }
            self.set(bx, by, bz, WALL_TORCH_BASE + toward_hit, 0);
            self.pay();
            return;
        }
        let place = match hi.kind {
            K_VSLAB => block::variant(K_VSLAB, hi.mat, if side_click { toward_hit } else { facing }, 0, 0),
            K_SLAB => block::variant(K_SLAB, hi.mat, 0, upper_half as u8, 0),
            K_STAIR => block::variant(K_STAIR, hi.mat, facing, upper_half as u8, 0),
            K_DOOR => {
                if !self.replaceable(bx, by + 1, bz) || !block::solid(self.get(bx, by - 1, bz)) {
                    return;
                }
                if self.player_intersects(bx, by, bz) || self.player_intersects(bx, by + 1, bz) {
                    return;
                }
                self.set(bx, by + 1, bz, block::variant(K_DOOR, hi.mat, facing, 0, 1), 0);
                self.set(bx, by, bz, block::variant(K_DOOR, hi.mat, facing, 0, 0), 0);
                self.pay();
                return;
            }
            _ => held,
        };
        if place == AIR {
            return;
        }
        let supported = if place == ICICLE {
            by + 1 < SY && block::solid(self.get(bx, by + 1, bz)) // o pingente fica pendurado
        } else {
            !block::info(place).needs_support || block::solid(self.get(bx, by - 1, bz))
        };
        if !supported || (block::solid(place) && self.player_intersects(bx, by, bz)) {
            return;
        }
        // blocos com "frente" (fornalha, bancada, baú, cama...) ficam com a frente virada para quem os colocou
        let rot = if block::info(place).rotatable { (facing + 2) & 3 } else { 0 };
        self.set(bx, by, bz, place, rot);
        self.pay();
    }

    /// Botão do meio: pega o bloco mirado para a mão (criativo).
    pub fn pick_aimed(&mut self) {
        let Some(h) = self.aim else { return };
        let item = block::item_for_block(self.get(h.b[0], h.b[1], h.b[2]));
        if item > 0 {
            self.inv.s[self.slot] = crate::inventory::Stack::new(item, crate::items::max_stack(item), 0);
            self.slot_name_timer = 2.0;
        }
    }

    /// Grava os pedaços modificados no disco (mesmo formato e mesma pasta do Java).
    pub fn save_chunks(&mut self, only_far: Option<(i32, i32, i32)>) {
        let Some(dir) = self.save_dir.clone() else { return };
        let dir = dir.join("chunks");
        let _ = std::fs::create_dir_all(&dir);
        let keys: Vec<(i32, i32)> = self.modified.iter().cloned().collect();
        for k in keys {
            if let Some((pcx, pcz, r)) = only_far {
                if (k.0 - pcx).abs() <= r && (k.1 - pcz).abs() <= r {
                    continue;
                }
            }
            if let Some(c) = self.chunks.get(&k) {
                let tmp = dir.join(format!("{}_{}.tmp", k.0, k.1));
                if std::fs::write(&tmp, c.to_bytes()).is_ok() && std::fs::rename(&tmp, dir.join(format!("{}_{}.dat", k.0, k.1))).is_ok() {
                    self.modified.remove(&k);
                }
            } else {
                self.modified.remove(&k);
            }
        }
    }
}

fn falls(b: u8) -> bool {
    b == SAND || b == GRAVEL
}

/// O raio em si, separado do jogo para dar para testar. `get` devolve None onde o mundo não está carregado.
pub fn raycast(get: impl Fn(i32, i32, i32) -> Option<u8>, o: [f64; 3], d: [f64; 3], reach: f64) -> Option<Hit> {
    let mut i = [o[0].floor() as i32, o[1].floor() as i32, o[2].floor() as i32];
    let s = [if d[0] > 0.0 { 1 } else { -1 }, if d[1] > 0.0 { 1 } else { -1 }, if d[2] > 0.0 { 1 } else { -1 }];
    let mut td = [0.0; 3];
    let mut tm = [0.0; 3];
    for a in 0..3 {
        td[a] = if d[a] == 0.0 { 1e30 } else { (1.0 / d[a]).abs() };
        tm[a] = if d[a] == 0.0 {
            1e30
        } else if d[a] > 0.0 {
            (i[a] as f64 + 1.0 - o[a]) * td[a]
        } else {
            (o[a] - i[a] as f64) * td[a]
        };
    }
    let mut t = 0.0;
    while t <= reach {
        let prev = i;
        let a = if tm[0] < tm[1] && tm[0] < tm[2] { 0 } else if tm[1] < tm[2] { 1 } else { 2 };
        i[a] += s[a];
        t = tm[a];
        tm[a] += td[a];
        if t > reach {
            break;
        }
        if i[1] < 0 || i[1] >= SY {
            if i[1] >= SY && s[1] > 0 {
                break;
            }
            continue;
        }
        if let Some(b) = get(i[0], i[1], i[2]) {
            if b != AIR && block::shape(b) != LIQUID {
                return Some(Hit { b: i, prev, t });
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Chão de pedra em y <= 24, ar em cima.
    fn ground(_x: i32, y: i32, _z: i32) -> Option<u8> {
        Some(if y <= 24 { STONE } else { AIR })
    }

    #[test]
    fn mira_o_chao_olhando_para_baixo() {
        let h = raycast(ground, [40.5, 26.62, 40.5], [0.0, -1.0, 0.0], 7.0).unwrap();
        assert_eq!(h.b, [40, 24, 40]);
        assert_eq!(h.prev, [40, 25, 40]);
    }

    #[test]
    fn mira_o_chao_na_diagonal() {
        let (yaw, pitch): (f64, f64) = (2.6, -0.35);
        let d = [yaw.sin() * pitch.cos(), pitch.sin(), yaw.cos() * pitch.cos()];
        let h = raycast(ground, [51.5, 26.62, 45.5], d, 7.0).expect("devia mirar o chão");
        assert_eq!(h.b[1], 24);
    }
}
