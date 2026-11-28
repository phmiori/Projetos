//! Os outros itens em 3D na mão (comida, lingotes, gemas, ovos, armaduras, arco, escudo, baldes...): montados com
//! caixas como as ferramentas. As cores vêm do próprio ícone do item (as duas cores principais do desenho), então
//! um ovo de porco sai rosa com pintas rosa-escuro, o de creeper verde com pintas pretas, e assim por diante.
//! O desenho fica no mesmo lugar do ícone (de -0,5 a 0,5 no plano x-y, de frente para quem olha).

use crate::hand::{mul, rot_y, rot_z, translate, Tf};
use crate::tool_model::{hash, p, render, Part, BODY, DARK_METAL, EDGE, GRIP, HANDLE, NOISE};
use crate::ui::Ui;
use std::cell::RefCell;
use std::collections::HashMap;
use std::f32::consts::{FRAC_PI_4, PI};

type C3 = [f32; 3];

thread_local! {
    static PALETTES: RefCell<HashMap<i32, (C3, C3)>> = RefCell::new(HashMap::new());
}

/// As duas cores principais do ícone (a mais comum primeiro), separadas em dois grupos (k-médias).
fn palette(icon: i32) -> (C3, C3) {
    if let Some(p) = PALETTES.with(|m| m.borrow().get(&icon).copied()) {
        return p;
    }
    let mut px: Vec<C3> = Vec::new();
    if let Some(img) = crate::items::ICON_SHEET.get() {
        let c = crate::ui::ICON;
        let (ix, iy) = ((icon % 32) as u32 * c, (icon / 32) as u32 * c);
        for y in 0..c {
            for x in 0..c {
                let solid = |dx: i32, dy: i32| {
                    let (xx, yy) = (x as i32 + dx, y as i32 + dy);
                    xx >= 0 && yy >= 0 && xx < c as i32 && yy < c as i32 && ix + (xx as u32) < img.width() && iy + (yy as u32) < img.height() && img.get_pixel(ix + xx as u32, iy + yy as u32).0[3] >= 128
                };
                // o contorno escuro do desenho não conta (só o miolo)
                if solid(0, 0) && solid(1, 0) && solid(-1, 0) && solid(0, 1) && solid(0, -1) {
                    let q = img.get_pixel(ix + x, iy + y).0;
                    {
                        px.push([q[0] as f32 / 255.0, q[1] as f32 / 255.0, q[2] as f32 / 255.0]);
                    }
                }
            }
        }
    }
    let res = if px.is_empty() {
        ([0.6; 3], [0.4; 3])
    } else {
        let lum = |c: &C3| c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
        let mut s = px.clone();
        s.sort_by(|a, b| lum(a).partial_cmp(&lum(b)).unwrap());
        let (mut a, mut b) = (s[s.len() / 4], s[s.len() * 3 / 4]);
        let d = |x: &C3, y: &C3| (x[0] - y[0]).powi(2) + (x[1] - y[1]).powi(2) + (x[2] - y[2]).powi(2);
        let (mut na, mut nb) = (0usize, 0usize);
        for _ in 0..8 {
            let (mut sa, mut sb) = ([0.0f32; 3], [0.0f32; 3]);
            na = 0;
            nb = 0;
            for c in &px {
                if d(c, &a) <= d(c, &b) {
                    na += 1;
                    for i in 0..3 {
                        sa[i] += c[i];
                    }
                } else {
                    nb += 1;
                    for i in 0..3 {
                        sb[i] += c[i];
                    }
                }
            }
            if na > 0 {
                a = sa.map(|v| v / na as f32);
            }
            if nb > 0 {
                b = sb.map(|v| v / nb as f32);
            }
        }
        if nb > na {
            (b, a)
        } else {
            (a, b)
        }
    };
    PALETTES.with(|m| m.borrow_mut().insert(icon, res));
    res
}

