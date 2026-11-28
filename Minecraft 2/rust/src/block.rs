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
pub const GLASS: u8 = 18;
pub const FARMLAND: u8 = 166;
// blocos da atualização das vilas (só na versão Rust)
pub const SUGAR_CANE: u8 = 228;
pub const PUMPKIN: u8 = 229;
pub const MELON: u8 = 230;
pub const COPPER_ORE: u8 = 231;
pub const EMERALD_ORE: u8 = 232;
// minérios de gemas (rubi, safira e ametista) e os blocos delas
pub const RUBY_ORE: u8 = 250;
pub const SAPPHIRE_ORE: u8 = 251;
pub const AMETHYST_ORE: u8 = 252;
pub const DEEPSLATE: u8 = 233;
pub const GRANITE: u8 = 234;
pub const DIORITE: u8 = 235;
pub const ANDESITE: u8 = 236;
pub const CHERRY_LOG: u8 = 239;
pub const CHERRY_LEAVES: u8 = 240;
pub const CHERRY_PLANKS: u8 = 241;
pub const CHERRY_SAPLING: u8 = 242;
#[cfg(test)]
pub const LADDER: u8 = 243;
pub const PATH: u8 = 247;
pub const BELL: u8 = 248;
pub const HAY: u8 = 249;
pub const K_LADDER: u8 = 8;

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
    /// 0 comum, 1 escada, 2 laje, 3 laje vertical, 4 porta, 5 lajes empilhadas, 6 cerca/painel, 7 tocha na parede
    pub kind: u8,
    /// material da escada/laje (índice em SHAPE_MATS) ou madeira da porta
    pub mat: u8,
    /// direção (0 +Z, 1 -X, 2 -Z, 3 +X)
    pub face: u8,
    /// escada invertida, laje em cima, porta aberta
    pub flag: u8,
    /// metade da porta (0 de baixo, 1 de cima)
    pub half: u8,
    /// precisa de chão firme embaixo (plantas, tochas)
    pub needs_support: bool,
    /// é a forma de item (o que vai para a mão)
    pub item_form: bool,
    /// o que dá ao quebrar (pode ser um id de item)
    pub drop: i32,
    /// segundos para quebrar com a mão (-1 = inquebrável)
    pub hardness: f64,
    /// qual ferramenta quebra mais rápido (M_SOIL, M_WOOD, M_ROCK, M_PLANT)
    pub material: i32,
    /// nível mínimo de picareta para o bloco dar item (-1 = qualquer coisa)
    pub tier: i32,
}

pub const M_SOIL: i32 = 1;
pub const M_WOOD: i32 = 2;
pub const M_ROCK: i32 = 3;
pub const M_PLANT: i32 = 4;

pub struct Table {
    pub blocks: Vec<Info>,
    /// itens que colocam blocos de id 200+ (o gelo do campo de gelo): item -> bloco
    pub placers: Vec<(i32, u8)>,
}

static BLOCKS: OnceLock<Table> = OnceLock::new();

pub fn table() -> &'static Table {
    BLOCKS.get_or_init(|| {
        let text = include_str!("../dados/blocos.txt");
        let mut blocks = vec![Info::default(); 256];
        let mut placers = Vec::new();
        for line in text.lines() {
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            let p: Vec<&str> = line.split('|').collect();
            if p[0] == "@item" && p.len() >= 3 {
                if let (Ok(i), Ok(b)) = (p[1].parse(), p[2].parse()) {
                    placers.push((i, b));
                }
                continue;
            }
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
                ..Default::default()
            };
            if p.len() >= 17 {
                let n = |i: usize| p[i].parse::<u8>().unwrap_or(0);
                info.kind = n(8);
                info.mat = n(9);
                info.face = n(10);
                info.flag = n(11);
                info.half = n(12);
                info.needs_support = p[13] == "1";
                info.item_form = p[14] == "1";
                info.drop = p[15].parse().unwrap_or(0);
                info.hardness = p[16].parse().unwrap_or(1.0);
            }
            if p.len() >= 19 {
                info.material = p[17].parse().unwrap_or(0);
                info.tier = p[18].parse().unwrap_or(-1);
            } else {
                info.tier = -1;
            }
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
        Table { blocks, placers }
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
    b == LEAVES || b == BIRCH_LEAVES || b == CHERRY_LEAVES
}

#[inline]
pub fn info(b: u8) -> &'static Info {
    &table().blocks[b as usize]
}

/// Tem colisão (o jogador não atravessa): tudo menos ar, líquidos e plantas/tochas.
#[inline]
pub fn solid(b: u8) -> bool {
    b != AIR && shape(b) != LIQUID && shape(b) != CROSS
}

pub const K_STAIR: u8 = 1;
pub const K_SLAB: u8 = 2;
pub const K_VSLAB: u8 = 3;
pub const K_DOOR: u8 = 4;
pub const WALL_TORCH_BASE: u8 = 132;
/// Bloco inteiro de cada material de escada/laje (Block.SHAPE_MATS do Java).
pub const SHAPE_MATS: [u8; 6] = [8, 4, 31, 9, 17, 171];
pub const DIR_X: [i32; 4] = [0, -1, 0, 1];
pub const DIR_Z: [i32; 4] = [1, 0, -1, 0];

/// A variante de um tipo de peça (escada, laje, porta...) com estes detalhes; procura na tabela do Java.
pub fn variant(kind: u8, mat: u8, face: u8, flag: u8, half: u8) -> u8 {
    table()
        .blocks
        .iter()
        .position(|i| i.kind == kind && i.mat == mat && i.face == face && i.flag == flag && i.half == half && !i.name.is_empty())
        .map(|i| i as u8)
        .unwrap_or(AIR)
}

/// Duas lajes de materiais diferentes no mesmo bloco (Block.mixedSlab do Java).
pub fn mixed_slab(lower: u8, upper: u8) -> u8 {
    if lower < 5 && upper < 5 {
        136 + lower * 5 + upper
    } else {
        187 + if lower == 5 { upper } else { 6 + lower }
    }
}

/// Direção para onde o jogador olha (0 +Z, 1 -X, 2 -Z, 3 +X), como Block.facingFromYaw.
pub fn facing_from_yaw(yaw: f64) -> u8 {
    let (fx, fz) = (yaw.sin(), yaw.cos());
    if fz.abs() >= fx.abs() {
        if fz > 0.0 { 0 } else { 2 }
    } else if fx < 0.0 {
        1
    } else {
        3
    }
}

/// O bloco que um item coloca (o próprio id para blocos; os itens 400+ colocam o gelo), ou 0.
pub fn block_of_item(item: i32) -> u8 {
    if item > 0 && item < 200 && (item as usize) < count() {
        return item as u8;
    }
    table().placers.iter().find(|p| p.0 == item).map_or(AIR, |p| p.1)
}

/// O item que se pega com o botão do meio num bloco (variantes viram a forma de item).
pub fn item_for_block(b: u8) -> i32 {
    let i = info(b);
    if i.item_form {
        return b as i32;
    }
    if let Some(p) = table().placers.iter().find(|p| p.1 == b) {
        return p.0;
    }
    i.drop
}
