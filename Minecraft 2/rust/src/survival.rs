//! Modo sobrevivência e itens soltos, traduzidos do BlockGame.java e do Drops.java: quebrar com tempo (conforme a
//! ferramenta), o que cada bloco solta, itens caindo no chão e sendo coletados, vida, fome, fôlego e morte.

use crate::block::{self, AIR};
use crate::inventory::{Stack, SIZE, TOTAL};
use crate::items;
use crate::physics::Player;
use crate::{Game, Loaded};

const PICKUP_DELAY: f64 = 0.5;
const PICKUP_RADIUS: f64 = 1.3;
const MAGNET_RADIUS: f64 = 2.4;
const LIFETIME: f64 = 300.0;
pub const MAX_HEALTH: f64 = 20.0;
pub const MAX_FOOD: f64 = 20.0;
pub const MAX_AIR: f64 = 10.0;

/// Um item solto no chão: cai, fica girando e é coletado quando o jogador chega perto.
pub struct Drop {
    pub body: Player,
    pub st: Stack,
    pub age: f64,
    pub delay: f64,
    pub phase: f64,
}

/// Sorteio simples (não precisa ser igual ao Java: é só para o que os blocos soltam).
pub struct Rng(u64);
impl Rng {
    pub fn new() -> Rng {
        Rng(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(7) | 1)
    }
    pub fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

impl Game {
    /// Solta um item no meio do bloco quebrado (Drops.spawn).
    pub fn drop_at_block(&mut self, id: i32, x: i32, y: i32, z: i32) {
        let (vx, vz) = ((self.rng.next() - 0.5) * 2.4, (self.rng.next() - 0.5) * 2.4);
        self.spawn_drop(Stack::new(id, 1, 0), [x as f64 + 0.5, y as f64 + 0.2, z as f64 + 0.5], [vx, 3.2, vz], PICKUP_DELAY);
    }

    pub fn spawn_drop(&mut self, st: Stack, p: [f64; 3], v: [f64; 3], delay: f64) {
        if st.empty() {
            return;
        }
        let mut body = Player::body(0.14, 0.28);
        (body.x, body.y, body.z, body.vx, body.vy, body.vz) = (p[0], p[1], p[2], v[0], v[1], v[2]);
        let phase = self.rng.next() * 6.28;
        self.drops.push(Drop { body, st, age: 0.0, delay, phase });
    }

    /// Joga fora o que está na mão (Q; com Ctrl, a pilha toda), na direção em que o jogador olha.
    pub fn throw_held(&mut self, all: bool) {
        let st = self.inv.s[self.slot];
        if st.empty() {
            return;
        }
        let n = if all { st.count } else { 1 };
        self.inv.s[self.slot] = Stack::new(st.id, st.count - n, st.wear);
        self.throw_stack(Stack::new(st.id, n, st.wear));
    }

    pub fn throw_stack(&mut self, st: Stack) {
        let f = self.forward();
        let e = self.eye();
        self.spawn_drop(st, [e[0] as f64 + f[0] as f64 * 0.4, e[1] as f64 - 0.35, e[2] as f64 + f[2] as f64 * 0.4], [f[0] as f64 * 6.0, f[1] as f64 * 6.0 + 2.0, f[2] as f64 * 6.0], 1.5);
    }

