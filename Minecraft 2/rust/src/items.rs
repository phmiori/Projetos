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
    /// fornalha: item -> (no que vira, quantos itens assa como combustível)
    pub furnace: HashMap<i32, (i32, i32)>,
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
        let mut furnace = HashMap::new();
        for line in include_str!("../dados/fornalha.txt").lines() {
            let p: Vec<i32> = line.split('|').filter_map(|v| v.trim().parse().ok()).collect();
            if !line.starts_with('#') && p.len() == 3 {
                furnace.insert(p[0], (p[1], p[2]));
            }
        }
        Tables { furnace, items, recipes, order }
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

/// No que o item vira na fornalha (0 = não assa).
pub fn smelt(id: i32) -> i32 {
    tables().furnace.get(&id).map_or(0, |f| f.0)
}

/// Quantos itens o combustível assa (0 = não queima).
pub fn fuel(id: i32) -> i32 {
    tables().furnace.get(&id).map_or(0, |f| f.1)
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

/// Dano ao bater numa criatura com o item na mão (Items.damage do Java).
pub fn damage(id: i32) -> f64 {
    match info(id) {
        Some(i) if i.tool_kind >= 0 => {
            let m = i.tool_mat as f64;
            match i.tool_kind {
                SWORD => 4.0 + m * 1.5,
                AXE => 3.0 + m,
                _ => 2.0 + m * 0.5,
            }
        }
        _ => 1.0,
    }
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

/// O item que coloca um bloco de id 200 ou mais.
pub fn item_of(b: u8) -> i32 {
    block::table().placers.iter().find(|p| p.1 == b).map_or(0, |p| p.0)
}

/// Tábuas de bétula e de cerejeira valem como tábuas comuns nas receitas que não são peças de madeira.
fn same(id: i32) -> i32 {
    if id == 171 || id == 425 { 8 } else { id }
}

/// Nome do arquivo do desenho do item: "Lingote de ferro" vira "lingote_de_ferro.png".
/// Cor de cada material de armadura (0xRRGGBB), pelo nome da peça: couro, ferro, diamante, ouro, cobre, esmeralda,
/// rubi, safira e ametista.
pub fn armor_color(name: &str) -> u32 {
    let n = name.to_lowercase();
    [("couro", 0x8B5A2B), ("ferro", 0xD2D5DB), ("diamante", 0x4FD8D0), ("ouro", 0xF2C230), ("cobre", 0xD97A45), ("esmeralda", 0x3CCB6A), ("rubi", 0xD42A3C), ("safira", 0x3466E0), ("ametista", 0xA466E6)]
        .iter()
        .find(|(m, _)| n.ends_with(m))
        .map_or(0xA0A0A0, |(_, c)| *c)
}

pub fn icon_file(name: &str) -> String {
    let mut s = String::new();
    for c in name.to_lowercase().chars() {
        let c = match c {
            'á' | 'à' | 'â' | 'ã' => 'a',
            'é' | 'ê' => 'e',
            'í' => 'i',
            'ó' | 'ô' | 'õ' => 'o',
            'ú' => 'u',
            'ç' => 'c',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            s.push(c);
        } else if !s.is_empty() && !s.ends_with('_') {
            s.push('_');
        }
    }
    format!("{}.png", s.trim_end_matches('_'))
}

/// Os desenhos dos itens que o jogador pode trocar: um PNG de 16x16 por item na pasta `dir`. O que faltar é criado
/// com o desenho padrão (da folha embutida, 32 por linha); depois a folha recebe o que está nos arquivos.
/// A folha final dos desenhos dos itens (células de `ui::ICON` px), a mesma do atlas: a mão usa para dar espessura.
pub static ICON_SHEET: std::sync::OnceLock<image::RgbaImage> = std::sync::OnceLock::new();

/// Põe na folha (células de `cell` px, 32 por linha) os desenhos de `dir/<nome>.png`; os que faltam são criados.
pub fn load_item_art(dir: &std::path::Path, sheet: &mut image::RgbaImage, cell: u32) {
    let _ = std::fs::create_dir_all(dir);
    for id in &tables().order {
        let info = &tables().items[id];
        let (x0, y0) = ((info.icon % 32) as u32 * cell, (info.icon / 32) as u32 * cell);
        if x0 + cell > sheet.width() || y0 + cell > sheet.height() {
            continue;
        }
        let path = dir.join(icon_file(&info.name));
        if !path.exists() {
            let _ = image::imageops::crop_imm(sheet, x0, y0, cell, cell).to_image().save(&path);
            continue;
        }
        match image::open(&path) {
            Ok(img) => {
                let mut img = img.to_rgba8();
                if img.dimensions() != (cell, cell) {
                    img = image::imageops::resize(&img, cell, cell, image::imageops::FilterType::Nearest);
                }
                image::imageops::replace(sheet, &img, x0 as i64, y0 as i64);
            }
            Err(e) => println!("não consegui ler {}: {e}", path.display()),
        }
    }
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
    fn toda_receita_monta_o_proprio_resultado_com_itens_que_existem() {
        for r in &tables().recipes {
            assert!(exists(r.out), "resultado {} não existe", r.out);
            assert!(r.cells.iter().all(|&c| c == 0 || exists(c)), "ingrediente inexistente na receita de {}", r.out);
            let mut grid = [0i32; 9];
            for (i, &c) in r.cells.iter().enumerate() {
                let w = if r.shapeless { 3 } else { r.w };
                grid[(i / w) * 3 + i % w] = c;
            }
            assert_eq!(match_recipe(&grid, 3).map(|m| m.out), Some(r.out), "a receita de {} está encoberta por outra", r.out);
        }
        for (from, (to, _)) in &tables().furnace {
            assert!(exists(*from) && (*to == 0 || exists(*to)), "fornalha: {from} -> {to}");
        }
    }

    #[test]
    fn cada_item_tem_o_seu_arquivo_e_o_desenho_trocado_vale() {
        let t = tables();
        let mut names: Vec<String> = t.order.iter().map(|i| icon_file(&t.items[i].name)).collect();
        let mut cells: Vec<i32> = t.order.iter().map(|i| t.items[i].icon).collect();
        let n = names.len();
        names.sort();
        names.dedup();
        cells.sort();
        cells.dedup();
        assert_eq!((names.len(), cells.len()), (n, n), "dois itens com o mesmo arquivo ou o mesmo lugar");
        assert_eq!(icon_file("Maçã"), "maca.png");
        assert_eq!(icon_file("Ovo de tigre-de-bengala"), "ovo_de_tigre_de_bengala.png");

        let dir = std::env::temp_dir().join(format!("mb-itens-{}", std::process::id()));
        let small = image::load_from_memory(include_bytes!("../dados/itens.png")).unwrap().to_rgba8();
        // como no jogo: a folha tem 6 linhas (as 2 de baixo são dos itens novos)
        let mut original = image::RgbaImage::new(small.width(), 6 * 16);
        image::imageops::replace(&mut original, &small, 0, 0);
        // na primeira vez os arquivos são criados e a folha não muda
        let mut sheet = original.clone();
        load_item_art(&dir, &mut sheet, 16);
        assert!(sheet == original);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), n);
        // um desenho trocado (aqui maior, 32x32) entra no lugar dele e não é sobrescrito
        image::RgbaImage::from_pixel(32, 32, image::Rgba([1, 2, 3, 255])).save(dir.join("graveto.png")).unwrap();
        load_item_art(&dir, &mut sheet, 16);
        let cell = t.items[&STICK].icon;
        assert_eq!(sheet.get_pixel((cell % 32) as u32 * 16 + 5, (cell / 32) as u32 * 16 + 5).0, [1, 2, 3, 255]);
        assert_eq!(image::open(dir.join("graveto.png")).unwrap().to_rgba8().dimensions(), (32, 32));
        std::fs::remove_dir_all(&dir).unwrap();
    }

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
