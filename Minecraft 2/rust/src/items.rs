//! Itens e receitas, vindos do jogo Java (dados/itens.txt, itens.png e receitas.txt, exportados por
//! ferramentas/ExportarBlocos.java). Ids abaixo de 200 são blocos; de 200 em diante, itens; 400+ colocam
//! os blocos de gelo.

use crate::block;
use std::collections::HashMap;
use std::sync::OnceLock;

pub const PICK: i32 = 0;
pub const AXE: i32 = 1;
pub const SHOVEL: i32 = 2;
pub const SWORD: i32 = 3;
pub const FLINT: i32 = 236;
pub const SEEDS: i32 = 237;
pub const STICK: i32 = 200;
pub const APPLE: i32 = 205;

#[derive(Clone, Default)]
pub struct ItemInfo {
    pub name: String,
    pub max_stack: i32,
    pub durability: i32,
    pub tool_kind: i32,
    pub tool_mat: i32,
    pub tool_speed: f64,
    pub food: i32,
    pub armor_piece: i32,
    pub armor_points: i32,
    /// posição do desenho 16x16 no itens.png (32 por linha)
    pub icon: i32,
}

pub struct Recipe {
    pub out: i32,
    pub count: i32,
    pub w: usize,
    pub h: usize,
    pub shapeless: bool,
    pub wood_piece: bool,
    pub cells: Vec<i32>,
}

pub struct Tables {
    pub items: HashMap<i32, ItemInfo>,
    pub recipes: Vec<Recipe>,
    /// ids de item (não bloco) na ordem do Java, para a paleta do criativo
    pub order: Vec<i32>,
}

static TABLES: OnceLock<Tables> = OnceLock::new();

pub fn tables() -> &'static Tables {
    TABLES.get_or_init(|| {
        let mut items = HashMap::new();
        let mut order = Vec::new();
        for line in include_str!("../dados/itens.txt").lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let p: Vec<&str> = line.split('|').collect();
            if p.len() < 11 {
                continue;
            }
            let n = |i: usize| p[i].trim().parse::<i32>().unwrap_or(0);
            let id = n(0);
            items.insert(
                id,
                ItemInfo {
                    name: p[1].to_string(),
                    max_stack: n(2).max(1),
                    durability: n(3),
                    tool_kind: n(4),
                    tool_mat: n(5),
                    tool_speed: p[6].trim().parse().unwrap_or(1.0),
                    food: n(7),
                    armor_piece: n(8),
                    armor_points: n(9),
                    icon: n(10),
                },
            );
            order.push(id);
        }
        let mut recipes = Vec::new();
        for line in include_str!("../dados/receitas.txt").lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let p: Vec<&str> = line.split('|').collect();
            if p.len() < 7 {
                continue;
            }
            let n = |i: usize| p[i].trim().parse::<i32>().unwrap_or(0);
            recipes.push(Recipe {
                out: n(0),
                count: n(1),
                w: n(2) as usize,
                h: n(3) as usize,
                shapeless: p[4] == "1",
                wood_piece: p[5] == "1",
                cells: p[6].split(',').map(|c| c.trim().parse().unwrap_or(0)).collect(),
            });
        }
        Tables { items, recipes, order }
    })
}

pub fn info(id: i32) -> Option<&'static ItemInfo> {
    tables().items.get(&id)
}

/// O item existe (bloco na forma de item, item ou colocador de gelo)?
pub fn exists(id: i32) -> bool {
    id > 0 && (info(id).is_some() || block::block_of_item(id) != block::AIR)
}

pub fn name(id: i32) -> String {
    if let Some(i) = info(id) {
        return i.name.clone();
    }
    let b = block::block_of_item(id);
    if b != block::AIR { block::info(b).name.clone() } else { format!("item {id}") }
}

pub fn max_stack(id: i32) -> i32 {
    info(id).map_or(64, |i| i.max_stack)
}

pub fn durability(id: i32) -> i32 {
    info(id).map_or(0, |i| i.durability)
}

pub fn is_durable(id: i32) -> bool {
    durability(id) > 0
}

