//! Uma criatura, traduzida do Mob.java: animais, pássaros, peixes e monstros. Os desenhos (caixas coloridas que
//! as pernas, asas e caudas movem), tamanhos, vidas e velocidades vêm de dados/bichos.txt, exportado do Java.

use crate::block;
use crate::physics::{Blocks, Player};
use crate::survival::Rng;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const PIG: usize = 0;
pub const SHEEP: usize = 1;
pub const CHICKEN: usize = 2;
pub const ZOMBIE: usize = 3;
pub const SPIDER: usize = 4;
pub const FISH: usize = 5;
pub const COW: usize = 6;
pub const CREEPER: usize = 7;
pub const SKELETON: usize = 8;
pub const WOLF: usize = 9;
pub const FOX: usize = 10;
pub const DEER: usize = 11;
pub const RABBIT: usize = 12;
pub const BEAR: usize = 13;
pub const BIRD: usize = 14;
pub const TROPICAL: usize = 15;
pub const SALMON: usize = 16;
pub const SHARK: usize = 17;
pub const TIGER: usize = 18;
pub const WHITE_TIGER: usize = 19;
pub const CAT: usize = 20;
pub const SCORPION: usize = 21;
pub const EMPEROR: usize = 22;
pub const POLAR_BEAR: usize = 23;
pub const PENGUIN: usize = 24;
pub const MUSKOX: usize = 25;
pub const NARWHAL: usize = 26;
pub const TYPES: usize = 27;

pub const TAMED_HP: f64 = 20.0;
pub const FUSE_TIME: f64 = 1.5;
pub const CREEPER_POWER: f64 = 3.2;
const AIM_TIME: f64 = 1.1;

// itens que as criaturas soltam (ids do Java)
const RAW_MEAT: i32 = 206;
const RAW_FISH: i32 = 208;
const GUNPOWDER: i32 = 210;
const LEATHER: i32 = 240;
const RAW_PORK: i32 = 241;
const RAW_MUTTON: i32 = 243;
const RAW_CHICKEN: i32 = 245;
const STRING: i32 = 247;
const FEATHER: i32 = 248;
pub const BONE: i32 = 249;
const ARROW: i32 = 251;
const COAL: i32 = 201;
const IRON_INGOT: i32 = 202;

#[derive(Clone, Copy)]
pub struct MBox {
    c: [f32; 3],
    s: [f32; 3],
    color: u32,
    leg: i32,
    glow: bool,
    piv: f32,
}

pub struct MobInfo {
    #[allow(dead_code)]
    pub name: String,
    pub hw: f64,
    pub h: f64,
    pub hp: f64,
    pub speed: f64,
}

pub struct Data {
    pub info: Vec<MobInfo>,
    models: HashMap<String, Vec<MBox>>,
    palettes: HashMap<String, Vec<Vec<u32>>>,
}

static DATA: OnceLock<Data> = OnceLock::new();

pub fn data() -> &'static Data {
    DATA.get_or_init(|| {
        let mut info = Vec::new();
        let mut models: HashMap<String, Vec<MBox>> = HashMap::new();
        let mut palettes = HashMap::new();
        let mut cur: Option<String> = None;
        for line in include_str!("../dados/bichos.txt").lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let p: Vec<&str> = line.split('|').collect();
            match p[0] {
                "@bicho" => info.push(MobInfo {
                    name: p[2].to_string(),
                    hw: p[3].parse().unwrap_or(0.3),
                    h: p[4].parse().unwrap_or(1.0),
                    hp: p[5].parse().unwrap_or(10.0),
                    speed: p[6].parse().unwrap_or(1.5),
                }),
                "@modelo" => {
                    cur = Some(p[1].to_string());
                    models.insert(p[1].to_string(), Vec::new());
                }
                "@paleta" => {
                    let rows: Vec<Vec<u32>> = p[2].split(';').map(|r| r.split(',').filter_map(|c| c.parse().ok()).collect()).collect();
                    palettes.insert(p[1].to_string(), rows);
                }
                _ => {
                    if let (Some(name), true) = (&cur, p.len() >= 10) {
                        let f = |i: usize| p[i].parse::<f32>().unwrap_or(f32::NAN);
                        models.get_mut(name).unwrap().push(MBox {
                            c: [f(0), f(1), f(2)],
                            s: [f(3), f(4), f(5)],
                            color: p[6].parse().unwrap_or(0xFF00FF),
                            leg: p[7].parse().unwrap_or(0),
                            glow: p[8] == "1",
                            piv: if p[9] == "nan" { f32::NAN } else { f(9) },
                        });
                    }
                }
            }
        }
        Data { info, models, palettes }
    })
}

pub fn info(t: usize) -> &'static MobInfo {
    &data().info[t]
}

