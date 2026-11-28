//! Ferramentas em 3D na mão: picareta, pá, machado, enxada e espada montadas com caixas (cabo de seção quadrada,
//! cabeça maciça, lâmina que afina até o fio), com texturas de madeira, couro, pedra, ferro e diamante desenhadas
//! aqui mesmo e guardadas num canto livre do atlas da interface. Os ícones do inventário continuam planos.

use crate::hand::{apply, mul, rot_y, rot_z, scale, translate, Tf};

/// Quanto a ferramenta gira em volta do próprio cabo (radianos).
const TWIST: f32 = -0.6;
use crate::ui::Ui;

/// Tamanho de cada textura de material (pixels) e onde elas ficam no atlas (ao lado dos desenhos dos itens).
const TEX: u32 = 64;
const MAT_X: u32 = 1024;

// texturas (na ordem em que ficam no atlas)
pub(crate) const HANDLE: usize = 0;
pub(crate) const GRIP: usize = 1;
pub(crate) const DARK_METAL: usize = 2;
/// corpo e fio de cada material: madeira, pedra, ferro, diamante
pub(crate) const BODY: [usize; 4] = [3, 5, 7, 9];
pub(crate) const EDGE: [usize; 4] = [4, 6, 8, 10];
/// cinza claro com manchas suaves: tingido com a cor de cada parte (itens)
pub(crate) const NOISE: usize = 11;
const COUNT: usize = 12;

// ------------------------------------------------------------------ ruído
pub(crate) fn hash(x: i32, y: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x8da6_b343) ^ (y as u32).wrapping_mul(0xd816_3841) ^ seed.wrapping_mul(0xcb1a_b31f);
    h ^= h >> 13;
    h = h.wrapping_mul(0x5bd1_e995);
    h ^= h >> 15;
    (h & 0xffff) as f32 / 65535.0
}

/// Ruído suave que se repete a cada `per` células (as texturas emendam sem costura).
fn noise(x: f32, y: f32, per_x: i32, per_y: i32, seed: u32) -> f32 {
    let (x0, y0) = (x.floor(), y.floor());
    let (fx, fy) = (x - x0, y - y0);
    let (sx, sy) = (fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy));
    let w = |a: f32, b: f32| hash((a as i32).rem_euclid(per_x), (b as i32).rem_euclid(per_y), seed);
    let a = w(x0, y0) + (w(x0 + 1.0, y0) - w(x0, y0)) * sx;
    let b = w(x0, y0 + 1.0) + (w(x0 + 1.0, y0 + 1.0) - w(x0, y0 + 1.0)) * sx;
    a + (b - a) * sy
}

/// Várias oitavas; `cx`/`cy` = quantas células cabem na textura em cada direção na primeira oitava.
fn fbm(u: f32, v: f32, cx: i32, cy: i32, seed: u32) -> f32 {
    let (mut s, mut amp, mut tot) = (0.0, 1.0, 0.0);
    for o in 0..4 {
        let k = 1 << o;
        let (px, py) = (cx * k, cy * k);
        s += noise(u / TEX as f32 * px as f32, v / TEX as f32 * py as f32, px, py, seed + o as u32 * 101) * amp;
        tot += amp;
        amp *= 0.5;
    }
    s / tot
}

