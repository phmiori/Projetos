//! Mão em primeira pessoa (Hand.java): o braço do personagem (manga da camisa + mão) e o que ele segura, em
//! coordenadas da câmera (x direita, y cima, olhando para -z), desenhados por cima da cena. Balança ao andar e
//! dá o golpe ao bater, quebrar ou colocar; o arco vem para o meio da tela ao puxar a corda.

use crate::block::{self, AIR};
use crate::ui::Ui;
use crate::Game;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Plantas, tochas e afins (blocos em X): a face da frente de cada textura, só cheio/vazio, por número da textura.
static CROSS_MASKS: OnceLock<HashMap<u16, (u32, Vec<bool>)>> = OnceLock::new();

/// Guarda o recorte das texturas em X (chamado uma vez, quando as texturas carregam).
pub fn keep_cross_masks(a: &crate::textures::Atlas) {
    let mut out = HashMap::new();
    let layer = (a.size * a.size * 4) as usize;
    // no máximo 32 x 32 "pixels" de espessura: as texturas de 64 px ficariam com bordas demais
    let n = a.size.min(32);
    for b in 1..block::count() {
        let b = b as u8;
        if block::shape(b) != block::CROSS {
            continue;
        }
        let t = block::texture(b);
        if out.contains_key(&t) {
            continue;
        }
        let o = (t as usize * 6 + 4) * layer;
        if o + layer > a.pixels.len() {
            continue;
        }
        let mut m = vec![false; (n * n) as usize];
        for y in 0..n {
            for x in 0..n {
                let (sx, sy) = ((x * a.size + a.size / 2) / n, (y * a.size + a.size / 2) / n);
                m[(y * n + x) as usize] = a.pixels[o + ((sy * a.size + sx) * 4 + 3) as usize] >= 128;
            }
        }
        out.insert(t, (n, m));
    }
    let _ = CROSS_MASKS.set(out);
}

fn icon_mask(icon: i32) -> Option<(u32, Vec<bool>)> {
    // a mesma folha que foi para o atlas (com os desenhos de textures/itens)
    let img = crate::items::ICON_SHEET.get()?;
    let c = crate::ui::ICON;
    let (ix, iy) = ((icon % 32) as u32 * c, (icon / 32) as u32 * c);
    if ix + c > img.width() || iy + c > img.height() {
        return None;
    }
    let mut m = vec![false; (c * c) as usize];
    for y in 0..c {
        for x in 0..c {
            m[(y * c + x) as usize] = img.get_pixel(ix + x, iy + y).0[3] >= 128;
        }
    }
    Some((c, m))
}

/// O desenho com espessura (como nos jogos de blocos): a frente e as costas com a figura e, em volta de cada
/// pixel cheio que encosta no vazio, uma lateral da cor dele. `uv(x, y)` dá a coordenada da textura do ponto
/// (x, y) do desenho, em pixels (0..n).
fn extruded(ui: &mut Ui, t: &Tf, n: u32, mask: &[bool], uv: &dyn Fn(f32, f32) -> [f32; 2], layer: f32, light: f32) {
    let nf = n as f32;
    let h = 0.5 / 16.0; // metade da espessura: um pixel de um desenho de 16
    let px = |x: f32, y: f32, z: f32| apply(t, [-0.5 + x / nf, 0.5 - y / nf, z]);
    let full = [uv(0.0, 0.0), uv(nf, 0.0), uv(nf, nf), uv(0.0, nf)];
    ui.quad([px(0.0, 0.0, h), px(nf, 0.0, h), px(nf, nf, h), px(0.0, nf, h)], full, layer, [light, light, light, 1.0]);
    let back = light * 0.8;
    ui.quad([px(nf, 0.0, -h), px(0.0, 0.0, -h), px(0.0, nf, -h), px(nf, nf, -h)], [full[1], full[0], full[3], full[2]], layer, [back, back, back, 1.0]);
    let filled = |x: i32, y: i32| x >= 0 && y >= 0 && x < n as i32 && y < n as i32 && mask[(y as u32 * n + x as u32) as usize];
    for y in 0..n as i32 {
        for x in 0..n as i32 {
            if !filled(x, y) {
                continue;
            }
            let c = uv(x as f32 + 0.5, y as f32 + 0.5);
            let cs = [c; 4];
            let (x0, x1, y0, y1) = (x as f32, x as f32 + 1.0, y as f32, y as f32 + 1.0);
            // em cima, embaixo, à esquerda e à direita (a luz vem de cima)
            let sides: [(bool, [[f32; 2]; 2], f32); 4] = [
                (!filled(x, y - 1), [[x0, y0], [x1, y0]], 1.0),
                (!filled(x, y + 1), [[x1, y1], [x0, y1]], 0.55),
                (!filled(x - 1, y), [[x0, y1], [x0, y0]], 0.75),
                (!filled(x + 1, y), [[x1, y0], [x1, y1]], 0.7),
            ];
            for (open, [a, b], sh) in sides {
                if open {
                    let l = light * sh;
                    ui.quad([px(a[0], a[1], h), px(b[0], b[1], h), px(b[0], b[1], -h), px(a[0], a[1], -h)], cs, layer, [l, l, l, 1.0]);
                }
            }
        }
    }
}