#[derive(Clone)]
pub struct Mob {
    pub body: Player,
    pub t: usize,
    pub id: i32,
    pub health: f64,
    pub yaw: f64,
    pub hurt: f64,
    pub walk: f64,
    ai_timer: f64,
    dir_x: f64,
    dir_y: f64,
    dir_z: f64,
    pub attack_cd: f64,
    pub flee: f64,
    pub burn: f64,
    pub tamed: bool,
    pub sitting: bool,
    pub owner_name: String,
    /// lobo domesticado, tubarão e narval: o id da criatura que está atacando
    pub target: Option<i32>,
    pub wants_bite: bool,
    pub angry: f64,
    pub flying: bool,
    landing: bool,
    cruise: f64,
    pub wants_attack: bool,
    pub fuse: f64,
    pub exploding: bool,
    pub aim: f64,
    pub wants_shoot: bool,
    shot_cd: f64,
    out_of_water: f64,
}

/// O que a criatura enxerga do mundo e dos outros a cada passo.
pub struct Sight<'a, W: Blocks> {
    pub w: &'a W,
    /// pés do jogador
    pub p: [f64; 3],
    pub can_target: bool,
    /// dono (lobo domesticado), se estiver no mundo
    pub owner: Option<[f64; 3]>,
    /// posição e meia largura do alvo (lobo, tubarão, narval)
    pub target: Option<([f64; 3], f64, bool)>,
    pub line_of_sight: bool,
}

fn atan2(y: f64, x: f64) -> f64 {
    y.atan2(x)
}

impl Mob {
    pub fn new(t: usize, x: f64, y: f64, z: f64, id: i32, rng: &mut Rng) -> Mob {
        let i = info(t);
        let mut body = Player::body(i.hw, i.h);
        (body.x, body.y, body.z) = (x, y, z);
        Mob {
            body,
            t,
            id,
            health: i.hp,
            yaw: rng.next() * std::f64::consts::TAU,
            hurt: 0.0,
            walk: 0.0,
            ai_timer: 0.0,
            dir_x: 0.0,
            dir_y: 0.0,
            dir_z: 0.0,
            attack_cd: 0.0,
            flee: 0.0,
            burn: 0.0,
            tamed: false,
            sitting: false,
            owner_name: String::new(),
            target: None,
            wants_bite: false,
            angry: 0.0,
            flying: false,
            landing: false,
            cruise: 0.0,
            wants_attack: false,
            fuse: 0.0,
            exploding: false,
            aim: 0.0,
            wants_shoot: false,
            shot_cd: 0.0,
            out_of_water: 0.0,
        }
    }

    pub fn swimmer(&self) -> bool {
        matches!(self.t, FISH | TROPICAL | SALMON | SHARK | NARWHAL)
    }
    pub fn bear(&self) -> bool {
        self.t == BEAR || self.t == POLAR_BEAR
    }
    pub fn small_fish(&self) -> bool {
        matches!(self.t, FISH | TROPICAL | SALMON)
    }
    pub fn tiger(&self) -> bool {
        self.t == TIGER || self.t == WHITE_TIGER
    }
    pub fn scorpion(&self) -> bool {
        self.t == SCORPION || self.t == EMPEROR
    }
    pub fn fighter(&self) -> bool {
        self.t == WOLF || self.bear() || self.tiger() || self.t == MUSKOX
    }
    pub fn hostile(&self) -> bool {
        matches!(self.t, ZOMBIE | SPIDER | CREEPER | SKELETON)
    }
    pub fn attacks_player(&self) -> bool {
        self.hostile() || self.t == SHARK || self.scorpion() || (self.fighter() && self.angry > 0.0 && !self.tamed)
    }
    pub fn attack_damage(&self) -> f64 {
        if self.t == ZOMBIE || self.t == WOLF {
            3.0
        } else if self.bear() {
            5.0
        } else if matches!(self.t, SHARK | MUSKOX | NARWHAL) {
            4.0
        } else if self.tiger() || self.t == EMPEROR {
            6.0
        } else {
            2.0
        }
    }
    /// Variação de cor de pássaros, peixes tropicais e gatos (vem do id).
    pub fn variant(&self) -> usize {
        self.id.rem_euclid(3) as usize
    }

    fn turn_to(&mut self, target: f64, dt: f64, rate: f64) {
        let diff = atan2((target - self.yaw).sin(), (target - self.yaw).cos());
        self.yaw += diff * (dt * rate).min(1.0);
    }