fn mix(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
fn mulc(a: [f32; 3], k: f32) -> [f32; 3] {
    [a[0] * k, a[1] * k, a[2] * k]
}

/// Madeira com veios ao longo de v (o comprimento do cabo).
fn wood(u: f32, v: f32, light: [f32; 3], dark: [f32; 3], seed: u32) -> [f32; 3] {
    let warp = fbm(u, v, 2, 1, seed) * 7.0;
    let rings = ((u + warp) * 0.75).sin() * 0.5 + 0.5;
    let streak = fbm(u, v, 16, 2, seed + 7);
    let t = (rings * 0.55 + streak * 0.45).clamp(0.0, 1.0);
    let mut c = mix(dark, light, t);
    if hash(u as i32, (v / 5.0) as i32, seed + 3) > 0.93 {
        c = mulc(c, 0.8); // poros
    }
    c
}

fn paint(idx: usize, u: f32, v: f32) -> [f32; 3] {
    match idx {
        HANDLE => wood(u, v, [0.56, 0.38, 0.22], [0.33, 0.21, 0.11], 11),
        GRIP => {
            // couro enrolado em diagonal: faixas com a borda de cima clara e a de baixo escura
            let band = (v + u * 0.45).rem_euclid(9.0);
            let base = mix([0.20, 0.12, 0.07], [0.36, 0.23, 0.14], fbm(u, v, 8, 8, 21));
            if band < 1.2 {
                mulc(base, 0.55)
            } else if band < 2.4 {
                mulc(base, 1.25)
            } else {
                base
            }
        }
        DARK_METAL => {
            let n = fbm(u, v, 24, 2, 31);
            mix([0.25, 0.26, 0.29], [0.44, 0.45, 0.49], n)
        }
        3 | 4 => {
            let c = wood(u, v, [0.80, 0.62, 0.38], [0.52, 0.36, 0.19], 41);
            if idx == 4 { mulc(c, 1.12) } else { c }
        }
        5 | 6 => {
            // pedra: manchas em várias escalas, pontinhos escuros e claros
            let n = fbm(u, v, 4, 4, 51) * 0.65 + fbm(u, v, 12, 12, 52) * 0.35;
            let mut c = mix([0.36, 0.36, 0.37], [0.66, 0.66, 0.65], n);
            let h = hash(u as i32, v as i32, 53);
            if h > 0.94 {
                c = mulc(c, 0.7);
            } else if h < 0.04 {
                c = mulc(c, 1.2);
            }
            if idx == 6 { mulc(c, 1.13) } else { c }
        }
        7 | 8 => {
            // ferro escovado: riscos finos ao longo do comprimento
            let n = fbm(u, v, 32, 2, 61) * 0.7 + fbm(u, v, 4, 4, 62) * 0.3;
            let c = mix([0.62, 0.64, 0.68], [0.90, 0.91, 0.94], n);
            if idx == 8 { mix(c, [1.0, 1.0, 1.0], 0.35) } else { c }
        }
        NOISE => {
            let n = fbm(u, v, 6, 6, 81) * 0.6 + fbm(u, v, 20, 20, 82) * 0.4;
            let g = 0.8 + 0.2 * n;
            [g, g, g]
        }
        _ => {
            // diamante: facetas (células de brilho diferente) e faíscas
            let (cu, cv) = ((u / 8.0) as i32, (v / 8.0) as i32);
            let facet = hash(cu, cv, 71);
            let n = fbm(u, v, 8, 8, 72);
            let mut c = mix([0.16, 0.62, 0.62], [0.55, 0.96, 0.93], facet * 0.7 + n * 0.3);
            if hash(u as i32, v as i32, 73) > 0.985 {
                c = [0.95, 1.0, 1.0];
            }
            if idx == 10 { mix(c, [0.9, 1.0, 1.0], 0.4) } else { c }
        }
    }
}

/// Desenha as texturas dos materiais no atlas (RGBA, `atlas` pixels de largura), na faixa que começa em `y0`.
pub fn paint_textures(px: &mut [u8], atlas: u32, y0: u32) {
    for idx in 0..COUNT {
        for y in 0..TEX {
            for x in 0..TEX {
                let c = paint(idx, x as f32 + 0.5, y as f32 + 0.5);
                let i = (((y0 + y) * atlas + MAT_X + idx as u32 * TEX + x) * 4) as usize;
                if i + 4 > px.len() {
                    return;
                }
                px[i..i + 4].copy_from_slice(&[(c[0].clamp(0.0, 1.0) * 255.0) as u8, (c[1].clamp(0.0, 1.0) * 255.0) as u8, (c[2].clamp(0.0, 1.0) * 255.0) as u8, 255]);
            }
        }
    }
}

// ------------------------------------------------------------------ modelos
pub(crate) struct Part {
    pub lo: [f32; 3],
    pub hi: [f32; 3],
    pub tex: usize,
    /// cor multiplicada na textura
    pub tint: [f32; 3],
    /// caixa girada/deslocada (antes da transformação do modelo)
    pub tf: Option<Tf>,
}

pub(crate) fn p(lo: [f32; 3], hi: [f32; 3], tex: usize) -> Part {
    Part { lo, hi, tex, tint: [1.0; 3], tf: None }
}

/// Caixa centrada em x e z: meia-largura `w`, meia-espessura `d`, de y0 a y1.
fn c(w: f32, d: f32, y0: f32, y1: f32, tex: usize) -> Part {
    p([-w, y0, -d], [w, y1, d], tex)
}

/// As caixas da ferramenta (`kind`: 0 picareta, 1 machado, 2 pá, 3 espada, 4 enxada; `mat`: 0 madeira .. 3
/// diamante), com o cabo ao longo de +y a partir do 0 e a cabeça no plano x-y (a lâmina do machado em -x).
fn parts(kind: i32, mat: usize) -> Vec<Part> {
    let (body, edge) = (BODY[mat], EDGE[mat]);
    let collar = if mat >= 2 { DARK_METAL } else { GRIP };
    let mut v = Vec::with_capacity(24);
    let handle = |v: &mut Vec<Part>, len: f32| {
        v.push(c(0.036, 0.036, 0.0, len, HANDLE));
        v.push(c(0.043, 0.043, 0.05, 0.30, GRIP)); // couro na pega
        v.push(c(0.044, 0.044, -0.025, 0.03, collar)); // ponteira
    };
    match kind {
        0 => {
            // picareta: colar no topo do cabo e os dois braços curvos que afinam até a ponta
            let l = 1.0;
            handle(&mut v, l);
            v.push(c(0.072, 0.064, l - 0.13, l + 0.02, collar));
            for s in [-1.0f32, 1.0] {
                // segmentos curtos e encostados num arco suave (a ponta desce um pouco)
                for i in 0..7 {
                    let f = i as f32;
                    let (x0, x1) = (0.066 + f * 0.044, 0.066 + (f + 1.0) * 0.044 + 0.008);
                    let xc = (x0 + x1) / 2.0;
                    let yc = l - 0.05 - xc * xc * 0.75;
                    let hh = 0.056 - f * 0.0055;
                    let d = 0.05 - f * 0.0045;
                    let (a, b) = if s < 0.0 { (-x1, -x0) } else { (x0, x1) };
                    v.push(p([a, yc - hh, -d], [b, yc + hh, d], if i >= 5 { edge } else { body }));
                }
            }
        }
        1 => {
            // machado: cabeça abraçando o cabo, contrapeso atrás e a lâmina que alarga e afina até o fio
            let l = 1.0;
            handle(&mut v, l);
            v.push(c(0.058, 0.054, l - 0.2, l + 0.02, body));
            v.push(p([0.058, l - 0.17, -0.046], [0.125, l - 0.03, 0.046], body));
            v.push(p([0.125, l - 0.15, -0.04], [0.14, l - 0.05, 0.04], collar));
            v.push(p([-0.16, l - 0.19, -0.04], [-0.058, l + 0.005, 0.04], body));
            v.push(p([-0.25, l - 0.225, -0.028], [-0.16, l + 0.04, 0.028], body));
            v.push(p([-0.3, l - 0.26, -0.016], [-0.25, l + 0.075, 0.016], edge));
        }
        2 => {
            // pá: encaixe no cabo, lâmina larga e fina com uma nervura no meio e a ponta arredondada
            let l = 0.9;
            handle(&mut v, l);
            v.push(c(0.05, 0.046, l - 0.12, l + 0.03, collar));
            v.push(c(0.15, 0.021, l + 0.02, l + 0.29, body));
            v.push(c(0.032, 0.034, l + 0.02, l + 0.22, body));
            v.push(c(0.15, 0.017, l + 0.29, l + 0.32, edge));
            v.push(c(0.11, 0.015, l + 0.32, l + 0.355, edge));
            v.push(c(0.06, 0.012, l + 0.355, l + 0.375, edge));
        }
        3 => {
            // espada: pomo, cabo de couro, guarda atravessada, lâmina com fio dos dois lados e nervura, ponta
            let guard = match mat {
                0 => HANDLE,
                1 => body,
                _ => DARK_METAL,
            };
            v.push(c(0.054, 0.05, -0.06, 0.0, guard));
            v.push(c(0.034, 0.034, 0.0, 0.24, GRIP));
            v.push(c(0.036, 0.036, 0.0, 0.03, guard));
            v.push(c(0.17, 0.055, 0.24, 0.3, guard));
            v.push(c(0.1, 0.045, 0.235, 0.305, guard));
            v.push(c(0.062, 0.02, 0.3, 1.0, body));
            for s in [-1.0f32, 1.0] {
                let (a, b) = if s < 0.0 { (-0.076, -0.062) } else { (0.062, 0.076) };
                v.push(p([a, 0.3, -0.011], [b, 0.98, 0.011], edge));
            }
            v.push(c(0.017, 0.027, 0.3, 0.93, edge));
            v.push(c(0.05, 0.016, 1.0, 1.045, edge));
            v.push(c(0.032, 0.012, 1.045, 1.085, edge));
            v.push(c(0.014, 0.008, 1.085, 1.115, edge));
        }
        _ => {
            // enxada: colar, barra para o lado e a lâmina caída para baixo com o fio embaixo
            let l = 1.0;
            handle(&mut v, l);
            v.push(c(0.052, 0.05, l - 0.1, l + 0.03, collar));
            v.push(p([-0.23, l - 0.06, -0.036], [-0.052, l + 0.02, 0.036], body));
            v.push(p([-0.31, l - 0.2, -0.024], [-0.21, l + 0.035, 0.024], body));
            v.push(p([-0.31, l - 0.245, -0.017], [-0.21, l - 0.2, 0.017], edge));
        }
    }
    v
}

/// É uma ferramenta que tem modelo 3D? Devolve (tipo, material).
pub fn model_of(item: i32) -> Option<(i32, usize)> {
    let i = crate::items::info(item)?;
    ((0..=4).contains(&i.tool_kind) && (0..=3).contains(&i.tool_mat)).then(|| (i.tool_kind, i.tool_mat as usize))
}

/// Desenha a ferramenta com a transformação `t` do ícone (o desenho de -0,5 a 0,5 no plano x-y, cabo embaixo à
/// esquerda e ponta em cima à direita). `light` = luz do lugar (0..1).
pub fn draw(ui: &mut Ui, t: &Tf, item: i32, light: f32) -> bool {
    let Some((kind, mat)) = model_of(item) else { return false };
    // o cabo na diagonal do ícone: começa embaixo à esquerda e aponta para cima à direita (a espada, que tem o
    // cabo curto, começa mais embaixo para a guarda ficar acima da mão)
    let start = if kind == crate::items::SWORD { -0.27 } else { -0.36 };
    let mut m = mul(t, &translate(start, start, 0.0));
    m = mul(&m, &rot_z(-std::f32::consts::FRAC_PI_4));
    m = mul(&m, &scale(0.93));
    // girada um pouco em volta do cabo, para aparecer a lateral da cabeça (a espessura de verdade)
    m = mul(&m, &rot_y(TWIST));
    render(ui, &m, &parts(kind, mat), light, true);
    true
}

/// Desenha as caixas com a transformação `m`: luz de cima e (`ao`) um pouco mais escuro perto da mão (y baixo).
pub(crate) fn render(ui: &mut Ui, m: &Tf, parts: &[Part], light: f32, ao: bool) {
    let (a, span) = (crate::ui::atlas_px(), TEX as f32);
    let y0 = crate::ui::items_y() as f32;
    // a luz vem de cima, um pouco da frente e da esquerda (no espaço de quem desenha: câmera ou mundo)
    let ld = {
        let l = [-0.35f32, 0.85, 0.4];
        let n = (l[0] * l[0] + l[1] * l[1] + l[2] * l[2]).sqrt();
        [l[0] / n, l[1] / n, l[2] / n]
    };
    for (k, part) in parts.iter().enumerate() {
        let m = match &part.tf {
            Some(tf) => mul(m, tf),
            None => *m,
        };
        let o = apply(&m, [0.0; 3]);
        let (lo, hi) = (part.lo, part.hi);
        let corner = |i: usize| [if i & 1 == 0 { lo[0] } else { hi[0] }, if i & 2 == 0 { lo[1] } else { hi[1] }, if i & 4 == 0 { lo[2] } else { hi[2] }];
        // (cantos, normal, eixo u, eixo v)
        let faces: [([usize; 4], [f32; 3], usize, usize); 6] = [
            ([1, 3, 7, 5], [1.0, 0.0, 0.0], 2, 1),
            ([0, 4, 6, 2], [-1.0, 0.0, 0.0], 2, 1),
            ([2, 6, 7, 3], [0.0, 1.0, 0.0], 0, 2),
            ([0, 1, 5, 4], [0.0, -1.0, 0.0], 0, 2),
            ([4, 5, 7, 6], [0.0, 0.0, 1.0], 0, 1),
            ([0, 2, 3, 1], [0.0, 0.0, -1.0], 0, 1),
        ];
        let rx = (MAT_X + part.tex as u32 * TEX) as f32;
        for (f, (q, n, ua, va)) in faces.iter().enumerate() {
            let nw = apply(&m, *n);
            let nw = [nw[0] - o[0], nw[1] - o[1], nw[2] - o[2]];
            let len = (nw[0] * nw[0] + nw[1] * nw[1] + nw[2] * nw[2]).sqrt().max(1e-6);
            let d = (nw[0] * ld[0] + nw[1] * ld[1] + nw[2] * ld[2]) / len;
            let shade = 0.5 + 0.5 * d.max(0.0);
            // textura: 60 pixels por unidade, no máximo a textura inteira; começa num ponto diferente por caixa
            let k_tex = 60.0;
            let (eu, ev) = ((hi[*ua] - lo[*ua]) * k_tex, (hi[*va] - lo[*va]) * k_tex);
            let (su, sv) = ((eu.min(span - 1.0)) / eu.max(1e-3), (ev.min(span - 1.0)) / ev.max(1e-3));
            let ou = ((span - eu.min(span - 1.0)) * hash(k as i32, f as i32, 5)).floor();
            let ov = ((span - ev.min(span - 1.0)) * hash(k as i32, f as i32, 6)).floor();
            let mut pts = [[0.0f32; 3]; 4];
            let mut uv = [[0.0f32; 2]; 4];
            let mut col = [[0.0f32; 4]; 4];
            for (j, &ci) in q.iter().enumerate() {
                let pl = corner(ci);
                pts[j] = apply(&m, pl);
                let pu = (pl[*ua] - lo[*ua]) * k_tex * su + ou;
                let pv = (hi[*va] - pl[*va]) * k_tex * sv + ov;
                uv[j] = [(rx + pu) * a, (y0 + pv) * a];
                // um pouco mais escuro perto da mão (sombra dos dedos e do braço)
                let ao = if ao { 0.8 + 0.2 * ((pl[1] + 0.1) / 0.6).clamp(0.0, 1.0) } else { 1.0 };
                let l = light * shade * ao;
                col[j] = [(l * part.tint[0]).min(1.0), (l * part.tint[1]).min(1.0), (l * part.tint[2]).min(1.0), 1.0];
            }
            ui.quad_colors(pts, uv, -1.0, col);
        }
    }
}