/// Cores da pele e da camisa do personagem (Persona.java).
pub const SKIN: [u32; 6] = [0xFFDBAC, 0xF1C27D, 0xE0AC69, 0xC68642, 0x8D5524, 0x5C3A1E];
pub const SHIRT: [u32; 9] = [0x2AA198, 0xC0392B, 0x2E6FD8, 0x3C9A3C, 0xE0B020, 0x8E44AD, 0xE8E8E8, 0x303030, 0xE67E22];

/// Transformação 3x4 (linhas [a b c tx; d e f ty; g h i tz]), como o Hand.Tf do Java.
pub type Tf = [f32; 12];

pub fn mul(a: &Tf, b: &Tf) -> Tf {
    let mut r = [0f32; 12];
    for row in 0..3 {
        for c in 0..4 {
            let mut s = a[row * 4] * b[c] + a[row * 4 + 1] * b[4 + c] + a[row * 4 + 2] * b[8 + c];
            if c == 3 {
                s += a[row * 4 + 3];
            }
            r[row * 4 + c] = s;
        }
    }
    r
}
pub fn translate(x: f32, y: f32, z: f32) -> Tf {
    [1.0, 0.0, 0.0, x, 0.0, 1.0, 0.0, y, 0.0, 0.0, 1.0, z]
}
pub fn scale(s: f32) -> Tf {
    [s, 0.0, 0.0, 0.0, 0.0, s, 0.0, 0.0, 0.0, 0.0, s, 0.0]
}
pub fn rot_y(a: f32) -> Tf {
    let (c, s) = (a.cos(), a.sin());
    [c, 0.0, s, 0.0, 0.0, 1.0, 0.0, 0.0, -s, 0.0, c, 0.0]
}
pub fn rot_x(a: f32) -> Tf {
    let (c, s) = (a.cos(), a.sin());
    [1.0, 0.0, 0.0, 0.0, 0.0, c, -s, 0.0, 0.0, s, c, 0.0]
}
pub fn rot_z(a: f32) -> Tf {
    let (c, s) = (a.cos(), a.sin());
    [c, -s, 0.0, 0.0, s, c, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0]
}
pub fn apply(t: &Tf, p: [f32; 3]) -> [f32; 3] {
    [
        t[0] * p[0] + t[1] * p[1] + t[2] * p[2] + t[3],
        t[4] * p[0] + t[5] * p[1] + t[6] * p[2] + t[7],
        t[8] * p[0] + t[9] * p[1] + t[10] * p[2] + t[11],
    ]
}

fn rgb(c: u32, l: f32) -> [f32; 4] {
    [((c >> 16) & 255) as f32 / 255.0 * l, ((c >> 8) & 255) as f32 / 255.0 * l, (c & 255) as f32 / 255.0 * l, 1.0]
}