// ------------------------------------------------------------------ peças
fn tinted(lo: C3, hi: C3, tint: C3) -> Part {
    let mut q = p(lo, hi, NOISE);
    q.tint = tint;
    q
}
/// Caixa de uma cor, pelo centro e meias-medidas.
fn cbox(c: C3, h: C3, tint: C3) -> Part {
    tinted([c[0] - h[0], c[1] - h[1], c[2] - h[2]], [c[0] + h[0], c[1] + h[1], c[2] + h[2]], tint)
}
/// Caixa com textura (madeira, ferro...) pelo centro e meias-medidas.
fn tbox(c: C3, h: C3, tex: usize) -> Part {
    p([c[0] - h[0], c[1] - h[1], c[2] - h[2]], [c[0] + h[0], c[1] + h[1], c[2] + h[2]], tex)
}
/// Gira a peça em volta do eixo z, no ponto (x, y).
fn turned(mut q: Part, x: f32, y: f32, ang: f32) -> Part {
    let t = mul(&mul(&translate(x, y, 0.0), &rot_z(ang)), &translate(-x, -y, 0.0));
    q.tf = Some(match q.tf {
        Some(o) => mul(&t, &o),
        None => t,
    });
    q
}
fn shade(c: C3, k: f32) -> C3 {
    c.map(|v| (v * k).min(1.0))
}

/// Forma arredondada (fatias ao longo de y, cada uma com duas caixas em cruz). `prof(t)` dá a largura da fatia
/// (t de -1 embaixo a 1 em cima; 1 = o raio inteiro).
fn blob(v: &mut Vec<Part>, c: C3, r: C3, n: usize, tint: C3, prof: &dyn Fn(f32) -> f32) {
    for i in 0..n {
        let t0 = -1.0 + 2.0 * i as f32 / n as f32;
        let t1 = t0 + 2.0 / n as f32;
        let k = prof((t0 + t1) / 2.0).max(0.0);
        if k <= 0.0 {
            continue;
        }
        let (y0, y1) = (c[1] + t0 * r[1], c[1] + t1 * r[1]);
        let (rx, rz) = (r[0] * k, r[2] * k);
        v.push(tinted([c[0] - rx, y0, c[2] - rz * 0.62], [c[0] + rx, y1, c[2] + rz * 0.62], tint));
        v.push(tinted([c[0] - rx * 0.62, y0, c[2] - rz], [c[0] + rx * 0.62, y1, c[2] + rz], tint));
    }
}
fn round(t: f32) -> f32 {
    (1.0 - t * t).max(0.0).sqrt()
}
fn ball(v: &mut Vec<Part>, c: C3, r: C3, n: usize, tint: C3) {
    blob(v, c, r, n, tint, &round);
}

/// Pontinhos de outra cor na superfície de uma forma arredondada (pintas do ovo, sementes...).
fn spots(v: &mut Vec<Part>, c: C3, r: C3, count: i32, size: f32, tint: C3, seed: u32, prof: &dyn Fn(f32) -> f32) {
    for i in 0..count {
        let t = hash(i, 1, seed) * 1.6 - 0.8;
        let ang = hash(i, 2, seed) * PI * 2.0;
        let k = prof(t);
        let (x, z) = (c[0] + ang.cos() * r[0] * k * 0.93, c[2] + ang.sin() * r[2] * k * 0.93);
        v.push(cbox([x, c[1] + t * r[1], z], [size, size, size], tint));
    }
}

/// Monte de grãos (sementes, açúcar, pólvora, farinha de osso).
fn pile(v: &mut Vec<Part>, a: C3, b: C3, seed: u32) {
    for i in 0..26 {
        let ang = hash(i, 3, seed) * PI * 2.0;
        let rr = hash(i, 4, seed).sqrt() * 0.27;
        let (x, z) = (ang.cos() * rr, ang.sin() * rr * 0.6);
        let y = -0.22 + (0.27 - rr) * 0.7 + hash(i, 5, seed) * 0.04;
        let s = 0.03 + hash(i, 6, seed) * 0.02;
        let _ = b;
        v.push(cbox([x, y, z], [s, s * 0.8, s], shade(a, 0.8 + hash(i, 7, seed) * 0.35)));
    }
}

