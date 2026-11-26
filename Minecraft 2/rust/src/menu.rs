//! Menu inicial (como o do Java): a lista dos mundos da pasta `worlds/` (o último jogado primeiro), criar um mundo
//! novo e sair. Ao fundo, o último mundo jogado gira devagar. Os mundos criados aqui abrem no Java do mesmo jeito.

use crate::save::{self, WorldInfo};
use crate::ui::{rgba, Color, Ui, ART_H, ART_W, THUMB_H, THUMB_SLOTS, THUMB_W};
use crate::{Game, Screen};
use std::path::{Path, PathBuf};

const ROWS: usize = 3;

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
    /// "Excluir mundo" foi clicado uma vez: o próximo clique apaga (como no Java)
    pub confirm_delete: bool,
    /// aviso embaixo do título (ex.: mundo apagado)
    pub message: Option<(String, std::time::Instant)>,
    /// lista em ordem de nome (senão, os mais recentes primeiro)
    pub by_name: bool,
    /// camada da miniatura de cada mundo da lista
    pub thumbs: Vec<usize>,
    /// miniaturas lidas do disco, esperando ir para a placa de vídeo
    pub pending_thumbs: Vec<(usize, Vec<u8>)>,
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
    RowPlay(usize),
    Sort,
    Side(u8),
    Play,
    New,
    Lan,
    Options,
    Delete,
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
        "#Mundo de Blocos\nnome={}\nsemente={seed}\ntamanhoBiomas={}\nmodo={}\ncriado={now}\nultimoJogo={now}\npersonagem.nome={}\nhora={}\ndiaDuracao={}\ndia=1\nalturaExtra={}\ngeracao=2\n",
        escape(name),
        2.0,
        if creative { "criativo" } else { "sobrevivencia" },
        escape(char_name),
        save::DAY_LENGTH * 0.3, // começa de manhã, como no Java
        save::DAY_LENGTH,
        crate::world::DEEP, // cavernas fundas (o jogo Java não abre estes mundos)
    );
    std::fs::write(dir.join("meta.properties"), text)?;
    Ok(dir)
}

fn inside(m: (f32, f32), r: [f32; 4]) -> bool {
    m.0 >= r[0] && m.0 < r[0] + r[2] && m.1 >= r[1] && m.1 < r[1] + r[3]
}

fn button(ui: &mut Ui, k: f32, r: [f32; 4], label: &str, hot: bool, primary: bool, enabled: bool) {
    let (top, bottom) = if !enabled {
        (rgba(44, 42, 56, 230), rgba(44, 42, 56, 230))
    } else if primary {
        if hot { (rgba(170, 80, 255, 255), rgba(120, 44, 240, 255)) } else { (rgba(153, 55, 250, 255), rgba(105, 29, 226, 255)) }
    } else if hot {
        (rgba(44, 43, 66, 250), rgba(44, 43, 66, 250))
    } else {
        (rgba(31, 31, 47, 250), rgba(31, 31, 47, 250))
    };
    ui.round_rect(r[0], r[1], r[2], r[3], 10.0 * k, top, bottom);
    ui.round_frame(r[0], r[1], r[2], r[3], 10.0 * k, 1.3 * k, if primary { rgba(200, 140, 255, 230) } else if hot { rgba(130, 100, 220, 230) } else { rgba(58, 56, 80, 220) });
    let c = if enabled { rgba(255, 255, 255, 255) } else { rgba(150, 150, 150, 255) };
    ui.centered(16.0 * k, r[0] + r[2] / 2.0, r[1] + r[3] / 2.0 + 6.0 * k, label, c);
}