    pub fn update_drops(&mut self, dt: f64) {
        let alive = self.health > 0.0;
        let (px, py, pz) = (self.player.x, self.player.y, self.player.z);
        let mut drops = std::mem::take(&mut self.drops);
        let mut picked = false;
        drops.retain_mut(|d| {
            d.age += dt;
            if d.age > LIFETIME || !self.chunks.contains_key(&((d.body.x.floor() as i32) >> 4, (d.body.z.floor() as i32) >> 4)) {
                return d.age <= LIFETIME; // em pedaço que não está carregado, fica parado
            }
            let w = Loaded(&self.chunks);
            d.body.update_fluids(&w);
            if d.body.in_lava {
                return false;
            }
            if d.body.in_water {
                d.body.vy = (d.body.vy - 6.0 * dt).max(-1.2);
                d.body.vx *= 0.9;
                d.body.vz *= 0.9;
            } else {
                d.body.vy = (d.body.vy - 28.0 * dt).max(-40.0);
            }
            let (dx, dz) = (px - d.body.x, pz - d.body.z);
            let dy = py + 0.9 - (d.body.y + 0.15);
            let flat = (dx * dx + dz * dz).sqrt();
            let can_pick = alive && d.age >= d.delay && dy.abs() < 1.5;
            if can_pick && flat < MAGNET_RADIUS && flat > 0.05 && self.inv.fits(d.st.id) {
                let pull = 14.0 * dt * (1.0 - flat / MAGNET_RADIUS + 0.2);
                d.body.vx += dx / flat * pull * 4.0;
                d.body.vz += dz / flat * pull * 4.0;
            }
            d.body.do_move(dt, &w, false);
            if d.body.on_ground {
                d.body.vx *= 0.6;
                d.body.vz *= 0.6;
                if d.body.vy < 0.0 {
                    d.body.vy = 0.0;
                }
            }
            if d.body.y < -20.0 {
                return false;
            }
            if can_pick && flat <= PICKUP_RADIUS {
                let before = d.st.count;
                d.st.count = self.inv.add(d.st.id, d.st.count, d.st.wear);
                if d.st.count != before {
                    picked = true;
                }
                if d.st.count <= 0 {
                    return false;
                }
            }
            true
        });
        // itens iguais parados um em cima do outro viram uma pilha só
        self.drops = drops;
        if picked {
            self.slot_name_timer = self.slot_name_timer.max(0.0);
        }
    }

    // ------------------------------------------------------------------ quebrar com tempo
    /// Segurando o botão esquerdo na sobrevivência: o bloco vai rachando até quebrar (BlockGame.java).
    pub fn mine(&mut self, dt: f64, holding: bool) {
        let Some(h) = self.aim.filter(|_| holding) else {
            self.break_progress = 0.0;
            return;
        };
        if Some(h.b) != self.break_pos {
            self.break_pos = Some(h.b);
            self.break_progress = 0.0;
        }
        let [x, y, z] = h.b;
        let b = self.get(x, y, z);
        let hard = block::info(b).hardness;
        if hard < 0.0 {
            return;
        }
        let held = self.inv.s[self.slot].id;
        let (speed, drops) = items::mining(held, b);
        self.break_progress += if hard == 0.0 { 1.0 } else { dt * speed / hard };
        if self.break_progress < 1.0 {
            return;
        }
        self.break_progress = 0.0;
        let broken = self.get(x, y, z);
        if !self.destroy(x, y, z) {
            return;
        }
        if drops {
            self.drop_loot(broken, x, y, z);
        }
        if self.inv.use_tool(self.slot) {
            self.notice("Sua ferramenta quebrou!".into());
        }
    }

    /// O que o bloco solta ao ser quebrado (mesmas chances do Java).
    fn drop_loot(&mut self, b: u8, x: i32, y: i32, z: i32) {
        let mut drop = block::info(b).drop;
        if b == block::GRAVEL && self.rng.next() < 0.1 {
            drop = items::FLINT; // às vezes o cascalho dá sílex
        }
        if drop != 0 {
            self.drop_at_block(drop, x, y, z);
        }
        let info = block::info(b);
        if info.kind == 5 {
            // lajes empilhadas: a de cima também
            let upper = block::table().blocks.iter().position(|i| i.kind == block::K_SLAB && i.flag == 0 && i.mat == upper_mat(b)).unwrap_or(0);
            if upper > 0 {
                self.drop_at_block(upper as i32, x, y, z);
            }
        }
        if b == block::LEAVES && self.rng.next() < 0.08 {
            self.drop_at_block(items::APPLE, x, y, z);
        }
        if block::is_leaves(b) && self.rng.next() < 0.07 {
            self.drop_at_block(if b == block::LEAVES { 163 } else { 164 }, x, y, z);
        }
        if b == block::TALL_GRASS && self.rng.next() < 0.05 {
            self.drop_at_block(items::STICK, x, y, z);
        }
        if b == block::TALL_GRASS && self.rng.next() < 0.15 {
            self.drop_at_block(items::SEEDS, x, y, z);
        }
    }

