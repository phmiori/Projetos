//! Arco do jogador, dinamite, cama, enxada e trigo, e a vida do mundo (folhas sem tronco somem, mudas viram
//! árvores, o trigo cresce, a grama se espalha): traduzidos do BlockGame.java e do World.tickGrowth.

use crate::block::{self, AIR, DIRT, GRASS, STONE};
use crate::items;
use crate::mobs::Arrow;
use crate::world::SY;
use crate::Game;

pub const TNT: u8 = 161;
pub const FARMLAND: u8 = 166;
pub const WHEAT: u8 = 167;
const SAPLING: u8 = 163;
const BIRCH_SAPLING: u8 = 164;
pub const WHEAT_ITEM: i32 = 238;
pub const FLINT_STEEL: i32 = 250;
pub const ARROW: i32 = 251;
pub const BOW: i32 = 264;
const BONE: i32 = crate::mob::BONE;
const HOE: i32 = 4;
/// força da dinamite (BlockGame.TNT_POWER) e tempo para puxar o arco todo (BOW_FULL)
const TNT_POWER: f64 = 4.2;
const BOW_FULL: f64 = 1.0;

pub fn is_wheat(b: u8) -> bool {
    (WHEAT..WHEAT + 3).contains(&b)
}

impl Game {
    // ------------------------------------------------------------------ arco
    /// Segurando o botão esquerdo com o arco: puxa a corda; soltando, dispara (BlockGame.tickBow).
    pub fn tick_bow(&mut self, dt: f64, pressed: bool) {
        let has_arrow = self.creative || self.inv.s[..crate::inventory::SIZE].iter().any(|s| s.id == ARROW && s.count > 0);
        if self.l_held && has_arrow {
            if self.bow_charge == 0.0 {
                crate::sound::play("arco_tensao", 0.6);
            }
            self.bow_charge += dt;
        } else if pressed && !has_arrow {
            self.notice("Você não tem flechas".into());
        } else if !self.l_held && self.bow_charge > 0.0 {
            if self.bow_charge >= 0.15 {
                self.fire_bow((self.bow_charge / BOW_FULL).min(1.0));
            }
            self.bow_charge = 0.0;
        }
    }

    /// Solta a flecha: quanto mais puxado (0..1), mais rápida e mais forte.
    pub fn fire_bow(&mut self, power: f64) {
        let f = self.forward();
        let (lx, ly, lz) = (f[0] as f64, f[1] as f64, f[2] as f64);
        let (speed, dmg) = (9.0 + 31.0 * power, 2.0 + 7.0 * power);
        let p = [self.player.x + lx * 0.4, self.player.y + self.player.eye() - 0.12 + ly * 0.4, self.player.z + lz * 0.4];
        if !self.creative {
            if let Some(i) = self.inv.s[..crate::inventory::SIZE].iter().position(|s| s.id == ARROW && s.count > 0) {
                self.inv.take_one(i);
            }
            if self.inv.use_tool(self.slot) {
                self.notice("Seu arco quebrou!".into());
            }
        }
        crate::sound::play("arco_disparo", 0.8);
        let v = [lx * speed, ly * speed, lz * speed];
        if self.is_client() {
            // no mundo de outro, a flecha nasce no anfitrião (ele avisa todos)
            if let Some(n) = &self.net {
                n.send(crate::net::Out::new(crate::net::SHOOT).f(p[0]).f(p[1]).f(p[2]).f(v[0]).f(v[1]).f(v[2]).f(dmg).bo(!self.creative), None);
            }
            return;
        }
        self.spawn_arrow(Arrow::new(p, v, dmg, -1, !self.creative), 0);
    }

    /// Barrinha de força do arco embaixo da mira.
    pub fn draw_bow_charge(&self, ui: &mut crate::ui::Ui, w: f32, h: f32) {
        if self.bow_charge <= 0.0 {
            return;
        }
        let k = Self::ui_scale(h as u32);
        let p = (self.bow_charge / BOW_FULL).min(1.0) as f32;
        let (bw, bh) = (60.0 * k, 5.0 * k);
        let (x, y) = (w / 2.0 - bw / 2.0, h / 2.0 + 18.0 * k);
        ui.rect(x, y, bw, bh, crate::ui::rgba(0, 0, 0, 150));
        let c = if p >= 1.0 { crate::ui::rgba(255, 220, 90, 255) } else { crate::ui::rgba(235, 235, 235, 255) };
        ui.rect(x, y, bw * p, bh, c);
    }

