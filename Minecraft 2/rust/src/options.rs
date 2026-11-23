//! Tela de configurações (como a do Java): muda na hora e grava no mesmo `settings.properties` que o Java usa,
//! trocando só as chaves desta tela (textura, LAN e o resto ficam como o Java deixou).

use crate::ui::{rgba, Ui};
use crate::{Game, Screen};

/// Linhas da tela, na ordem.
const ROWS: usize = 8;

fn on_off(b: bool) -> String {
    if b { "Ligado".into() } else { "Desligado".into() }
}

fn inside(m: (f32, f32), r: [f32; 4]) -> bool {
    m.0 >= r[0] && m.0 < r[0] + r[2] && m.1 >= r[1] && m.1 < r[1] + r[3]
}

/// Grava as chaves no settings.properties, mantendo as outras linhas.
pub fn write_settings(values: &[(&str, String)]) {
    let path = std::path::Path::new("settings.properties");
    let text = std::fs::read_to_string(path).unwrap_or_else(|_| "#Configuracoes do Mundo de Blocos\n".into());
    let mut lines: Vec<String> = text.lines().map(|l| l.to_string()).collect();
    for (k, v) in values {
        let prefix = format!("{k}=");
        match lines.iter().position(|l| l.starts_with(&prefix)) {
            Some(i) => lines[i] = format!("{k}={v}"),
            None => lines.push(format!("{k}={v}")),
        }
    }
    let _ = std::fs::write(path, lines.join("\n") + "\n");
}

impl Game {
    pub fn open_settings(&mut self) {
        self.settings_return = self.screen;
        self.screen = Screen::Settings;
    }

    pub fn close_settings(&mut self) {
        self.screen = self.settings_return;
        let s = &self.settings;
        write_settings(&[
            ("vsync", s.vsync.to_string()),
            ("volume", ((s.volume * 10.0).round() as i32).to_string()),
            ("distancia", s.view_dist.to_string()),
            ("sombras", s.shadows.to_string()),
            ("reflexos", s.reflections.to_string()),
            ("oclusao", s.ao.to_string()),
            ("fov", (s.fov as i32).to_string()),
            ("sensibilidade", s.sens_level.to_string()),
        ]);
    }