    // ------------------------------------------------------------------ comportamento
    pub fn update<W: Blocks>(&mut self, dt: f64, s: &Sight<W>, r: &mut Rng) {
        if self.swimmer() {
            return self.swim(dt, s, r);
        }
        if self.t == BIRD {
            return self.fly(dt, s, r);
        }
        let w = s.w;
        self.body.update_fluids(w);
        self.hurt -= dt;
        self.attack_cd -= dt;
        self.ai_timer -= dt;
        self.flee -= dt;
        self.angry -= dt;
        self.wants_attack = false;
        self.wants_bite = false;
        let (px, pz, py) = (s.p[0] - self.body.x, s.p[2] - self.body.z, s.p[1] - self.body.y);
        let dist = (px * px + pz * pz).sqrt();
        let (mut tx, mut tz, mut speed) = (0.0, 0.0, info(self.t).speed);

        if self.t == CREEPER {
            // chega perto, para e acende o pavio; se o jogador fugir a tempo, o pavio apaga
            let close = s.can_target && dist < 3.0 && py.abs() < 3.0;
            if close || (self.fuse > 0.0 && dist <= 5.0) {
                self.fuse += dt;
                if self.fuse >= FUSE_TIME {
                    self.exploding = true;
                }
            } else if self.fuse > 0.0 {
                self.fuse = (self.fuse - dt * 2.0).max(0.0);
            }
        }
        let mut face = false;
        self.wants_shoot = false;
        let hunting = self.t == SKELETON && s.can_target && dist < 22.0 && py.abs() < 10.0;
        if !hunting {
            self.aim = 0.0;
        }
        if matches!(self.t, DEER | RABBIT | FOX | CAT) && dist < if self.t == DEER { 10.0 } else { 6.0 } && py.abs() < 4.0 {
            self.flee = self.flee.max(1.5);
        }
        if self.tiger() && s.can_target && dist < 5.0 && py.abs() < 3.0 {
            self.angry = self.angry.max(12.0);
        }
        if self.t == WOLF && self.tamed {
            // lobo domesticado: sentado espera; senão ataca monstros perto do dono ou segue o dono
            if self.sitting {
            } else if let Some((tp, thw, _)) = s.target {
                let (ddx, ddz) = (tp[0] - self.body.x, tp[2] - self.body.z);
                let dd = (ddx * ddx + ddz * ddz).sqrt().max(0.01);
                tx = ddx / dd;
                tz = ddz / dd;
                speed *= 1.35;
                if dd < 1.4 + thw && (tp[1] - self.body.y).abs() < 1.6 && self.attack_cd <= 0.0 {
                    self.wants_bite = true;
                    self.attack_cd = 0.8;
                }
            } else if let Some(o) = s.owner {
                let (ddx, ddz) = (o[0] - self.body.x, o[2] - self.body.z);
                let dd = (ddx * ddx + ddz * ddz).sqrt().max(0.01);
                if dd > 24.0 || (o[1] - self.body.y).abs() > 12.0 {
                    // ficou muito para trás: aparece do lado do dono
                    let a = r.next() * std::f64::consts::TAU;
                    (self.body.x, self.body.y, self.body.z) = (o[0] + a.sin() * 1.5, o[1] + 0.2, o[2] + a.cos() * 1.5);
                    (self.body.vx, self.body.vy, self.body.vz) = (0.0, 0.0, 0.0);
                    if self.body.collides(w) {
                        (self.body.x, self.body.z) = (o[0], o[2]);
                    }
                } else if dd > 3.0 {
                    tx = ddx / dd;
                    tz = ddz / dd;
                    if dd > 7.0 {
                        speed *= 1.7;
                    }
                }
            }
        } else if hunting {
            // esqueleto: mantém distância (5 a 11 blocos), anda de lado e só atira com o alvo à vista
            let (ux, uz) = (px / dist.max(0.01), pz / dist.max(0.01));
            let sees = dist < 16.0 && s.line_of_sight;
            if self.ai_timer <= 0.0 {
                self.ai_timer = 1.0 + r.next() * 2.0;
                self.dir_x = (r.next() * 3.0).floor() - 1.0;
                self.dir_z = 0.0;
            }
            if !sees || dist > 11.0 {
                tx = ux;
                tz = uz;
            } else if dist < 5.0 {
                tx = -ux;
                tz = -uz;
            } else if self.aim < 0.5 {
                tx = -uz * self.dir_x * 0.5;
                tz = ux * self.dir_x * 0.5;
            }
            self.shot_cd -= dt;
            if sees {
                face = true;
                if self.shot_cd <= 0.0 {
                    self.aim += dt;
                }
                if self.aim >= AIM_TIME {
                    self.wants_shoot = true;
                    self.aim = 0.0;
                    self.shot_cd = 0.8 + r.next();
                }
            } else {
                self.aim = (self.aim - dt * 2.0).max(0.0);
            }
        } else if self.t == CREEPER && self.fuse > 0.0 {
            self.yaw = atan2(px, pz); // parado enquanto incha
        } else if self.attacks_player() && s.can_target && dist < 18.0 && py.abs() < 8.0 {
            tx = px / dist.max(0.01);
            tz = pz / dist.max(0.01);
            if !self.hostile() {
                speed *= 1.4;
            }
            let reach = if self.t == SPIDER {
                1.5
            } else if self.bear() || self.tiger() {
                1.9
            } else if self.t == MUSKOX {
                1.6
            } else if self.t == EMPEROR {
                3.4
            } else {
                1.3
            };
            if self.t != CREEPER && dist < reach && py.abs() < 1.7 {
                tx = 0.0;
                tz = 0.0;
                if self.attack_cd <= 0.0 {
                    self.wants_attack = true;
                    self.attack_cd = 1.0;
                }
            }
        } else if self.flee > 0.0 {
            tx = -px / dist.max(0.01);
            tz = -pz / dist.max(0.01);
            speed *= 1.9;
        } else {
            if self.ai_timer <= 0.0 {
                self.ai_timer = 2.0 + r.next() * 4.0;
                if r.next() < 0.4 {
                    self.dir_x = 0.0;
                    self.dir_z = 0.0;
                } else {
                    let a = r.next() * std::f64::consts::TAU;
                    self.dir_x = a.sin();
                    self.dir_z = a.cos();
                }
            }
            tx = self.dir_x;
            tz = self.dir_z;
            speed *= 0.6;
        }

        if face || tx != 0.0 || tz != 0.0 {
            let target = if face { atan2(px, pz) } else { atan2(tx, tz) };
            self.turn_to(target, dt, 8.0);
        }
        let k = (dt * if self.body.on_ground || self.body.in_water { 8.0 } else { 2.0 }).min(1.0);
        self.body.vx += (tx * speed - self.body.vx) * k;
        self.body.vz += (tz * speed - self.body.vz) * k;
        if self.body.in_water || self.body.in_lava {
            self.body.vy += (2.2 - self.body.vy) * (dt * 3.0).min(1.0); // boia
        } else {
            self.body.vy = (self.body.vy - 28.0 * dt).max(-50.0);
        }
        if self.body.hit_wall && (tx != 0.0 || tz != 0.0) {
            if self.t == SPIDER {
                self.body.vy = 3.5; // escala paredes
            } else if self.body.on_ground || self.body.in_water {
                self.body.vy = 7.6; // pula um degrau (ou sai da água)
            }
        }
        if self.t == RABBIT && self.body.on_ground && (tx != 0.0 || tz != 0.0) {
            self.body.vy = 5.2; // coelho anda aos pulos
        }
        self.body.do_move(dt, w, false);
        self.walk += (self.body.vx * self.body.vx + self.body.vz * self.body.vz).sqrt() * dt;
        if self.body.landed_fall > 4.0 {
            self.damage((self.body.landed_fall - 3.0).floor());
        }
        self.body.landed_fall = 0.0;
        if self.body.in_lava {
            self.damage(4.0 * dt);
        }
    }

