//! Baús e fornalhas, traduzidos do BlockGame.java. O conteúdo fica no meta.properties do mundo, igual ao Java:
//!   bau.x,y,z      = os 27 espaços do baú ("id:qtd:desgaste,...")
//!   fornalha.x,y,z = entrada, combustível e resultado | calor | calor máximo | progresso
//! As fornalhas assam o tempo todo, com a tela aberta ou não, e o bloco acende enquanto assa.

use crate::block::{self, CHEST, FURNACE, FURNACE_LIT};
use crate::inventory::{add_to, Stack};
use crate::items;
use crate::noise::JavaRandom;
use crate::Game;

pub const CHEST_SIZE: usize = 27;
/// Segundos para assar um item na fornalha comum (BlockGame.smeltTime).
const SMELT_TIME: f64 = 8.0;

#[derive(Clone, Default)]
pub struct Furnace {
    /// 0 entrada, 1 combustível, 2 resultado
    pub inv: [Stack; 3],
    pub heat: f64,
    pub heat_max: f64,
    pub progress: f64,
    pub burning: bool,
}

/// Qual baú ou fornalha está aberto na tela.
#[derive(Clone, PartialEq, Debug)]
pub enum Open {
    Chest(String),
    Furnace(String),
}

pub fn key(x: i32, y: i32, z: i32) -> String {
    format!("{x},{y},{z}")
}

fn parse_key(k: &str) -> Option<(i32, i32, i32)> {
    let v: Vec<i32> = k.split(',').filter_map(|s| s.trim().parse().ok()).collect();
    if v.len() == 3 { Some((v[0], v[1], v[2])) } else { None }
}

/// Lê espaços no formato do Java ("id:qtd:desgaste,...").
pub fn parse_slots(text: &str, n: usize) -> Vec<Stack> {
    let mut out = vec![Stack::default(); n];
    for (i, part) in text.split(',').take(n).enumerate() {
        let p: Vec<i32> = part.split(':').map(|v| v.trim().parse().unwrap_or(0)).collect();
        if p.len() >= 2 && items::exists(p[0]) {
            out[i] = Stack::new(p[0], p[1].min(items::max_stack(p[0])), *p.get(2).unwrap_or(&0));
        }
    }
    out
}

/// Grava espaços no formato do Java, com os dois-pontos escapados como o Properties faz.
pub fn serialize_slots(s: &[Stack]) -> String {
    s.iter()
        .map(|st| if st.empty() { "0\\:0\\:0".to_string() } else { format!("{}\\:{}\\:{}", st.id, st.count, st.wear) })
        .collect::<Vec<_>>()
        .join(",")
}

impl Furnace {
    pub fn parse(text: &str) -> Furnace {
        let p: Vec<&str> = text.split('|').collect();
        let slots = parse_slots(p.first().unwrap_or(&""), 3);
        let num = |i: usize| p.get(i).and_then(|v| v.trim().parse::<f64>().ok()).unwrap_or(0.0);
        Furnace { inv: [slots[0], slots[1], slots[2]], heat: num(1), heat_max: num(2), progress: num(3), burning: false }
    }

    pub fn serialize(&self) -> String {
        format!("{}|{}|{}|{}", serialize_slots(&self.inv), self.heat, self.heat_max, self.progress)
    }

    pub fn empty(&self) -> bool {
        self.inv.iter().all(|s| s.empty()) && self.heat <= 0.0
    }

    /// Um passo da fornalha (BlockGame.tickFurnace): acende o combustível e, a cada SMELT_TIME, passa um item.
    pub fn tick(&mut self, dt: f64) {
        self.burning = false;
        let input = self.inv[0];
        let out = items::smelt(input.id);
        let res = self.inv[2];
        let room = res.empty() || (res.id == out && res.count < items::max_stack(out));
        if input.empty() || out == 0 || !room {
            self.progress = 0.0;
            return;
        }
        if self.heat <= 0.0 {
            let f = if self.inv[1].empty() { 0 } else { items::fuel(self.inv[1].id) };
            if f == 0 {
                self.progress = 0.0;
                return;
            }
            let fu = self.inv[1];
            self.inv[1] = Stack::new(fu.id, fu.count - 1, fu.wear);
            self.heat = f as f64;
            self.heat_max = f as f64;
        }
        self.burning = true;
        self.progress += dt / SMELT_TIME;
        if self.progress >= 1.0 {
            self.progress = 0.0;
            self.inv[0] = Stack::new(input.id, input.count - 1, input.wear);
            self.inv[2] = Stack::new(out, if res.empty() { 0 } else { res.count } + 1, 0);
            self.heat -= 1.0;
        }
    }
}

