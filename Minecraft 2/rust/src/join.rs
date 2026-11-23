//! Tela "Jogar em LAN" (como a do Java): o IP do anfitrião e o seu nome. Conecta numa thread (sem travar a
//! janela) e, quando o anfitrião responde, o jogo entra no mundo dele. Lembra o último IP e nome no mesmo
//! settings.properties do Java (lanIp, lanNome, lanPersonagem).

use crate::net::{Net, Welcome};
use crate::ui::{rgba, Ui};
use crate::{Game, Screen};
use std::sync::mpsc::Receiver;

#[derive(Default)]
pub struct Join {
    pub ip: String,
    pub name: String,
    /// 1 IP, 2 nome
    pub focus: u8,
    pub persona: [usize; 4],
    pub connecting: Option<Receiver<Result<(Net, Welcome), String>>>,
    pub error: Option<String>,
}

fn inside(m: (f32, f32), r: [f32; 4]) -> bool {
    m.0 >= r[0] && m.0 < r[0] + r[2] && m.1 >= r[1] && m.1 < r[1] + r[3]
}

#[derive(Clone, Copy, PartialEq)]
enum Hit {
    Field(u8),
    Go,
    Cancel,
}

impl Game {
    pub fn start_join(&mut self) {
        let p = crate::save::read_properties(std::path::Path::new("settings.properties")).unwrap_or_default();
        self.join.ip = p.get("lanIp").cloned().unwrap_or_default();
        self.join.name = p.get("lanNome").cloned().filter(|s| !s.is_empty()).unwrap_or_else(|| if self.player_name.is_empty() { "Amigo".into() } else { self.player_name.clone() });
        let v: Vec<i32> = p.get("lanPersonagem").map(|s| s.split(',').filter_map(|n| n.trim().parse().ok()).collect()).unwrap_or_default();
        self.join.persona = if v.len() == 4 {
            crate::net::persona_from([v[0], v[1], v[2], v[3]])
        } else {
            let mut r = |n: f64| (self.rng.next() * n) as i32;
            crate::net::persona_from([r(6.0), r(8.0), r(9.0), r(7.0)])
        };
        self.join.focus = 1;
        self.join.error = None;
        self.join.connecting = None;
        self.screen = Screen::Join;
    }

    fn join_layout(&self, w: f32, h: f32) -> ([f32; 4], Vec<(Hit, [f32; 4])>) {
        let k = Self::ui_scale(h as u32);
        let (pw, ph) = (600.0 * k, 360.0 * k);
        let (px, py) = ((w - pw) / 2.0, (h - ph) / 2.0);
        let (fx, fw, fh) = (px + 200.0 * k, pw - 232.0 * k, 38.0 * k);
        let (bw, bh) = (220.0 * k, 46.0 * k);
        let v = vec![
            (Hit::Field(1), [fx, py + 84.0 * k, fw, fh]),
            (Hit::Field(2), [fx, py + 136.0 * k, fw, fh]),
            (Hit::Go, [w / 2.0 - bw - 8.0 * k, py + ph - 66.0 * k, bw, bh]),
            (Hit::Cancel, [w / 2.0 + 8.0 * k, py + ph - 66.0 * k, bw, bh]),
        ];
        ([px, py, pw, ph], v)
    }