    /// Peixes, tubarão e narval: nadam em 3D só dentro da água; fora dela caem, se debatem e perdem vida.
    fn swim<W: Blocks>(&mut self, dt: f64, s: &Sight<W>, r: &mut Rng) {
        let w = s.w;
        self.hurt -= dt;
        self.ai_timer -= dt;
        self.flee -= dt;
        self.attack_cd -= dt;
        self.wants_attack = false;
        self.wants_bite = false;
        let fl = |v: f64| v.floor() as i32;
        let water = block::is_water(w.get(fl(self.body.x), fl(self.body.y + 0.15), fl(self.body.z)));
        self.body.in_water = water;
        let look = if self.t == SHARK { 2.4 } else if self.t == NARWHAL { 1.8 } else { 0.6 };
        if water {
            self.out_of_water = 0.0;
            let (dx, dy, dz) = (s.p[0] - self.body.x, s.p[1] + 0.6 - self.body.y, s.p[2] - self.body.z);
            let d3 = (dx * dx + dy * dy + dz * dz).sqrt();
            let prey_in_water = block::is_water(w.get(fl(s.p[0]), fl(s.p[1] + 0.5), fl(s.p[2])));
            if self.t == SHARK && s.can_target && prey_in_water && d3 < 16.0 {
                self.dir_x = dx / d3;
                self.dir_y = dy / d3;
                self.dir_z = dz / d3;
                if d3 < 2.7 && self.attack_cd <= 0.0 {
                    self.wants_attack = true;
                    self.attack_cd = 4.5;
                }
            } else if let (true, Some((tp, _, small))) = (self.t == SHARK || self.t == NARWHAL, s.target) {
                let (ex, ey, ez) = (tp[0] - self.body.x, tp[1] + 0.2 - self.body.y, tp[2] - self.body.z);
                let d = (ex * ex + ey * ey + ez * ez).sqrt().max(0.01);
                self.dir_x = ex / d;
                self.dir_y = ey / d;
                self.dir_z = ez / d;
                let reach = if self.t == NARWHAL { 2.6 } else if small { 1.9 } else { 2.8 };
                if d < reach && self.attack_cd <= 0.0 {
                    self.wants_bite = true;
                    self.attack_cd = if self.t == NARWHAL { 1.3 } else if small { 3.0 } else { 3.5 };
                }
            } else if self.flee > 0.0 && self.t != SHARK {
                let (ex, ez) = (self.body.x - s.p[0], self.body.z - s.p[2]);
                let l = (ex * ex + ez * ez).sqrt().max(0.01);
                self.dir_x = ex / l;
                self.dir_z = ez / l;
                self.dir_y = 0.0;
            } else if self.ai_timer <= 0.0 {
                self.ai_timer = 1.5 + r.next() * 3.0;
                let a = r.next() * std::f64::consts::TAU;
                self.dir_x = a.sin();
                self.dir_z = a.cos();
                self.dir_y = (r.next() - 0.5) * 0.6;
                if r.next() < if self.t == SHARK { 0.05 } else { 0.25 } {
                    self.dir_x = 0.0;
                    self.dir_z = 0.0;
                    self.dir_y = 0.0;
                }
            }
            // não sai da água: se o ponto à frente não for água, vira para o outro lado
            let (ax, ay, az) = (fl(self.body.x + self.dir_x * look), fl(self.body.y + 0.15 + self.dir_y * look), fl(self.body.z + self.dir_z * look));
            if (self.dir_x != 0.0 || self.dir_z != 0.0 || self.dir_y != 0.0) && !block::is_water(w.get(ax, ay, az)) {
                if self.t == SHARK && self.dir_y > 0.0 {
                    self.dir_y = 0.0;
                } else {
                    self.dir_x = -self.dir_x;
                    self.dir_z = -self.dir_z;
                    self.dir_y = -self.dir_y * 0.5;
                    self.ai_timer = 0.8;
                }
            }
            let speed = info(self.t).speed
                * if self.flee > 0.0 { 2.2 } else if s.target.is_some() { 1.5 } else { 1.0 }
                * if self.t == SHARK && self.wants_attack { 0.6 } else { 1.0 };
            let k = (dt * if self.t == SHARK { 2.0 } else { 4.0 }).min(1.0);
            self.body.vx += (self.dir_x * speed - self.body.vx) * k;
            self.body.vy += (self.dir_y * speed - self.body.vy) * k;
            self.body.vz += (self.dir_z * speed - self.body.vz) * k;
            if self.dir_x != 0.0 || self.dir_z != 0.0 {
                let t = atan2(self.dir_x, self.dir_z);
                self.turn_to(t, dt, if self.t == SHARK { 3.0 } else { 6.0 });
            }
            self.body.do_move(dt, w, true);
        } else {
            self.body.vy -= 28.0 * dt;
            if self.body.on_ground && r.next() < dt * 3.0 {
                // se debate
                self.body.vy = if self.t == SHARK { 2.0 } else { 4.0 };
                self.body.vx = (r.next() - 0.5) * 3.0;
                self.body.vz = (r.next() - 0.5) * 3.0;
                self.yaw += (r.next() - 0.5) * 2.0;
            }
            self.body.vx *= (1.0 - dt * 2.0).max(0.0);
            self.body.vz *= (1.0 - dt * 2.0).max(0.0);
            self.body.do_move(dt, w, false);
            self.out_of_water += dt;
            if self.out_of_water > 1.0 {
                self.out_of_water = 0.0;
                self.damage(1.0);
            }
        }
        self.body.landed_fall = 0.0;
        self.walk += ((self.body.vx * self.body.vx + self.body.vz * self.body.vz).sqrt() + 0.6) * dt * 3.0;
    }

