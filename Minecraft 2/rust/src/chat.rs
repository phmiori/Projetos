//! Chat da LAN (como o do Java): T ou Enter abre a caixa, Enter envia, Esc cancela. As mensagens ficam no
//! canto de baixo à esquerda e somem depois de 10 s (com a caixa aberta, as últimas 12 continuam visíveis).

use crate::net::{Out, CHAT};
use crate::ui::{rgba, Color, Ui};
use crate::Game;
use std::time::Instant;
use winit::keyboard::KeyCode;

pub const WHITE: Color = [1.0, 1.0, 1.0, 1.0];
const MINE: Color = [1.0, 1.0, 0.63, 1.0];
const GRAY: Color = [0.75, 0.75, 0.75, 1.0];
const MAX_INPUT: usize = 100;

#[derive(Default)]
pub struct Chat {
    pub open: bool,
    pub input: String,
    pub lines: Vec<(String, Color, Instant)>,
}

impl Game {
    pub fn open_chat(&mut self) {
        self.chat.open = true;
        self.chat.input.clear();
        self.keys.clear();
        self.l_held = false;
        self.r_held = false;
    }

    pub fn add_chat(&mut self, text: String, color: Color) {
        self.chat.lines.push((text, color, Instant::now()));
        if self.chat.lines.len() > 50 {
            self.chat.lines.remove(0);
        }
        crate::sound::play("clique", 0.4);
    }

    /// Tecla com a caixa aberta (inclusive as repetidas, para o Backspace segurado).
    pub fn chat_key(&mut self, code: KeyCode, text: Option<&str>) {
        match code {
            KeyCode::Escape => {
                self.chat.open = false;
                self.chat.input.clear();
            }
            KeyCode::Enter | KeyCode::NumpadEnter => self.send_chat(),
            KeyCode::Backspace => {
                self.chat.input.pop();
            }
            _ => {
                if let Some(t) = text {
                    for c in t.chars().filter(|c| !c.is_control()) {
                        if self.chat.input.chars().count() < MAX_INPUT {
                            self.chat.input.push(c);
                        }
                    }
                }
            }
        }
    }

    /// Envia o que foi digitado: aparece aqui e vai para todos pela rede.
    fn send_chat(&mut self) {
        let text = self.chat.input.trim().to_string();
        self.chat.open = false;
        self.chat.input.clear();
        if text.is_empty() {
            return;
        }
        let me = if self.player_name.is_empty() { "Eu".to_string() } else { self.player_name.clone() };
        self.add_chat(format!("<{me}> {text}"), MINE);
        match &self.net {
            Some(n) => n.send(Out::new(CHAT).s(&me).s(&text), None),
            None => self.add_chat("(você está sozinho: abra o mundo para LAN no menu de pausa para conversar)".into(), GRAY),
        }
    }

    pub fn draw_chat(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        let px = 15.0 * k;
        let (bw, lh, x) = ((560.0 * k).min(w / 2.0 - 30.0 * k), 20.0 * k, 10.0 * k);
        let y = h - 150.0 * k; // acima da barra rápida e da vida
        if self.chat.open {
            ui.rect(x, y, bw, 24.0 * k, rgba(0, 0, 0, 170));
            // o começo some quando o texto não cabe
            let mut s: String = self.chat.input.clone();
            while !s.is_empty() && ui.text_width(px, &s) > bw - 24.0 * k {
                s.remove(0);
            }
            let caret = (self.start.elapsed().as_millis() / 500) % 2 == 0;
            ui.text(px, x + 6.0 * k, y + 17.0 * k, &format!("{s}{}", if caret { "_" } else { "" }), WHITE);
            if self.chat.input.is_empty() {
                ui.text(px, x + 6.0 * k, y + 17.0 * k, "   Enter envia   Esc cancela", [1.0, 1.0, 1.0, 0.43]);
            }
        }
        let mut by = y - 6.0 * k;
        let max = if self.chat.open { 12 } else { 8 };
        for (text, col, at) in self.chat.lines.iter().rev().take(max) {
            let age = at.elapsed().as_secs_f32();
            let alpha = if self.chat.open { 1.0 } else if age < 8.0 { 1.0 } else if age < 10.0 { (10.0 - age) / 2.0 } else { 0.0 };
            if alpha <= 0.0 {
                break;
            }
            let mut t = text.clone();
            while t.chars().count() > 1 && ui.text_width(px, &t) > bw - 12.0 * k {
                t.pop();
            }
            ui.rect(x, by - lh, bw, lh, [0.0, 0.0, 0.0, 0.43 * alpha]);
            ui.shadow(px, x + 6.0 * k, by - 5.0 * k, &t, [col[0], col[1], col[2], alpha]);
            by -= lh;
        }
    }
}