impl Game {
    /// O conteúdo do baú; um baú de iglu ainda não aberto vem com os itens do iglu (BlockGame.chestFor).
    pub fn chest_for(&mut self, x: i32, y: i32, z: i32) -> String {
        let k = key(x, y, z);
        if !self.chests.contains_key(&k) {
            let mut c = vec![Stack::default(); CHEST_SIZE];
            if self.gen.igloo_chest(x, y, z) {
                fill_igloo_loot(&mut c, x, y, z);
            }
            self.chests.insert(k.clone(), c);
        }
        k
    }

    /// Botão direito num baú ou fornalha: abre a tela dele.
    pub fn open_container(&mut self, x: i32, y: i32, z: i32, b: u8) {
        if self.is_client() {
            // no mundo de outro, o conteúdo está com o anfitrião: ele manda e a tela abre quando chegar
            let t = if b == CHEST { crate::net::CHEST_OPEN } else { crate::net::FURNACE_OPEN };
            if let Some(n) = &self.net {
                n.send(crate::net::Out::new(t).i(x).i(y).i(z), None);
            }
            return;
        }
        let open = if b == CHEST {
            Open::Chest(self.chest_for(x, y, z))
        } else {
            let k = key(x, y, z);
            self.furnaces.entry(k.clone()).or_default();
            Open::Furnace(k)
        };
        self.open = Some(open);
        self.screen = crate::Screen::Inventory;
        self.release_mouse = true;
    }

    /// O baú ou a fornalha foi quebrado: o que havia dentro cai no chão.
    pub fn spill_container(&mut self, x: i32, y: i32, z: i32, b: u8) {
        if self.is_client() {
            return; // quem espalha o conteúdo é o anfitrião
        }
        let k = key(x, y, z);
        let stacks: Vec<Stack> = if b == CHEST {
            self.chests.remove(&k).unwrap_or_default()
        } else {
            self.furnaces.remove(&k).map(|f| f.inv.to_vec()).unwrap_or_default()
        };
        if self.open.as_ref().map_or(false, |o| matches!(o, Open::Chest(c) | Open::Furnace(c) if *c == k)) {
            self.open = None;
        }
        for st in stacks {
            if !st.empty() {
                let (vx, vz) = ((self.rng.next() - 0.5) * 2.4, (self.rng.next() - 0.5) * 2.4);
                self.spawn_drop(st, [x as f64 + 0.5, y as f64 + 0.3, z as f64 + 0.5], [vx, 3.2, vz], 0.5);
            }
        }
    }

    /// Todas as fornalhas dos pedaços carregados assam; o bloco acende enquanto assa.
    pub fn tick_furnaces(&mut self, dt: f64) {
        let mut keys: Vec<String> = self.furnaces.keys().cloned().collect();
        if self.is_client() {
            // amigo: assa só a que está aberta; as fechadas ficam com o anfitrião
            keys.retain(|k| self.open == Some(Open::Furnace(k.clone())));
        }
        for k in keys {
            let Some((x, y, z)) = parse_key(&k) else { continue };
            if !self.chunks.contains_key(&(x >> 4, z >> 4)) {
                continue; // pedaço longe: espera
            }
            let b = self.get(x, y, z);
            if b != FURNACE && b != FURNACE_LIT {
                self.furnaces.remove(&k);
                continue;
            }
            let lit = {
                let f = self.furnaces.get_mut(&k).unwrap();
                f.tick(dt);
                f.burning
            };
            let want = if lit { FURNACE_LIT } else { FURNACE };
            if b != want {
                let rot = self.rotation_at(x, y, z);
                self.set(x, y, z, want, rot);
            }
            let open_here = self.open == Some(Open::Furnace(k.clone()));
            if !open_here && self.furnaces.get(&k).map_or(false, |f| f.empty()) {
                self.furnaces.remove(&k); // vazia: nada a guardar
            }
        }
    }