/// Caixa de uma cor, com as faces sombreadas como no Java.
fn solid_box(ui: &mut Ui, t: &Tf, lo: [f32; 3], hi: [f32; 3], color: u32, light: f32) {
    let c = |i: usize| apply(t, [if i & 1 == 0 { lo[0] } else { hi[0] }, if i & 2 == 0 { lo[1] } else { hi[1] }, if i & 4 == 0 { lo[2] } else { hi[2] }]);
    let faces = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
    let shade = [0.85, 0.6, 1.0, 0.5, 0.75, 0.75];
    for (f, q) in faces.iter().enumerate() {
        ui.solid_quad([c(q[0]), c(q[1]), c(q[2]), c(q[3])], rgb(color, shade[f] * light));
    }
}

impl Game {
    /// Monta o braço e o item no lote da interface (em coordenadas da câmera).
    pub fn draw_hand(&self, ui: &mut Ui, daylight: f32) {
        let e = self.eye();
        let (bx, by, bz) = (e[0].floor() as i32, e[1].floor() as i32, e[2].floor() as i32);
        let sky = self.sky_light(bx, by, bz) as f32 / 15.0 * (0.13 + 0.87 * daylight);
        let blk = (self.block_light(bx, by, bz) as f32 / 15.0).powf(1.5);
        let light = (sky.max(blk) * 0.95 + 0.05).min(1.0);

        // balanço ao andar e golpe ao bater/quebrar/colocar
        let phase = self.walk_dist * 2.4;
        let (bob_x, bob_y) = ((phase.sin() * 0.025) as f32, (-phase.cos().abs() * 0.03) as f32);
        let sw = if self.swing > 0.0 { ((1.0 - self.swing / 0.3) * std::f64::consts::PI).sin() as f32 } else { 0.0 };
        let mut arm = translate(0.5 + bob_x - sw * 0.12, -0.52 + bob_y - sw * 0.08, -0.38 - sw * 0.16);
        arm = mul(&arm, &rot_y(0.32 + sw * 0.3));
        arm = mul(&arm, &rot_x(0.14 - sw * 0.9));
        let shirt = SHIRT[self.persona[2].min(SHIRT.len() - 1)];
        let skin = SKIN[self.persona[0].min(SKIN.len() - 1)];
        solid_box(ui, &arm, [-0.1, -0.1, -0.48], [0.1, 0.1, 0.0], shirt, light); // manga
        solid_box(ui, &arm, [-0.095, -0.095, -0.72], [0.095, 0.095, -0.48], skin, light); // mão

        // o escudo do espaço do escudo, na mão esquerda; ao defender ele sobe para a frente
        let off = self.inv.s[crate::inventory::SHIELD_SLOT];
        if off.id == crate::combat::SHIELD && self.inv.s[self.slot].id != crate::combat::SHIELD {
            let up = if self.blocking() { 1.0 } else { 0.0 };
            let mut t = translate(-0.5 + up * 0.22 + bob_x, -0.38 + up * 0.14 + bob_y, -0.95 + up * 0.12);
            t = mul(&t, &rot_y(0.3 - up * 0.2));
            t = mul(&t, &scale(0.46));
            let icon = crate::items::info(off.id).map_or(0, |i| i.icon);
            if let Some((n, mask)) = icon_mask(icon) {
                let (u0, v0) = crate::ui::item_uv(icon);
                let px = crate::ui::atlas_px();
                extruded(ui, &t, n, &mask, &|x, y| [u0 + x * px, v0 + y * px], -1.0, light);
            }
        }

        let st = self.inv.s[self.slot];
        if st.empty() {
            return;
        }
        let item = st.id;
        let b = block::block_of_item(item);
        let tool = crate::items::info(item).map_or(false, |i| i.tool_kind >= 0);
        let item_light = if b != AIR && block::info(b).light > 0 { 1.0 } else { light };
        let t = if item == crate::tools::BOW {
            // arco: em pé na frente da mão; ao puxar, vem para o meio da tela e treme no máximo
            let c = (self.bow_charge as f32).clamp(0.0, 1.0);
            let shake = if c >= 1.0 { (self.clock_s * 40.0).sin() as f32 * 0.004 } else { 0.0 };
            let mut t = mul(&arm, &translate(-0.06 - c * 0.17 + shake, 0.26 + c * 0.03, -0.66 + c * 0.07));
            t = mul(&t, &rot_y(0.35 - c * 0.3));
            t = mul(&t, &rot_x(-0.15));
            mul(&t, &scale(0.62))
        } else if b != AIR && block::shape(b) != block::CROSS {
            let mut t = mul(&arm, &translate(-0.02, 0.18, -0.64));
            t = mul(&t, &rot_y(0.75));
            mul(&t, &scale(0.27))
        } else if !tool {
            // tocha, flores, comida: em pé na mão, de frente para a câmera
            let mut t = mul(&arm, &translate(-0.04, 0.24, -0.66));
            t = mul(&t, &rot_y(0.35));
            t = mul(&t, &rot_x(-0.15));
            mul(&t, &scale(0.55))
        } else {
            // ferramenta: o cabo no punho, a ponta para a frente e para cima
            let mut t = mul(&arm, &translate(0.0, 0.0, -0.6));
            t = mul(&t, &rot_y(-std::f32::consts::FRAC_PI_2 + 0.8));
            t = mul(&t, &rot_z(std::f32::consts::FRAC_PI_2 - 0.5));
            t = mul(&t, &scale(0.7));
            mul(&t, &translate(0.28, 0.28, 0.0))
        };
        let full = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        if b != AIR && block::shape(b) != block::CROSS && item != crate::tools::BOW {
            // cubinho com as texturas de verdade
            let r = 0.5;
            let tex = block::texture(b) as f32;
            let faces: [([[f32; 3]; 4], f32, f32); 6] = [
                ([[-r, r, -r], [r, r, -r], [r, r, r], [-r, r, r]], 2.0, 1.0),
                ([[-r, -r, r], [r, -r, r], [r, -r, -r], [-r, -r, -r]], 3.0, 0.5),
                ([[-r, r, r], [r, r, r], [r, -r, r], [-r, -r, r]], 4.0, 0.75),
                ([[r, r, -r], [-r, r, -r], [-r, -r, -r], [r, -r, -r]], 5.0, 0.75),
                ([[r, r, r], [r, r, -r], [r, -r, -r], [r, -r, r]], 0.0, 0.85),
                ([[-r, r, -r], [-r, r, r], [-r, -r, r], [-r, -r, -r]], 1.0, 0.6),
            ];
            for (pts, face, shade) in faces {
                let l = item_light * shade;
                ui.quad(pts.map(|p| apply(&t, p)), full, tex * 6.0 + face, [l, l, l, 1.0]);
            }
        } else if b != AIR {
            // planta, tocha...: a figura da textura com espessura
            let tex = block::texture(b);
            match CROSS_MASKS.get().and_then(|m| m.get(&tex)) {
                Some((n, mask)) => {
                    let nf = *n as f32;
                    extruded(ui, &t, *n, mask, &|x, y| [x / nf, y / nf], tex as f32 * 6.0 + 4.0, item_light);
                }
                None => {
                    let r = 0.5;
                    let pts = [[-r, r, 0.0], [r, r, 0.0], [r, -r, 0.0], [-r, -r, 0.0]];
                    ui.quad(pts.map(|p| apply(&t, p)), full, tex as f32 * 6.0 + 4.0, [item_light, item_light, item_light, 1.0]);
                }
            }
        } else {
            // ferramentas, comida, arco...: o ícone com espessura (o ícone da barra continua plano)
            let icon = crate::items::info(item).map_or(0, |i| i.icon);
            let (u0, v0) = crate::ui::item_uv(icon);
            let px = crate::ui::atlas_px();
            match icon_mask(icon) {
                Some((n, mask)) => extruded(ui, &t, n, &mask, &|x, y| [u0 + x * px, v0 + y * px], -1.0, item_light),
                None => {
                    let s = crate::ui::icon_span();
                    let r = 0.5;
                    let pts = [[-r, r, 0.0], [r, r, 0.0], [r, -r, 0.0], [-r, -r, 0.0]];
                    ui.quad(pts.map(|p| apply(&t, p)), [[u0, v0], [u0 + s, v0], [u0 + s, v0 + s], [u0, v0 + s]], -1.0, [item_light, item_light, item_light, 1.0]);
                }
            }
        }
    }
}