    // ------------------------------------------------------------------ dinamite
    /// Acende uma dinamite. `has_block`: o bloco ainda está no mundo (falso nas que voaram de outra explosão).
    pub fn prime(&mut self, x: i32, y: i32, z: i32, seconds: f64, has_block: bool) {
        if self.primed.iter().any(|p| p.0 == x && p.1 == y && p.2 == z) {
            return;
        }
        self.primed.push((x, y, z, seconds, has_block));
        self.sfx("pavio", [x as f64 + 0.5, y as f64 + 0.5, z as f64 + 0.5], 0.9);
    }

    pub fn tick_primed(&mut self, dt: f64) {
        if self.primed.is_empty() {
            return;
        }
        let mut ready = Vec::new();
        let mut keep = Vec::new();
        for mut p in std::mem::take(&mut self.primed) {
            if p.4 && self.get(p.0, p.1, p.2) != TNT {
                continue; // alguém quebrou antes
            }
            p.3 -= dt;
            if self.rng.next() < dt * 20.0 {
                self.smoke([p.0 as f64 + 0.5, p.1 as f64 + 1.05, p.2 as f64 + 0.5]);
            }
            if p.3 <= 0.0 { ready.push(p) } else { keep.push(p) }
        }
        self.primed = keep;
        for (x, y, z, _, has_block) in ready {
            if has_block {
                self.set(x, y, z, AIR, 0);
            }
            self.explode_at([x as f64 + 0.5, y as f64 + 0.5, z as f64 + 0.5], TNT_POWER);
        }
    }

