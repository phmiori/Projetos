//! Cuida das criaturas (Mobs.java do Java): aparecem nos mesmos lugares e proporções (animais de dia na grama e
//! na neve, peixes na água, pássaros, monstros no escuro), atacam, morrem, dormem com o pedaço quando o jogador vai
//! longe e são gravados no meta.properties igual ao Java ("criatura.N" e "lobo.N").
//! Também: a explosão do creeper, as flechas do esqueleto, domar lobo com osso e os ovos de criatura.

use crate::block::{self, LAVA};
use crate::inventory::Stack;
use crate::mob::{self, Mob, Sight};
use crate::physics::Blocks;
use crate::world::{SEA, SY};
use crate::{Game, Loaded};

pub const SPAWN_EGG: i32 = 265;
const ARROW_SPEED: f64 = 24.0;
const ARROW_DAMAGE: f64 = 3.0;
const ARROW_GRAVITY: f64 = 20.0;

/// Flecha do esqueleto voando (ou fincada num bloco).
pub struct Arrow {
    pub p: [f64; 3],
    pub v: [f64; 3],
    /// para onde aponta (fica igual depois de presa)
    pub d: [f64; 3],
    pub life: f64,
    pub stuck: bool,
    stuck_time: f64,
    pub damage: f64,
    /// criatura que atirou (para não se acertar), -1 = o jogador, -2 = esqueleto
    pub shooter: i32,
    /// pode ser recolhida depois de presa (flecha do jogador na sobrevivência)
    pub pickup: bool,
    /// número na rede e quem atirou (0 = o anfitrião, -1 = criatura, outro = o amigo)
    pub id: i32,
    pub owner: i32,
}

/// Flecha presa some depois de um minuto (Arrows.LIFE_STUCK); voando, depois de 30 s.
const LIFE_STUCK: f64 = 60.0;

impl Arrow {
    pub fn new(p: [f64; 3], v: [f64; 3], damage: f64, shooter: i32, pickup: bool) -> Arrow {
        let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt().max(1e-6);
        Arrow { p, v, d: [v[0] / l, v[1] / l, v[2] / l], life: 30.0, stuck: false, stuck_time: 0.0, damage, shooter, pickup, id: 0, owner: 0 }
    }
}

fn is_meat(id: i32) -> bool {
    matches!(id, 206 | 207 | 241 | 242 | 243 | 244 | 245 | 246 | 208 | 209)
}

impl Game {
    fn next_mob_id(&mut self) -> i32 {
        let id = self.mob_id;
        self.mob_id += 1;
        id
    }

    pub fn add_mob(&mut self, t: usize, x: f64, y: f64, z: f64) -> Option<usize> {
        let id = self.next_mob_id();
        let m = Mob::new(t, x, y, z, id, &mut self.rng);
        if m.body.collides(&Loaded(&self.chunks)) {
            return None;
        }
        self.mobs.push(m);
        Some(self.mobs.len() - 1)
    }

    /// Criaturas salvas: as dos pedaços já carregados entram; as outras esperam o pedaço delas carregar.
    pub fn load_mobs(&mut self, saved: &[String], wolves: &[String]) {
        for s in saved {
            if let Some(m) = Mob::load(s, &mut self.rng) {
                self.mob_id = self.mob_id.max(m.id + 1);
                let k = ((m.body.x.floor() as i32) >> 4, (m.body.z.floor() as i32) >> 4);
                self.sleeping.entry(k).or_default().push(s.clone());
            }
        }
        // lobos domesticados voltam onde estavam: "x;y;z;sentado;vida;dono"
        for s in wolves {
            let p: Vec<&str> = s.splitn(6, ';').collect();
            if p.len() < 6 {
                continue;
            }
            let f = |i: usize| p[i].trim().parse::<f64>().unwrap_or(0.0);
            let id = self.next_mob_id();
            let mut m = Mob::new(mob::WOLF, f(0), f(1), f(2), id, &mut self.rng);
            m.tamed = true;
            m.sitting = p[3] == "1";
            m.health = f(4).clamp(1.0, mob::TAMED_HP);
            m.owner_name = p[5].to_string();
            self.mobs.push(m);
        }
    }

    pub fn save_mobs(&self) -> (Vec<String>, Vec<String>) {
        let mut out: Vec<String> = self.mobs.iter().filter(|m| !m.tamed && m.health > 0.0 && !m.exploding).map(|m| m.save()).collect();
        for l in self.sleeping.values() {
            out.extend(l.iter().cloned());
        }
        let wolves = self
            .mobs
            .iter()
            .filter(|m| m.t == mob::WOLF && m.tamed && m.health > 0.0)
            .map(|m| format!("{:.2};{:.2};{:.2};{};{:.1};{}", m.body.x, m.body.y, m.body.z, m.sitting as i32, m.health, m.owner_name))
            .collect();
        (out, wolves)
    }

    pub fn daylight(&self) -> f64 {
        let a = self.time / crate::save::DAY_LENGTH * std::f64::consts::TAU;
        ((a.sin() + 0.12) / 0.4).clamp(0.0, 1.0)
    }

    fn loaded_at(&self, x: f64, z: f64) -> bool {
        self.chunks.contains_key(&((x.floor() as i32) >> 4, (z.floor() as i32) >> 4))
    }