    pub fn draw_join(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        ui.rect(0.0, 0.0, w, h, rgba(0, 0, 0, 90));
        let (p, layout) = self.join_layout(w, h);
        ui.rect(p[0], p[1], p[2], p[3], rgba(20, 22, 28, 225));
        ui.frame(p[0], p[1], p[2], p[3], 2.0 * k, rgba(0, 0, 0, 180));
        ui.centered(26.0 * k, w / 2.0, p[1] + 48.0 * k, "Jogar em LAN", rgba(245, 232, 205, 255));
        let caret = (self.start.elapsed().as_millis() / 500) % 2 == 0;
        let busy = self.join.connecting.is_some();
        for (hit, r) in &layout {
            match *hit {
                Hit::Field(f) => {
                    let (lab, val, ph) = if f == 1 { ("IP do anfitrião", &self.join.ip, "ex.: 26.12.34.56") } else { ("Seu nome", &self.join.name, "Amigo") };
                    ui.text(15.0 * k, p[0] + 32.0 * k, r[1] + 25.0 * k, lab, rgba(230, 230, 235, 255));
                    let focused = self.join.focus == f;
                    ui.rect(r[0], r[1], r[2], r[3], rgba(10, 10, 14, 230));
                    ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, if focused { rgba(200, 235, 170, 230) } else { rgba(90, 90, 100, 200) });
                    let (txt, col) = if val.is_empty() && !focused { (ph.to_string(), rgba(130, 130, 140, 255)) } else { (val.clone(), rgba(255, 255, 255, 255)) };
                    ui.text(16.0 * k, r[0] + 10.0 * k, r[1] + 25.0 * k, &txt, col);
                    if focused && caret && !busy {
                        let cx = r[0] + 10.0 * k + ui.text_width(16.0 * k, val) + 1.0;
                        ui.rect(cx, r[1] + 8.0 * k, 2.0 * k, r[3] - 16.0 * k, rgba(255, 255, 255, 255));
                    }
                }
                Hit::Go | Hit::Cancel => {
                    let hot = inside(self.mouse, *r);
                    let label = if *hit == Hit::Go { if busy { "Conectando..." } else { "Entrar" } } else { "Cancelar" };
                    let base = if hot { rgba(96, 150, 70, 255) } else if *hit == Hit::Go { rgba(70, 112, 52, 245) } else { rgba(64, 64, 72, 245) };
                    ui.rect(r[0], r[1], r[2], r[3], base);
                    ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, rgba(0, 0, 0, 180));
                    ui.centered(16.0 * k, r[0] + r[2] / 2.0, r[1] + r[3] / 2.0 + 6.0 * k, label, rgba(255, 255, 255, 255));
                }
            }
        }
        let note = "O amigo abre o mundo dele em Pausa > Abrir para LAN (no Java ou no Rust). Porta 25600.";
        ui.centered(12.0 * k, w / 2.0, p[1] + 206.0 * k, note, rgba(200, 200, 210, 220));
        if let Some(e) = &self.join.error {
            let e: String = e.chars().take(110).collect();
            ui.centered(13.0 * k, w / 2.0, p[1] + 236.0 * k, &e, rgba(255, 140, 120, 255));
        }
    }

    pub fn join_mouse(&mut self, w: f32, h: f32) {
        let (_, layout) = self.join_layout(w, h);
        let Some((hit, _)) = layout.into_iter().find(|(_, r)| inside(self.mouse, *r)) else { return };
        crate::sound::play("clique", 0.4);
        match hit {
            Hit::Field(f) => self.join.focus = f,
            Hit::Go => self.begin_connect(),
            Hit::Cancel => {
                self.join.connecting = None;
                self.screen = Screen::Menu;
            }
        }
    }

    pub fn join_key(&mut self, code: winit::keyboard::KeyCode, text: Option<&str>) {
        use winit::keyboard::KeyCode as K;
        match code {
            K::Escape => {
                self.join.connecting = None;
                self.screen = Screen::Menu;
            }
            K::Enter | K::NumpadEnter => self.begin_connect(),
            K::Tab => self.join.focus = self.join.focus % 2 + 1,
            K::Backspace => {
                if self.join.focus == 1 { self.join.ip.pop() } else { self.join.name.pop() };
            }
            _ => {
                if let Some(t) = text {
                    let f = if self.join.focus == 1 { &mut self.join.ip } else { &mut self.join.name };
                    for c in t.chars().filter(|c| !c.is_control()) {
                        if f.chars().count() < 40 {
                            f.push(c);
                        }
                    }
                }
            }
        }
    }

    fn begin_connect(&mut self) {
        if self.join.connecting.is_some() {
            return;
        }
        let ip = self.join.ip.trim().to_string();
        if ip.is_empty() {
            self.join.error = Some("Digite o IP do anfitrião".into());
            return;
        }
        let name = if self.join.name.trim().is_empty() { "Amigo".to_string() } else { self.join.name.trim().to_string() };
        let p = self.join.persona;
        crate::options::write_settings(&[("lanIp", ip.clone()), ("lanNome", name.clone()), ("lanPersonagem", format!("{},{},{},{}", p[0], p[1], p[2], p[3]))]);
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(crate::net::connect(&ip, &name, p));
        });
        self.join.error = None;
        self.join.connecting = Some(rx);
    }

    /// Chegou a resposta do anfitrião? (o jogo troca de mundo quando chega)
    pub fn poll_join(&mut self) -> Option<(Net, Welcome, String, [usize; 4])> {
        let rx = self.join.connecting.as_ref()?;
        match rx.try_recv() {
            Ok(Ok((n, w))) => {
                self.join.connecting = None;
                let name = if self.join.name.trim().is_empty() { "Amigo".to_string() } else { self.join.name.trim().to_string() };
                Some((n, w, name, self.join.persona))
            }
            Ok(Err(e)) => {
                self.join.connecting = None;
                self.join.error = Some(e);
                None
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => None,
            Err(_) => {
                self.join.connecting = None;
                None
            }
        }
    }
}