    fn settings_rows(&self) -> [(&'static str, String); ROWS] {
        let s = &self.settings;
        [
            ("Sincronia vertical (VSync)", on_off(s.vsync)),
            ("Volume dos sons", format!("{}%", (s.volume * 100.0).round() as i32)),
            ("Distância de visão", format!("{} blocos", s.view_dist)),
            ("Sombras", on_off(s.shadows)),
            ("Reflexos na água", on_off(s.reflections)),
            ("Sombra nos cantos (AO)", on_off(s.ao)),
            ("Campo de visão (FOV)", format!("{}°", s.fov as i32)),
            ("Sensibilidade do mouse", s.sens_level.to_string()),
        ]
    }

    /// Painel, linhas (cada uma com a seta da esquerda e a da direita) e o botão Voltar.
    fn settings_layout(&self, w: f32, h: f32) -> ([f32; 4], Vec<([f32; 4], [f32; 4], [f32; 4])>, [f32; 4]) {
        let k = Self::ui_scale(h as u32);
        let (pw, row) = ((700.0 * k).min(w - 20.0), 42.0 * k);
        let ph = 90.0 * k + ROWS as f32 * row + 90.0 * k;
        let (px, py) = ((w - pw) / 2.0, ((h - ph) / 2.0).max(6.0));
        let (bw, bh) = (40.0 * k, 32.0 * k);
        let rows = (0..ROWS)
            .map(|i| {
                let y = py + 80.0 * k + i as f32 * row;
                let r = [px + 30.0 * k, y, pw - 60.0 * k, row - 8.0 * k];
                let right = [r[0] + r[2] - bw, y + (r[3] - bh) / 2.0, bw, bh];
                let left = [right[0] - 220.0 * k - bw, right[1], bw, bh];
                (r, left, right)
            })
            .collect();
        let back = [(w - 220.0 * k) / 2.0, py + ph - 64.0 * k, 220.0 * k, 44.0 * k];
        ([px, py, pw, ph], rows, back)
    }

    pub fn draw_settings(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        ui.rect(0.0, 0.0, w, h, rgba(0, 0, 0, 120));
        let (p, rows, back) = self.settings_layout(w, h);
        ui.rect(p[0], p[1], p[2], p[3], rgba(20, 22, 28, 228));
        ui.frame(p[0], p[1], p[2], p[3], 2.0 * k, rgba(0, 0, 0, 180));
        ui.centered(28.0 * k, w / 2.0, p[1] + 50.0 * k, "Configurações", rgba(245, 232, 205, 255));
        let m = self.mouse;
        for ((label, value), (r, l, rt)) in self.settings_rows().into_iter().zip(rows) {
            ui.rect(r[0], r[1], r[2], r[3], rgba(40, 42, 50, 200));
            ui.text(15.0 * k, r[0] + 14.0 * k, r[1] + r[3] / 2.0 + 5.0 * k, label, rgba(235, 235, 240, 255));
            for (b, s) in [(l, "<"), (rt, ">")] {
                ui.rect(b[0], b[1], b[2], b[3], if inside(m, b) { rgba(96, 150, 70, 255) } else { rgba(64, 64, 72, 245) });
                ui.centered(16.0 * k, b[0] + b[2] / 2.0, b[1] + b[3] / 2.0 + 6.0 * k, s, rgba(255, 255, 255, 255));
            }
            let cx = (l[0] + l[2] + rt[0]) / 2.0;
            ui.centered(15.0 * k, cx, r[1] + r[3] / 2.0 + 5.0 * k, &value, rgba(200, 235, 170, 255));
        }
        ui.centered(12.0 * k, w / 2.0, back[1] - 14.0 * k, "As mudanças valem na hora e também para a versão Java", rgba(200, 200, 210, 220));
        ui.rect(back[0], back[1], back[2], back[3], if inside(m, back) { rgba(96, 150, 70, 255) } else { rgba(70, 112, 52, 245) });
        ui.frame(back[0], back[1], back[2], back[3], 2.0 * k, rgba(0, 0, 0, 180));
        ui.centered(16.0 * k, w / 2.0, back[1] + back[3] / 2.0 + 6.0 * k, "Voltar", rgba(255, 255, 255, 255));
    }

    /// Clique na tela. Retorna true se a sincronia vertical mudou (quem cuida da janela aplica).
    pub fn settings_click(&mut self, w: f32, h: f32) -> bool {
        let (_, rows, back) = self.settings_layout(w, h);
        if inside(self.mouse, back) {
            crate::sound::play("clique", 0.4);
            self.close_settings();
            return false;
        }
        for (i, (r, l, _)) in rows.iter().enumerate() {
            if inside(self.mouse, *r) {
                crate::sound::play("clique", 0.4);
                // metade esquerda da linha (ou a seta "<") diminui; o resto aumenta
                let dir = if self.mouse.0 < l[0] + l[2] + 110.0 * Self::ui_scale(h as u32) { -1 } else { 1 };
                return self.change_setting(i, dir);
            }
        }
        false
    }

    fn change_setting(&mut self, row: usize, dir: i32) -> bool {
        let s = &mut self.settings;
        match row {
            0 => {
                s.vsync = !s.vsync;
                return true;
            }
            1 => {
                s.volume = (s.volume + dir as f32 * 0.1).clamp(0.0, 1.0);
                crate::sound::set_volume(s.volume);
            }
            2 => {
                s.view_dist = (s.view_dist + dir * 16).clamp(32, 384);
                self.radius = (s.view_dist + 15) / 16;
            }
            3 => s.shadows = !s.shadows,
            4 => s.reflections = !s.reflections,
            5 => {
                s.ao = !s.ao;
                self.ao = s.ao;
            }
            6 => s.fov = (s.fov + dir as f32 * 5.0).clamp(50.0, 110.0),
            _ => {
                s.sens_level = (s.sens_level + dir).clamp(1, 20);
                s.sensitivity = s.sens_level as f64 * 0.00044;
            }
        }
        false
    }
}