    /// Dinamite acesa piscando em branco (o Java solta fumaça).
    pub fn draw_primed(&self, ui: &mut crate::ui::Ui) {
        for p in &self.primed {
            if !p.4 || ((p.3 * 6.0) as i32) % 2 != 0 {
                continue;
            }
            let (x0, y0, z0) = (p.0 as f32 - 0.01, p.1 as f32 - 0.01, p.2 as f32 - 0.01);
            let (x1, y1, z1) = (x0 + 1.02, y0 + 1.02, z0 + 1.02);
            let c = [1.0, 1.0, 1.0, 0.55];
            ui.solid_quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c);
            ui.solid_quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], c);
            ui.solid_quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c);
            ui.solid_quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], c);
            ui.solid_quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], c);
        }
    }

    // ------------------------------------------------------------------ botão direito em blocos especiais
    /// Cama, dinamite, osso no trigo, enxada e sementes. Retorna true se usou o clique.
    pub fn use_farm(&mut self, b: u8, x: i32, y: i32, z: i32) -> bool {
        let held = self.inv.s[self.slot].id;
        if b == block::BED {
            self.use_bed(x, y, z);
            return true;
        }
        if b == TNT && held == FLINT_STEEL {
            self.prime(x, y, z, 3.0, true);
            if !self.creative && self.inv.use_tool(self.slot) {
                self.notice("Sua pederneira acabou!".into());
            }
            return true;
        }
        if b == TNT && block::block_of_item(held) == AIR && items::info(held).map_or(true, |i| i.food == 0) {
            self.notice("Use uma pederneira para acender a dinamite".into());
            return true;
        }
        false
    }

    /// Osso como adubo, enxada e sementes (depois de comer/vestir, como no Java).
    pub fn use_on_soil(&mut self, b: u8, x: i32, y: i32, z: i32) -> bool {
        let held = self.inv.s[self.slot].id;
        if held == BONE && is_wheat(b) && b < WHEAT + 2 {
            self.set(x, y, z, b + 1, 0); // o trigo cresce uma fase
            self.hit_bits([x as f64 + 0.5, y as f64 + 0.4, z as f64 + 0.5], 0xE8F0D8, 8);
            if !self.creative {
                self.inv.take_one(self.slot);
            }
            return true;
        }
        if items::info(held).map_or(false, |i| i.tool_kind == HOE) && (b == GRASS || b == DIRT) {
            self.till(x, y, z);
            return true;
        }
        if held == items::SEEDS {
            if b == FARMLAND && self.get(x, y + 1, z) == AIR {
                self.set(x, y + 1, z, WHEAT, 0);
                self.sfx("colocar", [x as f64 + 0.5, y as f64 + 1.2, z as f64 + 0.5], 0.6);
                if !self.creative {
                    self.inv.take_one(self.slot);
                }
            } else if b != FARMLAND {
                self.notice("Sementes só crescem em terra arada: use a enxada na terra".into());
            }
            return true;
        }
        false
    }

    /// Enxada: grama ou terra viram terra arada, onde as sementes crescem.
    fn till(&mut self, x: i32, y: i32, z: i32) {
        let above = self.get(x, y + 1, z);
        if above != AIR && block::shape(above) != block::CROSS {
            return;
        }
        if above != AIR {
            self.set(x, y + 1, z, AIR, 0);
        }
        self.set(x, y, z, FARMLAND, 0);
        self.block_bits(DIRT, x, y + 1, z, 6);
        self.sfx("quebrar_terra", [x as f64 + 0.5, y as f64 + 1.0, z as f64 + 0.5], 0.7);
        if !self.creative && self.inv.use_tool(self.slot) {
            self.notice("Sua ferramenta quebrou!".into());
        }
    }

    /// Cama: define onde você renasce e, de noite, faz o tempo pular para a manhã.
    fn use_bed(&mut self, x: i32, y: i32, z: i32) {
        self.spawn = [x as f64 + 0.5, y as f64 + 0.6, z as f64 + 0.5];
        let night = crate::sky_at(self.time).daylight < 0.35;
        if !night {
            self.notice("Ponto de renascimento definido. Só dá para dormir à noite.".into());
            return;
        }
        if self.is_client() {
            self.notice("Ponto de renascimento definido. Só o anfitrião faz a noite passar.".into());
            return;
        }
        let p = &self.player;
        if self.mobs.iter().any(|m| m.hostile() && (m.body.x - p.x).abs() < 8.0 && (m.body.z - p.z).abs() < 8.0 && (m.body.y - p.y).abs() < 5.0) {
            self.notice("Você não pode dormir agora: há monstros por perto.".into());
            return;
        }
        if self.time > crate::DAY_LENGTH * 0.5 {
            self.day += 1;
        }
        self.time = crate::DAY_LENGTH * 0.27;
        self.mobs.retain(|m| !m.hostile());
        if let Some(n) = &self.net {
            n.send(crate::net::Out::new(crate::net::TIME).dbl(self.time).i(self.day), None);
        }
        let d = self.day;
        self.notice(format!("Você dormiu. Bom dia!  (dia {d})"));
        self.save_all();
    }

    /// Trigo maduro: além da semente, dá o trigo e às vezes mais sementes.
    pub fn wheat_loot(&mut self, b: u8, x: i32, y: i32, z: i32) {
        if b == WHEAT + 2 {
            self.drop_at_block(WHEAT_ITEM, x, y, z);
            for _ in 0..self.int(3) {
                self.drop_at_block(items::SEEDS, x, y, z);
            }
        }
    }

    // ------------------------------------------------------------------ vida do mundo
    /// Sorteia blocos perto do jogador, como o World.tickGrowth: folhas sem tronco somem, mudas viram árvores, o
    /// trigo cresce com luz (mais rápido perto da água), terra arada abandonada volta a ser terra, a grama se
    /// espalha pela terra e morre debaixo de blocos.
    pub fn tick_growth(&mut self, dt: f64) {
        self.grow_timer += dt;
        if self.grow_timer < 0.05 {
            return;
        }
        let n = (self.grow_timer * 8000.0).min(2000.0) as i32;
        self.grow_timer = 0.0;
        let (cx, cz) = (self.player.x.floor() as i32, self.player.z.floor() as i32);
        for _ in 0..n {
            let (x, z, y) = (cx - 48 + self.int(96), cz - 48 + self.int(96), self.int(SY));
            if !self.chunks.contains_key(&(x >> 4, z >> 4)) {
                continue;
            }
            let b = self.get(x, y, z);
            if b == AIR || b == STONE {
                continue;
            }
            if block::is_leaves(b) {
                if !self.near(x, y, z, 4, 4, |b| b == block::LOG || b == block::BIRCH_LOG) {
                    self.set(x, y, z, AIR, 0);
                }
            } else if b == SAPLING || b == BIRCH_SAPLING {
                if self.int(3) == 0 && self.sky_light(x, y, z).max(self.block_light(x, y, z)) >= 9 {
                    self.grow_tree(x, y, z, b == BIRCH_SAPLING);
                }
            } else if is_wheat(b) {
                if b < WHEAT + 2 && self.sky_light(x, y, z).max(self.block_light(x, y, z)) >= 9 {
                    let wet = self.water_near(x, y - 1, z);
                    if self.int(if wet { 2 } else { 4 }) == 0 {
                        self.set(x, y, z, b + 1, 0);
                    }
                }
            } else if b == FARMLAND {
                let above = if y + 1 < SY { self.get(x, y + 1, z) } else { AIR };
                if block::solid(above) || (!is_wheat(above) && self.int(8) == 0 && !self.water_near(x, y, z)) {
                    self.set(x, y, z, DIRT, 0);
                }
            } else if b == DIRT {
                if y + 1 < SY && !covers_grass(self.get(x, y + 1, z)) && self.sky_light(x, y + 1, z) >= 9 && self.near(x, y, z, 1, 1, |b| b == GRASS) {
                    self.set(x, y, z, GRASS, 0);
                }
            } else if b == GRASS && y + 1 < SY && covers_grass(self.get(x, y + 1, z)) {
                self.set(x, y, z, DIRT, 0);
            }
        }
    }

    /// Há algum bloco que satisfaz `f` no cubo de raio r (e altura ±ry) em volta?
    fn near(&self, x: i32, y: i32, z: i32, r: i32, ry: i32, f: impl Fn(u8) -> bool) -> bool {
        for dx in -r..=r {
            for dz in -r..=r {
                for dy in -ry..=ry {
                    if f(self.get(x + dx, y + dy, z + dz)) {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn water_near(&self, x: i32, y: i32, z: i32) -> bool {
        for dy in 0..=1 {
            for dx in -4..=4 {
                for dz in -4..=4 {
                    if block::is_water(self.get(x + dx, y + dy, z + dz)) {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// A muda vira uma árvore, se houver espaço para o tronco (World.growTree).
    fn grow_tree(&mut self, x: i32, y: i32, z: i32, birch: bool) {
        let (log, leaf) = if birch { (block::BIRCH_LOG, block::BIRCH_LEAVES) } else { (block::LOG, block::LEAVES) };
        let h = if birch { 5 } else { 4 } + self.int(3);
        if y + h + 2 >= SY {
            return;
        }
        for i in 1..=h {
            let b = self.get(x, y + i, z);
            if b != AIR && !block::is_leaves(b) {
                return;
            }
        }
        let top = y + h;
        for dy in -2..=1 {
            let rad: i32 = if dy < 0 { 2 } else { 1 };
            for dx in -rad..=rad {
                for dz in -rad..=rad {
                    let corner = dx.abs() == rad && dz.abs() == rad;
                    if corner && (dy == 1 || self.int(2) == 0) {
                        continue;
                    }
                    if self.get(x + dx, top + dy, z + dz) == AIR {
                        self.set(x + dx, top + dy, z + dz, leaf, 0);
                    }
                }
            }
        }
        for i in 0..h {
            self.set(x, y + i, z, log, 0);
        }
    }

}

fn covers_grass(above: u8) -> bool {
    block::opaque_cube(above) || block::shape(above) == block::LIQUID
}