    // ------------------------------------------------------------------ vida, fome e fôlego
    pub fn survival(&mut self, dt: f64) {
        self.hurt_flash = (self.hurt_flash - dt).max(0.0);
        if self.creative {
            self.health = MAX_HEALTH;
            self.food = MAX_FOOD;
            self.air = MAX_AIR;
            self.player.landed_fall = 0.0;
            return;
        }
        if self.health <= 0.0 {
            return;
        }
        if self.player.landed_fall > 3.5 {
            self.damage((self.player.landed_fall - 3.0).floor());
        }
        self.player.landed_fall = 0.0;
        if self.player.head_in_water {
            self.air -= dt;
            if self.air <= 0.0 {
                self.air = 0.0;
                self.drown_timer += dt;
                if self.drown_timer >= 1.0 {
                    self.drown_timer = 0.0;
                    self.damage(2.0);
                }
            }
        } else {
            self.air = (self.air + dt * 4.0).min(MAX_AIR);
            self.drown_timer = 0.0;
        }
        self.hazard_cd -= dt;
        if self.hazard_cd <= 0.0 {
            if self.player.in_lava {
                self.damage(4.0);
                self.hazard_cd = 0.5;
            } else if self.player.touching(&Loaded(&self.chunks), block::CACTUS) {
                self.hit(1.0);
                self.hazard_cd = 0.6;
            }
        }
        // fome: cai devagar, mais rápido correndo; com a barra alta a vida se recupera
        self.food = (self.food - dt * if self.player.sprinting { 1.0 / 12.0 } else { 1.0 / 45.0 }).max(0.0);
        if self.food >= 16.0 && self.clock_s - self.last_hurt > 4.0 && self.health < MAX_HEALTH {
            self.health = (self.health + dt * 0.6).min(MAX_HEALTH);
            self.food = (self.food - dt * 0.15).max(0.0);
        }
        if self.food <= 0.0 {
            self.starve_timer += dt;
            if self.starve_timer >= 4.0 {
                self.starve_timer = 0.0;
                if self.health > 1.0 {
                    self.damage(1.0);
                }
            }
        } else {
            self.starve_timer = 0.0;
        }
        if self.health <= 0.0 {
            self.die();
        }
    }

    /// Golpe (a armadura diminui e se gasta).
    pub fn hit(&mut self, mut n: f64) {
        let pts = self.inv.armor_points();
        if n > 0.0 && pts > 0 {
            n = (n * (1.0 - pts as f64 * 0.04)).max(0.5);
            if self.inv.wear_armor() {
                self.notice("Uma peça da sua armadura quebrou!".into());
            }
        }
        self.damage(n);
    }

    pub fn damage(&mut self, n: f64) {
        if n <= 0.0 {
            return;
        }
        self.health -= n;
        self.last_hurt = self.clock_s;
        self.hurt_flash = 0.45;
    }

    /// Como no Java: tudo o que você carregava cai onde você morreu.
    fn die(&mut self) {
        self.health = 0.0;
        let (x, y, z) = (self.player.x, self.player.y + 0.6, self.player.z);
        for i in 0..TOTAL {
            let st = self.inv.s[i];
            if !st.empty() {
                let (vx, vz) = ((self.rng.next() - 0.5) * 4.0, (self.rng.next() - 0.5) * 4.0);
                self.spawn_drop(st, [x, y, z], [vx, 4.0, vz], 2.0);
                self.inv.s[i] = Stack::default();
            }
        }
        self.screen = crate::Screen::Dead;
        self.release_mouse = true;
    }

    /// Renasce no ponto de nascimento salvo, com a vida e a fome cheias.
    pub fn respawn(&mut self) {
        self.health = MAX_HEALTH;
        self.food = MAX_FOOD;
        self.air = MAX_AIR;
        let s = self.spawn;
        (self.player.x, self.player.y, self.player.z) = (s[0], s[1], s[2]);
        (self.player.vx, self.player.vy, self.player.vz) = (0.0, 0.0, 0.0);
        self.player.fall_dist = 0.0;
        self.player.landed_fall = 0.0;
        self.player.flying = false;
        self.screen = crate::Screen::Play;
        self.grab_mouse = true;
    }

