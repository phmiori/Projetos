//! Menu inicial (como o do Java): a lista dos mundos da pasta `worlds/` (o último jogado primeiro), criar um mundo
//! novo e sair. Ao fundo, o último mundo jogado gira devagar. Os mundos criados aqui abrem no Java do mesmo jeito.

use crate::save::{self, WorldInfo};
use crate::ui::{rgba, Color, Ui};
use crate::{Game, Screen};
use std::path::{Path, PathBuf};

const ROWS: usize = 6;

#[derive(Default)]
pub struct Menu {
    pub worlds: Vec<WorldInfo>,
    pub selected: usize,
    pub scroll: usize,
    /// campos da tela de criar mundo
    pub name: String,
    pub seed: String,
    pub char_name: String,
    pub creative: bool,
    /// campo com o cursor: 1 nome do mundo, 2 semente, 3 nome do personagem
    pub focus: u8,
    pub error: Option<String>,
}

/// O que o menu pediu para o jogo fazer.
pub enum Action {
    None,
    Open(PathBuf),
    Quit,
}

#[derive(Clone, Copy, PartialEq)]
enum Hit {
    Row(usize),
    Play,
    New,
    Quit,
    Field(u8),
    Mode,
    Confirm,
    Cancel,
}

/// Todos os mundos da pasta, do último jogado para o mais antigo (Saves.list do Java).
pub fn list_worlds() -> Vec<WorldInfo> {
    let mut v: Vec<WorldInfo> = std::fs::read_dir("worlds")
        .map(|d| d.flatten().filter_map(|e| save::read_world(&e.path())).collect())
        .unwrap_or_default();
    v.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    v
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// "há 5 min", "há 3 dias"...
fn ago(ms: i64) -> String {
    if ms <= 0 {
        return "nunca jogado".into();
    }
    let s = ((now_ms() - ms) / 1000).max(0);
    match s {
        0..=59 => "agora mesmo".into(),
        60..=3599 => format!("há {} min", s / 60),
        3600..=86399 => format!("há {} h", s / 3600),
        86400..=172799 => "ontem".into(),
        _ => format!("há {} dias", s / 86400),
    }
}

/// Pasta do mundo a partir do nome (Saves.newId do Java): minúsculas, só letras e números, sem repetir.
fn new_id(name: &str) -> String {
    let mut base = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            base.push(c);
        } else if !base.ends_with('-') {
            base.push('-');
        }
    }
    let mut base = base.trim_matches('-').to_string();
    if base.is_empty() {
        base = "mundo".into();
    }
    base.truncate(24);
    let mut id = base.clone();
    let mut n = 2;
    while Path::new("worlds").join(&id).exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    id
}

/// String.hashCode do Java (a semente escrita com letras vira número do mesmo jeito que no Java).
pub fn java_hash(s: &str) -> i32 {
    s.encode_utf16().fold(0i32, |h, c| h.wrapping_mul(31).wrapping_add(c as i32))
}

fn escape(v: &str) -> String {
    let mut o = String::new();
    for (i, c) in v.chars().enumerate() {
        match c {
            '\\' => o.push_str("\\\\"),
            ' ' if i == 0 => o.push_str("\\ "),
            '\n' => o.push_str("\\n"),
            c => o.push(c),
        }
    }
    o
}

/// Cria a pasta e o meta.properties do mundo novo, como o createWorld do Java (o ponto de nascimento é achado
/// quando o mundo abre). Retorna a pasta.
pub fn create_world(name: &str, seed_text: &str, creative: bool, char_name: &str) -> std::io::Result<PathBuf> {
    let name = if name.trim().is_empty() { "Mundo sem nome" } else { name.trim() };
    let seed_text = seed_text.trim();
    let seed: i32 = if seed_text.is_empty() {
        (now_ms() as i32) ^ (std::process::id() as i32).wrapping_mul(0x5DEECE6)
    } else {
        seed_text.parse().unwrap_or_else(|_| java_hash(seed_text))
    };
    let dir = Path::new("worlds").join(new_id(name));
    std::fs::create_dir_all(dir.join("chunks"))?;
    let now = now_ms();
    let char_name = if char_name.trim().is_empty() { "Explorador" } else { char_name.trim() };
    let text = format!(
        "#Mundo de Blocos\nnome={}\nsemente={seed}\ntamanhoBiomas={}\nmodo={}\ncriado={now}\nultimoJogo={now}\npersonagem.nome={}\nhora={}\ndiaDuracao={}\ndia=1\n",
        escape(name),
        2.0,
        if creative { "criativo" } else { "sobrevivencia" },
        escape(char_name),
        save::DAY_LENGTH * 0.3, // começa de manhã, como no Java
        save::DAY_LENGTH,
    );
    std::fs::write(dir.join("meta.properties"), text)?;
    Ok(dir)
}

