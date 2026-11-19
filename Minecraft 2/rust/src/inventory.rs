//! Inventário igual ao do Java: 36 espaços (0-8 = barra) mais 4 de armadura (36 capacete .. 39 botas), cada um
//! com id, quantidade e desgaste. Lê e grava no mesmo texto do meta.properties ("id:qtd:desgaste,...").

use crate::items;

pub const SIZE: usize = 36;
pub const HOTBAR: usize = 9;
pub const TOTAL: usize = 40;

#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub struct Stack {
    pub id: i32,
    pub count: i32,
    pub wear: i32,
}

impl Stack {
    pub fn new(id: i32, count: i32, wear: i32) -> Stack {
        if id <= 0 || count <= 0 { Stack::default() } else { Stack { id, count, wear } }
    }
    pub fn empty(&self) -> bool {
        self.id <= 0 || self.count <= 0
    }
}

/// Coloca n itens nos espaços dados (Inventory.addRange do Java): completa pilhas, depois ocupa vazios.
/// Retorna o que não coube.
pub fn add_to(slots: &mut [Stack], id: i32, mut n: i32, wear: i32) -> i32 {
    let max = items::max_stack(id);
    if max > 1 {
        for st in slots.iter_mut() {
            if n <= 0 {
                break;
            }
            if st.id == id && st.count > 0 && st.count < max {
                let k = n.min(max - st.count);
                st.count += k;
                n -= k;
            }
        }
    }
    for st in slots.iter_mut() {
        if n <= 0 {
            break;
        }
        if st.empty() {
            let k = n.min(max);
            *st = Stack::new(id, k, wear);
            n -= k;
        }
    }
    n
}

#[derive(Clone)]
pub struct Inventory {
    pub s: [Stack; TOTAL],
}

impl Default for Inventory {
    fn default() -> Self {
        Inventory { s: [Stack::default(); TOTAL] }
    }
}

impl Inventory {
    /// Lê o texto salvo pelo Java (Inventory.serialize).
    pub fn parse(text: &str) -> Inventory {
        let mut inv = Inventory::default();
        for (i, part) in text.split(',').take(TOTAL).enumerate() {
            let p: Vec<i32> = part.split(':').map(|v| v.trim().parse().unwrap_or(0)).collect();
            if p.len() >= 2 && items::exists(p[0]) {
                inv.s[i] = Stack::new(p[0], p[1].min(items::max_stack(p[0])), *p.get(2).unwrap_or(&0));
            }
        }
        inv
    }

    /// Texto no formato do Java (com os dois-pontos escapados, como o Properties grava).
    pub fn serialize(&self) -> String {
        self.s
            .iter()
            .map(|st| if st.empty() { "0\\:0\\:0".to_string() } else { format!("{}\\:{}\\:{}", st.id, st.count, st.wear) })
            .collect::<Vec<_>>()
            .join(",")
    }

    /// Coloca n itens nos espaços [from, to): completa pilhas, depois ocupa vazios. Retorna o que não coube.
    pub fn add_range(&mut self, id: i32, n: i32, wear: i32, from: usize, to: usize) -> i32 {
        add_to(&mut self.s[from..to], id, n, wear)
    }

    /// Guarda itens na mochila (barra primeiro, como no Java). Retorna o que não coube.
    pub fn add(&mut self, id: i32, n: i32, wear: i32) -> i32 {
        self.add_range(id, n, wear, 0, SIZE)
    }

    pub fn fits(&self, id: i32) -> bool {
        let max = items::max_stack(id);
        self.s[..SIZE].iter().any(|st| st.empty() || (st.id == id && st.count < max))
    }

    /// Tira um do espaço.
    pub fn take_one(&mut self, slot: usize) {
        let st = self.s[slot];
        self.s[slot] = Stack::new(st.id, st.count - 1, st.wear);
    }

    /// Gasta um uso da ferramenta no espaço; quebra se acabar. Retorna true se quebrou.
    pub fn use_tool(&mut self, slot: usize) -> bool {
        let st = &mut self.s[slot];
        if st.empty() || !items::is_durable(st.id) {
            return false;
        }
        st.wear += 1;
        if st.wear >= items::durability(st.id) {
            *st = Stack::default();
            return true;
        }
        false
    }

    /// Soma dos pontos de defesa das peças vestidas (0 a 20).
    pub fn armor_points(&self) -> i32 {
        self.s[SIZE..].iter().filter(|st| !st.empty()).map(|st| items::info(st.id).map_or(0, |i| i.armor_points)).sum()
    }

    /// Um golpe gasta um uso de cada peça vestida. Retorna true se alguma quebrou.
    pub fn wear_armor(&mut self) -> bool {
        let mut broke = false;
        for i in SIZE..TOTAL {
            broke |= self.use_tool(i);
        }
        broke
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_e_grava_igual_ao_java() {
        let java = "1:64:0,217:1:5,0:0:0";
        let inv = Inventory::parse(java);
        assert_eq!(inv.s[0], Stack::new(1, 64, 0));
        assert_eq!(inv.s[1], Stack::new(217, 1, 5));
        assert!(inv.serialize().starts_with(r"1\:64\:0,217\:1\:5,0\:0\:0"));
        assert_eq!(inv.serialize().split(',').count(), TOTAL);
    }

    #[test]
    fn junta_pilhas_e_respeita_o_maximo() {
        let mut inv = Inventory::default();
        assert_eq!(inv.add(3, 100, 0), 0);
        assert_eq!((inv.s[0].count, inv.s[1].count), (64, 36));
        inv.add(217, 1, 0);
        inv.add(217, 1, 0);
        assert_eq!((inv.s[2].id, inv.s[3].id), (217, 217)); // ferramenta não empilha
    }
}