    /// Pássaro: pousado, anda aos pulinhos e voa quando alguém chega perto; no ar plana acima do chão.
    fn fly<W: Blocks>(&mut self, dt: f64, s: &Sight<W>, r: &mut Rng) {
        let w = s.w;
        self.hurt -= dt;
        self.ai_timer -= dt;
        self.flee -= dt;
        self.wants_attack = false;
        self.body.update_fluids(w);
        let (px, pz) = (s.p[0] - self.body.x, s.p[2] - self.body.z);
        let dist = (px * px + pz * pz).sqrt();
        if !self.flying {
            if dist < 5.0 || self.flee > 0.0 || self.body.in_water || r.next() < dt * 0.07 {
                self.flying = true;
                self.landing = false;
                self.body.vy = 5.0;
                self.ai_timer = 0.0;
            } else {
                if self.ai_timer <= 0.0 {
                    self.ai_timer = 0.6 + r.next() * 1.5;
                    let a = r.next() * std::f64::consts::TAU;
                    let hop = r.next() < 0.5;
                    self.dir_x = if hop { a.sin() } else { 0.0 };
                    self.dir_z = if hop { a.cos() } else { 0.0 };
                    if hop && self.body.on_ground {
                        self.body.vy = 3.0;
                    }
                    if hop {
                        self.yaw = a;
                    }
                }
                let k = (dt * 6.0).min(1.0);
                self.body.vx += (self.dir_x * 0.8 - self.body.vx) * k;
                self.body.vz += (self.dir_z * 0.8 - self.body.vz) * k;
                if self.body.on_ground {
                    self.dir_x *= 0.9;
                    self.dir_z *= 0.9;
                }
                self.body.vy -= 28.0 * dt;
                self.body.do_move(dt, w, false);
                self.walk += (self.body.vx * self.body.vx + self.body.vz * self.body.vz).sqrt() * dt;
                self.body.landed_fall = 0.0;
                return;
            }
        }
        if self.ai_timer <= 0.0 {
            self.ai_timer = 2.0 + r.next() * 3.0;
            let mut a = r.next() * std::f64::consts::TAU;
            if self.flee > 0.0 || dist < 7.0 {
                a = atan2(-px, -pz) + (r.next() - 0.5) * 1.2;
            }
            self.dir_x = a.sin();
            self.dir_z = a.cos();
            self.cruise = 5.0 + r.next() * 9.0;
            self.landing = self.flee <= 0.0 && dist > 10.0 && r.next() < 0.3;
        }
        let (bx, bz, by) = (self.body.x.floor() as i32, self.body.z.floor() as i32, self.body.y.floor() as i32);
        let mut ground = by - 30;
        let mut yy = by;
        while yy > by - 30 {
            let b = w.get(bx, yy, bz);
            if block::solid(b) || block::is_leaves(b) || block::is_water(b) {
                ground = yy;
                break;
            }
            yy -= 1;
        }
        let want = (if self.landing { ground as f64 + 1.0 } else { ground as f64 + 1.0 + self.cruise }).min((crate::world::SY + 6) as f64);
        self.body.vy += (((want - self.body.y) * 1.2).clamp(-4.0, 4.0) - self.body.vy) * (dt * 2.5).min(1.0);
        let speed = info(BIRD).speed * if self.landing { 0.5 } else { 1.0 } * if self.flee > 0.0 { 1.4 } else { 1.0 };
        let k = (dt * 2.0).min(1.0);
        self.body.vx += (self.dir_x * speed - self.body.vx) * k;
        self.body.vz += (self.dir_z * speed - self.body.vz) * k;
        let t = atan2(self.body.vx, self.body.vz);
        self.turn_to(t, dt, 5.0);
        self.body.do_move(dt, w, false);
        if self.body.hit_wall {
            self.dir_x = -self.dir_x;
            self.dir_z = -self.dir_z;
            self.body.vy = 3.0;
        }
        self.walk += dt * if self.landing { 2.5 } else { 4.0 };
        self.body.landed_fall = 0.0;
        if self.landing && self.body.on_ground {
            self.flying = false;
            self.landing = false;
            self.body.vx = 0.0;
            self.body.vz = 0.0;
            self.ai_timer = 1.0;
        }
        if self.body.in_water {
            self.body.vy = 4.0;
            self.landing = false;
        }
    }