/// Velocidade de quebrar o bloco com o item na mão, e se o bloco dá algo (Items.mining do Java).
pub fn mining(id: i32, b: u8) -> (f64, bool) {
    let bi = block::info(b);
    let (mat, need) = (bi.material, bi.tier);
    let mut speed = 1.0;
    let mut tier = -1;
    if let Some(i) = info(id) {
        if i.tool_kind >= 0 {
            let k = i.tool_kind;
            let right = (k == PICK && mat == block::M_ROCK) || (k == AXE && mat == block::M_WOOD) || (k == SHOVEL && mat == block::M_SOIL) || (k == SWORD && mat == block::M_PLANT);
            if right {
                speed = i.tool_speed;
            }
            if k == PICK {
                tier = i.tool_mat;
            }
        }
    }
    let drops = need < 0 || tier >= need;
    if !drops {
        speed *= 0.3;
    }
    (speed, drops)
}

/// Tábuas de bétula valem como tábuas comuns nas receitas que não são peças de madeira.
fn same(id: i32) -> i32 {
    if id == 171 { 8 } else { id }
}

/// A receita que a grade (size x size) monta, ou None (Items.match do Java: primeiro com os itens exatos,
/// depois aceitando tábuas de bétula no lugar das comuns).
pub fn match_recipe(grid: &[i32], size: usize) -> Option<&'static Recipe> {
    let (mut min_x, mut min_y, mut max_x, mut max_y, mut n) = (size, size, 0usize, 0usize, 0usize);
    for y in 0..size {
        for x in 0..size {
            if grid[y * size + x] != 0 {
                n += 1;
                min_x = min_x.min(x);
                max_x = max_x.max(x);
                min_y = min_y.min(y);
                max_y = max_y.max(y);
            }
        }
    }
    if n == 0 {
        return None;
    }
    let (w, h) = (max_x - min_x + 1, max_y - min_y + 1);
    for loose in [false, true] {
        for r in &tables().recipes {
            if loose && r.wood_piece {
                continue;
            }
            if r.shapeless {
                if r.cells.len() != n {
                    continue;
                }
                let mut a: Vec<i32> = grid.iter().filter(|&&c| c != 0).map(|&c| if loose { same(c) } else { c }).collect();
                let mut b = r.cells.clone();
                a.sort();
                b.sort();
                if a == b {
                    return Some(r);
                }
                continue;
            }
            if r.w != w || r.h != h {
                continue;
            }
            for mirror in [false, true] {
                let mut ok = true;
                'cells: for y in 0..h {
                    for x in 0..w {
                        let want = r.cells[y * w + if mirror { w - 1 - x } else { x }];
                        let got = grid[(min_y + y) * size + min_x + x];
                        if (if loose { same(got) } else { got }) != want {
                            ok = false;
                            break 'cells;
                        }
                    }
                }
                if ok {
                    return Some(r);
                }
            }
        }
    }
    None
}

/// Tudo o que aparece na paleta do criativo: os blocos (só a forma de item), o gelo e depois os itens.
pub fn palette() -> Vec<i32> {
    let mut l: Vec<i32> = (1..block::count()).filter(|&b| block::info(b as u8).item_form && b < 200).map(|b| b as i32).collect();
    l.extend(block::table().placers.iter().map(|p| p.0));
    l.extend(tables().order.iter().cloned());
    l
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tronco_vira_tabuas() {
        let r = match_recipe(&[0, 0, 6, 0], 2).expect("receita do tronco");
        assert_eq!((r.out, r.count), (8, 4));
    }

    #[test]
    fn bancada_com_tabuas_de_betula() {
        // 2x2 de tábuas faz bancada; com tábuas de bétula também (vale como tábua comum)
        assert_eq!(match_recipe(&[8, 8, 8, 8], 2).map(|r| r.out), Some(20));
        assert_eq!(match_recipe(&[171, 171, 171, 171], 2).map(|r| r.out), Some(20));
    }

    #[test]
    fn picareta_de_pedra_na_bancada() {
        let g = [4, 4, 4, 0, 200, 0, 0, 200, 0];
        assert_eq!(match_recipe(&g, 3).map(|r| r.out), Some(217));
    }

    #[test]
    fn picareta_quebra_pedra_rapido_e_da_pedregulho() {
        let (mao, da_mao) = mining(0, crate::block::STONE);
        let (pic, da_pic) = mining(217, crate::block::STONE);
        assert!(!da_mao && da_pic, "pedra só dá item com picareta");
        assert!(pic > mao * 10.0);
    }
}