impl Game {
    /// Abre o menu (relendo a lista de mundos).
    pub fn open_menu(&mut self) {
        self.menu.worlds = list_worlds();
        self.sort_worlds();
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
            return self.home_layout(w, h);
        }
        {
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
        if self.screen == Screen::Menu {
            return self.draw_home(ui, w, h);
        }
        let k = Self::ui_scale(h as u32);
        // a tela inicial de verdade (com os seus mundos) por trás, escurecida
        let mouse = self.mouse;
        self.mouse = (-1.0, -1.0);
        self.draw_home(ui, w, h);
        self.mouse = mouse;
        ui.rect(0.0, 0.0, w, h, rgba(4, 4, 12, 150));
        let layout = self.menu_layout(w, h);
        let m = self.mouse;
        let hot = |r: [f32; 4]| inside(m, r);
        {
            let (pw, ph) = (620.0 * k, 430.0 * k);
            let (px, py) = ((w - pw) / 2.0, (h - ph) / 2.0);
            ui.round_rect(px, py, pw, ph, 16.0 * k, rgba(23, 23, 41, 248), rgba(20, 20, 33, 248));
            ui.round_frame(px, py, pw, ph, 16.0 * k, 1.5 * k, rgba(124, 70, 240, 230));
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
                        ui.round_rect(r[0], r[1], r[2], r[3], 8.0 * k, rgba(12, 12, 22, 240), rgba(12, 12, 22, 240));
                        ui.round_frame(r[0], r[1], r[2], r[3], 8.0 * k, 1.6 * k, if focused { rgba(170, 120, 255, 255) } else { rgba(70, 66, 96, 220) });
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
                        ui.text(12.0 * k, px + 32.0 * k, r[1] + r[3] + 22.0 * k, hint, rgba(190, 170, 240, 255));
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
        if hit != Hit::Delete {
            self.menu.confirm_delete = false;
        }
        match hit {
            Hit::Delete => self.delete_selected(),
            Hit::Row(i) => {
                if i == self.menu.selected {
                    return self.play_selected(); // clicar de novo no mesmo mundo: joga
                }
                self.menu.selected = i;
            }
            Hit::Play => return self.play_selected(),
            Hit::RowPlay(i) => {
                self.menu.selected = i;
                return self.play_selected();
            }
            Hit::Sort => {
                let name = self.menu.worlds.get(self.menu.selected).map(|w| w.dir.clone());
                self.menu.by_name = !self.menu.by_name;
                self.sort_worlds();
                self.menu.selected = name.and_then(|d| self.menu.worlds.iter().position(|w| w.dir == d)).unwrap_or(0);
                self.menu.scroll = self.menu.selected.saturating_sub(ROWS - 1);
            }
            Hit::Side(1) => self.open_settings(),
            Hit::Side(2) => open_folder("textures"),
            Hit::Side(_) => self.menu.message = Some(("Mundo de Blocos v1.0.0  ·  F2 tira foto  ·  F6 troca o clima no criativo".into(), std::time::Instant::now())),
            Hit::New => self.start_create(),
            Hit::Lan => self.start_join(),
            Hit::Options => self.open_settings(),
            Hit::Quit => return Action::Quit,
            Hit::Field(f) => self.menu.focus = f,
            Hit::Mode => self.menu.creative = !self.menu.creative,
            Hit::Confirm => return self.confirm_create(),
            Hit::Cancel => self.screen = Screen::Menu,
        }
        Action::None
    }

    /// Excluir mundo: o primeiro clique pede confirmação, o segundo apaga a pasta do mundo (Saves.delete do Java).
    pub fn delete_selected(&mut self) {
        let Some(wi) = self.menu.worlds.get(self.menu.selected) else { return };
        if !self.menu.confirm_delete {
            self.menu.confirm_delete = true;
            return;
        }
        self.menu.confirm_delete = false;
        let (dir, name) = (wi.dir.clone(), wi.name.clone());
        // só apaga o que está mesmo dentro da pasta worlds
        let inside_worlds = dir.canonicalize().ok().zip(std::path::Path::new("worlds").canonicalize().ok()).map_or(false, |(d, w)| d.starts_with(&w) && d != w);
        let msg = if inside_worlds && std::fs::remove_dir_all(&dir).is_ok() { format!("Mundo \"{name}\" apagado") } else { format!("Não consegui apagar \"{name}\"") };
        self.menu.message = Some((msg, std::time::Instant::now()));
        self.menu.worlds = list_worlds();
        self.sort_worlds();
        self.menu.selected = self.menu.selected.min(self.menu.worlds.len().saturating_sub(1));
        self.menu.scroll = self.menu.scroll.min(self.menu.selected);
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

// ---------------------------------------------------------------------- tela inicial (arte de fundo)

/// Onde a arte (ART_W x ART_H) fica na janela: escala e deslocamento, cobrindo a janela inteira.
fn art_map(w: f32, h: f32) -> (f32, f32, f32) {
    let s = (w / ART_W).max(h / ART_H);
    (s, (w - ART_W * s) / 2.0, (h - ART_H * s) / 2.0)
}

/// Retângulo (x, y, largura, altura) na janela a partir das coordenadas da arte.
fn art_rect(m: (f32, f32, f32), x0: f32, y0: f32, x1: f32, y1: f32) -> [f32; 4] {
    [m.1 + x0 * m.0, m.2 + y0 * m.0, (x1 - x0) * m.0, (y1 - y0) * m.0]
}

/// Primeira linha da lista na arte e a distância entre as linhas.
const ROW_TOP: f32 = 348.0;
const ROW_STEP: f32 = 97.5;
const MONTHS: [&str; 12] = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/// "setembro 2024" a partir de milissegundos desde 1970.
fn month_year(ms: i64) -> String {
    if ms <= 0 {
        return "data desconhecida".into();
    }
    // dias desde 1970 até ano/mês (algoritmo civil de Howard Hinnant)
    let z = ms.div_euclid(86_400_000) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + (month <= 2) as i64;
    format!("{} {year}", MONTHS[(month - 1) as usize])
}

fn rgbf(r: u8, g: u8, b: u8) -> Color {
    rgba(r, g, b, 255)
}

/// Texto com o meio da altura das letras em `cy`.
fn text_mid(ui: &mut Ui, px: f32, x: f32, cy: f32, s: &str, c: Color) {
    ui.text(px, x, cy + px * 0.36, s, c);
}

fn text_mid_centered(ui: &mut Ui, px: f32, cx: f32, cy: f32, s: &str, c: Color) {
    let w = ui.text_width(px, s);
    ui.text(px, cx - w / 2.0, cy + px * 0.36, s, c);
}

/// Linha grossa entre dois pontos (para os ícones).
fn line(ui: &mut Ui, a: [f32; 2], b: [f32; 2], t: f32, c: Color) {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let l = (dx * dx + dy * dy).sqrt().max(0.001);
    let (nx, ny) = (-dy / l * t / 2.0, dx / l * t / 2.0);
    ui.tri([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], c);
    ui.tri([a[0] + nx, a[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], c);
}

#[derive(Clone, Copy)]
enum Icon {
    Plus,
    Lan,
    Gear,
    Trash,
    Exit,
}

/// Ícones dos botões de baixo, desenhados com formas simples (tamanho `s` em pixels).
fn icon(ui: &mut Ui, kind: Icon, cx: f32, cy: f32, s: f32, c: Color, bg: Color) {
    let t = s * 0.14;
    match kind {
        Icon::Plus => {
            ui.rect(cx - t / 2.0, cy - s / 2.0, t, s, c);
            ui.rect(cx - s / 2.0, cy - t / 2.0, s, t, c);
        }
        Icon::Lan => {
            let (top, l, r) = ([cx, cy - s * 0.36], [cx - s * 0.36, cy + s * 0.34], [cx + s * 0.36, cy + s * 0.34]);
            let mid = [cx, cy + s * 0.02];
            for p in [l, r] {
                line(ui, mid, p, t * 0.8, c);
            }
            line(ui, top, mid, t * 0.8, c);
            for p in [top, l, r] {
                ui.disc(p[0], p[1], s * 0.15, c);
            }
        }
        Icon::Gear => {
            for i in 0..8 {
                let a = i as f32 * std::f32::consts::PI / 4.0;
                let (ca, sa) = (a.cos(), a.sin());
                line(ui, [cx + ca * s * 0.2, cy + sa * s * 0.2], [cx + ca * s * 0.5, cy + sa * s * 0.5], s * 0.2, c);
            }
            ui.disc(cx, cy, s * 0.36, c);
            ui.disc(cx, cy, s * 0.15, bg);
        }
        Icon::Trash => {
            ui.rect(cx - s * 0.42, cy - s * 0.36, s * 0.84, t, c);
            ui.rect(cx - s * 0.14, cy - s * 0.5, s * 0.28, t, c);
            ui.round_rect(cx - s * 0.32, cy - s * 0.2, s * 0.64, s * 0.7, s * 0.08, c, c);
            for dx in [-0.13f32, 0.0, 0.13] {
                ui.rect(cx + dx * s - t * 0.3, cy - s * 0.08, t * 0.6, s * 0.46, bg);
            }
        }
        Icon::Exit => {
            // porta (aberta à direita) e a seta saindo
            ui.rect(cx - s * 0.44, cy - s * 0.46, t, s * 0.92, c);
            ui.rect(cx - s * 0.44, cy - s * 0.46, s * 0.5, t, c);
            ui.rect(cx - s * 0.44, cy + s * 0.46 - t, s * 0.5, t, c);
            ui.rect(cx + s * 0.06 - t, cy - s * 0.46, t, s * 0.22, c);
            ui.rect(cx + s * 0.06 - t, cy + s * 0.24, t, s * 0.22, c);
            ui.rect(cx - s * 0.16, cy - t / 2.0, s * 0.5, t, c);
            ui.tri([cx + s * 0.28, cy - s * 0.24], [cx + s * 0.52, cy], [cx + s * 0.28, cy + s * 0.24], c);
        }
    }
}

impl Game {
    /// Lista da tela inicial na ordem escolhida (mais recentes ou nome) e as miniaturas.
    fn sort_worlds(&mut self) {
        if self.menu.by_name {
            self.menu.worlds.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        } else {
            self.menu.worlds.sort_by(|a, b| b.last_played.cmp(&a.last_played));
        }
        self.load_thumbs();
    }

    /// Lê a miniatura (worlds/<mundo>/miniatura.png) de cada mundo; quem não tem usa uma das de exemplo.
    pub fn load_thumbs(&mut self) {
        self.menu.thumbs.clear();
        for (i, w) in self.menu.worlds.iter().enumerate() {
            let slot = THUMB_SLOTS.min(3 + i);
            let img = if slot < THUMB_SLOTS { image::open(w.dir.join("miniatura.png")).ok() } else { None };
            match img {
                Some(img) => {
                    let img = image::imageops::resize(&img.to_rgba8(), THUMB_W, THUMB_H, image::imageops::FilterType::Triangle);
                    self.menu.pending_thumbs.push((slot, img.into_raw()));
                    self.menu.thumbs.push(slot);
                }
                None => self.menu.thumbs.push(i % 3),
            }
        }
    }

    fn home_layout(&self, w: f32, h: f32) -> Vec<(Hit, [f32; 4])> {
        let m = art_map(w, h);
        let mut v = Vec::new();
        for i in 0..ROWS.min(self.menu.worlds.len().saturating_sub(self.menu.scroll)) {
            let y = ROW_TOP + i as f32 * ROW_STEP;
            let idx = self.menu.scroll + i;
            // o botão de jogar da linha vem antes, para ganhar do clique na linha
            v.push((Hit::RowPlay(idx), art_rect(m, 1024.0, y + 20.0, 1082.0, y + 70.0)));
            v.push((Hit::Row(idx), art_rect(m, 266.0, y, 1100.0, y + 88.0)));
        }
        v.push((Hit::Sort, art_rect(m, 817.0, 291.0, 1097.0, 329.0)));
        for (hit, x0, x1) in [(Hit::Play, 257.0, 611.0), (Hit::New, 628.0, 799.0), (Hit::Lan, 817.0, 988.0), (Hit::Options, 1006.0, 1188.0), (Hit::Delete, 1205.0, 1371.0), (Hit::Quit, 1389.0, 1548.0)] {
            v.push((hit, art_rect(m, x0, 700.0, x1, 805.0)));
        }
        for (i, (y0, y1)) in [(360.0, 432.0), (433.0, 507.0), (507.0, 580.0)].into_iter().enumerate() {
            v.push((Hit::Side(i as u8 + 1), art_rect(m, 18.0, y0, 200.0, y1)));
        }
        v
    }

    /// A arte de fundo cobrindo a janela.
    pub fn draw_art(&self, ui: &mut Ui, w: f32, h: f32) {
        let m = art_map(w, h);
        ui.art(m.1, m.2, ART_W * m.0, ART_H * m.0, [0.0, 0.0, 1.0, 1.0], 1.0);
    }

    fn draw_home(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let m = art_map(w, h);
        let s = m.0;
        let r = |x0: f32, y0: f32, x1: f32, y1: f32| art_rect(m, x0, y0, x1, y1);
        let mouse = self.mouse;
        let hot = |q: [f32; 4]| inside(mouse, q);
        self.draw_art(ui, w, h);
        let layout = self.home_layout(w, h);

        // menu lateral (a arte já desenha; aqui o realce do mouse)
        for (hit, q) in &layout {
            if let Hit::Side(_) = hit {
                if hot(*q) {
                    ui.round_rect(q[0] + 4.0 * s, q[1] + 4.0 * s, q[2] - 8.0 * s, q[3] - 8.0 * s, 12.0 * s, rgba(255, 255, 255, 22), rgba(255, 255, 255, 22));
                }
            }
        }

        // painel "Meus Mundos"
        let p = r(246.0, 269.0, 1118.0, 649.0);
        ui.round_rect(p[0], p[1], p[2], p[3], 16.0 * s, rgbf(23, 23, 41), rgbf(20, 20, 33));
        ui.round_frame(p[0], p[1], p[2], p[3], 16.0 * s, 1.5 * s, rgba(64, 62, 92, 220));
        let f = r(275.0, 297.0, 313.0, 326.0);
        ui.round_rect(f[0], f[1], f[2] * 0.45, f[3] * 0.4, 3.0 * s, rgbf(110, 40, 230), rgbf(110, 40, 230));
        ui.round_rect(f[0], f[1] + f[3] * 0.18, f[2], f[3] * 0.82, 4.0 * s, rgbf(150, 82, 255), rgbf(112, 38, 236));
        text_mid(ui, 22.0 * s, 333.0 * s + m.1, 311.0 * s + m.2, "Meus Mundos", rgbf(232, 230, 245));
        let q = r(817.0, 291.0, 1097.0, 329.0);
        let sort_hot = hot(q);
        ui.round_rect(q[0], q[1], q[2], q[3], 10.0 * s, if sort_hot { rgbf(36, 32, 54) } else { rgbf(25, 21, 37) }, if sort_hot { rgbf(36, 32, 54) } else { rgbf(25, 21, 37) });
        ui.round_frame(q[0], q[1], q[2], q[3], 10.0 * s, 1.2 * s, rgba(60, 56, 84, 220));
        let (ax, ay) = (m.1 + 834.0 * s, m.2 + 310.0 * s);
        let light = rgbf(220, 218, 235);
        ui.rect(ax - 1.2 * s, ay - 6.0 * s, 2.4 * s, 13.0 * s, light);
        ui.tri([ax - 5.0 * s, ay - 5.0 * s], [ax, ay - 11.0 * s], [ax + 5.0 * s, ay - 5.0 * s], light);
        ui.rect(ax + 9.0 * s, ay - 7.0 * s, 2.4 * s, 13.0 * s, light);
        ui.tri([ax + 5.2 * s, ay + 5.0 * s], [ax + 10.2 * s, ay + 11.0 * s], [ax + 15.2 * s, ay + 5.0 * s], light);
        let lab = "Ordenar por: ";
        let lw = ui.text_width(14.0 * s, lab);
        text_mid(ui, 14.0 * s, m.1 + 866.0 * s, ay, lab, rgbf(205, 203, 220));
        text_mid(ui, 14.0 * s, m.1 + 866.0 * s + lw, ay, if self.menu.by_name { "Nome" } else { "Mais recentes" }, rgbf(178, 140, 255));
        ui.tri([m.1 + 1071.0 * s, ay - 3.0 * s], [m.1 + 1081.0 * s, ay - 3.0 * s], [m.1 + 1076.0 * s, ay + 3.0 * s], rgbf(178, 140, 255));

        if self.menu.worlds.is_empty() {
            text_mid_centered(ui, 17.0 * s, m.1 + 682.0 * s, m.2 + 480.0 * s, "Nenhum mundo ainda: crie o primeiro!", rgbf(210, 208, 225));
        }
        for i in 0..ROWS.min(self.menu.worlds.len().saturating_sub(self.menu.scroll)) {
            let idx = self.menu.scroll + i;
            let y = ROW_TOP + i as f32 * ROW_STEP;
            let q = r(266.0, y, 1100.0, y + 88.0);
            let sel = idx == self.menu.selected;
            let rad = 12.0 * s;
            if sel {
                for g in 1..=4 {
                    let e = g as f32 * 2.0 * s;
                    ui.round_rect(q[0] - e, q[1] - e, q[2] + 2.0 * e, q[3] + 2.0 * e, rad + e, rgba(140, 70, 255, 12), rgba(140, 70, 255, 12));
                }
                ui.round_rect(q[0], q[1], q[2], q[3], rad, rgbf(62, 28, 132), rgbf(48, 22, 106));
                ui.round_frame(q[0], q[1], q[2], q[3], rad, 2.2 * s, rgbf(160, 92, 255));
            } else {
                let c = if hot(q) { rgbf(38, 38, 60) } else { rgbf(29, 29, 46) };
                ui.round_rect(q[0], q[1], q[2], q[3], rad, c, c);
                ui.round_frame(q[0], q[1], q[2], q[3], rad, 1.0 * s, rgba(56, 56, 82, 200));
            }
            let t = r(274.0, y + 8.0, 434.0, y + 80.0);
            let slot = self.menu.thumbs.get(idx).copied().unwrap_or(idx % 3);
            ui.thumb(slot, t[0], t[1], t[2], t[3], 7.0 * s);
            let wi = &self.menu.worlds[idx];
            text_mid(ui, 21.0 * s, m.1 + 453.0 * s, m.2 + (y + 30.0) * s, &wi.name, rgbf(250, 248, 255));
            let mode = if wi.creative { "Criativo" } else { "Sobrevivência" };
            let when = if wi.created > 0 { month_year(wi.created) } else { format!("semente {}", wi.seed) };
            let sub = format!("{mode}  ·  {when}  ·  {}", ago(wi.last_played));
            text_mid(ui, 15.0 * s, m.1 + 453.0 * s, m.2 + (y + 61.0) * s, &sub, if sel { rgbf(176, 150, 230) } else { rgbf(150, 140, 190) });
            let b = r(1024.0, y + 20.0, 1082.0, y + 70.0);
            let bhot = hot(b);
            if sel || bhot {
                ui.round_rect(b[0], b[1], b[2], b[3], 9.0 * s, if bhot { rgbf(86, 40, 180) } else { rgbf(44, 19, 100) }, if bhot { rgbf(70, 30, 156) } else { rgbf(40, 16, 92) });
                ui.round_frame(b[0], b[1], b[2], b[3], 9.0 * s, 1.2 * s, rgba(150, 100, 255, 200));
            }
            let (cx, cy) = (b[0] + b[2] / 2.0 + 2.0 * s, b[1] + b[3] / 2.0);
            let tc = if sel || bhot { rgbf(252, 252, 255) } else { rgbf(202, 198, 236) };
            ui.tri([cx - 8.0 * s, cy - 11.0 * s], [cx + 11.0 * s, cy], [cx - 8.0 * s, cy + 11.0 * s], tc);
        }
        // barra de rolagem quando há mais mundos que linhas
        let n = self.menu.worlds.len();
        if n > ROWS {
            let track = r(1106.0, ROW_TOP, 1110.0, ROW_TOP + ROW_STEP * ROWS as f32 - 10.0);
            ui.round_rect(track[0], track[1], track[2], track[3], 2.0 * s, rgba(255, 255, 255, 18), rgba(255, 255, 255, 18));
            let part = ROWS as f32 / n as f32;
            let at = self.menu.scroll as f32 / (n - ROWS) as f32 * (1.0 - part);
            ui.round_rect(track[0], track[1] + track[3] * at, track[2], track[3] * part, 2.0 * s, rgba(170, 120, 255, 200), rgba(170, 120, 255, 200));
        }

        // aviso entre a lista e os botões
        let msg = if self.menu.confirm_delete {
            self.menu.worlds.get(self.menu.selected).map(|wi| (format!("Apagar \"{}\" para sempre? Clique de novo em Excluir para confirmar.", wi.name), rgbf(255, 150, 130)))
        } else {
            self.menu.message.as_ref().filter(|(_, at)| at.elapsed().as_secs() < 5).map(|(t, _)| (t.clone(), rgbf(200, 235, 170)))
        };
        if let Some((t, c)) = msg {
            text_mid_centered(ui, 14.0 * s, m.1 + 682.0 * s, m.2 + 674.0 * s, &t, c);
        }

        // botões de baixo
        let can_play = !self.menu.worlds.is_empty();
        for (hit, q) in &layout {
            let (label, icon_kind) = match hit {
                Hit::Play => {
                    let on = hot(*q) && can_play;
                    let rad = 14.0 * s;
                    for g in 1..=5 {
                        let e = g as f32 * 2.4 * s;
                        ui.round_rect(q[0] - e, q[1] - e, q[2] + 2.0 * e, q[3] + 2.0 * e, rad + e, rgba(150, 70, 255, if on { 16 } else { 11 }), rgba(150, 70, 255, if on { 16 } else { 11 }));
                    }
                    let (top, bot) = if !can_play { (rgbf(90, 80, 120), rgbf(70, 62, 96)) } else if on { (rgbf(170, 80, 255), rgbf(120, 44, 240)) } else { (rgbf(153, 55, 250), rgbf(105, 29, 226)) };
                    ui.round_rect(q[0], q[1], q[2], q[3], rad, top, bot);
                    ui.round_frame(q[0], q[1], q[2], q[3], rad, 2.0 * s, rgba(200, 140, 255, 230));
                    let cy = q[1] + q[3] / 2.0;
                    let tx = m.1 + 352.0 * s;
                    ui.tri([tx, cy - 20.0 * s], [tx + 35.0 * s, cy], [tx, cy + 20.0 * s], rgbf(255, 255, 255));
                    text_mid(ui, 32.0 * s, m.1 + 428.0 * s, cy, "Jogar", rgbf(255, 255, 255));
                    continue;
                }
                Hit::New => ("Criar novo\nmundo", Icon::Plus),
                Hit::Lan => ("Jogar em\nLAN", Icon::Lan),
                Hit::Options => ("Configurações", Icon::Gear),
                Hit::Delete => (if self.menu.confirm_delete { "Clique:\napagar!" } else { "Excluir\nmundo" }, Icon::Trash),
                Hit::Quit => ("Sair", Icon::Exit),
                _ => continue,
            };
            let enabled = *hit != Hit::Delete || can_play;
            let danger = *hit == Hit::Delete && self.menu.confirm_delete;
            let on = hot(*q) && enabled;
            let bg = if danger { rgbf(150, 45, 40) } else if on { rgbf(44, 43, 66) } else { rgbf(31, 31, 47) };
            ui.round_rect(q[0], q[1], q[2], q[3], 14.0 * s, bg, bg);
            ui.round_frame(q[0], q[1], q[2], q[3], 14.0 * s, 1.3 * s, if on { rgba(130, 100, 220, 230) } else { rgba(58, 56, 80, 220) });
            let fg = if enabled { rgbf(214, 210, 240) } else { rgbf(110, 108, 125) };
            let cx = q[0] + q[2] / 2.0;
            icon(ui, icon_kind, cx, m.2 + 729.0 * s, 24.0 * s, fg, bg);
            let lines: Vec<&str> = label.split('\n').collect();
            for (k, l) in lines.iter().enumerate() {
                let cy = if lines.len() == 1 { 769.0 } else { 762.0 + k as f32 * 20.0 };
                text_mid_centered(ui, 15.5 * s, cx, m.2 + cy * s, l, fg);
            }
        }
    }
}

/// Abre a pasta no Explorador do Windows.
fn open_folder(dir: &str) {
    let _ = std::fs::create_dir_all(dir);
    let _ = std::process::Command::new("explorer").arg(dir).spawn();
}

#[cfg(test)]
mod tests {
    #[test]
    fn semente_com_letras_igual_ao_java() {
        // "abc".hashCode() e "hello".hashCode() no Java
        assert_eq!(super::java_hash("abc"), 96354);
        assert_eq!(super::java_hash("hello"), 99162322);
    }

    #[test]
    fn mes_e_ano_da_criacao() {
        assert_eq!(super::month_year(1_726_000_000_000), "setembro 2024");
        assert_eq!(super::month_year(0), "data desconhecida");
    }
}