    pub fn damage(&mut self, d: f64) {
        self.health -= d;
        self.hurt = 0.35;
        if self.fighter() {
            if self.tamed {
                self.sitting = false; // o lobo domesticado levanta para se defender
            } else {
                self.angry = 25.0; // lobo selvagem, urso, tigre e boi revidam
            }
        } else if self.t == NARWHAL && self.target.is_some() {
        } else if !self.hostile() && self.t != SHARK && !self.scorpion() {
            self.flee = 4.0;
        }
    }

    /// Itens que a criatura deixa ao morrer: (item, quantidade), como no Mob.drops do Java.
    pub fn drops(&self, r: &mut Rng) -> Vec<(i32, i32)> {
        let n = |r: &mut Rng, k: i32| (r.next() * k as f64) as i32; // nextInt(k)
        let v: Vec<(i32, i32)> = match self.t {
            PIG => vec![(RAW_PORK, 1 + n(r, 2))],
            SHEEP => vec![(block::WOOL as i32, 1), (RAW_MUTTON, 1 + n(r, 2))],
            CHICKEN => vec![(RAW_CHICKEN, 1), (FEATHER, n(r, 3))],
            SPIDER => {
                let s = n(r, 3);
                vec![(STRING, s), (COAL, if n(r, 4) == 0 { 1 } else { 0 })]
            }
            SKELETON => {
                let b = n(r, 3);
                let a = if n(r, 2) == 0 { 1 + n(r, 2) } else { 0 };
                vec![(BONE, b), (ARROW, a)]
            }
            FISH | TROPICAL => vec![(RAW_FISH, 1)],
            COW => {
                let leather = n(r, 3);
                vec![(RAW_MEAT, 1 + n(r, 3)), (LEATHER, leather)]
            }
            CREEPER => vec![(GUNPOWDER, n(r, 3))],
            WOLF => {
                if self.tamed {
                    vec![]
                } else {
                    vec![(BONE, n(r, 2))]
                }
            }
            FOX => vec![(LEATHER, n(r, 2))],
            DEER => vec![(RAW_MEAT, 1 + n(r, 3)), (LEATHER, n(r, 3))],
            RABBIT => vec![(RAW_MEAT, 1)],
            BEAR => vec![(RAW_MEAT, 2 + n(r, 3)), (LEATHER, 1 + n(r, 2))],
            POLAR_BEAR => vec![(RAW_MEAT, 1 + n(r, 2)), (RAW_FISH, 1 + n(r, 2)), (LEATHER, 1 + n(r, 2))],
            PENGUIN => vec![(FEATHER, 1 + n(r, 2)), (RAW_FISH, n(r, 2))],
            MUSKOX => vec![(RAW_MEAT, 2 + n(r, 2)), (LEATHER, 1 + n(r, 2)), (block::WOOL as i32, n(r, 2))],
            NARWHAL => vec![(RAW_FISH, 2 + n(r, 3)), (BONE, 1)],
            BIRD => vec![(FEATHER, 1 + n(r, 2))],
            SALMON => vec![(RAW_FISH, 1 + n(r, 2))],
            SHARK => vec![(RAW_FISH, 3 + n(r, 3)), (BONE, n(r, 2))],
            TIGER | WHITE_TIGER => vec![(RAW_MEAT, 1 + n(r, 3)), (LEATHER, 1 + n(r, 2))],
            CAT | SCORPION => vec![(STRING, n(r, 2))],
            EMPEROR => vec![(STRING, 1 + n(r, 2)), (BONE, n(r, 2)), (GUNPOWDER, n(r, 2))],
            _ => {
                // morto-vivo
                if r.next() < 0.06 {
                    vec![(IRON_INGOT, 1)]
                } else if r.next() < 0.4 {
                    vec![(COAL, 1 + n(r, 2))]
                } else {
                    vec![]
                }
            }
        };
        v.into_iter().filter(|p| p.1 > 0).collect()
    }

