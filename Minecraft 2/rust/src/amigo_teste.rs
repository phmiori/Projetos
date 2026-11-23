//! Teste automático do lado do amigo (`--amigo-teste`), para rodar contra o teste do jogo Java
//! (`-Dbench -Dbench.world -Dbench.arrows -Dbench.survival -Dbench.host`): como o benchArrowsClient do Java,
//! acha o palco do anfitrião, abre o baú dele pela rede e pega os pães, atira no anfitrião e conta o que aconteceu.

use crate::block::CHEST;
use crate::Game;

#[derive(Default)]
pub struct FriendTest {
    t: f64,
    phase: u8,
    chest: Option<(i32, i32, i32)>,
    health: f64,
}

fn say(s: String) {
    println!("AMIGO RUST: {s}");
}

impl FriendTest {
    pub fn update(&mut self, g: &mut Game, dt: f64) {
        if !g.is_client() {
            return;
        }
        self.t += dt;
        let host = g.net.as_ref().and_then(|n| n.remotes.get(&0)).filter(|r| r.has_state).map(|r| r.pos);
        if g.health < self.health - 0.5 && self.phase > 0 {
            // perdeu vida: onde estava e o que havia por perto
            let p = (g.player.x, g.player.y, g.player.z);
            let near: Vec<String> = g.mobs.iter().filter(|m| (m.body.x - p.0).hypot(m.body.z - p.2) < 6.0).map(|m| format!("{}", crate::mob::info(m.t).name)).collect();
            say(format!("vida {:.1} -> {:.1} (t {:.1} s) em {:.1},{:.1},{:.1}; perto: {}", self.health, g.health, self.t, p.0, p.1, p.2, near.join(", ")));
        }
        self.health = g.health;
        match self.phase {
            0 if self.t > 3.0 => {
                let Some(h) = host else { return };
                // o baú do palco (y 61) perto do anfitrião
                let (hx, hz) = (h[0].floor() as i32, h[2].floor() as i32);
                'busca: for x in hx - 30..=hx + 30 {
                    for z in hz - 30..=hz + 30 {
                        if g.get(x, 61, z) == CHEST {
                            self.chest = Some((x, 61, z));
                            break 'busca;
                        }
                    }
                }
                let Some((cx, _, cz)) = self.chest else {
                    say("não achei o baú do palco do anfitrião".into());
                    self.phase = 99;
                    return;
                };
                self.phase = 1;
                g.player.x = cx as f64 + 5.5;
                g.player.y = 61.01;
                g.player.z = cz as f64 + 0.5;
                g.player.vx = 0.0;
                g.player.vy = 0.0;
                g.player.vz = 0.0;
                g.player.flying = false;
                g.inv.s[0] = crate::inventory::Stack::new(crate::tools::BOW, 1, 0);
                g.inv.s[1] = crate::inventory::Stack::new(crate::tools::ARROW, 10, 0);
                g.slot = 0;
                say(format!("entrei: {} criatura(s), {} jogador(es) remotos, baú em {cx},61,{cz}", g.mobs.len(), g.net.as_ref().map_or(0, |n| n.remotes.len())));
            }
            1 if self.t > 4.0 => {
                self.phase = 2;
                let (x, y, z) = self.chest.unwrap();
                g.open_container(x, y, z, CHEST);
                say("pedi para abrir o baú".into());
            }
            2 if self.t > 6.0 => {
                self.phase = 3;
                let (x, y, z) = self.chest.unwrap();
                let k = crate::containers::key(x, y, z);
                let Some(c) = g.chests.get_mut(&k).filter(|_| g.screen == crate::Screen::Inventory) else {
                    say("O BAÚ NÃO ABRIU".into());
                    return;
                };
                let mut moved = 0;
                let stacks: Vec<_> = c.iter_mut().filter(|s| !s.empty()).map(std::mem::take).collect();
                for s in stacks {
                    moved += s.count;
                    g.inv.add(s.id, s.count, s.wear);
                }
                g.close_inventory(); // manda o baú (agora vazio) de volta ao anfitrião
                say(format!("abri o baú e peguei {moved} item(ns); fechei"));
            }
            3 if self.t > 8.0 => {
                self.phase = 4;
                let Some(h) = host else { return };
                // mira no peito do anfitrião e atira com o arco puxado até o fim
                let (dx, dy, dz) = (h[0] - g.player.x, h[1] + 1.0 - (g.player.y + crate::physics::EYE), h[2] - g.player.z);
                g.player.yaw = dx.atan2(dz);
                g.player.pitch = dy.atan2((dx * dx + dz * dz).sqrt()) + 0.02;

                g.fire_bow(1.0);
                say(format!("atirei no anfitrião (em {:.1},{:.1},{:.1}); flechas {}", h[0], h[1], h[2], g.inv.s[1].count));
            }
            4 if self.t > 45.0 => {
                self.phase = 5;
                let items: Vec<String> = g.inv.s.iter().filter(|s| !s.empty()).map(|s| format!("{}x{}", crate::items::name(s.id), s.count)).collect();
                say(format!("FIM: vida {:.1}; inventário: {}", g.health, items.join(", ")));
            }
            _ => {}
        }
    }
}
