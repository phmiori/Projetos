//! Clima: tempo limpo, chuva (neve nos lugares frios, nada no deserto) e trovoada, com raios e céu escuro.

use crate::block;
use crate::ui::Ui;
use crate::world::{DESERT, ICE_FIELD, MOUNTAINS, TUNDRA};
use crate::Game;

#[derive(Clone, Copy, PartialEq, Default, Debug)]
pub enum Sky {
    #[default]
    Clear,
    Rain,
    Thunder,
}

#[derive(Default)]
pub struct Weather {
    pub kind: Sky,
    /// segundos até o clima mudar
    pub left: f64,
    /// 0 limpo ... 1 chovendo forte (muda aos poucos)
    pub strength: f64,
    next_bolt: f64,
    /// raio caindo: lugar e tempo que ainda aparece
    bolt: Option<([f64; 3], f64)>,
}

impl Weather {
    pub fn raining(&self) -> bool {
        self.kind != Sky::Clear
    }

    /// Quanto o céu escurece (0 a 0,6).
    pub fn gloom(&self) -> f64 {
        self.strength * if self.kind == Sky::Thunder { 0.6 } else { 0.4 }
    }

    pub fn start(&mut self, kind: Sky, roll: f64) {
        self.kind = kind;
        self.left = match kind {
            Sky::Clear => 420.0 + roll * 600.0,
            Sky::Rain => 120.0 + roll * 180.0,
            Sky::Thunder => 90.0 + roll * 120.0,
        };
    }

    pub fn save(&self) -> String {
        format!("{};{:.0}", self.kind as i32, self.left)
    }

    pub fn load(s: &str) -> Weather {
        let mut p = s.split(';');
        let kind = match p.next() {
            Some("1") => Sky::Rain,
            Some("2") => Sky::Thunder,
            _ => Sky::Clear,
        };
        let left: f64 = p.next().and_then(|v| v.parse().ok()).unwrap_or(0.0);
        Weather { kind, left, strength: if kind == Sky::Clear { 0.0 } else { 1.0 }, ..Default::default() }
    }
}

impl Game {
    pub fn tick_weather(&mut self, dt: f64) {
        if self.is_client() {
            return; // o clima ainda não passa pela LAN: no mundo de outro o tempo fica limpo
        }
        if self.ex.weather.left <= 0.0 {
            let roll = self.rng.next();
            if self.ex.weather.kind == Sky::Clear && self.ex.weather.strength == 0.0 && self.ex.weather.left == 0.0 {
                self.ex.weather.start(Sky::Clear, roll); // mundo recém-aberto: começa limpo
            } else if self.ex.weather.kind == Sky::Clear {
                let kind = if self.rng.next() < 0.25 { Sky::Thunder } else { Sky::Rain };
                self.ex.weather.start(kind, roll);
            } else {
                self.ex.weather.start(Sky::Clear, roll);
            }
        }
        let w = &mut self.ex.weather;
        w.left -= dt;
        if w.left == 0.0 {
            w.left = -1.0;
        }
        let want = if w.raining() { 1.0 } else { 0.0 };
        w.strength += (want - w.strength).clamp(-dt / 6.0, dt / 6.0);
        if let Some((_, t)) = &mut w.bolt {
            *t -= dt;
            if *t <= 0.0 {
                w.bolt = None;
            }
        }
        if w.kind == Sky::Thunder {
            w.next_bolt -= dt;
            if w.next_bolt <= 0.0 {
                self.ex.weather.next_bolt = 5.0 + self.rng.next() * 14.0;
                let (dx, dz) = (self.rng.next() * 80.0 - 40.0, self.rng.next() * 80.0 - 40.0);
                let (x, z) = (self.player.x + dx, self.player.z + dz);
                let y = self.rain_floor(x.floor() as i32, z.floor() as i32);
                self.ex.weather.bolt = Some(([x, y as f64, z], 0.22));
                self.blast_flash = self.blast_flash.max(0.16);
                crate::sound::play("explosao", 0.35);
            }
        }
    }