fn inside(m: (f32, f32), r: [f32; 4]) -> bool {
    m.0 >= r[0] && m.0 < r[0] + r[2] && m.1 >= r[1] && m.1 < r[1] + r[3]
}

fn button(ui: &mut Ui, k: f32, r: [f32; 4], label: &str, hot: bool, primary: bool, enabled: bool) {
    let base: Color = if !enabled {
        rgba(50, 50, 56, 200)
    } else if hot {
        rgba(96, 150, 70, 255)
    } else if primary {
        rgba(70, 112, 52, 245)
    } else {
        rgba(64, 64, 72, 245)
    };
    ui.rect(r[0], r[1], r[2], r[3], base);
    ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, rgba(0, 0, 0, 180));
    let c = if enabled { rgba(255, 255, 255, 255) } else { rgba(150, 150, 150, 255) };
    ui.centered(16.0 * k, r[0] + r[2] / 2.0, r[1] + r[3] / 2.0 + 6.0 * k, label, c);
}

impl Game {
    /// Abre o menu (relendo a lista de mundos).
    pub fn open_menu(&mut self) {
        self.menu.worlds = list_worlds();
        self.menu.selected = 0;
        self.menu.scroll = 0;
        self.menu.error = None;
        self.screen = Screen::Menu;
        self.release_mouse = true;
    }

    pub fn start_create(&mut self) {
        let n = self.menu.worlds.len() + 1;
        self.menu.name = format!("Novo mundo {n}");
        self.menu.seed.clear();
        if self.menu.char_name.is_empty() {
            self.menu.char_name = "Explorador".into();
        }
        self.menu.creative = false;
        self.menu.focus = 1;
        self.menu.error = None;
        self.screen = Screen::Create;
    }

    fn menu_layout(&self, w: f32, h: f32) -> Vec<(Hit, [f32; 4])> {
        let k = Self::ui_scale(h as u32);
        let mut v = Vec::new();
        if self.screen == Screen::Menu {
            let (pw, row) = (640.0 * k, 58.0 * k);
            let (px, top) = ((w - pw) / 2.0, h * 0.5 - (ROWS as f32 * row) / 2.0 - 10.0 * k);
            for i in 0..ROWS.min(self.menu.worlds.len().saturating_sub(self.menu.scroll)) {
                v.push((Hit::Row(self.menu.scroll + i), [px + 12.0 * k, top + i as f32 * row, pw - 24.0 * k, row - 6.0 * k]));
            }
            let (bw, bh, gap) = (200.0 * k, 46.0 * k, 16.0 * k);
            let by = top + ROWS as f32 * row + 24.0 * k;
            let bx = (w - (bw * 3.0 + gap * 2.0)) / 2.0;
            v.push((Hit::Play, [bx, by, bw, bh]));
            v.push((Hit::New, [bx + bw + gap, by, bw, bh]));
            v.push((Hit::Quit, [bx + 2.0 * (bw + gap), by, bw, bh]));
        } else {
            let (pw, ph) = (620.0 * k, 430.0 * k);
            let (px, py) = ((w - pw) / 2.0, (h - ph) / 2.0);
            let (fx, fw, fh) = (px + 230.0 * k, pw - 262.0 * k, 38.0 * k);
            v.push((Hit::Field(1), [fx, py + 80.0 * k, fw, fh]));
            v.push((Hit::Field(2), [fx, py + 130.0 * k, fw, fh]));
            v.push((Hit::Mode, [fx, py + 180.0 * k, fw, fh]));
            v.push((Hit::Field(3), [fx, py + 270.0 * k, fw, fh]));
            let (bw, bh) = (230.0 * k, 46.0 * k);
            v.push((Hit::Confirm, [w / 2.0 - bw - 8.0 * k, py + ph - 66.0 * k, bw, bh]));
            v.push((Hit::Cancel, [w / 2.0 + 8.0 * k, py + ph - 66.0 * k, bw, bh]));
        }
        v
    }

