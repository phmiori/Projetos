//! Os outros jogadores da LAN (Remote.writeModel do Java): o boneco com as cores do personagem, andando,
//! dando golpes e com o item na mão, e o nome em cima da cabeça.

use crate::hand::{apply, mul, rot_x, rot_y, scale, translate, Tf, SHIRT, SKIN};
use crate::net::Remote;
use crate::ui::{rgba, Ui};
use crate::Game;

const HAIR: [u32; 8] = [0x2B1B10, 0x6B4226, 0xE6C15A, 0xA0401E, 0xB0B0B0, 0x3060C0, 0xE070B0, 0x30A060];
const PANTS: [u32; 7] = [0x34495E, 0x2C3E8F, 0x6B4F2A, 0x222222, 0x777777, 0x3E5E2E, 0x8B1E3F];
/// Um "pixel" do boneco: o corpo tem 32 de altura, como uma figura de 1,8 bloco.
const P: f32 = 1.8 / 32.0;
const SHADE: [f32; 6] = [0.8, 0.8, 1.0, 0.55, 0.9, 0.65];

fn darker(c: u32, f: f32) -> u32 {
    let ch = |s: u32| (((c >> s) & 255) as f32 * f).min(255.0) as u32;
    ch(16) << 16 | ch(8) << 8 | ch(0)
}

fn rgb(c: u32, l: f32) -> [f32; 4] {
    [((c >> 16) & 255) as f32 / 255.0 * l, ((c >> 8) & 255) as f32 / 255.0 * l, (c & 255) as f32 / 255.0 * l, 1.0]
}

fn bx(ui: &mut Ui, t: &Tf, lo: [f32; 3], hi: [f32; 3], color: u32, light: f32) {
    let c = |i: usize| apply(t, [if i & 1 == 0 { lo[0] } else { hi[0] }, if i & 2 == 0 { lo[1] } else { hi[1] }, if i & 4 == 0 { lo[2] } else { hi[2] }]);
    let faces = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
    for (f, q) in faces.iter().enumerate() {
        ui.solid_quad([c(q[0]), c(q[1]), c(q[2]), c(q[3])], rgb(color, SHADE[f] * light));
    }
}

fn limb(base: &Tf, px: f32, py: f32, angle: f32) -> Tf {
    mul(&mul(base, &translate(px, py, 0.0)), &rot_x(angle))
}

