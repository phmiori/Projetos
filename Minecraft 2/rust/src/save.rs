//! Lê os mundos salvos pelo jogo Java (pasta worlds/<mundo>/meta.properties e chunks/). Por enquanto só lê:
//! a versão Rust ainda não grava nada, então dá para abrir qualquer mundo sem risco de estragar.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub struct WorldInfo {
    pub dir: PathBuf,
    pub name: String,
    pub seed: i32,
    pub biome_scale: f64,
    pub player: Option<[f64; 5]>, // x, y, z, yaw, pitch
    pub last_played: i64,
}

/// Lê um arquivo .properties do Java (chave=valor, com escapes \uXXXX).
pub fn read_properties(path: &Path) -> Option<HashMap<String, String>> {
    let text = std::fs::read_to_string(path).ok()?;
    let mut map = HashMap::new();
    for line in text.lines() {
        let line = line.trim_start();
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            continue;
        }
        let mut key = String::new();
        let mut value = String::new();
        let mut in_value = false;
        let mut chars = line.chars().peekable();
        while let Some(c) = chars.next() {
            let ch = if c == '\\' {
                match chars.next() {
                    Some('u') => {
                        let hex: String = (0..4).filter_map(|_| chars.next()).collect();
                        u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32).unwrap_or('?')
                    }
                    Some('n') => '\n',
                    Some('t') => '\t',
                    Some(o) => o,
                    None => break,
                }
            } else if !in_value && (c == '=' || c == ':') {
                in_value = true;
                continue;
            } else {
                c
            };
            if in_value { value.push(ch) } else { key.push(ch) }
        }
        map.insert(key.trim().to_string(), value);
    }
    Some(map)
}

pub fn read_world(dir: &Path) -> Option<WorldInfo> {
    let p = read_properties(&dir.join("meta.properties"))?;
    let num = |k: &str| p.get(k).and_then(|v| v.trim().parse::<f64>().ok());
    let player = match (num("jogador.x"), num("jogador.y"), num("jogador.z")) {
        (Some(x), Some(y), Some(z)) => Some([x, y, z, num("jogador.yaw").unwrap_or(0.0), num("jogador.pitch").unwrap_or(0.0)]),
        _ => None,
    };
    Some(WorldInfo {
        dir: dir.to_path_buf(),
        name: p.get("nome").cloned().unwrap_or_else(|| dir.file_name().unwrap_or_default().to_string_lossy().into()),
        seed: p.get("semente").and_then(|v| v.trim().parse().ok()).unwrap_or(0),
        biome_scale: num("tamanhoBiomas").unwrap_or(1.0),
        player,
        last_played: p.get("ultimoJogo").and_then(|v| v.trim().parse().ok()).unwrap_or(0),
    })
}

/// O mundo jogado por último na pasta worlds (o mesmo que o Java mostra primeiro).
pub fn latest_world(worlds: &Path) -> Option<WorldInfo> {
    let mut best: Option<WorldInfo> = None;
    for e in std::fs::read_dir(worlds).ok()?.flatten() {
        if let Some(w) = read_world(&e.path()) {
            if best.as_ref().map_or(true, |b| w.last_played > b.last_played) {
                best = Some(w);
            }
        }
    }
    best
}

/// Um pedaço salvo (pedaços que nunca foram mexidos não têm arquivo: o gerador refaz igualzinho).
pub fn read_chunk(dir: &Path, cx: i32, cz: i32) -> Option<Vec<u8>> {
    std::fs::read(dir.join("chunks").join(format!("{cx}_{cz}.dat"))).ok()
}