    /// Distância ao longo do raio até a caixa da criatura, ou None se não acerta (para bater nela).
    pub fn ray_hit(&self, o: [f64; 3], d: [f64; 3]) -> Option<f64> {
        let b = &self.body;
        let lo = [b.x - b.hw, b.y, b.z - b.hw];
        let hi = [b.x + b.hw, b.y + b.h, b.z + b.hw];
        let (mut tmin, mut tmax) = (0.0f64, 1e9f64);
        for i in 0..3 {
            if d[i].abs() < 1e-9 {
                if o[i] < lo[i] || o[i] > hi[i] {
                    return None;
                }
            } else {
                let (t1, t2) = ((lo[i] - o[i]) / d[i], (hi[i] - o[i]) / d[i]);
                tmin = tmin.max(t1.min(t2));
                tmax = tmax.min(t1.max(t2));
                if tmin > tmax {
                    return None;
                }
            }
        }
        Some(tmin)
    }

    // ------------------------------------------------------------------ desenho
    fn palette(&self) -> Option<&'static [u32]> {
        let p = &data().palettes;
        let pick = |name: &str, row: usize| p.get(name).and_then(|r| r.get(row.min(r.len().saturating_sub(1)))).map(|v| v.as_slice());
        match self.t {
            BIRD => pick("BIRD_COLORS", self.variant()),
            TROPICAL => pick("TROPICAL_COLORS", self.variant()),
            CAT => pick("CAT_COLORS", self.variant()),
            TIGER => pick("TIGER_COLORS", 0),
            WHITE_TIGER => pick("WHITE_TIGER_COLORS", 0),
            SCORPION => pick("SCORPION_COLORS", 0),
            EMPEROR => pick("EMPEROR_COLORS", 0),
            _ => None,
        }
    }

    fn current_model(&self) -> &'static [MBox] {
        let m = &data().models;
        let name = if self.t == SKELETON && self.aim > 0.05 {
            "SKELETON_AIM".to_string()
        } else if self.t == WOLF {
            (match (self.sitting, self.tamed) {
                (true, true) => "WOLF_SIT_TAMED",
                (true, false) => "WOLF_SIT",
                (false, true) => "WOLF_TAMED",
                _ => "9",
            })
            .to_string()
        } else if self.t == DEER && self.id.rem_euclid(2) == 0 {
            "DEER_STAG".to_string()
        } else {
            self.t.to_string()
        };
        m.get(&name).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Desenha a criatura (Mob.writeModel do Java): cada caixa com as pernas, asas e caudas animadas.
    pub fn draw(&self, ui: &mut crate::ui::Ui, light: f32) {
        let (cy, sy) = (self.yaw.cos() as f32, self.yaw.sin() as f32);
        let spd = ((self.body.vx * self.body.vx + self.body.vz * self.body.vz).sqrt() / 1.5).min(1.0);
        let swing = ((self.walk * 5.5).sin() * spd) as f32;
        let red = self.hurt > 0.0;
        let flash = self.fuse > 0.0 && ((self.fuse * 9.0) as i32) % 2 == 0;
        let swell = if self.fuse > 0.0 { 1.0 + 0.18 * (self.fuse / FUSE_TIME).min(1.0) as f32 } else { 1.0 };
        let palette = self.palette();
        let wing_a = if self.t == BIRD { if self.flying { ((self.walk * 7.0).sin() * 0.9 + 0.15) as f32 } else { -1.35 } } else { 0.0 };
        let tail_a = ((self.walk * 5.0).sin() * if self.t == SHARK || self.t == NARWHAL { 0.3 } else { 0.45 }) as f32;
        let (x, y, z) = (self.body.x as f32, self.body.y as f32, self.body.z as f32);
        const SHADE: [f32; 6] = [0.8, 0.8, 1.0, 0.55, 0.7, 0.7];
        // cantos de cada face (na ordem dos índices 0..7: bit 0 = x, bit 1 = y, bit 2 = z)
        const FACES: [[usize; 4]; 6] = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
        let spider = self.t == SPIDER || self.scorpion();
        for bx in self.current_model() {
            let mut oz = 0.0;
            let mut mode = 0;
            let mut angle = 0.0f32;
            if bx.leg == 1 || bx.leg == 2 {
                angle = if bx.leg == 1 { 1.0 } else { -1.0 } * swing * 0.7;
                mode = 1;
            } else if bx.leg == 5 || bx.leg == 6 {
                angle = if bx.leg == 5 { wing_a } else { -wing_a };
                mode = 2;
            } else if bx.leg == 7 {
                angle = tail_a;
                mode = 3;
            } else if bx.leg != 0 {
                mode = 1;
            }
            if spider && (1..=4).contains(&bx.leg) {
                oz = ((self.walk * 7.0 + bx.leg as f64 * 2.0).sin() * 0.12 * ((swing as f64) * 3.0 + 0.05).min(1.0)) as f32;
                angle = 0.0;
            }
            let (hx, hy, hz) = (bx.s[0] / 2.0 * swell, bx.s[1] / 2.0, bx.s[2] / 2.0 * swell);
            let mut c = [[0f32; 3]; 8];
            for (i, ci) in c.iter_mut().enumerate() {
                let (mut lx, mut ly, mut lz) = (if i & 1 == 0 { -hx } else { hx }, if i & 2 == 0 { -hy } else { hy }, if i & 4 == 0 { -hz } else { hz });
                if mode == 2 && angle != 0.0 {
                    let rx = bx.c[0] + lx - bx.piv;
                    let (ca, sa) = (angle.cos(), angle.sin());
                    let (nx, ny) = (rx * ca - ly * sa, rx * sa + ly * ca);
                    lx = nx + bx.piv - bx.c[0];
                    ly = ny;
                } else if mode == 3 && angle != 0.0 {
                    let (rz, rx) = (bx.c[2] + lz - bx.piv, bx.c[0] + lx);
                    let (ca, sa) = (angle.cos(), angle.sin());
                    let (nx, nz) = (rx * ca + rz * sa, -rx * sa + rz * ca);
                    lx = nx - bx.c[0];
                    lz = nz + bx.piv - bx.c[2];
                } else if mode == 1 && angle != 0.0 {
                    let pv = if bx.piv.is_nan() { hy } else { bx.piv - bx.c[1] };
                    let py = ly - pv;
                    let (ny, nz) = (py * angle.cos() - lz * angle.sin(), py * angle.sin() + lz * angle.cos());
                    ly = ny + pv;
                    lz = nz;
                }
                let (mx, my, mz) = (bx.c[0] + lx, bx.c[1] + ly, bx.c[2] + lz + oz);
                *ci = [x + mx * cy + mz * sy, y + my, z - mx * sy + mz * cy];
            }
            let mut col = bx.color;
            if let Some(p) = palette {
                if col >= 1 && col as usize <= p.len() {
                    col = p[col as usize - 1];
                }
            }
            for (f, face) in FACES.iter().enumerate() {
                let l = if bx.glow { 1.0 } else { SHADE[f] * light };
                let (mut r, mut g, mut b) = (((col >> 16) & 255) as f32 / 255.0 * l, ((col >> 8) & 255) as f32 / 255.0 * l, (col & 255) as f32 / 255.0 * l);
                if red {
                    r = r * 0.5 + 0.5 * l;
                    g *= 0.45;
                    b *= 0.45;
                }
                if flash {
                    r = r * 0.35 + 0.65;
                    g = g * 0.35 + 0.65;
                    b = b * 0.35 + 0.65;
                }
                ui.solid_quad([c[face[0]], c[face[1]], c[face[2]], c[face[3]]], [r, g, b, 1.0]);
            }
        }
    }

    /// Texto no formato do Java (Mobs.save): tipo;x;y;z;direção;vida;id.
    pub fn save(&self) -> String {
        format!("{};{:.2};{:.2};{:.2};{:.2};{:.1};{}", self.t, self.body.x, self.body.y, self.body.z, self.yaw, self.health, self.id)
    }

    pub fn load(s: &str, rng: &mut Rng) -> Option<Mob> {
        let p: Vec<&str> = s.split(';').collect();
        if p.len() < 7 {
            return None;
        }
        let t: usize = p[0].trim().parse().ok()?;
        if t >= TYPES {
            return None;
        }
        let f = |i: usize| p[i].trim().parse::<f64>().ok();
        let mut m = Mob::new(t, f(1)?, f(2)?, f(3)?, p[6].trim().parse().ok()?, rng);
        m.yaw = f(4)?;
        m.health = f(5)?.clamp(1.0, info(t).hp);
        Some(m)
    }

    /// Bichos de terra ficam no mundo (dormem com o pedaço); monstros, pássaros e peixes somem de longe.
    pub fn persistent(&self) -> bool {
        !self.hostile() && !self.tamed && self.t != BIRD && !self.swimmer()
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modelos_do_java_carregam() {
        let d = data();
        assert_eq!(d.info.len(), TYPES);
        for t in 0..TYPES {
            assert!(!d.models[&t.to_string()].is_empty(), "modelo {t} vazio");
        }
        for v in ["SKELETON_AIM", "WOLF_SIT", "WOLF_TAMED", "WOLF_SIT_TAMED", "DEER_STAG"] {
            assert!(!d.models[v].is_empty(), "{v} vazio");
        }
        assert_eq!(info(PENGUIN).name, "Pinguim");
        assert_eq!(info(SHARK).hp, 25.0);
    }

    #[test]
    fn grava_e_le_igual_ao_java() {
        let mut r = Rng::new();
        // linha de um mundo salvo pelo Java
        let m = Mob::load("25;-39.84;24.00;-52.13;2.31;20.0;1", &mut r).unwrap();
        assert_eq!((m.t, m.id, m.health), (MUSKOX, 1, 20.0));
        assert_eq!(m.save(), "25;-39.84;24.00;-52.13;2.31;20.0;1");
    }
}
