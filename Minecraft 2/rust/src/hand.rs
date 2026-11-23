//! Mão em primeira pessoa (Hand.java): o braço do personagem (manga da camisa + mão) e o que ele segura, em
//! coordenadas da câmera (x direita, y cima, olhando para -z), desenhados por cima da cena. Balança ao andar e
//! dá o golpe ao bater, quebrar ou colocar; o arco vem para o meio da tela ao puxar a corda.

use crate::block::{self, AIR};
use crate::ui::Ui;
use crate::Game;

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
        } else {
            // figura plana (dos dois lados)
            let (layer, uv) = if b != AIR {
                (block::texture(b) as f32 * 6.0 + 4.0, full)
            } else {
                let icon = crate::items::info(item).map_or(0, |i| i.icon);
                let (u0, v0) = crate::ui::item_uv(icon);
                let s = 16.0 / 1024.0;
                (-1.0, [[u0, v0], [u0 + s, v0], [u0 + s, v0 + s], [u0, v0 + s]])
            };
            let r = 0.5;
            let pts = [[-r, r, 0.0], [r, r, 0.0], [r, -r, 0.0], [-r, -r, 0.0]];
            ui.quad(pts.map(|p| apply(&t, p)), uv, layer, [item_light, item_light, item_light, 1.0]);
        }
    }
}
