//! Tabela de blocos. Vem do jogo Java (dados/blocos.txt, gerado por ferramentas/ExportarBlocos.java),
//! então os ids, formas, texturas e caixas são sempre os mesmos nas duas versões.

use std::sync::OnceLock;

// ids usados pelo gerador de mundo (os mesmos do Block.java)
pub const AIR: u8 = 0;
pub const GRASS: u8 = 1;
pub const DIRT: u8 = 2;
pub const STONE: u8 = 3;
pub const SAND: u8 = 5;
pub const LOG: u8 = 6;
pub const LEAVES: u8 = 7;
pub const SNOW: u8 = 10;
pub const WATER: u8 = 11;
pub const COAL_ORE: u8 = 12;
pub const IRON_ORE: u8 = 13;
pub const GOLD_ORE: u8 = 14;
pub const CRYSTAL_ORE: u8 = 15;
pub const GRAVEL: u8 = 16;
pub const SANDSTONE: u8 = 17;
pub const TORCH: u8 = 19;
pub const TABLE: u8 = 20;
pub const FURNACE: u8 = 21;
pub const BIRCH_LOG: u8 = 22;
pub const BIRCH_LEAVES: u8 = 23;
pub const CACTUS: u8 = 24;
pub const TALL_GRASS: u8 = 25;
pub const FLOWER_YELLOW: u8 = 26;
pub const FLOWER_RED: u8 = 27;
pub const ICE: u8 = 28;
pub const LAVA: u8 = 29;
pub const WOOL: u8 = 30;
pub const BEDROCK: u8 = 34;
pub const WATER_FLOW: u8 = 35; // 35..41
pub const BED: u8 = 162;
pub const CHEST: u8 = 165;
pub const FURNACE_LIT: u8 = 170;
pub const PACKED_ICE: u8 = 216;
pub const BLUE_ICE: u8 = 217;
pub const ICICLE: u8 = 218;

pub const CUBE: u8 = 0;
pub const CUTOUT: u8 = 1;
pub const CROSS: u8 = 2;
pub const LIQUID: u8 = 3;
pub const MODEL: u8 = 4;

#[derive(Clone, Default)]
pub struct Info {
    pub shape: u8,
    pub texture: u16,
    pub light: u8,
    pub rotatable: bool,
    pub file: String,
    pub name: String,
    /// caixas dos modelos: x0,y0,z0,x1,y1,z1 (0..1) e o bloco da textura de cada caixa
    pub boxes: Vec<([f32; 6], u16)>,
}

pub struct Table {
    pub blocks: Vec<Info>,
}

static BLOCKS: OnceLock<Table> = OnceLock::new();

pub fn table() -> &'static Table {
    BLOCKS.get_or_init(|| {
        let text = include_str!("../dados/blocos.txt");
        let mut blocks = vec![Info::default(); 256];
        for line in text.lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let p: Vec<&str> = line.split('|').collect();
            if p.len() < 8 {
                continue;
            }
            let id: usize = p[0].parse().unwrap_or(0);
            let mut info = Info {
                shape: p[1].parse().unwrap_or(0),
                texture: p[2].parse().unwrap_or(id as u16),
                light: p[3].parse().unwrap_or(0),
                rotatable: p[4] == "1",
                file: p[5].to_string(),
                name: p[6].to_string(),
                boxes: Vec::new(),
            };
            if !p[7].is_empty() {
                for b in p[7].split(';') {
                    let v: Vec<f32> = b.split(',').map(|s| s.parse().unwrap_or(0.0)).collect();
                    if v.len() >= 6 {
                        let tex = if v.len() > 6 { v[6] as u16 } else { info.texture };
                        info.boxes.push(([v[0], v[1], v[2], v[3], v[4], v[5]], tex));
                    }
                }
            }
            if id < 256 {
                blocks[id] = info;
            }
        }
        Table { blocks }
    })
}

/// Quantos blocos o jogo conhece (as texturas vão de 0 a count*6).
pub fn count() -> usize {
    let t = table();
    t.blocks.iter().rposition(|b| !b.name.is_empty()).map(|i| i + 1).unwrap_or(0)
}

#[inline]
pub fn shape(b: u8) -> u8 {
    table().blocks[b as usize].shape
}
#[inline]
pub fn texture(b: u8) -> u16 {
    table().blocks[b as usize].texture
}
#[inline]
pub fn light(b: u8) -> u8 {
    table().blocks[b as usize].light
}
#[inline]
pub fn is_water(b: u8) -> bool {
    b == WATER || (WATER_FLOW..WATER_FLOW + 7).contains(&b)
}
/// 0 = fonte, 1..7 = água corrente, -1 = não é água.
#[inline]
pub fn water_level(b: u8) -> i32 {
    if b == WATER {
        0
    } else if (WATER_FLOW..WATER_FLOW + 7).contains(&b) {
        (b - WATER_FLOW) as i32 + 1
    } else {
        -1
    }
}
#[inline]
pub fn opaque_cube(b: u8) -> bool {
    b != AIR && shape(b) == CUBE
}
#[inline]
pub fn is_leaves(b: u8) -> bool {
    b == LEAVES || b == BIRCH_LEAVES
}
