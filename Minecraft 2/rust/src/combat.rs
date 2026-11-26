//! Combate e experiência: barra de XP e níveis, golpe com tempo de recarga (e acerto crítico), escudo e a
//! pérola do End. Aqui fica também o estado novo do jogo (Extras).

use crate::explore::{Boat, Fishing};
use crate::ui::{rgba, Ui};
use crate::weather::Weather;
use crate::Game;
use std::collections::HashSet;

pub const SHIELD: i32 = 313;
pub const ENDER_PEARL: i32 = 314;

/// O estado que esta atualização acrescentou ao jogo.
#[derive(Default)]
pub struct Extras {
    /// experiência total acumulada
    pub xp: i32,
    /// segundos desde o último golpe (a força volta aos poucos)
    pub since_attack: f64,
    pub pearl_cd: f64,
    /// vilas que já ganharam moradores (região)
    pub villages_done: HashSet<(i32, i32)>,
    pub village_timer: f64,
    /// id do aldeão com a tela de trocas aberta
    pub trade_with: i32,
    pub boats: Vec<Boat>,
    /// barco em que o jogador está
    pub riding: Option<usize>,
    pub fishing: Option<Fishing>,
    pub weather: Weather,
}

/// Pontos para passar do nível n para o seguinte.
fn need(level: i32) -> i32 {
    7 + level * 2
}

/// (nível, fração até o próximo)
pub fn level_of(xp: i32) -> (i32, f32) {
    let (mut level, mut rest) = (0, xp.max(0));
    while rest >= need(level) {
        rest -= need(level);
        level += 1;
    }
    (level, rest as f32 / need(level) as f32)
}

/// Quanto tempo o golpe leva para recuperar a força, conforme o que está na mão.
fn recharge(item: i32) -> f64 {
    match crate::items::info(item).map_or(-1, |i| i.tool_kind) {
        crate::items::SWORD => 0.6,
        crate::items::AXE => 1.0,
        crate::items::PICK | crate::items::SHOVEL => 0.8,
        _ => 0.3,
    }
}

impl Game {
    pub fn add_xp(&mut self, n: i32) {
        if n <= 0 || self.creative {
            return;
        }
        let before = level_of(self.ex.xp).0;
        self.ex.xp += n;
        let after = level_of(self.ex.xp).0;
        if after > before {
            crate::sound::play("coletar", 1.0);
            self.notice(format!("Nível {after}!"));
        }
    }

    /// Experiência de minerar os minérios que já saem do bloco prontos.
    pub fn xp_for_block(&mut self, b: u8) {
        let n = match b {
            crate::block::COAL_ORE => 1,
            crate::block::CRYSTAL_ORE => 5,
            crate::block::EMERALD_ORE => 5,
            _ => 0,
        };
        self.add_xp(n);
    }

    /// Força do golpe agora: de 0,2 (acabou de bater) a 1.
    pub fn attack_strength(&self) -> f64 {
        let c = (self.ex.since_attack / recharge(self.inv.s[self.slot].id)).min(1.0);
        0.2 + 0.8 * c * c
    }

    /// Dano do golpe (e recomeça a recarga). Golpe cheio caindo é crítico.
    pub fn swing_damage(&mut self, base: f64) -> (f64, bool) {
        let strength = self.attack_strength();
        let critical = strength > 0.9 && !self.player.on_ground && self.player.vy < -1.0 && !self.player.in_water && !self.player.flying;
        self.ex.since_attack = 0.0;
        (base * strength * if critical { 1.5 } else { 1.0 }, critical)
    }

    /// Segurando o botão direito com o escudo na mão.
    pub fn blocking(&self) -> bool {
        self.r_held && self.screen == crate::Screen::Play && self.inv.s[self.slot].id == SHIELD
    }

    /// O escudo apara um golpe que vem de (x, z)? Só os que vêm da frente.
    pub fn shield_blocks(&mut self, x: f64, z: f64) -> bool {
        if !self.blocking() {
            return false;
        }
        let (dx, dz) = (x - self.player.x, z - self.player.z);
        let d = (dx * dx + dz * dz).sqrt().max(0.01);
        if (dx * self.player.yaw.sin() + dz * self.player.yaw.cos()) / d < 0.2 {
            return false;
        }
        crate::sound::play("quebrar_madeira", 0.9);
        if !self.creative && self.inv.use_tool(self.slot) {
            self.notice("Seu escudo quebrou!".into());
        }
        true
    }

    /// Pérola do End: leva até o bloco que você está olhando (até 40 blocos).
    pub fn use_pearl(&mut self) -> bool {
        if self.inv.s[self.slot].id != ENDER_PEARL {
            return false;
        }
        if self.ex.pearl_cd > 0.0 {
            return true;
        }
        let e = self.eye();
        let f = self.forward();
        let o = [e[0] as f64, e[1] as f64, e[2] as f64];
        let Some(hit) = self.raycast(o, [f[0] as f64, f[1] as f64, f[2] as f64], 40.0) else {
            self.notice("Mire num bloco a até 40 blocos".into());
            return true;
        };
        let from = (self.player.x, self.player.y, self.player.z);
        (self.player.x, self.player.y, self.player.z) = (hit.prev[0] as f64 + 0.5, hit.prev[1] as f64 + 0.05, hit.prev[2] as f64 + 0.5);
        if self.player.collides(&crate::Loaded(&self.chunks)) {
            (self.player.x, self.player.y, self.player.z) = from;
            return true;
        }
        (self.player.vx, self.player.vy, self.player.vz, self.player.fall_dist) = (0.0, 0.0, 0.0, 0.0);
        self.ex.pearl_cd = 1.0;
        crate::sound::play("arco_disparo", 0.6);
        if !self.creative {
            self.inv.take_one(self.slot);
            self.damage(3.0);
        }
        true
    }

    /// Barra de experiência em cima da barra de itens e a recarga do golpe embaixo da mira.
    pub fn draw_combat_hud(&self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        let strength = ((self.ex.since_attack / recharge(self.inv.s[self.slot].id)).min(1.0)) as f32;
        if strength < 1.0 && self.screen == crate::Screen::Play {
            ui.rect(w / 2.0 - 14.0 * k, h / 2.0 + 26.0 * k, 28.0 * k, 4.0 * k, rgba(0, 0, 0, 150));
            ui.rect(w / 2.0 - 14.0 * k, h / 2.0 + 26.0 * k, 28.0 * k * strength, 4.0 * k, rgba(235, 235, 235, 235));
        }
        if self.blocking() {
            ui.centered(13.0 * k, w / 2.0, h / 2.0 + 48.0 * k, "Defendendo", rgba(190, 215, 255, 230));
        }
        if self.creative {
            return;
        }
        let size = 52.0 * k;
        let (x0, bw) = ((w - 9.0 * size) / 2.0, 9.0 * size - 4.0 * k);
        let y = h - size - 14.0 * k - 11.0 * k;
        let (level, part) = level_of(self.ex.xp);
        ui.rect(x0, y, bw, 4.0 * k, rgba(20, 30, 14, 220));
        ui.rect(x0, y, bw * part, 4.0 * k, rgba(126, 230, 66, 255));
        if level > 0 {
            ui.shadow(14.0 * k, w / 2.0 - 4.0 * k, y - 4.0 * k, &level.to_string(), rgba(150, 250, 90, 255));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn niveis_sobem_cada_vez_mais_devagar() {
        assert_eq!(level_of(0), (0, 0.0));
        assert_eq!(level_of(7).0, 1);
        assert_eq!(level_of(7 + 9).0, 2);
        assert!(level_of(1000).0 < 35);
    }
}