fn draw_one(ui: &mut Ui, r: &Remote, light: f32) {
    let [sk, hr, sh, pa] = r.persona;
    let (skin, hair, shirt, pants) = (SKIN[sk.min(5)], HAIR[hr.min(7)], SHIRT[sh.min(8)], PANTS[pa.min(6)]);
    let (skin_d, shirt_d, pants_d, hair_d) = (darker(skin, 0.82), darker(shirt, 0.78), darker(pants, 0.8), darker(hair, 0.8));
    let (shoe, white, iris, mouth) = (0x3A2A1C, 0xF4F4F4, 0x3B5BA8, darker(skin, 0.6));

    let amount = (r.speed / 4.0).min(1.0) as f32;
    let phase = (r.walk * 2.6) as f32;
    let leg = phase.sin() * 0.75 * amount;
    let sw = if r.swing > 0.0 { ((1.0 - r.swing / 0.3) * std::f64::consts::PI).sin() as f32 } else { 0.0 };
    let mut right_arm = leg - sw * 1.6;
    let left_arm = -leg;
    if r.held > 0 && sw == 0.0 {
        right_arm = right_arm * 0.5 - 0.35; // segurando algo: braço um pouco para a frente
    }
    let base = mul(&translate(r.pos[0] as f32, r.pos[1] as f32, r.pos[2] as f32), &rot_y(r.yaw as f32));
    for side in [-1.0f32, 1.0] {
        let a = if side < 0.0 { leg } else { -leg };
        let t = limb(&base, side * 2.0 * P, 12.0 * P, a);
        bx(ui, &t, [-2.0 * P, -12.0 * P, -2.0 * P], [2.0 * P, 0.3 * P, 2.0 * P], if side < 0.0 { pants } else { pants_d }, light);
        bx(ui, &t, [-2.05 * P, -12.0 * P, -2.3 * P], [2.05 * P, -10.0 * P, 2.05 * P], shoe, light);
    }
    bx(ui, &base, [-4.0 * P, 12.0 * P, -2.0 * P], [4.0 * P, 24.0 * P, 2.0 * P], shirt, light);
    bx(ui, &base, [-4.05 * P, 12.0 * P, -2.05 * P], [4.05 * P, 13.2 * P, 2.05 * P], 0x3A2A20, light);
    bx(ui, &base, [-1.2 * P, 22.6 * P, 2.0 * P], [1.2 * P, 24.0 * P, 2.15 * P], skin_d, light);
    bx(ui, &base, [-4.05 * P, 23.3 * P, -2.05 * P], [4.05 * P, 24.05 * P, 2.05 * P], shirt_d, light);
    let arm_r = limb(&base, -6.0 * P, 22.0 * P, right_arm);
    let arm_l = limb(&base, 6.0 * P, 22.0 * P, left_arm);
    for t in [&arm_r, &arm_l] {
        bx(ui, t, [-2.0 * P, -4.0 * P, -2.0 * P], [2.0 * P, 2.0 * P, 2.0 * P], shirt, light);
        bx(ui, t, [-1.9 * P, -10.0 * P, -1.9 * P], [1.9 * P, -4.0 * P, 1.9 * P], skin, light);
        bx(ui, t, [-1.95 * P, -10.6 * P, -1.95 * P], [1.95 * P, -9.4 * P, 1.95 * P], skin_d, light);
    }
    let head = mul(&mul(&base, &translate(0.0, 24.0 * P, 0.0)), &rot_x(-(r.pitch.clamp(-1.2, 1.2) as f32) * 0.8));
    bx(ui, &head, [-4.0 * P, 0.0, -4.0 * P], [4.0 * P, 8.0 * P, 4.0 * P], skin, light);
    bx(ui, &head, [-4.25 * P, 6.3 * P, -4.25 * P], [4.25 * P, 8.4 * P, 4.25 * P], hair, light);
    bx(ui, &head, [-4.25 * P, 2.5 * P, -4.25 * P], [4.25 * P, 6.4 * P, -3.2 * P], hair_d, light);
    bx(ui, &head, [-4.25 * P, 4.5 * P, -4.25 * P], [-3.4 * P, 6.4 * P, 2.5 * P], hair_d, light);
    bx(ui, &head, [3.4 * P, 4.5 * P, -4.25 * P], [4.25 * P, 6.4 * P, 2.5 * P], hair_d, light);
    bx(ui, &head, [-4.25 * P, 5.6 * P, 3.6 * P], [1.5 * P, 6.4 * P, 4.25 * P], hair, light);
    let (f, f2) = (4.0 * P, 4.12 * P);
    for side in [-1.0f32, 1.0] {
        let ex = side * 2.0 * P;
        bx(ui, &head, [ex - 1.1 * P, 3.4 * P, f], [ex + 1.1 * P, 4.5 * P, f2], white, light);
        let ix = ex - side * 0.45 * P; // íris virada para o centro
        bx(ui, &head, [ix - 0.55 * P, 3.4 * P, f2 - 0.02 * P], [ix + 0.55 * P, 4.5 * P, f2 + 0.06 * P], iris, light);
        bx(ui, &head, [ex - 1.2 * P, 4.9 * P, f], [ex + 1.2 * P, 5.3 * P, f2], hair_d, light); // sobrancelha
    }
    bx(ui, &head, [-0.6 * P, 2.4 * P, f], [0.6 * P, 3.4 * P, 4.5 * P], skin_d, light); // nariz
    bx(ui, &head, [-1.5 * P, 1.3 * P, f], [1.5 * P, 1.8 * P, f2], mouth, light); // boca

    // o item na mão direita (figura plana ou cubinho)
    if r.held > 0 && crate::items::exists(r.held) {
        let b = crate::block::block_of_item(r.held);
        let t = mul(&arm_r, &translate(0.0, -10.0 * P, 1.2 * P));
        let full = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        if b != crate::block::AIR && crate::block::shape(b) != crate::block::CROSS {
            let t = mul(&mul(&mul(&t, &translate(0.0, -0.1, 0.14)), &rot_y(0.6)), &scale(0.36));
            let tex = crate::block::texture(b) as f32;
            let s = 0.5;
            let faces: [([[f32; 3]; 4], f32, f32); 6] = [
                ([[-s, s, -s], [s, s, -s], [s, s, s], [-s, s, s]], 2.0, 1.0),
                ([[-s, -s, s], [s, -s, s], [s, -s, -s], [-s, -s, -s]], 3.0, 0.5),
                ([[-s, s, s], [s, s, s], [s, -s, s], [-s, -s, s]], 4.0, 0.75),
                ([[s, s, -s], [-s, s, -s], [-s, -s, -s], [s, -s, -s]], 5.0, 0.75),
                ([[s, s, s], [s, s, -s], [s, -s, -s], [s, -s, s]], 0.0, 0.85),
                ([[-s, s, -s], [-s, s, s], [-s, -s, s], [-s, -s, -s]], 1.0, 0.6),
            ];
            for (pts, face, shade) in faces {
                let l = light * shade;
                ui.quad(pts.map(|p| apply(&t, p)), full, tex * 6.0 + face, [l, l, l, 1.0]);
            }
        } else {
            let t = mul(&mul(&mul(&t, &rot_y(-std::f32::consts::FRAC_PI_2 + 0.5)), &scale(0.85)), &translate(0.3, 0.3, 0.0));
            let (layer, uv) = if b != crate::block::AIR {
                (crate::block::texture(b) as f32 * 6.0 + 4.0, full)
            } else {
                let icon = crate::items::info(r.held).map_or(0, |i| i.icon);
                let (u0, v0) = crate::ui::item_uv(icon);
                let s = crate::ui::icon_span();
                (-1.0, [[u0, v0], [u0 + s, v0], [u0 + s, v0 + s], [u0, v0 + s]])
            };
            let s = 0.5;
            let pts = [[-s, s, 0.0], [s, s, 0.0], [s, -s, 0.0], [-s, -s, 0.0]];
            ui.quad(pts.map(|p| apply(&t, p)), uv, layer, [light, light, light, 1.0]);
        }
    }
}