    /// Botão direito com comida (come) ou armadura (veste) na mão. Retorna true se usou o item.
    pub fn use_item(&mut self) -> bool {
        let st = self.inv.s[self.slot];
        let Some(info) = items::info(st.id) else { return false };
        if info.food > 0 {
            if self.creative || self.food >= MAX_FOOD || self.eat_cd > 0.0 {
                return self.food >= MAX_FOOD || self.creative;
            }
            self.food = (self.food + info.food as f64).min(MAX_FOOD);
            self.inv.take_one(self.slot);
            self.eat_cd = 0.6;
            return true;
        }
        if info.armor_piece >= 0 {
            let to = SIZE + info.armor_piece as usize;
            self.inv.s.swap(self.slot, to);
            return true;
        }
        false
    }
}

/// Material da metade de cima das lajes empilhadas (Block.mixedSlab ao contrário).
fn upper_mat(b: u8) -> u8 {
    if (136..161).contains(&b) {
        (b - 136) % 5
    } else if b >= 187 {
        let k = b - 187;
        if k < 6 { k } else { 5 }
    } else {
        0
    }
}

impl Game {
    /// Itens soltos: blocos viram cubinhos girando; os outros, a figura plana girando (como no Java).
    pub fn draw_drops(&self, ui: &mut crate::ui::Ui, daylight: f32) {
        let t = self.clock_s as f32;
        for d in &self.drops {
            let light = drop_light(self, d, daylight);
            let n = if d.st.count > 1 { 2 } else { 1 };
            for copy in 0..n {
                let bob = (t * 2.2 + d.phase as f32).sin() * 0.06;
                let ang = t * 1.8 + d.phase as f32;
                let (ca, sa) = (ang.cos(), ang.sin());
                let off = copy as f32 * 0.08;
                let (cx, cy, cz) = (d.body.x as f32 + off, d.body.y as f32 + 0.27 + bob + copy as f32 * 0.07, d.body.z as f32 + off);
                let b = block::block_of_item(d.st.id);
                let rot = |x: f32, y: f32, z: f32| [cx + x * ca - z * sa, cy + y, cz + x * sa + z * ca];
                if b != AIR && block::shape(b) != block::CROSS {
                    let r = 0.13;
                    let tex = block::texture(b) as f32;
                    let c = |k: f32| [light * k, light * k, light * k, 1.0];
                    // cubinho: em cima, embaixo e os quatro lados
                    let faces: [([[f32; 3]; 4], f32, f32); 6] = [
                        ([[-r, r, -r], [r, r, -r], [r, r, r], [-r, r, r]], 2.0, 1.0),
                        ([[-r, -r, r], [r, -r, r], [r, -r, -r], [-r, -r, -r]], 3.0, 0.55),
                        ([[-r, r, r], [r, r, r], [r, -r, r], [-r, -r, r]], 4.0, 0.8),
                        ([[r, r, -r], [-r, r, -r], [-r, -r, -r], [r, -r, -r]], 5.0, 0.8),
                        ([[r, r, r], [r, r, -r], [r, -r, -r], [r, -r, r]], 0.0, 0.65),
                        ([[-r, r, -r], [-r, r, r], [-r, -r, r], [-r, -r, -r]], 1.0, 0.65),
                    ];
                    for (pts, face, shade) in faces {
                        let p = pts.map(|q| rot(q[0], q[1], q[2]));
                        ui.quad(p, [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]], tex * 6.0 + face, c(shade));
                    }
                } else {
                    // figura plana, dos dois lados
                    let r = 0.2;
                    let p = [rot(-r, r, 0.0), rot(r, r, 0.0), rot(r, -r, 0.0), rot(-r, -r, 0.0)];
                    let c = [light, light, light, 1.0];
                    let (layer, uv) = if b != AIR {
                        (block::texture(b) as f32 * 6.0 + 4.0, [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]])
                    } else {
                        let icon = crate::items::info(d.st.id).map_or(0, |i| i.icon);
                        let (u0, v0) = crate::ui::item_uv(icon);
                        let s = 16.0 / 1024.0;
                        (-1.0, [[u0, v0], [u0 + s, v0], [u0 + s, v0 + s], [u0, v0 + s]])
                    };
                    ui.quad(p, uv, layer, c);
                }
            }
        }
    }
}

/// Quanta luz o item solto recebe (céu conforme a hora, ou tocha).
pub fn drop_light(g: &Game, d: &Drop, daylight: f32) -> f32 {
    let (x, y, z) = (d.body.x.floor() as i32, (d.body.y + 0.1).floor() as i32, d.body.z.floor() as i32);
    let sky = g.sky_light(x, y, z) as f32 / 15.0 * (0.13 + 0.87 * daylight);
    let blk = g.block_light(x, y, z) as f32 / 15.0;
    (sky.max(blk) * 0.95 + 0.05).min(1.0)
}