    pub fn draw_main_menu(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        ui.rect(0.0, 0.0, w, h, rgba(0, 0, 0, 90));
        let layout = self.menu_layout(w, h);
        let m = self.mouse;
        let hot = |r: [f32; 4]| inside(m, r);
        if self.screen == Screen::Menu {
            ui.centered(44.0 * k, w / 2.0 + 3.0 * k, 92.0 * k + 3.0 * k, "Mundo de Blocos", rgba(0, 0, 0, 160));
            ui.centered(44.0 * k, w / 2.0, 92.0 * k, "Mundo de Blocos", rgba(245, 232, 205, 255));
            ui.centered(14.0 * k, w / 2.0, 120.0 * k, "versão Rust (prévia) · os mundos são os mesmos do Java", rgba(220, 225, 235, 230));
            let rows: Vec<[f32; 4]> = layout.iter().filter_map(|(h, r)| if let Hit::Row(_) = h { Some(*r) } else { None }).collect();
            let (pw, row) = (640.0 * k, 58.0 * k);
            let top = h * 0.5 - (ROWS as f32 * row) / 2.0 - 10.0 * k;
            ui.rect((w - pw) / 2.0, top - 12.0 * k, pw, ROWS as f32 * row + 18.0 * k, rgba(20, 22, 28, 200));
            ui.frame((w - pw) / 2.0, top - 12.0 * k, pw, ROWS as f32 * row + 18.0 * k, 2.0 * k, rgba(0, 0, 0, 160));
            if self.menu.worlds.is_empty() {
                ui.centered(16.0 * k, w / 2.0, top + ROWS as f32 * row / 2.0, "Nenhum mundo ainda: crie o primeiro!", rgba(220, 220, 225, 230));
            }
            for (i, r) in rows.iter().enumerate() {
                let idx = self.menu.scroll + i;
                let wi = &self.menu.worlds[idx];
                let sel = idx == self.menu.selected;
                ui.rect(r[0], r[1], r[2], r[3], if sel { rgba(70, 112, 52, 220) } else if hot(*r) { rgba(60, 64, 76, 220) } else { rgba(40, 42, 50, 200) });
                if sel {
                    ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, rgba(200, 235, 170, 220));
                }
                ui.text(17.0 * k, r[0] + 14.0 * k, r[1] + 22.0 * k, &wi.name, rgba(255, 255, 255, 255));
                let mode = if wi.creative { "Criativo" } else { "Sobrevivência" };
                let sub = format!("{mode} · semente {} · {}", wi.seed, ago(wi.last_played));
                ui.text(12.0 * k, r[0] + 14.0 * k, r[1] + 42.0 * k, &sub, rgba(205, 210, 220, 230));
            }
            if self.menu.worlds.len() > ROWS {
                let more = format!("{} mundos (rodinha do mouse para ver todos)", self.menu.worlds.len());
                ui.centered(12.0 * k, w / 2.0, top + ROWS as f32 * row + 14.0 * k, &more, rgba(200, 200, 210, 200));
            }
            let can_play = !self.menu.worlds.is_empty();
            for (hit, r) in &layout {
                match hit {
                    Hit::Play => button(ui, k, *r, "Jogar", hot(*r) && can_play, true, can_play),
                    Hit::New => button(ui, k, *r, "Criar novo mundo", hot(*r), false, true),
                    Hit::Quit => button(ui, k, *r, "Sair", hot(*r), false, true),
                    _ => {}
                }
            }
        } else {
            let (pw, ph) = (620.0 * k, 430.0 * k);
            let (px, py) = ((w - pw) / 2.0, (h - ph) / 2.0);
            ui.rect(px, py, pw, ph, rgba(20, 22, 28, 225));
            ui.frame(px, py, pw, ph, 2.0 * k, rgba(0, 0, 0, 180));
            ui.centered(26.0 * k, w / 2.0, py + 48.0 * k, "Criar novo mundo", rgba(245, 232, 205, 255));
            let caret = (self.start.elapsed().as_millis() / 500) % 2 == 0;
            let label = |ui: &mut Ui, r: [f32; 4], s: &str| ui.text(15.0 * k, px + 32.0 * k, r[1] + 25.0 * k, s, rgba(230, 230, 235, 255));
            for (hit, r) in &layout {
                match *hit {
                    Hit::Field(f) => {
                        let (lab, val, ph) = match f {
                            1 => ("Nome do mundo", &self.menu.name, "Meu mundo"),
                            2 => ("Semente (opcional)", &self.menu.seed, "aleatória"),
                            _ => ("Nome do personagem", &self.menu.char_name, "Explorador"),
                        };
                        label(ui, *r, lab);
                        let focused = self.menu.focus == f;
                        ui.rect(r[0], r[1], r[2], r[3], rgba(10, 10, 14, 230));
                        ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, if focused { rgba(200, 235, 170, 230) } else { rgba(90, 90, 100, 200) });
                        let (txt, col) = if val.is_empty() && !focused { (ph.to_string(), rgba(130, 130, 140, 255)) } else { (val.clone(), rgba(255, 255, 255, 255)) };
                        ui.text(16.0 * k, r[0] + 10.0 * k, r[1] + 25.0 * k, &txt, col);
                        if focused && caret {
                            let cx = r[0] + 10.0 * k + ui.text_width(16.0 * k, val) + 1.0;
                            ui.rect(cx, r[1] + 8.0 * k, 2.0 * k, r[3] - 16.0 * k, rgba(255, 255, 255, 255));
                        }
                    }
                    Hit::Mode => {
                        label(ui, *r, "Modo de jogo");
                        button(ui, k, *r, if self.menu.creative { "Criativo" } else { "Sobrevivência" }, hot(*r), false, true);
                        let hint = if self.menu.creative {
                            "Blocos infinitos, voo (dois toques no Espaço) e nenhum dano."
                        } else {
                            "Colete blocos para construir. Cuidado com quedas e com os monstros!"
                        };
                        ui.text(12.0 * k, px + 32.0 * k, r[1] + r[3] + 22.0 * k, hint, rgba(200, 230, 190, 255));
                    }
                    Hit::Confirm => button(ui, k, *r, "Criar mundo", hot(*r), true, true),
                    Hit::Cancel => button(ui, k, *r, "Cancelar", hot(*r), false, true),
                    _ => {}
                }
            }
            if let Some(e) = &self.menu.error {
                ui.centered(13.0 * k, w / 2.0, py + ph - 80.0 * k, e, rgba(255, 140, 120, 255));
            }
        }
    }

    /// Clique no menu ou na tela de criar mundo.
    pub fn menu_mouse(&mut self, w: f32, h: f32) -> Action {
        let Some((hit, _)) = self.menu_layout(w, h).into_iter().find(|(_, r)| inside(self.mouse, *r)) else { return Action::None };
        crate::sound::play("clique", 0.4);
        match hit {
            Hit::Row(i) => {
                if i == self.menu.selected {
                    return self.play_selected(); // clicar de novo no mesmo mundo: joga
                }
                self.menu.selected = i;
            }
            Hit::Play => return self.play_selected(),
            Hit::New => self.start_create(),
            Hit::Quit => return Action::Quit,
            Hit::Field(f) => self.menu.focus = f,
            Hit::Mode => self.menu.creative = !self.menu.creative,
            Hit::Confirm => return self.confirm_create(),
            Hit::Cancel => self.screen = Screen::Menu,
        }
        Action::None
    }

    fn play_selected(&self) -> Action {
        match self.menu.worlds.get(self.menu.selected) {
            Some(w) => Action::Open(w.dir.clone()),
            None => Action::None,
        }
    }

    fn confirm_create(&mut self) -> Action {
        match create_world(&self.menu.name, &self.menu.seed, self.menu.creative, &self.menu.char_name) {
            Ok(dir) => Action::Open(dir),
            Err(e) => {
                self.menu.error = Some(format!("Não deu para criar o mundo: {e}"));
                Action::None
            }
        }
    }

    pub fn menu_scroll(&mut self, up: bool) {
        if self.screen == Screen::Menu {
            let max = self.menu.worlds.len().saturating_sub(ROWS);
            self.menu.scroll = if up { self.menu.scroll.saturating_sub(1) } else { (self.menu.scroll + 1).min(max) };
        }
    }

    /// Teclado no menu: setas escolhem o mundo, Enter joga/cria, Tab troca de campo, Esc volta.
    pub fn menu_key(&mut self, code: winit::keyboard::KeyCode, text: Option<&str>) -> Action {
        use winit::keyboard::KeyCode as K;
        if self.screen == Screen::Menu {
            let n = self.menu.worlds.len();
            match code {
                K::ArrowDown if n > 0 => self.menu.selected = (self.menu.selected + 1).min(n - 1),
                K::ArrowUp => self.menu.selected = self.menu.selected.saturating_sub(1),
                K::Enter | K::NumpadEnter => return self.play_selected(),
                _ => {}
            }
            // mantém o escolhido à vista
            if self.menu.selected < self.menu.scroll {
                self.menu.scroll = self.menu.selected;
            } else if self.menu.selected >= self.menu.scroll + ROWS {
                self.menu.scroll = self.menu.selected + 1 - ROWS;
            }
            return Action::None;
        }
        match code {
            K::Escape => self.screen = Screen::Menu,
            K::Enter | K::NumpadEnter => return self.confirm_create(),
            K::Tab => self.menu.focus = self.menu.focus % 3 + 1,
            K::Backspace => {
                self.field().pop();
            }
            _ => {
                if let Some(t) = text {
                    let f = self.field();
                    for c in t.chars().filter(|c| !c.is_control()) {
                        if f.chars().count() < 32 {
                            f.push(c);
                        }
                    }
                }
            }
        }
        Action::None
    }

    fn field(&mut self) -> &mut String {
        match self.menu.focus {
            2 => &mut self.menu.seed,
            3 => &mut self.menu.char_name,
            _ => &mut self.menu.name,
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn semente_com_letras_igual_ao_java() {
        // "abc".hashCode() e "hello".hashCode() no Java
        assert_eq!(super::java_hash("abc"), 96354);
        assert_eq!(super::java_hash("hello"), 99162322);
    }
}