impl Game {
    /// Os bonecos dos outros jogadores (no lote das criaturas).
    pub fn draw_players(&self, ui: &mut Ui, daylight: f32) {
        let Some(n) = &self.net else { return };
        for r in n.remotes.values().filter(|r| r.has_state && r.id != n.my_id) {
            let (x, y, z) = (r.pos[0].floor() as i32, (r.pos[1] + 1.0).floor() as i32, r.pos[2].floor() as i32);
            let sky = self.sky_light(x, y, z) as f32 / 15.0 * (0.13 + 0.87 * daylight);
            let blk = (self.block_light(x, y, z) as f32 / 15.0).powf(1.5);
            draw_one(ui, r, (sky.max(blk) * 0.95 + 0.05).min(1.0));
        }
    }

    /// Nomes em cima das cabeças (na tela, depois do mundo). `vp` é a matriz da câmera.
    pub fn draw_name_tags(&self, ui: &mut Ui, vp: &[f32; 16], w: f32, h: f32) {
        let Some(n) = &self.net else { return };
        let k = Self::ui_scale(h as u32);
        for r in n.remotes.values().filter(|r| r.has_state && r.id != n.my_id) {
            let p = [r.pos[0] as f32, r.pos[1] as f32 + 2.15, r.pos[2] as f32];
            let c = [
                vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12],
                vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13],
                vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15],
            ];
            if c[2] <= 0.1 {
                continue; // atrás da câmera
            }
            let dist = ((r.pos[0] - self.player.x).powi(2) + (r.pos[2] - self.player.z).powi(2)).sqrt();
            if dist > 64.0 {
                continue;
            }
            let (sx, sy) = ((c[0] / c[2] * 0.5 + 0.5) * w, (0.5 - c[1] / c[2] * 0.5) * h);
            let px = 14.0 * k;
            let tw = ui.text_width(px, &r.name);
            ui.rect(sx - tw / 2.0 - 6.0 * k, sy - 18.0 * k, tw + 12.0 * k, 24.0 * k, rgba(0, 0, 0, 120));
            ui.centered(px, sx, sy, &r.name, rgba(255, 255, 255, 255));
        }
    }
}
