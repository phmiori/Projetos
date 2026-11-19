//! Texturas: lê os mesmos PNGs da pasta "textures" do jogo Java (cada bloco é um "cubo aberto" de 4 x 3 células:
//!            [topo]
//!   [esquerda][frente][direita][trás]
//!            [base]
//! ) e monta uma camada por face (camada = bloco * 6 + face), como o GLRenderer do Java.

use crate::block;
use std::collections::HashMap;
use std::path::Path;

/// Célula (coluna, linha) de cada face no PNG: 0 +X (direita), 1 -X, 2 topo, 3 base, 4 +Z (frente), 5 -Z (trás).
const CELL: [(u32, u32); 6] = [(2, 1), (0, 1), (1, 0), (1, 2), (1, 1), (3, 1)];

pub struct Atlas {
    pub size: u32,
    pub layers: u32,
    /// RGBA, camada após camada, linha 0 = topo da imagem
    pub pixels: Vec<u8>,
    pub missing: Vec<String>,
}

pub fn load(dir: &Path) -> Atlas {
    let count = block::count();
    let table = block::table();
    // primeiro lê os arquivos (cada um uma vez) para descobrir o maior tamanho de célula
    let mut images: HashMap<String, image::RgbaImage> = HashMap::new();
    let mut missing = Vec::new();
    for b in 1..count {
        let f = &table.blocks[b].file;
        if f.is_empty() || images.contains_key(f) {
            continue;
        }
        match image::open(dir.join(format!("{f}.png"))) {
            Ok(img) => {
                images.insert(f.clone(), img.to_rgba8());
            }
            Err(_) => {
                if !missing.contains(f) {
                    missing.push(f.clone());
                }
            }
        }
    }
    let mut size = 16;
    for img in images.values() {
        size = size.max((img.width() / 4).min(128));
    }
    let layers = (count * 6) as u32;
    let mut pixels = vec![0u8; (size * size * 4 * layers) as usize];
    let layer_bytes = (size * size * 4) as usize;
    for b in 1..count {
        let info = &table.blocks[b];
        let dst = |f: usize| (b * 6 + f) * layer_bytes;
        match images.get(&info.file) {
            Some(img) => {
                let cell = img.width() / 4;
                if cell == 0 || img.height() < cell * 3 {
                    continue;
                }
                for f in 0..6 {
                    let (cx, cy) = CELL[f];
                    let o = dst(f);
                    for y in 0..size {
                        for x in 0..size {
                            // vizinho mais próximo: texturas de 16 px ficam nítidas mesmo numa camada de 64
                            let sx = cx * cell + x * cell / size;
                            let sy = cy * cell + y * cell / size;
                            let p = img.get_pixel(sx, sy).0;
                            let i = o + ((y * size + x) * 4) as usize;
                            pixels[i..i + 4].copy_from_slice(&p);
                        }
                    }
                }
            }
            None => {
                // sem arquivo: xadrez magenta, para dar para ver que falta
                for f in 0..6 {
                    let o = dst(f);
                    for y in 0..size {
                        for x in 0..size {
                            let on = ((x * 4 / size) + (y * 4 / size)) % 2 == 0;
                            let i = o + ((y * size + x) * 4) as usize;
                            pixels[i..i + 4].copy_from_slice(&if on { [230, 0, 230, 255] } else { [30, 30, 30, 255] });
                        }
                    }
                }
            }
        }
    }
    Atlas { size, layers, pixels, missing }
}