    /// F6 no criativo: limpo -> chuva -> trovoada.
    pub fn next_weather(&mut self) {
        let (kind, name) = match self.ex.weather.kind {
            Sky::Clear => (Sky::Rain, "Clima: chuva"),
            Sky::Rain => (Sky::Thunder, "Clima: trovoada"),
            Sky::Thunder => (Sky::Clear, "Clima: tempo limpo"),
        };
        let roll = self.rng.next();
        self.ex.weather.start(kind, roll);
        self.notice(name.into());
    }

    /// Y logo acima do bloco mais alto da coluna que para a chuva.
    fn rain_floor(&self, x: i32, z: i32) -> i32 {
        let mut y = self.gen.build_top() - 1;
        while y > 0 {
            let b = self.get(x, y, z);
            if block::solid(b) || block::is_water(b) {
                break;
            }
            y -= 1;
        }
        y + 1
    }

    /// Gotas (ou flocos) em volta da câmera, só onde o céu está aberto, e o raio.
    pub fn draw_weather(&self, ui: &mut Ui, daylight: f32) {
        let w = &self.ex.weather;
        if let Some((p, _)) = w.bolt {
            let (mut x, mut z) = (p[0] as f32, p[2] as f32);
            let mut y = p[1] as f32;
            for k in 0..14 {
                let nx = x + ((k * 7919 % 13) as f32 - 6.0) * 0.16;
                let nz = z + ((k * 104729 % 11) as f32 - 5.0) * 0.16;
                let white = [0.92, 0.95, 1.0, 1.0];
                ui.solid_quad([[x - 0.14, y, z], [x + 0.14, y, z], [nx + 0.14, y + 3.0, nz], [nx - 0.14, y + 3.0, nz]], white);
                ui.solid_quad([[x, y, z - 0.14], [x, y, z + 0.14], [nx, y + 3.0, nz + 0.14], [nx, y + 3.0, nz - 0.14]], white);
                (x, y, z) = (nx, y + 3.0, nz);
            }
        }
        if w.strength <= 0.02 {
            return;
        }
        let e = self.eye();
        let (cx, cz) = (e[0].floor() as i32, e[2].floor() as i32);
        let t = self.clock_s as f32;
        const R: i32 = 11;
        // de lado para a câmera
        let (rx, rz) = (-(self.player.yaw.cos() as f32), self.player.yaw.sin() as f32);
        for dx in -R..=R {
            for dz in -R..=R {
                if dx * dx + dz * dz > R * R {
                    continue;
                }
                let (x, z) = (cx + dx, cz + dz);
                let h = crate::noise::hash(x, z, 777) as f32;
                if h as f64 > 0.35 + 0.4 * w.strength {
                    continue;
                }
                let ground = self.gen.height_at(x, z);
                let biome = self.gen.biome_at(x, z, ground - 1);
                if biome == DESERT {
                    continue;
                }
                let snow = biome == TUNDRA || biome == ICE_FIELD || (biome == MOUNTAINS && ground > 50 + self.gen.lift);
                let floor = self.rain_floor(x, z) as f32;
                let speed = if snow { 1.6 } else { 14.0 };
                for k in 0..2 {
                    let phase = (t * speed / 12.0 + h * 7.3 + k as f32 * 0.5).fract();
                    let y = e[1] + 8.0 - phase * 12.0;
                    if y < floor {
                        continue;
                    }
                    let mut px = x as f32 + (h * 13.7).fract();
                    let pz = z as f32 + (h * 31.3).fract();
                    let (half, len, color) = if snow {
                        px += (t * 1.7 + h * 20.0).sin() * 0.18;
                        (0.04, 0.08, [0.97 * daylight.max(0.35), 0.98 * daylight.max(0.35), daylight.max(0.35), 0.9])
                    } else {
                        (0.012, 0.55, [0.55, 0.66, 0.95, 0.42])
                    };
                    ui.solid_quad([[px - rx * half, y, pz - rz * half], [px + rx * half, y, pz + rz * half], [px + rx * half, y + len, pz + rz * half], [px - rx * half, y + len, pz - rz * half]], color);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clima_grava_e_le() {
        let mut w = Weather::default();
        w.start(Sky::Thunder, 0.5);
        let r = Weather::load(&w.save());
        assert!(r.kind == Sky::Thunder && (r.left - w.left).abs() < 1.0 && r.raining() && r.gloom() > 0.5);
        assert!(!Weather::load("lixo").raining());
    }
}