/// Pedaço irregular (carvão, sílex, cobre bruto): caixas sobrepostas em volta do centro.
fn lump(v: &mut Vec<Part>, a: C3, b: C3, seed: u32, size: f32) {
    v.push(cbox([0.0, 0.0, 0.0], [0.16 * size, 0.14 * size, 0.11 * size], a));
    for i in 0..7 {
        let ang = hash(i, 8, seed) * PI * 2.0;
        let (x, y) = (ang.cos() * 0.12 * size, ang.sin() * 0.11 * size);
        let h = [0.07 + hash(i, 9, seed) * 0.06, 0.06 + hash(i, 10, seed) * 0.06, 0.06 + hash(i, 11, seed) * 0.04].map(|q| q * size);
        v.push(cbox([x, y, (hash(i, 12, seed) - 0.5) * 0.08 * size], h, if i % 3 == 1 { b } else { shade(a, 0.85 + hash(i, 13, seed) * 0.3) }));
    }
}

/// Bastão na diagonal (graveto, osso, flecha...): do canto de baixo à esquerda ao de cima à direita.
fn diag(q: Part) -> Part {
    turned(q, 0.0, 0.0, -FRAC_PI_4)
}

const LEATHER: C3 = [0.55, 0.36, 0.2];

/// As caixas do item (ou None: fica o ícone engrossado). `a`, `b` = cores do ícone.
fn parts(id: i32, name: &str, a: C3, b: C3) -> Option<Vec<Part>> {
    let mut v: Vec<Part> = Vec::with_capacity(48);
    let n = name;
    let white = [0.93, 0.92, 0.88];
    let wood = HANDLE;
    match id {
        // graveto
        200 => {
            v.push(diag(tbox([0.0, 0.0, 0.0], [0.035, 0.46, 0.035], wood)));
            v.push(diag(turned(tbox([0.07, 0.1, 0.0], [0.022, 0.08, 0.022], wood), 0.03, 0.04, -0.7)));
        }
        // lingotes
        202 | 203 | 316 => {
            let c = shade(a, 1.0);
            v.push(cbox([0.0, -0.05, 0.0], [0.3, 0.07, 0.16], shade(c, 0.85)));
            v.push(cbox([0.0, 0.06, 0.0], [0.25, 0.05, 0.12], c));
            v.push(cbox([0.0, 0.115, 0.0], [0.2, 0.012, 0.08], shade(c, 1.2)));
        }
        // gemas: diamante e esmeralda (a esmeralda mais alta)
        204 | 296 | 317 | 318 | 319 => {
            let tall = if id == 296 || id == 319 { 1.25 } else { 1.0 };
            let ws = [0.08, 0.17, 0.25, 0.29, 0.27, 0.2, 0.1];
            for (i, w) in ws.iter().enumerate() {
                let y = (-0.3 + i as f32 * 0.075) * tall;
                let col = if i >= 4 { shade(a, 1.2) } else { shade(a, 0.9 + i as f32 * 0.04) };
                v.push(cbox([0.0, y, 0.0], [*w * if id == 296 || id == 319 { 0.75 } else { 1.0 }, 0.04 * tall, *w * 0.5], col));
            }
            v.push(cbox([-0.08, 0.02 * tall, 0.13], [0.03, 0.03, 0.01], [1.0, 1.0, 1.0]));
        }
        // pedaços: carvão, sílex, cobre bruto
        201 | 236 | 315 => lump(&mut v, a, b, id as u32, 1.15),
        // pérola do End
        314 => {
            ball(&mut v, [0.0; 3], [0.2, 0.2, 0.2], 8, a);
            v.push(cbox([0.0, 0.0, 0.18], [0.07, 0.07, 0.03], shade(a, 1.4)));
        }
        // maçã
        205 => {
            ball(&mut v, [0.0, -0.04, 0.0], [0.25, 0.24, 0.25], 9, a);
            v.push(tbox([0.0, 0.25, 0.0], [0.02, 0.06, 0.02], wood));
            v.push(turned(cbox([0.08, 0.27, 0.0], [0.07, 0.02, 0.035], [0.3, 0.62, 0.2]), 0.02, 0.27, 0.4));
        }
        // cenouras
        297 | 307 => {
            for i in 0..8 {
                let f = i as f32 / 7.0;
                let w = 0.03 + 0.1 * f;
                v.push(diag(cbox([0.0, -0.4 + f * 0.62, 0.0], [w, 0.045, w], shade(a, 0.9 + 0.15 * f))));
            }
            let leaf = if id == 307 { shade(a, 1.15) } else { [0.3, 0.6, 0.2] };
            for (i, ang) in [-0.4f32, 0.0, 0.4].iter().enumerate() {
                v.push(diag(turned(cbox([0.0, 0.34 + i as f32 * 0.01, 0.0], [0.025, 0.12, 0.02], leaf), 0.0, 0.24, *ang)));
            }
        }
        // batatas e beterraba
        298 | 299 => {
            blob(&mut v, [0.0, 0.0, 0.0], [0.19, 0.28, 0.17], 9, a, &|t| round(t) * (1.0 - 0.1 * t));
            spots(&mut v, [0.0; 3], [0.19, 0.28, 0.17], 7, 0.018, shade(a, 0.65), id as u32, &round);
        }
        300 => {
            ball(&mut v, [0.0, -0.05, 0.0], [0.22, 0.21, 0.2], 8, a);
            v.push(cbox([0.0, -0.3, 0.0], [0.02, 0.06, 0.02], shade(a, 0.8)));
            for ang in [-0.35f32, 0.35] {
                v.push(turned(cbox([0.0, 0.26, 0.0], [0.05, 0.11, 0.02], [0.3, 0.55, 0.22]), 0.0, 0.16, ang));
            }
        }
        // carnes: bife, porco e carneiro (fatia oval com a gordura na borda)
        206 | 207 | 241 | 242 | 243 | 244 => {
            let lum = |c: C3| c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
            let (meat, fat) = if lum(a) < lum(b) { (a, b) } else { (b, a) };
            blob(&mut v, [0.0, 0.0, 0.0], [0.3, 0.24, 0.08], 8, meat, &|t| round(t) * (1.0 - 0.15 * t));
            for i in 0..6 {
                let t = -0.9 + i as f32 * 0.32;
                let x = 0.29 * round(t) * (1.0 - 0.15 * t);
                v.push(cbox([x, t * 0.24, 0.0], [0.035, 0.045, 0.075], fat));
            }
            if id == 243 || id == 244 {
                v.push(diag(cbox([0.0, -0.33, 0.0], [0.03, 0.1, 0.03], white)));
            }
        }
        // frango: coxa com o osso
        245 | 246 => {
            ball(&mut v, [0.06, 0.08, 0.0], [0.2, 0.22, 0.16], 8, a);
            v.push(diag(cbox([0.0, -0.22, 0.0], [0.03, 0.14, 0.03], white)));
            v.push(diag(cbox([-0.025, -0.37, 0.0], [0.03, 0.03, 0.03], white)));
            v.push(diag(cbox([0.025, -0.37, 0.0], [0.03, 0.03, 0.03], white)));
        }
        // peixe: corpo, rabo, barbatana e olho
        208 | 209 => {
            blob(&mut v, [0.04, 0.0, 0.0], [0.15, 0.3, 0.08], 9, a, &|t| round(t) * (1.0 - 0.25 * t));
            let v2: Vec<Part> = std::mem::take(&mut v);
            for q in v2 {
                v.push(turned(q, 0.0, 0.0, PI / 2.0));
            }
            v.push(cbox([-0.33, 0.06, 0.0], [0.05, 0.08, 0.02], b));
            v.push(cbox([-0.33, -0.06, 0.0], [0.05, 0.08, 0.02], b));
            v.push(cbox([0.02, 0.16, 0.0], [0.08, 0.03, 0.015], b));
            v.push(cbox([0.24, 0.03, 0.075], [0.025, 0.025, 0.01], [0.05, 0.05, 0.05]));
        }
        // pão
        239 => {
            v.push(cbox([0.0, -0.08, 0.0], [0.34, 0.07, 0.15], shade(a, 0.9)));
            blob(&mut v, [0.0, -0.03, 0.0], [0.33, 0.14, 0.15], 5, a, &|t| if t < 0.0 { 1.0 } else { round(t) });
            for i in 0..3 {
                v.push(turned(cbox([-0.15 + i as f32 * 0.15, 0.09, 0.0], [0.012, 0.03, 0.14], shade(b, 1.1)), -0.15 + i as f32 * 0.15, 0.09, 0.4));
            }
        }
        // torta de abóbora: disco com a borda
        306 => {
            ball(&mut v, [0.0, 0.0, 0.0], [0.32, 0.32, 0.09], 8, a);
            let rim = [0.8, 0.58, 0.32];
            for i in 0..12 {
                let ang = i as f32 / 12.0 * PI * 2.0;
                v.push(cbox([ang.cos() * 0.29, ang.sin() * 0.29, 0.0], [0.05, 0.05, 0.1], rim));
            }
        }
        // fatia de melancia: casca verde, polpa vermelha e sementes
        305 => {
            for i in 0..6 {
                let f = i as f32;
                let w = 0.34 - f * 0.055;
                v.push(cbox([0.0, -0.18 + f * 0.075, 0.0], [w, 0.04, 0.06], [0.88, 0.26, 0.24]));
            }
            v.push(cbox([0.0, -0.24, 0.0], [0.36, 0.035, 0.065], [0.3, 0.6, 0.25]));
            v.push(cbox([0.0, -0.2, 0.0], [0.35, 0.012, 0.067], [0.85, 0.93, 0.7]));
            for (x, y) in [(-0.15, -0.1), (0.0, -0.08), (0.15, -0.1), (-0.07, 0.03), (0.07, 0.03), (0.0, 0.14)] {
                v.push(cbox([x, y, 0.06], [0.015, 0.022, 0.01], [0.08, 0.06, 0.05]));
            }
        }
        // sopa de beterraba: tigela de madeira com a sopa em cima
        302 => {
            for i in 0..5 {
                let f = i as f32;
                let w = 0.18 + f * 0.035;
                v.push(tbox([0.0, -0.2 + f * 0.06, 0.0], [w, 0.03, w * 0.6], BODY[0]));
            }
            v.push(cbox([0.0, 0.08, 0.0], [0.3, 0.012, 0.16], [0.62, 0.12, 0.16]));
        }
        // grãos
        237 | 301 | 304 | 303 | 210 => pile(&mut v, a, b, id as u32),
        // trigo: um feixe de talos com as espigas
        238 => {
            let stalk = [0.72, 0.62, 0.3];
            for i in 0..6 {
                let f = i as f32 - 2.5;
                let ang = f * 0.07;
                let z = if i % 2 == 0 { 0.02 } else { -0.02 };
                let mut s = cbox([f * 0.032, -0.1, z], [0.018, 0.34, 0.018], shade(stalk, 0.9 + 0.04 * (i % 3) as f32));
                s = turned(s, 0.0, -0.15, ang);
                v.push(s);
                for j in 0..5 {
                    let y = 0.14 + j as f32 * 0.06;
                    v.push(turned(cbox([f * 0.032, y, z], [0.04 - j as f32 * 0.005, 0.034, 0.032], shade(a, 0.9 + 0.08 * (j % 2) as f32)), 0.0, -0.15, ang));
                }
            }
            v.push(cbox([0.0, -0.15, 0.0], [0.11, 0.03, 0.06], [0.5, 0.36, 0.18]));
        }
        // couro: folha irregular e fina
        240 => {
            for (c, h) in [([0.0, 0.0], [0.26, 0.3]), ([-0.18, 0.15], [0.12, 0.12]), ([0.18, -0.16], [0.12, 0.12]), ([0.12, 0.2], [0.1, 0.08])] {
                v.push(cbox([c[0], c[1], 0.0], [h[0], h[1], 0.022], a));
            }
            v.push(cbox([0.0, 0.0, 0.0], [0.2, 0.22, 0.03], shade(a, 1.08)));
        }
        // fio: um rolinho e a ponta solta
        247 => {
            for i in 0..14 {
                let ang = i as f32 / 14.0 * PI * 2.0;
                v.push(turned(cbox([ang.cos() * 0.16, 0.06 + ang.sin() * 0.16, 0.0], [0.03, 0.045, 0.06], shade(a, 0.95 + 0.1 * (i % 2) as f32)), ang.cos() * 0.16, 0.06 + ang.sin() * 0.16, ang));
            }
            v.push(turned(cbox([0.05, -0.25, 0.0], [0.015, 0.14, 0.015], a), 0.05, -0.12, 0.5));
        }
        // pena: haste e as duas abas que afinam até a ponta
        248 => {
            v.push(diag(cbox([0.0, 0.0, 0.0], [0.012, 0.44, 0.015], shade(a, 0.8))));
            for i in 0..8 {
                let f = i as f32 / 7.0;
                let w = 0.03 + 0.1 * (PI * (0.15 + 0.8 * f)).sin();
                v.push(diag(cbox([0.0, -0.2 + f * 0.55, 0.0], [w, 0.04, 0.008], shade(a, 1.0 - 0.06 * (i % 2) as f32))));
            }
        }
        // osso
        249 => {
            v.push(diag(cbox([0.0, 0.0, 0.0], [0.04, 0.36, 0.04], white)));
            for y in [-0.36f32, 0.36] {
                v.push(diag(cbox([-0.04, y, 0.0], [0.045, 0.06, 0.045], white)));
                v.push(diag(cbox([0.04, y, 0.0], [0.045, 0.06, 0.045], white)));
            }
        }
        // pederneira: o aço em C e o sílex
        250 => {
            v.push(tbox([-0.08, 0.1, 0.0], [0.17, 0.035, 0.035], BODY[2]));
            v.push(tbox([-0.22, -0.02, 0.0], [0.035, 0.15, 0.035], BODY[2]));
            v.push(tbox([-0.08, -0.14, 0.0], [0.17, 0.035, 0.035], BODY[2]));
            let mut s = Vec::new();
            lump(&mut s, [0.2, 0.2, 0.22], [0.35, 0.35, 0.37], 250, 0.6);
            for q in s {
                let mut q = q;
                q.tf = Some(translate(0.17, -0.12, 0.0));
                v.push(q);
            }
        }
        // flecha: haste, ponta de pedra e as penas
        251 => {
            v.push(diag(tbox([0.0, 0.0, 0.0], [0.018, 0.44, 0.018], wood)));
            for (i, w) in [0.07f32, 0.05, 0.03, 0.012].iter().enumerate() {
                v.push(diag(tbox([0.0, 0.36 + i as f32 * 0.035, 0.0], [*w, 0.02, *w * 0.5], BODY[1])));
            }
            for i in 0..4 {
                let w = 0.06 - i as f32 * 0.008;
                v.push(diag(cbox([0.0, -0.4 + i as f32 * 0.05, 0.0], [w, 0.025, 0.006], white)));
                v.push(diag(cbox([0.0, -0.4 + i as f32 * 0.05, 0.0], [0.006, 0.025, w], white)));
            }
        }
        // ovos de criatura: ovo com pintas
        265..=295 => {
            let prof = |t: f32| round(t) * (1.0 - 0.17 * t);
            blob(&mut v, [0.0, 0.0, 0.0], [0.21, 0.3, 0.21], 10, a, &prof);
            spots(&mut v, [0.0; 3], [0.21, 0.3, 0.21], 9, 0.038, b, id as u32, &prof);
        }
        // baldes: o balde que alarga para cima, a alça e o que tem dentro
        308..=310 => {
            for i in 0..6 {
                let f = i as f32;
                let w = 0.17 + f * 0.012;
                v.push(tbox([0.0, -0.25 + f * 0.07, 0.0], [w, 0.036, w * 0.75], if i == 5 { EDGE[2] } else { BODY[2] }));
            }
            let inside = match id {
                309 => [0.2, 0.4, 0.9],
                310 => [1.0, 0.45, 0.08],
                _ => [0.12, 0.12, 0.14],
            };
            v.push(cbox([0.0, 0.13, 0.0], [0.2, 0.008, 0.15], inside));
            for i in 0..12 {
                let ang = (i as f32 + 0.5) / 12.0 * PI;
                let (x, y) = (ang.cos() * 0.22, 0.14 + ang.sin() * 0.2);
                v.push(turned(tbox([x, y, 0.0], [0.034, 0.015, 0.015], DARK_METAL), x, y, ang + PI / 2.0));
            }
        }
        // vara de pescar: a vara, a linha e o anzol
        311 => {
            v.push(diag(tbox([0.0, 0.0, 0.0], [0.024, 0.46, 0.024], wood)));
            v.push(diag(tbox([0.0, -0.32, 0.0], [0.03, 0.1, 0.03], GRIP)));
            v.push(cbox([0.3, -0.02, 0.0], [0.005, 0.3, 0.005], [0.85, 0.85, 0.85]));
            v.push(tbox([0.3, -0.33, 0.0], [0.012, 0.03, 0.012], BODY[2]));
            v.push(tbox([0.33, -0.35, 0.0], [0.02, 0.01, 0.012], BODY[2]));
        }
        // barco: fundo, laterais, pontas e o banco
        312 => {
            let w = BODY[0];
            v.push(tbox([0.0, -0.14, 0.0], [0.34, 0.03, 0.16], w));
            v.push(tbox([0.0, -0.04, 0.15], [0.36, 0.09, 0.02], w));
            v.push(tbox([0.0, -0.04, -0.15], [0.36, 0.09, 0.02], w));
            v.push(tbox([0.36, -0.04, 0.0], [0.02, 0.09, 0.16], w));
            v.push(tbox([-0.36, -0.04, 0.0], [0.02, 0.09, 0.16], w));
            v.push(tbox([0.0, -0.02, 0.0], [0.06, 0.015, 0.14], HANDLE));
        }
        // escudo: tábuas com aro de ferro e o miolo no meio
        313 => {
            v.push(tbox([0.0, 0.0, 0.0], [0.3, 0.4, 0.035], BODY[0]));
            for x in [-0.15f32, 0.0, 0.15] {
                v.push(tbox([x, 0.0, 0.0], [0.004, 0.4, 0.037], HANDLE));
            }
            v.push(tbox([0.0, 0.39, 0.0], [0.31, 0.03, 0.045], DARK_METAL));
            v.push(tbox([0.0, -0.39, 0.0], [0.31, 0.03, 0.045], DARK_METAL));
            v.push(tbox([0.3, 0.0, 0.0], [0.025, 0.4, 0.045], DARK_METAL));
            v.push(tbox([-0.3, 0.0, 0.0], [0.025, 0.4, 0.045], DARK_METAL));
            v.push(tbox([0.0, 0.0, 0.05], [0.07, 0.07, 0.025], BODY[2]));
            v.push(tbox([0.0, 0.0, 0.07], [0.04, 0.04, 0.012], EDGE[2]));
        }
        // arco: braços curvos, a pega de couro e a corda
        264 => {
            let segs = 9;
            for i in 0..segs {
                let t = (i as f32 + 0.5) / segs as f32 * 2.0 - 1.0; // -1..1
                let ang = t * 1.05;
                let (x, y) = (-ang.cos() * 0.0 + (1.0 - ang.cos()) * 0.42 - 0.12, ang.sin() * 0.44);
                let tex = if i == segs / 2 { GRIP } else { BODY[0] };
                let th = 0.032 - t.abs() * 0.01;
                v.push(diag(turned(tbox([x, y, 0.0], [th, 0.062, th], tex), x, y, -ang)));
            }
            let (ex, ey) = ((1.0 - 1.05f32.cos()) * 0.42 - 0.12, 1.05f32.sin() * 0.44);
            v.push(diag(cbox([ex, 0.0, 0.0], [0.006, ey, 0.006], [0.9, 0.9, 0.85])));
        }
        _ => {
            // armaduras: pela peça
            let piece = crate::items::info(id).map_or(-1, |i| i.armor_piece);
            let c = if n.contains("couro") {
                LEATHER
            } else if n.contains("diamante") {
                [0.32, 0.85, 0.82]
            } else {
                [0.82, 0.83, 0.86]
            };
            let dark = shade(c, 0.72);
            match piece {
                0 => {
                    // capacete: topo, nuca, laterais e a aba; o rosto fica aberto
                    // casco arredondado em cima, laterais inteiras até a bochecha e a nuca mais baixa
                    v.push(cbox([0.0, 0.2, 0.0], [0.22, 0.05, 0.22], shade(c, 1.08)));
                    v.push(cbox([0.0, 0.08, 0.0], [0.27, 0.08, 0.27], c));
                    v.push(cbox([-0.25, -0.06, -0.02], [0.03, 0.07, 0.25], c));
                    v.push(cbox([0.25, -0.06, -0.02], [0.03, 0.07, 0.25], c));
                    v.push(cbox([0.0, -0.1, -0.245], [0.27, 0.11, 0.03], dark));
                    v.push(cbox([0.0, 0.01, 0.255], [0.275, 0.025, 0.03], dark));
                    v.push(cbox([0.0, -0.04, 0.0], [0.22, 0.06, 0.22], shade(c, 0.3)));
                }
                1 => {
                    // peitoral: tronco, ombreiras, gola e a placa do peito
                    v.push(cbox([0.0, -0.05, 0.0], [0.24, 0.27, 0.12], c));
                    v.push(cbox([-0.27, 0.15, 0.0], [0.08, 0.08, 0.13], dark));
                    v.push(cbox([0.27, 0.15, 0.0], [0.08, 0.08, 0.13], dark));
                    v.push(cbox([0.0, 0.23, 0.0], [0.09, 0.02, 0.1], shade(c, 0.35)));
                    v.push(cbox([0.0, 0.0, 0.125], [0.14, 0.15, 0.012], shade(c, 1.12)));
                }
                2 => {
                    // calças: cinto e as duas pernas
                    v.push(cbox([0.0, 0.22, 0.0], [0.24, 0.06, 0.12], dark));
                    v.push(cbox([-0.12, -0.06, 0.0], [0.11, 0.24, 0.11], c));
                    v.push(cbox([0.12, -0.06, 0.0], [0.11, 0.24, 0.11], shade(c, 0.92)));
                }
                3 => {
                    // botas: o cano, o pé para a frente e a sola
                    for (x, k) in [(-0.13f32, 1.0f32), (0.13, 0.92)] {
                        v.push(cbox([x, 0.05, 0.0], [0.1, 0.15, 0.1], shade(c, k)));
                        v.push(cbox([x, -0.14, 0.05], [0.1, 0.06, 0.15], shade(c, k)));
                        v.push(cbox([x, -0.21, 0.05], [0.105, 0.015, 0.155], shade(dark, 0.6)));
                    }
                }
                _ => return None,
            }
        }
    }
    Some(v)
}

/// Desenha o item com a transformação `t` do ícone. Devolve false se ele não tem modelo (fica o ícone).
pub fn draw(ui: &mut Ui, t: &Tf, item: i32, light: f32) -> bool {
    let Some(info) = crate::items::info(item) else { return false };
    let (a, b) = palette(info.icon);
    let Some(parts) = parts(item, &info.name.to_lowercase(), a, b) else { return false };
    // um pouco de lado, para aparecer a espessura (o capacete bem de lado: de frente parece uma mesa)
    let yaw = if info.armor_piece == 0 { -1.1 } else { -0.45 };
    let m = mul(t, &rot_y(yaw));
    render(ui, &m, &parts, light, false);
    true
}
