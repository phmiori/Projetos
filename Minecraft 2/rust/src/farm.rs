//! Plantações: trigo, cenoura, batata e beterraba (três fases cada), cana-de-açúcar e farinha de osso.

use crate::block::{self, AIR, DIRT, GRASS, SAND, SUGAR_CANE};
use crate::Game;

pub const BONE_MEAL: i32 = 303;

/// (primeiro bloco da plantação, item que se planta, o que dá madura)
pub const CROPS: [(u8, i32, i32); 4] = [(167, 237, 238), (219, 297, 297), (222, 298, 298), (225, 301, 300)];

/// Se é uma plantação: (índice em CROPS, fase 0..2).
pub fn crop(b: u8) -> Option<(usize, u8)> {
    CROPS.iter().position(|c| (c.0..c.0 + 3).contains(&b)).map(|i| (i, b - CROPS[i].0))
}

/// O bloco que o item planta na terra arada (0 = não é de plantar).
pub fn crop_of_item(item: i32) -> u8 {
    CROPS.iter().find(|c| c.1 == item).map_or(AIR, |c| c.0)
}

impl Game {
    /// A cana precisa de cana embaixo, ou de terra, grama ou areia com água do lado.
    pub fn cane_can_grow(&self, x: i32, y: i32, z: i32) -> bool {
        let below = self.get(x, y - 1, z);
        if below == SUGAR_CANE {
            return true;
        }
        matches!(below, GRASS | DIRT | SAND) && [(1, 0), (-1, 0), (0, 1), (0, -1)].iter().any(|(dx, dz)| block::is_water(self.get(x + dx, y - 1, z + dz)))
    }

    /// O que sai a mais de uma plantação quebrada (a semente de volta já vem da tabela de blocos).
    pub fn crop_loot(&mut self, b: u8, x: i32, y: i32, z: i32) {
        if b == block::MELON {
            for _ in 0..3 + self.int(4) {
                self.drop_at_block(305, x, y, z);
            }
        }
        let Some((i, stage)) = crop(b) else { return };
        if stage < 2 {
            return;
        }
        let (_, seed, product) = CROPS[i];
        if seed == product {
            // cenoura e batata: o próprio fruto é o que se planta
            for _ in 0..1 + self.int(3) {
                self.drop_at_block(product, x, y, z);
            }
        } else {
            self.drop_at_block(product, x, y, z);
            for _ in 0..self.int(3) {
                self.drop_at_block(seed, x, y, z);
            }
        }
    }

    /// Farinha de osso: adianta a plantação, faz a muda virar árvore e espalha mato e flores na grama.
    pub fn use_bone_meal(&mut self, b: u8, x: i32, y: i32, z: i32) -> bool {
        let used = if let Some((_, stage)) = crop(b) {
            if stage < 2 {
                self.set(x, y, z, b + 1, 0);
            }
            stage < 2
        } else if self.grow_any_sapling(b, x, y, z) {
            true
        } else if b == GRASS {
            for _ in 0..24 {
                let (dx, dz) = (self.int(7) - 3, self.int(7) - 3);
                if self.get(x + dx, y, z + dz) == GRASS && self.get(x + dx, y + 1, z + dz) == AIR {
                    let roll = self.int(10);
                    self.set(x + dx, y + 1, z + dz, if roll == 0 { block::FLOWER_YELLOW } else if roll == 1 { block::FLOWER_RED } else { block::TALL_GRASS }, 0);
                }
            }
            true
        } else {
            false
        };
        if used {
            self.hit_bits([x as f64 + 0.5, y as f64 + 0.6, z as f64 + 0.5], 0x8CF05A, 10);
            if !self.creative {
                self.inv.take_one(self.slot);
            }
        }
        used
    }

    /// Cana-de-açúcar cresce até três blocos de altura.
    pub fn grow_cane(&mut self, x: i32, y: i32, z: i32) {
        let mut height = 1;
        while self.get(x, y - height, z) == SUGAR_CANE {
            height += 1;
        }
        if height < 3 && self.get(x, y + 1, z) == AIR && self.int(3) == 0 {
            self.set(x, y + 1, z, SUGAR_CANE, 0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plantacoes_e_sementes_batem_com_a_tabela_de_blocos() {
        for (base, seed, product) in CROPS {
            assert!(crate::items::exists(seed) && crate::items::exists(product));
            assert_eq!(crop_of_item(seed), base);
            for stage in 0..3 {
                assert_eq!(crop(base + stage).map(|c| c.1), Some(stage));
                assert!(!block::info(base + stage).name.is_empty() && block::shape(base + stage) == block::CROSS);
            }
        }
        assert!(crop(block::STONE).is_none());
    }
}