    pub fn rotation_at(&self, x: i32, y: i32, z: i32) -> u8 {
        match self.chunks.get(&(x >> 4, z >> 4)) {
            Some(c) if (0..crate::world::SY).contains(&y) => *c.rot.get(&(crate::world::idx(x & 15, y, z & 15) as u16)).unwrap_or(&0),
            _ => 0,
        }
    }

    /// Guarda itens no baú aberto. Retorna o que não coube.
    pub fn add_to_open(&mut self, st: Stack) -> i32 {
        match self.open.clone() {
            Some(Open::Chest(k)) => self.chests.get_mut(&k).map_or(st.count, |c| add_to(c, st.id, st.count, st.wear)),
            Some(Open::Furnace(k)) => {
                let Some(f) = self.furnaces.get_mut(&k) else { return st.count };
                // o que assa vai para a entrada; o que queima, para o combustível
                let slot = if items::smelt(st.id) != 0 { 0 } else if items::fuel(st.id) != 0 { 1 } else { return st.count };
                add_to(&mut f.inv[slot..slot + 1], st.id, st.count, st.wear)
            }
            None => st.count,
        }
    }
}

/// O que se acha no baú do iglu (sempre o mesmo para cada iglu): BlockGame.fillIglooLoot.
fn fill_igloo_loot(c: &mut [Stack], x: i32, y: i32, z: i32) {
    let seed = (x as i64).wrapping_mul(341873128712).wrapping_add((z as i64).wrapping_mul(132897987541)).wrapping_add(y as i64);
    let mut r = JavaRandom::new(seed);
    // na ordem do vetor do Java (cada quantidade é sorteada em sequência)
    let loot = [
        (201, 3 + r.next_int(5)),
        (208, 2 + r.next_int(4)),
        (209, 1 + r.next_int(3)),
        (239, 1 + r.next_int(2)),
        (240, 1 + r.next_int(3)),
        (247, r.next_int(3)),
        (202, r.next_int(3)),
        (205, r.next_int(3)),
        (block::WOOL as i32, r.next_int(2)),
    ];
    // Collections.shuffle(slots, r)
    let mut slots: Vec<usize> = (0..CHEST_SIZE).collect();
    for i in (1..slots.len()).rev() {
        let j = r.next_int(i as i32 + 1) as usize;
        slots.swap(i, j);
    }
    let mut k = 0;
    for (id, n) in loot {
        if n > 0 {
            c[slots[k]] = Stack::new(id, n, 0);
            k += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn loot(x: i32, y: i32, z: i32) -> Vec<(usize, i32, i32)> {
        let mut c = vec![Stack::default(); CHEST_SIZE];
        fill_igloo_loot(&mut c, x, y, z);
        c.iter().enumerate().filter(|(_, s)| !s.empty()).map(|(i, s)| (i, s.id, s.count)).collect()
    }

    #[test]
    fn bau_do_iglu_igual_ao_java() {
        // resultado do BlockGame.fillIglooLoot do Java para as mesmas posições
        assert_eq!(loot(100, 30, 200), vec![(6, 209, 3), (12, 202, 1), (13, 208, 3), (15, 201, 5), (16, 240, 3), (20, 247, 2), (26, 239, 1)]);
        assert_eq!(loot(-1234, 27, 5678), vec![(5, 202, 2), (9, 201, 6), (12, 209, 1), (17, 208, 4), (19, 240, 3), (25, 239, 1), (26, 30, 1)]);
    }

    #[test]
    fn fornalha_assa_com_carvao() {
        let mut f = Furnace::default();
        f.inv[0] = Stack::new(4, 3, 0); // 3 pedregulhos
        f.inv[1] = Stack::new(201, 1, 0); // 1 carvão (assa 8)
        for _ in 0..170 {
            f.tick(0.1); // 17 segundos: 8 s por item
        }
        assert_eq!(f.inv[2], Stack::new(3, 2, 0)); // 2 pedras prontas
        assert!(f.inv[1].empty() && f.heat == 6.0 && f.burning);
        let txt = f.serialize();
        let g = Furnace::parse(&txt.replace(r"\:", ":"));
        assert_eq!((g.inv, g.heat), (f.inv, f.heat));
    }
}
