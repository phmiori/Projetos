//! O boneco do personagem no inventário: o mesmo corpo dos jogadores da LAN, com as cores do seu personagem e a
//! armadura vestida, olhando para o mouse (a cabeça vira e o corpo acompanha um pouco).

use crate::hand::{mul, rot_y, translate};
use crate::inventory::SIZE;
use crate::players::{body, Pose};
use crate::ui::{rgba, Ui};
use crate::Game;

impl Game {
    pub fn draw_avatar(&self, ui: &mut Ui, w: f32, h: f32) {
        let Some(r) = self.avatar_rect(w, h) else { return };
        let k = Self::ui_scale(h as u32);
        // fundo escuro, como os espaços
        ui.rect(r[0], r[1], r[2], r[3], rgba(16, 16, 20, 235));
        ui.frame(r[0], r[1], r[2], r[3], k, rgba(0, 0, 0, 180));

        // tamanho: o boneco (uns 1,9 de altura) cabe na caixa com uma folga
        let s = r[3] * 0.86 / 1.9;
        let (cx, feet) = (r[0] + r[2] / 2.0, r[1] + r[3] * 0.95);
        let head_y = feet - 1.62 * s;
        // para onde olhar: o mouse, em relação aos olhos
        let (dx, dy) = (self.mouse.0 - cx, self.mouse.1 - head_y);
        let head_yaw = (dx / (160.0 * k)).atan().clamp(-0.75, 0.75);
        let head_pitch = (-dy / (160.0 * k)).atan().clamp(-0.55, 0.55);
        let body_yaw = head_yaw * 0.4;
        let pose = Pose { head_yaw: head_yaw - body_yaw, head_pitch, left_arm: 0.06, right_arm: -0.06, leg: 0.0 };
        let armor = [0, 1, 2, 3].map(|i| self.inv.s[SIZE + i].id.max(0));
        // de frente para quem olha
        let base = mul(&rot_y(body_yaw), &translate(0.0, 0.0, 0.0));

        let mut faces: Vec<([[f32; 3]; 4], [f32; 4])> = Vec::with_capacity(400);
        body(
            &mut |q, c| {
                // só as faces viradas para quem olha (as caixas são convexas: o resto fica escondido atrás)
                let (a, b) = ([q[1][0] - q[0][0], q[1][1] - q[0][1]], [q[2][0] - q[0][0], q[2][1] - q[0][1]]);
                if a[0] * b[1] - a[1] * b[0] > 1e-7 {
                    faces.push((q, c));
                }
            },
            &base,
            self.persona,
            &pose,
            1.0,
            armor,
        );
        // de trás para a frente (o que está mais longe de quem olha, z menor, primeiro)
        faces.sort_by(|a, b| {
            let za: f32 = a.0.iter().map(|p| p[2]).sum();
            let zb: f32 = b.0.iter().map(|p| p[2]).sum();
            za.partial_cmp(&zb).unwrap_or(std::cmp::Ordering::Equal)
        });
        for (q, c) in faces {
            ui.solid_quad(q.map(|p| [cx + p[0] * s, feet - p[1] * s, 0.0]), c);
        }
    }
}