    /// Dá para ver de um ponto ao outro sem um bloco sólido no caminho? (plantas, tochas e líquidos não tapam)
    fn line_of_sight(&self, a: [f64; 3], b: [f64; 3]) -> bool {
        let d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        let steps = ((d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt() / 0.25).ceil() as i32;
        (1..steps).all(|i| {
            let t = i as f64 / steps as f64;
            !block::solid(self.get((a[0] + d[0] * t).floor() as i32, (a[1] + d[1] * t).floor() as i32, (a[2] + d[2] * t).floor() as i32))
        })
    }

    pub fn update_mobs(&mut self, dt: f64) {
        if self.is_client() {
            // no mundo de outro, as criaturas vêm do anfitrião (MOBS); aqui só as pernas e o susto
            for m in self.mobs.iter_mut() {
                m.hurt = (m.hurt - dt).max(0.0);
            }
            self.update_arrows(dt);
            return;
        }
        // acorda as criaturas dos pedaços que carregaram
        let awake: Vec<(i32, i32)> = self.sleeping.keys().filter(|k| self.chunks.contains_key(k)).cloned().collect();
        for k in awake {
            for s in self.sleeping.remove(&k).unwrap_or_default() {
                if let Some(m) = Mob::load(&s, &mut self.rng) {
                    if !self.mobs.iter().any(|o| o.id == m.id) {
                        self.mobs.push(m);
                    }
                }
            }
        }
        let daylight = self.daylight();
        let p = [self.player.x, self.player.y, self.player.z];
        // todos os jogadores do mundo: este e, no anfitrião, os amigos (cada criatura olha o mais perto, como no Java)
        let mut players: Vec<(Option<usize>, [f64; 3], bool, String)> = vec![(None, p, self.health > 0.0, self.player_name.clone())];
        if let Some(n) = &self.net {
            if n.is_host() {
                for r in n.remotes.values().filter(|r| r.has_state) {
                    if let Some(c) = r.conn {
                        players.push((Some(c), r.pos, true, r.name.clone()));
                    }
                }
            }
        }
        let mut mobs = std::mem::take(&mut self.mobs);
        let mut explosions = Vec::new();
        let mut shots: Vec<([f64; 3], [f64; 3])> = Vec::new();
        let mut player_hits: Vec<(Option<usize>, f64, f64, f64)> = Vec::new();
        let mut i = 0;
        while i < mobs.len() {
            if !self.loaded_at(mobs[i].body.x, mobs[i].body.z) {
                let m = &mobs[i];
                if m.tamed {
                    i += 1;
                    continue; // o lobo do jogador espera onde está
                }
                if m.persistent() && m.health > 0.0 {
                    let k = ((m.body.x.floor() as i32) >> 4, (m.body.z.floor() as i32) >> 4);
                    self.sleeping.entry(k).or_default().push(m.save());
                }
                mobs.swap_remove(i);
                continue;
            }
            let (who, tp, alive) = {
                let (mx, mz) = (mobs[i].body.x, mobs[i].body.z);
                let d = |q: &[f64; 3]| (q[0] - mx).powi(2) + (q[2] - mz).powi(2);
                let n = players.iter().min_by(|a, b| d(&a.1).total_cmp(&d(&b.1))).unwrap();
                (n.0, n.1, n.2)
            };
            let survival = !self.creative && alive;
            // o lobo segue o dono, se ele estiver no mundo (aqui ou um amigo)
            let owner = if mobs[i].tamed { players.iter().find(|q| q.3 == mobs[i].owner_name).map(|q| q.1) } else { None };
            // alvos: lobo domesticado (monstros perto do dono), tubarão (peixes, narval), narval (tubarão)
            if mobs[i].tamed && !mobs[i].sitting {
                choose_wolf_target(&mut mobs, i, owner.unwrap_or(p));
            }
            if mobs[i].t == mob::SHARK || mobs[i].t == mob::NARWHAL {
                choose_sea_target(&mut mobs, i);
            }
            let target = mobs[i].target.and_then(|id| mobs.iter().find(|o| o.id == id && o.health > 0.0)).map(|t| ([t.body.x, t.body.y, t.body.z], t.body.hw, t.small_fish()));
            if target.is_none() {
                mobs[i].target = None;
            }
            let los = mobs[i].t == mob::SKELETON && {
                let m = &mobs[i];
                self.line_of_sight([m.body.x, m.body.y + 1.5, m.body.z], [tp[0], tp[1] + 1.1, tp[2]])
            };
            {
                let w = Loaded(&self.chunks);
                let sight = Sight { w: &w, p: tp, can_target: survival, owner, target, line_of_sight: los };
                let mut rng = std::mem::replace(&mut self.rng, crate::survival::Rng::new());
                let fuse0 = mobs[i].fuse;
                mobs[i].update(dt, &sight, &mut rng);
                self.rng = rng;
                let m = &mut mobs[i];
                let at = [m.body.x, m.body.y + 1.0, m.body.z];
                if fuse0 <= 0.0 && m.fuse > 0.0 {
                    self.sfx("pavio", at, 0.9);
                }
                m.idle_sound -= dt;
                if m.idle_sound <= 0.0 {
                    m.idle_sound = 6.0 + self.rng.next() * 10.0;
                    if let Some(v) = mob::voice(m.t) {
                        self.sfx(v, at, 0.65);
                    }
                }
            }
            // mordida do lobo domesticado, do tubarão ou chifrada do narval
            if mobs[i].wants_bite {
                if let Some(tid) = mobs[i].target {
                    if let Some(j) = mobs.iter().position(|o| o.id == tid) {
                        let (mt, mid, dmg, mx, mz) = (mobs[i].t, mobs[i].id, mobs[i].attack_damage(), mobs[i].body.x, mobs[i].body.z);
                        let eat = mt == mob::SHARK && mobs[j].small_fish();
                        if (mt == mob::NARWHAL || mt == mob::SHARK) && (mobs[j].t == mob::NARWHAL || mobs[j].t == mob::SHARK) {
                            mobs[j].target = Some(mid); // tubarão e narval revidam
                        }
                        mobs[j].damage(if mt == mob::WOLF { 4.0 } else if eat { 10.0 } else { dmg });
                        if eat {
                            mobs[i].health = (mobs[i].health + 3.0).min(mob::info(mt).hp);
                        }
                        let t = &mut mobs[j];
                        let (kx, kz) = (t.body.x - mx, t.body.z - mz);
                        let kl = (kx * kx + kz * kz).sqrt().max(0.01);
                        t.body.vx += kx / kl * 6.0;
                        t.body.vz += kz / kl * 6.0;
                        t.body.vy = 4.0;
                        let at = [t.body.x, t.body.y + 0.8, t.body.z];
                        self.sfx("criatura_dano", at, 0.8);
                        if mt == mob::SHARK {
                            self.blood([at[0], at[1] - 0.5, at[2]]);
                        }
                        let t = &mut mobs[j];
                        if t.health <= 0.0 {
                            if !eat {
                                // o que os lobos derrubam deixa o que tinha
                                let (pos, loot) = ([t.body.x, t.body.y + 0.4, t.body.z], t.drops(&mut self.rng));
                                for (id, n) in loot {
                                    self.spawn_drop(Stack::new(id, n, 0), pos, [0.0, 3.0, 0.0], 0.5);
                                }
                            }
                            mobs[i].target = None;
                        }
                    }
                }
            }
            let m = &mobs[i];
            if m.exploding {
                explosions.push([m.body.x, m.body.y + 0.8, m.body.z]);
                mobs.swap_remove(i);
                continue;
            }
            if m.wants_shoot {
                shots.push(([m.body.x, m.body.y, m.body.z], tp));
            }
            if m.wants_attack {
                player_hits.push((who, m.attack_damage(), m.body.x, m.body.z));
                if let Some(v) = mob::voice(m.t) {
                    self.sfx(v, [m.body.x, m.body.y + 1.0, m.body.z], 0.9);
                }
            }
            let (dx, dz) = (m.body.x - tp[0], m.body.z - tp[2]);
            let dist = (dx * dx + dz * dz).sqrt();
            // monstros queimam/somem sob o sol
            let mut gone = false;
            if m.hostile() && m.t != mob::CREEPER && daylight > 0.75 && self.sky_light(m.body.x.floor() as i32, (m.body.y + 1.0).floor() as i32, m.body.z.floor() as i32) >= 14 {
                mobs[i].burn += dt;
                gone = mobs[i].burn > 4.0;
            }
            let m = &mobs[i];
            if gone || m.health <= 0.0 || (dist > 100.0 && !m.tamed && !m.persistent()) || m.body.y < -10.0 {
                mobs.swap_remove(i);
                continue;
            }
            i += 1;
        }
        self.mobs = mobs;
        // golpes no jogador (com o empurrão, como no Java)
        for (who, dmg, fx, fz) in player_hits {
            if let Some(c) = who {
                // golpe num amigo: avisa só ele (o empurrão e a vida são calculados lá)
                if let Some(n) = &self.net {
                    n.send_to(c, crate::net::Out::new(crate::net::DAMAGE).f(dmg).f(fx).f(fz));
                }
                continue;
            }
            if self.creative || self.health <= 0.0 {
                continue;
            }
            self.hit(dmg);
            let (kx, kz) = (self.player.x - fx, self.player.z - fz);
            let kl = (kx * kx + kz * kz).sqrt().max(0.01);
            self.player.vx += kx / kl * 8.0;
            self.player.vz += kz / kl * 8.0;
            self.player.vy = 5.0;
        }
        for e in explosions {
            self.explode_at(e, mob::CREEPER_POWER);
        }
        for (s, at) in shots {
            self.shoot_arrow(s, at);
        }
        self.update_arrows(dt);

        // aparecimento, a cada 0,8 s
        self.mob_spawn_timer -= dt;
        if self.mob_spawn_timer > 0.0 {
            return;
        }
        self.mob_spawn_timer = 0.8;
        let (mut passive, mut hostile, mut fish, mut birds, mut sharks) = (0, 0, 0, 0, 0);
        for m in self.mobs.iter().filter(|m| !m.tamed) {
            if m.t == mob::SHARK {
                sharks += 1;
            }
            if m.swimmer() {
                fish += 1;
            } else if m.t == mob::BIRD {
                birds += 1;
            } else if m.hostile() {
                hostile += 1;
            } else {
                passive += 1;
            }
        }
        // aparecem em volta de um jogador qualquer (no anfitrião, os amigos contam), com limites por jogador
        let n = players.len() as i32;
        let pick = players[self.int(n) as usize].1;
        self.spawn_near = [pick[0], pick[2]];
        if passive < 14 * n && self.rng.next() < 0.45 {
            self.spawn_passive();
        }
        if fish < 12 * n && self.rng.next() < 0.5 {
            self.spawn_fish(sharks < n);
        }
        if birds < 8 * n && daylight > 0.3 && self.rng.next() < 0.3 {
            self.spawn_birds();
        }
        if hostile < 10 * n {
            self.spawn_hostile(daylight);
        }
    }

    pub fn int(&mut self, n: i32) -> i32 {
        (self.rng.next() * n as f64) as i32
    }

    fn around(&mut self, min: f64, span: f64) -> (i32, i32, f64) {
        let a = self.rng.next() * std::f64::consts::TAU;
        let r = min + self.rng.next() * span;
        ((self.spawn_near[0] + a.sin() * r) as i32, (self.spawn_near[1] + a.cos() * r) as i32, r)
    }

    /// Y do chão de terra firme (grama, neve ou areia) se for o topo da coluna, senão -1.
    fn grass_top(&self, x: i32, z: i32) -> i32 {
        for y in (0..SY).rev() {
            let b = self.get(x, y, z);
            if b == block::AIR || block::shape(b) == block::CROSS {
                continue;
            }
            return if (b == block::GRASS || b == block::SNOW || b == block::SAND) && y >= SEA { y } else { -1 };
        }
        -1
    }

    /// Animais: cada bioma tem os seus (Mobs.spawnPassive do Java).
    fn spawn_passive(&mut self) {
        let (x, z, _) = self.around(24.0, 30.0);
        if !self.loaded_at(x as f64, z as f64) {
            return;
        }
        let top = self.grass_top(x, z);
        if top < 0 {
            return;
        }
        let ground = self.get(x, top, z);
        let biome = self.gen.biome_at(x, z, top);
        use crate::world::*;
        let desert = ground == block::SAND && biome == DESERT;
        if ground != block::GRASS && !(ground == block::SNOW && biome == TUNDRA) && !desert {
            return;
        }
        let berg = biome == TUNDRA && self.gen.height_at(x, z) < SEA;
        use mob::*;
        let pool: &[usize] = if desert {
            &[SCORPION, SCORPION, SCORPION, RABBIT, EMPEROR]
        } else if biome == FOREST || biome == BIRCH_FOREST {
            &[DEER, DEER, FOX, RABBIT, WOLF, PIG, COW, BEAR, TIGER]
        } else if berg {
            &[PENGUIN, PENGUIN, PENGUIN, POLAR_BEAR, POLAR_BEAR]
        } else if biome == TUNDRA {
            &[WOLF, FOX, RABBIT, BEAR, DEER, WHITE_TIGER, POLAR_BEAR, PENGUIN, PENGUIN, MUSKOX, MUSKOX]
        } else if biome == MOUNTAINS {
            &[SHEEP, SHEEP, RABBIT, WOLF]
        } else {
            &[PIG, SHEEP, CHICKEN, COW, PIG, SHEEP, CHICKEN, COW, RABBIT, FOX, DEER, CAT]
        };
        let mut t = pool[self.int(pool.len() as i32) as usize];
        if (t == BEAR || t == TIGER || t == WHITE_TIGER) && self.rng.next() < 0.5 {
            t = DEER; // urso e tigre são raros
        }
        if t == POLAR_BEAR && self.rng.next() < 0.5 {
            t = PENGUIN;
        }
        if t == EMPEROR && self.rng.next() < 0.85 {
            t = SCORPION; // o imperador é bem raro
        }
        let n = if matches!(t, BEAR | POLAR_BEAR | TIGER | WHITE_TIGER | EMPEROR | CAT | FOX) {
            1
        } else if t == WOLF || t == MUSKOX {
            2 + self.int(2)
        } else if t == PENGUIN {
            2 + self.int(3)
        } else {
            1 + self.int(3)
        };
        for _ in 0..n {
            let (mx, mz) = (x as f64 + 0.5 + self.rng.next() * 2.0 - 1.0, z as f64 + 0.5 + self.rng.next() * 2.0 - 1.0);
            self.add_mob(t, mx, top as f64 + 1.01, mz);
        }
    }

    /// Peixes: num ponto de água funda perto do jogador; tubarão em água bem funda; narvais no mar gelado.
    fn spawn_fish(&mut self, shark_allowed: bool) {
        for _ in 0..6 {
            let (x, z, r) = self.around(8.0, 26.0);
            if !self.loaded_at(x as f64, z as f64) {
                continue;
            }
            for y in (3..SEA).rev() {
                if !block::is_water(self.get(x, y, z)) {
                    continue;
                }
                if !block::is_water(self.get(x, y - 1, z)) {
                    break; // raso demais
                }
                let mut depth = 0;
                while depth < 12 && block::is_water(self.get(x, y - depth, z)) {
                    depth += 1;
                }
                if shark_allowed && depth >= 6 && r > 16.0 && self.rng.next() < 0.12 {
                    self.add_mob(mob::SHARK, x as f64 + 0.5, y as f64 - depth as f64 / 2.0, z as f64 + 0.5);
                    return;
                }
                let biome = self.gen.biome_at(x, z, self.gen.height_at(x, z) - 1);
                use crate::world::*;
                let cold = biome == TUNDRA || biome == ICE_FIELD;
                if cold && depth >= 5 && r > 14.0 && self.rng.next() < if biome == ICE_FIELD { 0.3 } else { 0.18 } {
                    let nn = 1 + self.int(2);
                    for k in 0..nn {
                        self.add_mob(mob::NARWHAL, x as f64 + 0.5 + k as f64 * 1.5, y as f64 - depth as f64 / 2.0, z as f64 + 0.5);
                    }
                    return;
                }
                let roll = self.rng.next();
                let t = if biome == DESERT || (biome == PLAINS && roll < 0.35) {
                    mob::TROPICAL
                } else if (cold || biome == FOREST || biome == MOUNTAINS) && roll < 0.5 {
                    mob::SALMON
                } else {
                    mob::FISH
                };
                let n = 1 + self.int(3);
                for _ in 0..n {
                    let (fx, fz) = (x as f64 + 0.5 + (self.rng.next() - 0.5), z as f64 + 0.5 + (self.rng.next() - 0.5));
                    if !block::is_water(self.get(fx.floor() as i32, y - 1, fz.floor() as i32)) {
                        continue;
                    }
                    self.add_mob(t, fx, y as f64 - 0.7, fz);
                }
                return;
            }
        }
    }

    /// Bando de pássaros voando um pouco acima das árvores (menos no deserto).
    fn spawn_birds(&mut self) {
        let (x, z, _) = self.around(20.0, 25.0);
        if !self.loaded_at(x as f64, z as f64) {
            return;
        }
        let top = self.gen.height_at(x, z);
        if self.gen.biome_at(x, z, top - 1) == crate::world::DESERT || top < SEA {
            return;
        }
        let n = 2 + self.int(3);
        let y = ((SY + 2) as f64).min(top as f64 + 8.0 + self.rng.next() * 6.0);
        for _ in 0..n {
            let (bx, by, bz) = (x as f64 + self.rng.next() * 3.0, y + self.rng.next(), z as f64 + self.rng.next() * 3.0);
            if let Some(i) = self.add_mob(mob::BIRD, bx, by, bz) {
                self.mobs[i].flying = true;
            }
        }
    }

    /// Monstros: num lugar escuro com chão firme e duas células livres.
    fn spawn_hostile(&mut self, daylight: f64) {
        for _ in 0..4 {
            let (x, z, _) = self.around(18.0, 24.0);
            if !self.loaded_at(x as f64, z as f64) {
                continue;
            }
            let mut y = 2 + self.int(SY - 4);
            let mut k = 0;
            while k < 12 && y > 1 {
                let ok = block::solid(self.get(x, y - 1, z)) && !block::solid(self.get(x, y, z)) && !block::solid(self.get(x, y + 1, z));
                let wet = block::is_water(self.get(x, y, z)) || self.get(x, y, z) == LAVA;
                if ok && !wet {
                    let light = (self.sky_light(x, y, z) as f64 / 15.0 * daylight).max(self.block_light(x, y, z) as f64 / 15.0);
                    if light <= 0.3 {
                        let roll = self.rng.next();
                        let t = if roll < 0.38 {
                            mob::ZOMBIE
                        } else if roll < 0.62 {
                            mob::SKELETON
                        } else if roll < 0.82 {
                            mob::SPIDER
                        } else {
                            mob::CREEPER
                        };
                        if self.add_mob(t, x as f64 + 0.5, y as f64 + 0.01, z as f64 + 0.5).is_some() {
                            return;
                        }
                    }
                }
                k += 1;
                y -= 1;
            }
        }
    }

    // ------------------------------------------------------------------ explosão e flechas
    /// Explosão (World.explode + BlockGame.explodeAt do Java): quebra os blocos em volta, espalha o que havia em
    /// baús e fornalhas, machuca e empurra criaturas e o jogador.
    pub fn explode_at(&mut self, c: [f64; 3], power: f64) {
        self.sfx("explosao", c, 1.0);
        self.explosion_bits(c, power);
        let rad = power.ceil() as i32;
        let (bx, by, bz) = (c[0].floor() as i32, c[1].floor() as i32, c[2].floor() as i32);
        let mut gone = Vec::new();
        for dx in -rad..=rad {
            for dy in -rad..=rad {
                for dz in -rad..=rad {
                    let (x, y, z) = (bx + dx, by + dy, bz + dz);
                    if !(0..SY).contains(&y) || !self.chunks.contains_key(&(x >> 4, z >> 4)) {
                        continue;
                    }
                    let b = self.get(x, y, z);
                    if b == block::AIR || block::shape(b) == block::LIQUID {
                        continue;
                    }
                    let hard = block::info(b).hardness;
                    if hard < 0.0 {
                        continue;
                    }
                    let dist = ((dx * dx + dy * dy + dz * dz) as f64).sqrt();
                    if dist + hard * 0.3 + self.rng.next() * 0.9 > power {
                        continue;
                    }
                    gone.push((x, y, z, b));
                }
            }
        }
        for &(x, y, z, b) in &gone {
            self.set(x, y, z, block::AIR, 0);
            if b == crate::tools::TNT {
                let s = 0.25 + self.rng.next() * 0.5;
                self.prime(x, y, z, s, false); // reação em cadeia
            } else if b == block::CHEST || b == block::FURNACE || b == block::FURNACE_LIT {
                self.spill_container(x, y, z, b);
            } else if !self.creative && self.rng.next() < 0.3 {
                let d = block::info(b).drop;
                if d != 0 {
                    self.drop_at_block(d, x, y, z);
                }
            }
        }
        for m in self.mobs.iter_mut() {
            let (dx, dy, dz) = (m.body.x - c[0], m.body.y + m.body.h / 2.0 - c[1], m.body.z - c[2]);
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            if dist > power * 2.0 {
                continue;
            }
            let k = 1.0 - dist / (power * 2.0);
            m.damage(k * power * 5.0);
            let l = dist.max(0.3);
            m.body.vx += dx / l * k * 10.0;
            m.body.vz += dz / l * k * 10.0;
            m.body.vy += 4.0 + k * 5.0;
        }
        if let Some(n) = &self.net {
            if n.is_host() {
                n.send(crate::net::Out::new(crate::net::EXPLODE).f(c[0]).f(c[1]).f(c[2]).f(power), None);
            }
        }
        self.blast_player(c, power);
    }

    /// Dano e empurrão da explosão no jogador desta tela, e o clarão.
    fn blast_player(&mut self, c: [f64; 3], power: f64) {
        let (dx, dy, dz) = (self.player.x - c[0], self.player.y + 0.9 - c[1], self.player.z - c[2]);
        let dist = (dx * dx + dy * dy + dz * dz).sqrt();
        if dist <= power * 2.0 && !self.creative && self.health > 0.0 {
            let k = 1.0 - dist / (power * 2.0);
            self.hit((k * power * 5.0).floor());
            let l = dist.max(0.3);
            self.player.vx += dx / l * k * 12.0;
            self.player.vz += dz / l * k * 12.0;
            self.player.vy += 4.0 + k * 5.0;
        }
        self.blast_flash = 0.35;
    }

    /// Explosão que aconteceu no mundo do anfitrião: som, fumaça e o dano aqui.
    pub fn blast_effects(&mut self, c: [f64; 3], power: f64) {
        self.sfx("explosao", c, 1.0);
        self.explosion_bits(c, power);
        self.blast_player(c, power);
    }

    /// Flecha do esqueleto (em m) para o jogador mais perto (em `at`): arco calculado para a distância, com um pouco de erro.
    fn shoot_arrow(&mut self, m: [f64; 3], at: [f64; 3]) {
        let s = [m[0], m[1] + 1.45, m[2]];
        let (dx, dy, dz) = (at[0] - s[0], at[1] + 1.0 - s[1], at[2] - s[2]);
        let flat = (dx * dx + dz * dz).sqrt().max(0.5);
        let t = flat / ARROW_SPEED;
        let e = 0.07;
        let vx = dx / t * (1.0 + (self.rng.next() - 0.5) * e);
        let vz = dz / t * (1.0 + (self.rng.next() - 0.5) * e);
        let vy = (dy / t + 0.5 * ARROW_GRAVITY * t) * (1.0 + (self.rng.next() - 0.5) * e) + 0.4;
        self.spawn_arrow(Arrow::new([s[0] + dx / flat * 0.45, s[1], s[2] + dz / flat * 0.45], [vx, vy, vz], ARROW_DAMAGE, -2, false), -1);
    }

    /// Flechas (Arrows.update + BlockGame.arrowHit): gravidade, mais freio na água, acertam criaturas e o jogador,
    /// prendem nos blocos (e caem de novo se o bloco sumir); as do jogador podem ser recolhidas.
    fn update_arrows(&mut self, dt: f64) {
        let mut arrows = std::mem::take(&mut self.arrows);
        let mut mobs = std::mem::take(&mut self.mobs);
        let e = self.eye();
        let (ear, yaw) = ([e[0] as f64, e[1] as f64, e[2] as f64], self.player.yaw);
        let client = self.is_client();
        let can_take = !self.creative && self.health > 0.0 && self.inv.fits(crate::tools::ARROW) && !client;
        let mut stuck_now: Vec<usize> = Vec::new();
        let mut gone: Vec<(i32, i32, [f64; 3])> = Vec::new();
        let (px, py, pz) = (self.player.x, self.player.y, self.player.z);
        let mut killed: Vec<i32> = Vec::new();
        let mut hits: Vec<[f64; 3]> = Vec::new();
        let mut picked = 0;
        // amigos que uma flecha pode acertar (só no anfitrião, e nunca o próprio atirador)
        let friends: Vec<(usize, i32, [f64; 3])> = match &self.net {
            Some(n) if n.is_host() && !self.creative => n.remotes.values().filter(|r| r.has_state).filter_map(|r| r.conn.map(|c| (c, r.id, r.pos))).collect(),
            _ => Vec::new(),
        };
        let mut friend_hits: Vec<(usize, f64, f64, f64)> = Vec::new();
        let mut idx = 0usize;
        arrows.retain_mut(|a| {
            let my = idx;
            idx += 1;
            a.life -= dt;
            if a.life <= 0.0 || a.p[1] < -20.0 {
                gone.push((a.id, 0, a.p));
                return false;
            }
            let w = Loaded(&self.chunks);
            if a.stuck {
                a.stuck_time += dt;
                let tip = [a.p[0] + a.d[0] * 0.08, a.p[1] + a.d[1] * 0.08, a.p[2] + a.d[2] * 0.08];
                if !block::solid(w.get(tip[0].floor() as i32, tip[1].floor() as i32, tip[2].floor() as i32)) {
                    a.stuck = false; // o bloco sumiu: a flecha cai de novo
                    a.v = [0.0; 3];
                } else {
                    let near = (a.p[0] - px).abs() < 1.0 && (a.p[2] - pz).abs() < 1.0 && a.p[1] > py - 0.5 && a.p[1] < py + 2.3;
                    if a.pickup && can_take && a.stuck_time > 0.4 && near {
                        picked += 1;
                        gone.push((a.id, 0, a.p));
                        return false;
                    }
                    return true;
                }
            }
            let water = block::is_water(w.get(a.p[0].floor() as i32, a.p[1].floor() as i32, a.p[2].floor() as i32));
            a.v[1] -= ARROW_GRAVITY * dt;
            let drag = (1.0 - if water { 3.0 } else { 0.25 } * dt).max(0.0);
            for k in 0..3 {
                a.v[k] *= drag;
            }
            let speed = (a.v[0] * a.v[0] + a.v[1] * a.v[1] + a.v[2] * a.v[2]).sqrt();
            let len = speed * dt;
            if len < 1e-7 {
                return true;
            }
            if speed > 0.5 {
                a.d = [a.v[0] / speed, a.v[1] / speed, a.v[2] / speed];
            }
            let steps = (len / 0.2).ceil().max(1.0) as i32;
            for _ in 0..steps {
                for k in 0..3 {
                    a.p[k] += a.v[k] * dt / steps as f64;
                }
                // criaturas (nunca quem atirou); no mundo de outro, quem decide os acertos é o anfitrião
                for m in mobs.iter_mut().filter(|_| !client) {
                    if m.id == a.shooter || m.health <= 0.0 {
                        continue;
                    }
                    let b = &m.body;
                    if (a.p[0] - b.x).abs() < b.hw + 0.05 && (a.p[2] - b.z).abs() < b.hw + 0.05 && a.p[1] > b.y && a.p[1] < b.y + b.h {
                        m.damage(a.damage);
                        m.body.vx += a.d[0] * 5.0;
                        m.body.vz += a.d[2] * 5.0;
                        m.body.vy = m.body.vy.max(3.5);
                        crate::sound::play_at("flecha_criatura", a.p, ear, yaw, 0.9);
                        hits.push(a.p);
                        if let Some(v) = mob::voice(m.t) {
                            crate::sound::play_at(v, [m.body.x, m.body.y + 0.8, m.body.z], ear, yaw, 0.6);
                        }
                        if m.health <= 0.0 {
                            killed.push(m.id);
                        }
                        gone.push((a.id, 1, a.p));
                        return false;
                    }
                }
                let hb = w.get(a.p[0].floor() as i32, a.p[1].floor() as i32, a.p[2].floor() as i32);
                if block::solid(hb) {
                    let hard = block::info(hb).material == block::M_ROCK || hb == 18 || hb == 131;
                    crate::sound::play_at(if hard { "flecha_pedra" } else { "flecha_madeira" }, a.p, ear, yaw, 0.7);
                    a.stuck = true;
                    a.stuck_time = 0.0;
                    a.v = [0.0; 3];
                    a.life = if a.pickup { LIFE_STUCK } else { a.life.min(5.0) };
                    if client {
                        a.life = 90.0; // o anfitrião avisa quando some
                    }
                    stuck_now.push(my);
                    return true;
                }
                // o jogador (só flechas que não são dele)
                let pl = &self.player;
                let inside = (a.p[0] - pl.x).abs() < pl.hw + 0.1 && a.p[1] > pl.y && a.p[1] < pl.y + pl.h && (a.p[2] - pl.z).abs() < pl.hw + 0.1;
                if a.owner != 0 && !client && inside && !self.creative && self.health > 0.0 {
                    self.pending_damage += a.damage;
                    gone.push((a.id, 1, a.p));
                    crate::sound::play_at("flecha_criatura", a.p, ear, yaw, 0.9);
                    return false;
                }
                // um amigo (o dano vai para ele, com o empurrão vindo de trás da flecha)
                if let Some(f) = friends.iter().find(|f| f.1 != a.owner && (a.p[0] - f.2[0]).abs() < 0.4 && (a.p[2] - f.2[2]).abs() < 0.4 && a.p[1] > f.2[1] && a.p[1] < f.2[1] + 1.8) {
                    friend_hits.push((f.0, a.damage, a.p[0] - a.d[0] * 2.0, a.p[2] - a.d[2] * 2.0));
                    gone.push((a.id, 1, a.p));
                    crate::sound::play_at("flecha_criatura", a.p, ear, yaw, 0.9);
                    hits.push(a.p);
                    return false;
                }
            }
            true
        });
        // anfitrião: avisa os amigos das flechas que prenderam e das que sumiram
        if let Some(n) = &self.net {
            for (c, dmg, x, z) in &friend_hits {
                n.send_to(*c, crate::net::Out::new(crate::net::DAMAGE).f(*dmg).f(*x).f(*z));
            }
            if n.is_host() {
                for (id, kind, p) in &gone {
                    n.send(crate::net::Out::new(crate::net::ARROW_GONE).i(*id).i(*kind).f(p[0]).f(p[1]).f(p[2]), None);
                }
            }
        }
        let _ = stuck_now;
        for a in arrows.iter().filter(|a| a.stuck && a.stuck_time == 0.0) {
            if let Some(n) = &self.net {
                if n.is_host() {
                    n.send(crate::net::stuck_packet(a), None);
                }
            }
        }
        self.arrows = arrows;
        for p in hits {
            self.hit_bits(p, 0xB02020, 10);
        }
        // o que a criatura abatida solta fica onde ela caiu
        for id in killed {
            if let Some(m) = mobs.iter().find(|m| m.id == id) {
                let pos = [m.body.x, m.body.y + 0.4, m.body.z];
                for (item, n) in m.drops(&mut self.rng) {
                    self.spawn_drop(Stack::new(item, n, 0), pos, [0.0, 3.0, 0.0], 0.5);
                }
            }
        }
        self.mobs = mobs;
        if picked > 0 {
            self.inv.add(crate::tools::ARROW, picked, 0);
            crate::sound::play("coletar", 0.7);
        }
        if self.pending_damage > 0.0 {
            let d = std::mem::take(&mut self.pending_damage);
            self.hit(d);
        }
    }

    // ------------------------------------------------------------------ o jogador e as criaturas
    /// A criatura na mira (mais perto que `reach`), como o Mobs.raycast do Java.
    pub fn aimed_mob(&self, reach: f64) -> Option<usize> {
        let e = self.eye();
        let f = self.forward();
        let (o, d) = ([e[0] as f64, e[1] as f64, e[2] as f64], [f[0] as f64, f[1] as f64, f[2] as f64]);
        let mut best = None;
        let mut bt = reach;
        for (i, m) in self.mobs.iter().enumerate() {
            if let Some(t) = m.ray_hit(o, d) {
                if t < bt {
                    bt = t;
                    best = Some(i);
                }
            }
        }
        best
    }

    /// Bater na criatura (dano da ferramenta, empurrão; se morrer, solta o que tinha).
    pub fn hit_mob(&mut self, i: usize) {
        let held = self.inv.s[self.slot].id;
        let dmg = crate::items::damage(held);
        let (px, pz) = (self.player.x, self.player.z);
        if self.mobs[i].hurt > 0.0 {
            return;
        }
        let (kx, kz) = (self.mobs[i].body.x - px, self.mobs[i].body.z - pz);
        let kl = (kx * kx + kz * kz).sqrt().max(0.01);
        if self.is_client() {
            // no mundo de outro, quem calcula o golpe é o anfitrião
            let m = &mut self.mobs[i];
            m.hurt = 0.35;
            let (id, at) = (m.id, [m.body.x, m.body.y + 0.8, m.body.z]);
            if let Some(n) = &self.net {
                n.send(crate::net::Out::new(crate::net::HIT_MOB).i(id).f(dmg).f(kx / kl).f(kz / kl), None);
            }
            self.sfx("criatura_dano", at, 0.9);
        } else {
            self.damage_mob(i, dmg, [kx / kl, kz / kl]);
        }
        if !self.creative && self.inv.use_tool(self.slot) {
            self.notice("Sua ferramenta quebrou!".into());
        }
    }

    /// Golpe numa criatura (do jogador ou de um amigo da LAN): dano, empurrão e, se morrer, o que ela solta.
    pub fn damage_mob(&mut self, i: usize, dmg: f64, k: [f64; 2]) {
        let m = &mut self.mobs[i];
        if m.hurt > 0.0 {
            return;
        }
        m.damage(dmg);
        let (at, voice) = ([m.body.x, m.body.y + 0.8, m.body.z], mob::voice(m.t));
        self.sfx("criatura_dano", at, 0.9);
        if let Some(v) = voice {
            self.sfx(v, at, 0.6);
        }
        let m = &mut self.mobs[i];
        m.body.vx += k[0] * 7.0;
        m.body.vz += k[1] * 7.0;
        m.body.vy = 5.0;
        if m.health <= 0.0 {
            let pos = [m.body.x, m.body.y + 0.4, m.body.z];
            let loot = m.drops(&mut self.rng);
            for (id, n) in loot {
                let (vx, vz) = ((self.rng.next() - 0.5) * 3.0, (self.rng.next() - 0.5) * 3.0);
                self.spawn_drop(Stack::new(id, n, 0), pos, [vx, 3.5, vz], 0.5);
            }
        }
    }

    /// Botão direito numa criatura: osso doma o lobo (1 chance em 3), carne cura, mão vazia senta/levanta.
    pub fn use_on_mob(&mut self, i: usize) -> bool {
        let held = self.inv.s[self.slot].id;
        if self.mobs[i].t != mob::WOLF {
            return false;
        }
        let eats = (!self.mobs[i].tamed && held == mob::BONE) || (self.mobs[i].tamed && is_meat(held));
        if eats && !self.creative {
            self.inv.take_one(self.slot);
        }
        if self.is_client() {
            // no mundo de outro, o lobo é do anfitrião: ele decide e manda a resposta
            if let Some(n) = &self.net {
                n.send(crate::net::Out::new(crate::net::MOB_USE).i(self.mobs[i].id).i(held), None);
            }
            return true;
        }
        let name = self.player_name.clone();
        if let Some(msg) = self.mob_use(i, held, &name) {
            self.notice(msg);
        }
        true
    }

    /// O que acontece ao usar um item no lobo (do jogador ou de um amigo da LAN). Retorna a mensagem.
    pub fn mob_use(&mut self, i: usize, held: i32, name: &str) -> Option<String> {
        if self.mobs[i].t != mob::WOLF {
            return None;
        }
        let name = name.to_string();
        let roll = self.int(3);
        let m = &self.mobs[i];
        let at = [m.body.x, m.body.y + 0.6, m.body.z];
        if !m.tamed && held == mob::BONE {
            self.sfx(if roll == 0 { "domar" } else { "lobo" }, at, if roll == 0 { 1.0 } else { 0.8 });
        } else if m.tamed && is_meat(held) {
            self.sfx("comer", at, 0.7);
        }
        let m = &mut self.mobs[i];
        let msg = if !m.tamed {
            if held != mob::BONE {
                if m.angry > 0.0 { "O lobo está bravo!" } else { "Lobos gostam de osso..." }.to_string()
            } else if roll == 0 {
                m.tamed = true;
                m.owner_name = name;
                m.sitting = true;
                m.health = mob::TAMED_HP;
                m.angry = 0.0;
                m.target = None;
                "O lobo agora é seu! Clique nele com a mão vazia para ele sentar ou te seguir.".to_string()
            } else {
                "O lobo cheirou o osso... tente de novo".to_string()
            }
        } else if is_meat(held) {
            m.health = (m.health + (crate::items::info(held).map_or(2, |i| i.food).max(2)) as f64).min(mob::TAMED_HP);
            format!("O lobo comeu ({}/{} de vida)", m.health as i32, mob::TAMED_HP as i32)
        } else if m.owner_name != name {
            format!("Esse lobo é de {}", m.owner_name)
        } else {
            m.sitting = !m.sitting;
            m.target = None;
            if m.sitting { "Lobo: senta!" } else { "Lobo: vem comigo!" }.to_string()
        };
        Some(msg)
    }

    /// Ovo de criatura: nasce na célula de frente para o bloco mirado.
    pub fn use_egg(&mut self) -> bool {
        let st = self.inv.s[self.slot];
        let t = st.id - SPAWN_EGG;
        if st.empty() || t < 0 || t >= mob::TYPES as i32 {
            return false;
        }
        let Some(h) = self.aim else { return true };
        let [x, y, z] = h.prev;
        self.sfx(mob::voice(t as usize).unwrap_or("colocar"), [x as f64 + 0.5, y as f64 + 0.5, z as f64 + 0.5], 0.8);
        if self.is_client() {
            let yaw = self.player.yaw + std::f64::consts::PI;
            if let Some(n) = &self.net {
                n.send(crate::net::Out::new(crate::net::MOB_SPAWN).i(t).f(x as f64 + 0.5).f(y as f64 + 0.01).f(z as f64 + 0.5).f(yaw), None);
            }
            if !self.creative {
                self.inv.take_one(self.slot);
            }
            return true;
        }
        if let Some(i) = self.add_mob(t as usize, x as f64 + 0.5, y as f64 + 0.01, z as f64 + 0.5) {
            self.mobs[i].yaw = self.player.yaw + std::f64::consts::PI;
        }
        if !self.creative {
            self.inv.take_one(self.slot);
        }
        true
    }

    /// Desenha as criaturas e as flechas perto da câmera.
    pub fn draw_mobs(&self, ui: &mut crate::ui::Ui, daylight: f32) {
        let e = self.eye();
        let vd = self.settings.view_dist as f32;
        for m in &self.mobs {
            let (dx, dz) = (m.body.x as f32 - e[0], m.body.z as f32 - e[2]);
            if dx * dx + dz * dz > vd * vd {
                continue;
            }
            let (bx, by, bz) = (m.body.x.floor() as i32, (m.body.y + 0.5).floor() as i32, m.body.z.floor() as i32);
            let sky = self.sky_light(bx, by, bz) as f32 / 15.0 * (0.13 + 0.87 * daylight);
            let blk = (self.block_light(bx, by, bz) as f32 / 15.0).powf(1.5);
            m.draw(ui, (sky.max(blk) * 0.95 + 0.05).min(1.0));
        }
        for a in &self.arrows {
            // varetinha na direção em que voa
            let d = [(a.d[0] * 0.35) as f32, (a.d[1] * 0.35) as f32, (a.d[2] * 0.35) as f32];
            // presa: a ponta fica no bloco e o resto para fora
            let back = if a.stuck { 0.3 } else { 0.0 };
            let p = [(a.p[0] - a.d[0] * back) as f32, (a.p[1] - a.d[1] * back) as f32, (a.p[2] - a.d[2] * back) as f32];
            let t = 0.025;
            let col = [0.45, 0.32, 0.18, 1.0];
            ui.solid_quad([[p[0] - d[0], p[1] - d[1] - t, p[2] - d[2]], [p[0] + d[0], p[1] + d[1] - t, p[2] + d[2]], [p[0] + d[0], p[1] + d[1] + t, p[2] + d[2]], [p[0] - d[0], p[1] - d[1] + t, p[2] - d[2]]], col);
            ui.solid_quad([[p[0] - d[0] - t, p[1] - d[1], p[2] - d[2]], [p[0] + d[0] - t, p[1] + d[1], p[2] + d[2]], [p[0] + d[0] + t, p[1] + d[1], p[2] + d[2]], [p[0] - d[0] + t, p[1] - d[1], p[2] - d[2]]], col);
        }
    }
}

/// Lobo domesticado: escolhe o monstro mais perto (até 10 blocos do dono) para atacar.
fn choose_wolf_target(mobs: &mut [Mob], i: usize, owner: [f64; 3]) {
    if let Some(t) = mobs[i].target {
        if mobs.iter().any(|m| m.id == t && m.health > 0.0) {
            return;
        }
        mobs[i].target = None;
    }
    let mut best = None;
    let mut bd = 100.0;
    for m in mobs.iter() {
        if !m.hostile() && !(m.attacks_player() && m.t != mob::SHARK) {
            continue;
        }
        let (dx, dz) = (m.body.x - owner[0], m.body.z - owner[2]);
        let d = dx * dx + dz * dz;
        if d < bd && (m.body.y - owner[1]).abs() < 6.0 {
            bd = d;
            best = Some(m.id);
        }
    }
    mobs[i].target = best;
}

/// Tubarão caça peixes pequenos (e briga com narval); narval ataca tubarões.
fn choose_sea_target(mobs: &mut [Mob], i: usize) {
    let me = (mobs[i].body.x, mobs[i].body.y, mobs[i].body.z, mobs[i].t, mobs[i].id);
    let d2 = |m: &Mob| (m.body.x - me.0).powi(2) + (m.body.y - me.1).powi(2) + (m.body.z - me.2).powi(2);
    if let Some(t) = mobs[i].target {
        match mobs.iter().find(|m| m.id == t) {
            Some(tm) if tm.health > 0.0 && d2(tm) <= 400.0 => {
                if !(me.3 == mob::SHARK && tm.small_fish()) {
                    return; // briga em andamento continua
                }
            }
            _ => mobs[i].target = None,
        }
    }
    let r = if me.3 == mob::SHARK { 10.0 } else { 14.0 };
    let mut bd = r * r;
    let mut best = None;
    for o in mobs.iter() {
        if o.id == me.4 || o.health <= 0.0 {
            continue;
        }
        let foe = if me.3 == mob::NARWHAL { o.t == mob::SHARK } else { o.t == mob::NARWHAL };
        let prey = me.3 == mob::SHARK && o.small_fish();
        if !foe && !prey {
            continue;
        }
        let mut d = d2(o);
        if foe {
            d *= 0.5;
        }
        if d < bd {
            bd = d;
            best = Some(o.id);
        }
    }
    if best.is_some() {
        mobs[i].target = best;
    }
}
