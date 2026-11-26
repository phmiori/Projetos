//! Telas: a barra e as informações durante o jogo, o inventário (com a paleta do criativo e a grade de criação),
//! a pausa e a tela de morte. O visual segue o do jogo Java (caixas escuras, borda dourada no espaço escolhido).

use crate::containers::Open;
use crate::inventory::{Stack, HOTBAR, SIZE};
use crate::items;
use crate::survival::MAX_AIR;
use crate::ui::{rgba, Ui};
use crate::{Game, Screen};

const PAL_COLS: usize = 9;
const PAL_ROWS: usize = 6;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SlotRef {
    Inv(usize),
    Craft(usize),
    Result,
    Palette(usize),
    Chest(usize),
    Furnace(usize),
}

/// Desenhos em pixel art (8 x 7) para coração, coxa, bolha e armadura: '#' cheio, '+' brilho.
const HEART: [&str; 7] = [" ## ## ", "#+######", "#+######", "########", " ###### ", "  ####  ", "   ##   "];
const FOOD: [&str; 7] = ["    ### ", "   #####", "   #####", "  ##### ", " ###    ", "##      ", "#       "];
const BUBBLE: [&str; 7] = ["  ####  ", " #+   # ", "#+     #", "#      #", "#      #", " #    # ", "  ####  "];
const ARMOR: [&str; 7] = ["## ## ##", "########", " ###### ", " ###### ", " ###### ", " ###### ", " ###### "];

fn pixel_icon(ui: &mut Ui, art: &[&str; 7], x: f32, y: f32, px: f32, full: crate::ui::Color, empty: crate::ui::Color, frac: f32) {
    for (r, row) in art.iter().enumerate() {
        for (c, ch) in row.chars().enumerate() {
            if ch == ' ' {
                continue;
            }
            let filled = (c as f32 + 0.5) / 8.0 <= frac;
            let mut col = if filled { full } else { empty };
            if ch == '+' && filled {
                col = [1.0, 1.0, 1.0, 0.85];
            }
            ui.rect(x + c as f32 * px, y + r as f32 * px, px, px, col);
        }
    }
}

// ---------------------------------------------------------------------- tema de pedra (Ui.java)

/// Chanfro de 2 px: para dentro (afundado) ou para fora (saltado).
pub(crate) fn bevel(ui: &mut Ui, x: f32, y: f32, w: f32, h: f32, raised: bool, k: f32) {
    let t = 2.0 * k.max(0.5);
    let (light, dark) = (rgba(255, 245, 230, if raised { 60 } else { 38 }), rgba(0, 0, 0, 150));
    let (a, b) = if raised { (light, dark) } else { (dark, light) };
    ui.rect(x, y, w, t, a);
    ui.rect(x, y, t, h, a);
    ui.rect(x, y + h - t, w, t, b);
    ui.rect(x + w - t, y, t, h, b);
}

/// Pedra com manchas (sem textura: quadradinhos de tons um pouco diferentes).
fn stone_fill(ui: &mut Ui, x: f32, y: f32, w: f32, h: f32, base: u8, k: f32) {
    ui.rect(x, y, w, h, rgba(base, base.saturating_sub(1), base.saturating_add(3), 255));
    let cell = 16.0 * k;
    let (nx, ny) = ((w / cell).ceil() as i32, (h / cell).ceil() as i32);
    for j in 0..ny {
        for i in 0..nx {
            let v = crate::noise::hash(i, j, 77) as f32;
            let d = ((v - 0.5) * 16.0) as i32;
            if d.abs() < 2 {
                continue;
            }
            let c = (base as i32 + d).clamp(0, 255) as u8;
            let (cx, cy) = (x + i as f32 * cell, y + j as f32 * cell);
            ui.rect(cx, cy, cell.min(x + w - cx), cell.min(y + h - cy), rgba(c, c.saturating_sub(1), c.saturating_add(3), 120));
        }
    }
}

/// Painel de pedra com moldura chanfrada, borda de ferro e rebites nos cantos (Ui.stonePanel).
pub(crate) fn stone_panel(ui: &mut Ui, x: f32, y: f32, w: f32, h: f32, k: f32) {
    ui.rect(x + 5.0 * k, y + 7.0 * k, w, h, rgba(0, 0, 0, 110));
    ui.rect(x, y, w, h, rgba(24, 22, 24, 255));
    stone_fill(ui, x + 2.0 * k, y + 2.0 * k, w - 4.0 * k, h - 4.0 * k, 30, k);
    let m = 8.0 * k;
    stone_fill(ui, x + m, y + m, w - 2.0 * m, h - 2.0 * m, 60, k);
    bevel(ui, x + m, y + m, w - 2.0 * m, h - 2.0 * m, true, k);
    ui.frame(x + k, y + k, w - 2.0 * k, h - 2.0 * k, k, rgba(110, 100, 92, 255));
    ui.frame(x + 7.0 * k, y + 7.0 * k, w - 14.0 * k, h - 14.0 * k, k, rgba(0, 0, 0, 200));
    for (cx, cy) in [(x + 4.0 * k, y + 4.0 * k), (x + w - 5.0 * k, y + 4.0 * k), (x + 4.0 * k, y + h - 5.0 * k), (x + w - 5.0 * k, y + h - 5.0 * k)] {
        let r = 6.0 * k;
        ui.disc(cx, cy, r, rgba(20, 18, 18, 255));
        ui.disc(cx - 0.5 * k, cy - 0.5 * k, r - 1.5 * k, rgba(150, 140, 128, 255));
        ui.disc(cx - 1.5 * k, cy - 1.5 * k, r * 0.45, rgba(220, 210, 196, 255));
    }
}

/// Espaço de item afundado na pedra (Ui.slot).
pub(crate) fn slot_box(ui: &mut Ui, x: f32, y: f32, s: f32, hover: bool, k: f32) {
    ui.rect(x, y, s, s, rgba(16, 15, 18, 235));
    ui.rect(x + 2.0 * k, y + 2.0 * k, s - 4.0 * k, s - 4.0 * k, rgba(42, 39, 44, 235));
    bevel(ui, x, y, s, s, false, k);
    if hover {
        ui.rect(x + 2.0 * k, y + 2.0 * k, s - 4.0 * k, s - 4.0 * k, rgba(255, 240, 210, 46));
    }
}

/// Título gravado, com traços e losangos dos dois lados (Ui.stoneTitle).
pub(crate) fn stone_title(ui: &mut Ui, t: &str, cx: f32, y: f32, span: f32, k: f32) {
    let px = 22.0 * k;
    let tw = ui.text_width(px, t);
    let x = cx - tw / 2.0;
    ui.shadow(px, x, y, t, rgba(226, 212, 188, 255));
    let ly = y - px * 0.36;
    let len = ((span - tw) / 2.0 - 18.0 * k).max(0.0);
    if len > 8.0 * k {
        for side in [-1.0f32, 1.0] {
            let x0 = if side < 0.0 { x - 12.0 * k - len } else { x + tw + 12.0 * k };
            ui.rect(x0, ly + k, len, 3.0 * k, rgba(0, 0, 0, 160));
            ui.rect(x0, ly, len, 2.0 * k, rgba(170, 158, 140, 255));
            let dx = if side < 0.0 { x0 + len + 4.0 * k } else { x0 - 8.0 * k };
            let c = rgba(170, 158, 140, 255);
            ui.tri([dx, ly + k], [dx + 3.0 * k, ly - 2.0 * k], [dx + 6.0 * k, ly + k], c);
            ui.tri([dx, ly + k], [dx + 6.0 * k, ly + k], [dx + 3.0 * k, ly + 4.0 * k], c);
        }
    }
}

/// Seta da criação e da fornalha; `progress` de 0 a 1 enche a seta da esquerda para a direita (Ui.arrow).
fn arrow(ui: &mut Ui, x: f32, y: f32, w: f32, h: f32, progress: f32, k: f32) {
    let shape = |ui: &mut Ui, x: f32, y: f32, upto: f32, c: crate::ui::Color| {
        let neck = x + w * 0.6;
        let end = x + upto.min(w);
        // haste
        ui.rect(x, y + h * 0.3, (end.min(neck) - x).max(0.0), h * 0.4, c);
        // ponta (cortada em `end`)
        if end > neck {
            let half = |px: f32| h / 2.0 * (1.0 - (px - neck) / (w * 0.4));
            let (a, b) = (half(neck), half(end));
            let my = y + h / 2.0;
            ui.tri([neck, my - a], [end, my - b], [end, my + b], c);
            ui.tri([neck, my - a], [end, my + b], [neck, my + a], c);
        }
    };
    shape(ui, x + 2.0 * k, y + 2.0 * k, w, rgba(0, 0, 0, 150));
    shape(ui, x - k, y - k, w + 2.0 * k, rgba(40, 36, 34, 255));
    shape(ui, x, y, w, rgba(150, 140, 128, 255));
    if progress > 0.0 {
        shape(ui, x, y, w * progress, rgba(240, 236, 226, 255));
    }
}

/// O fogo da fornalha em pixel art: '.' vazio, 'r' borda vermelha, 'o' laranja, 'y' amarelo, 'w' miolo claro.
const FIRE: [&str; 14] = [
    "......r.......",
    "......rr......",
    ".....rorr.....",
    ".....roor...r.",
    "..r.rooor..rr.",
    "..rrrooorr.ror",
    ".roroooyorroor",
    ".rooooyyooooor",
    "rroooyyyyoooor",
    "rooyyywyyyooor",
    "rooyywwwyyoorr",
    "rrooywwwyyoorr",
    ".rrooywwyoorr.",
    "..rrroooorrr..",
];

/// Chama da fornalha: `fill` de 0 a 1 (quanto do combustível ainda queima). A parte que já queimou fica apagada,
/// de cima para baixo.
fn flame(ui: &mut Ui, x: f32, y: f32, s: f32, fill: f32) {
    let px = s / 14.0;
    // primeiro o contorno escuro do desenho todo (por baixo de todas as linhas)
    for (j, row) in FIRE.iter().enumerate() {
        for (i, _) in row.chars().enumerate().filter(|c| c.1 != '.') {
            ui.rect(x + (i as f32 - 0.5) * px, y + (j as f32 - 0.5) * px, px * 2.0, px * 2.0, rgba(24, 20, 18, 255));
        }
    }
    for (j, row) in FIRE.iter().enumerate() {
        // quanto desta linha de pixels está acesa (a última a apagar é a de baixo)
        let lit = (fill * 14.0 - (13 - j) as f32).clamp(0.0, 1.0);
        for (i, c) in row.chars().enumerate() {
            if c == '.' {
                continue;
            }
            let (cx, cy) = (x + i as f32 * px, y + j as f32 * px);
            let gray = if c == 'r' { rgba(84, 76, 72, 255) } else { rgba(112, 102, 94, 255) };
            ui.rect(cx, cy, px + 0.5, px + 0.5, gray);
        }
        if lit > 0.0 {
            for (i, c) in row.chars().enumerate() {
                let color = match c {
                    'r' => rgba(214, 52, 18, 255),
                    'o' => rgba(250, 120, 20, 255),
                    'y' => rgba(255, 196, 40, 255),
                    'w' => rgba(255, 244, 170, 255),
                    _ => continue,
                };
                let (cx, cy) = (x + i as f32 * px, y + j as f32 * px);
                ui.rect(cx, cy + px * (1.0 - lit), px + 0.5, px * lit + 0.5, color);
            }
        }
    }
}

impl Game {
    pub fn ui_scale(h: u32) -> f32 {
        (h as f32 / 720.0).clamp(0.75, 2.5)
    }

    /// Hora, bioma e posição: as duas linhas da caixa do canto (como no Java).
    fn info_lines(&self) -> (String, String) {
        let (x, z) = (self.player.x.floor() as i32, self.player.z.floor() as i32);
        let h = self.gen.height_at(x, z);
        let biome = crate::world::BIOME_NAMES[self.gen.biome_at(x, z, h - 1) as usize];
        let lan = match &self.net {
            Some(n) if n.is_host() => format!("  ·  LAN: anfitrião, {} jogadores", n.remotes.len() + 1),
            Some(n) => format!("  ·  LAN: {} jogadores", n.remotes.len() + 1),
            None => String::new(),
        };
        let l1 = format!("{}  ·  {}{lan}", self.world_name, if self.creative { "Criativo" } else { "Sobrevivência" });
        let l2 = format!(
            "Dia {}, {}  ·  {}  ·  X {:.0}  Y {:.0}  Z {:.0}{}  ·  {} FPS",
            self.day,
            self.clock(),
            biome,
            self.player.x,
            self.player.y,
            self.player.z,
            if self.player.flying { "  ·  voando" } else { "" },
            self.fps
        );
        (l1, l2)
    }

    pub fn draw_hud(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        if self.blast_flash > 0.0 {
            ui.rect(0.0, 0.0, w, h, [1.0, 0.95, 0.85, (self.blast_flash / 0.35 * 0.6) as f32]);
        }
        if self.hurt_flash > 0.0 {
            ui.rect(0.0, 0.0, w, h, [0.8, 0.0, 0.0, (self.hurt_flash / 0.45 * 0.43) as f32]);
        }
        // barra: moldura, espaços afundados e o escolhido com borda dourada
        let size = 52.0 * k;
        let fr = 6.0 * k;
        let x0 = (w - 9.0 * size) / 2.0;
        let y0 = h - size - 14.0 * k;
        ui.rect(x0 - fr, y0 - fr, 9.0 * size + fr * 2.0 - 4.0 * k, size + fr * 2.0 - 4.0 * k, rgba(52, 52, 58, 225));
        ui.frame(x0 - fr, y0 - fr, 9.0 * size + fr * 2.0 - 4.0 * k, size + fr * 2.0 - 4.0 * k, 2.0 * k, rgba(20, 20, 24, 230));
        for i in 0..HOTBAR {
            let x = x0 + i as f32 * size;
            ui.rect(x, y0, size - 4.0 * k, size - 4.0 * k, rgba(28, 28, 32, 230));
            ui.frame(x, y0, size - 4.0 * k, size - 4.0 * k, k, rgba(0, 0, 0, 150));
            ui.item(self.inv.s[i], x + 5.0 * k, y0 + 5.0 * k, size - 14.0 * k, k);
            ui.text(11.0 * k, x + 4.0 * k, y0 + 13.0 * k, &(i + 1).to_string(), rgba(255, 255, 255, 70));
        }
        let sx = x0 + self.slot as f32 * size;
        ui.frame(sx - 4.0 * k, y0 - 4.0 * k, size + 4.0 * k, size + 4.0 * k, 4.0 * k, rgba(0, 0, 0, 160));
        ui.frame(sx - 3.0 * k, y0 - 3.0 * k, size + 2.0 * k, size + 2.0 * k, 3.0 * k, rgba(240, 200, 100, 255));
        let top = y0 - fr;
        // nome do item ao trocar de espaço
        let st = self.inv.s[self.slot];
        if self.slot_name_timer > 0.0 && !st.empty() {
            let a = self.slot_name_timer.min(1.0) as f32;
            let nm = items::name(st.id);
            let tw = ui.text_width(17.0 * k, &nm) + 24.0 * k;
            let ty = top - if self.creative { 12.0 } else { 62.0 } * k;
            ui.rect(w / 2.0 - tw / 2.0, ty - 18.0 * k, tw, 25.0 * k, [0.04, 0.04, 0.055, 0.47 * a]);
            ui.centered(17.0 * k, w / 2.0, ty, &nm, [0.96, 0.91, 0.8, a]);
        }
        // vida, fome, armadura e fôlego (sobrevivência)
        if !self.creative {
            let row_y = top - 24.0 * k;
            let px = 2.25 * k;
            for i in 0..10 {
                let f = ((self.health - i as f64 * 2.0) / 2.0).clamp(0.0, 1.0);
                let f = if f >= 1.0 { 1.0 } else if f > 0.0 { 0.5 } else { 0.0 };
                pixel_icon(ui, &HEART, x0 + i as f32 * 21.0 * k, row_y, px, rgba(220, 30, 40, 255), rgba(40, 10, 12, 200), f as f32);
            }
            let armor = self.inv.armor_points();
            for i in 0..10 {
                if armor <= 0 {
                    break;
                }
                let f = if armor >= i * 2 + 2 { 1.0 } else if armor > i * 2 { 0.5 } else { 0.0 };
                pixel_icon(ui, &ARMOR, x0 + i as f32 * 21.0 * k, row_y - 21.0 * k, px, rgba(200, 200, 210, 255), rgba(40, 40, 46, 180), f);
            }
            let right = x0 + 9.0 * size - 4.0 * k;
            for i in 0..10 {
                let f = ((self.food - i as f64 * 2.0) / 2.0).clamp(0.0, 1.0);
                let f = if f >= 1.0 { 1.0 } else if f > 0.0 { 0.5 } else { 0.0 };
                pixel_icon(ui, &FOOD, right - 20.0 * k - i as f32 * 21.0 * k, row_y, px, rgba(196, 120, 60, 255), rgba(45, 28, 16, 200), f as f32);
            }
            if self.player.head_in_water || self.air < MAX_AIR {
                let bubbles = self.air.ceil() as i32;
                for i in 0..10 {
                    if i < bubbles {
                        pixel_icon(ui, &BUBBLE, right - 18.0 * k - i as f32 * 21.0 * k, row_y - 22.0 * k, px, rgba(120, 190, 255, 235), rgba(0, 0, 0, 0), 1.0);
                    }
                }
            }
        }
        // rachando o bloco: barrinha embaixo da mira
        if self.break_progress > 0.0 {
            let (bw, bh) = (44.0 * k, 5.0 * k);
            ui.rect(w / 2.0 - bw / 2.0, h / 2.0 + 16.0 * k, bw, bh, rgba(0, 0, 0, 150));
            ui.rect(w / 2.0 - bw / 2.0, h / 2.0 + 16.0 * k, bw * self.break_progress.min(1.0) as f32, bh, rgba(240, 200, 100, 230));
        }
        // aviso (ferramenta quebrou, etc.)
        if let Some((t, at)) = &self.notice {
            let s = at.elapsed().as_secs_f32();
            if s < 4.0 {
                let a = (4.0 - s).min(1.0);
                let tw = ui.text_width(16.0 * k, t) + 30.0 * k;
                let ty = top - 100.0 * k;
                ui.rect(w / 2.0 - tw / 2.0, ty - 20.0 * k, tw, 30.0 * k, [0.04, 0.04, 0.06, 0.7 * a]);
                ui.centered(16.0 * k, w / 2.0, ty, t, [1.0, 0.9, 0.75, a]);
            }
        }
        // informações: duas linhas numa caixa escura no canto
        let (l1, l2) = self.info_lines();
        let fpx = 13.0 * k;
        let bw = ui.text_width(fpx, &l1).max(ui.text_width(fpx, &l2)) + 20.0 * k;
        ui.hud_box(8.0 * k, 8.0 * k, bw, 44.0 * k, k);
        ui.shadow(fpx, 18.0 * k, 26.0 * k, &l1, rgba(245, 232, 205, 255));
        ui.shadow(fpx, 18.0 * k, 44.0 * k, &l2, rgba(220, 220, 225, 255));
    }

    // ------------------------------------------------------------------ inventário
    fn craft_size(&self) -> usize {
        if self.at_table { 3 } else { 2 }
    }

    /// Onde fica cada espaço na tela (e o retângulo do painel).
    pub fn inv_layout(&self, w: f32, h: f32) -> ([f32; 4], Vec<(SlotRef, f32, f32)>, f32) {
        let k = Self::ui_scale(h as u32);
        let pitch = 48.0 * k;
        let pad = 18.0 * k;
        let pw = 9.0 * pitch + pad * 2.0 - 4.0 * k;
        let mut slots = Vec::new();
        let top_h = if self.open.is_some() {
            3.0 * pitch + 30.0 * k
        } else if self.creative && !self.at_table {
            PAL_ROWS as f32 * pitch + 30.0 * k
        } else {
            (self.craft_size().max(4)) as f32 * pitch + 30.0 * k
        };
        let ph = 30.0 * k + top_h + 30.0 * k + 3.0 * pitch + 10.0 * k + pitch + pad;
        // um pouco acima do meio, para não cobrir a barra
        // com o livro de receitas aberto, o painel anda para a esquerda para os dois ficarem no meio
        let (px, py) = ((w - pw) / 2.0 - self.book_shift(k), ((h - ph) / 2.0 - 40.0 * k).max(4.0 * k));
        let x0 = px + pad;
        let mut y = py + 44.0 * k;
        if let Some(open) = &self.open {
            match open {
                Open::Chest(_) => {
                    for i in 0..27 {
                        slots.push((SlotRef::Chest(i), x0 + (i % 9) as f32 * pitch, y + (i / 9) as f32 * pitch));
                    }
                }
                Open::Furnace(_) => {
                    // como no Java: entrada em cima, combustível embaixo, chama no meio, seta e resultado à direita
                    let s = 44.0 * k;
                    let grid_w = 9.0 * pitch - 4.0 * k;
                    let group = s + 34.0 * k + 50.0 * k + 34.0 * k + s;
                    let fx = x0 + (grid_w - group) / 2.0;
                    let (top, bottom) = (y + 6.0 * k, y + 3.0 * pitch - 4.0 * k);
                    slots.push((SlotRef::Furnace(0), fx, top));
                    slots.push((SlotRef::Furnace(1), fx, bottom - s));
                    slots.push((SlotRef::Furnace(2), fx + s + 118.0 * k, (top + bottom) / 2.0 - s / 2.0));
                }
            }
        } else if self.creative && !self.at_table {
            for r in 0..PAL_ROWS {
                for c in 0..PAL_COLS {
                    slots.push((SlotRef::Palette(r * PAL_COLS + c), x0 + c as f32 * pitch, y + r as f32 * pitch));
                }
            }
        } else {
            // armadura à esquerda, grade de criação no meio, resultado à direita
            for i in 0..4 {
                slots.push((SlotRef::Inv(SIZE + i), x0, y + i as f32 * pitch));
            }
            let n = self.craft_size();
            let gx = x0 + 2.5 * pitch;
            for r in 0..n {
                for c in 0..n {
                    slots.push((SlotRef::Craft(r * 3 + c), gx + c as f32 * pitch, y + r as f32 * pitch));
                }
            }
            slots.push((SlotRef::Result, gx + (n as f32 + 1.6) * pitch, y + (n as f32 - 1.0) / 2.0 * pitch));
        }
        y += top_h;
        for r in 0..3 {
            for c in 0..9 {
                slots.push((SlotRef::Inv(HOTBAR + r * 9 + c), x0 + c as f32 * pitch, y + r as f32 * pitch));
            }
        }
        y += 3.0 * pitch + 10.0 * k;
        for c in 0..9 {
            slots.push((SlotRef::Inv(c), x0 + c as f32 * pitch, y));
        }
        ([px, py, pw, ph], slots, 44.0 * k)
    }

    pub fn slot_at(&self, w: f32, h: f32, mx: f32, my: f32) -> Option<SlotRef> {
        let (_, slots, s) = self.inv_layout(w, h);
        slots.into_iter().find(|&(_, x, y)| mx >= x && mx < x + s && my >= y && my < y + s).map(|(r, _, _)| r)
    }

    fn palette_item(&self, i: usize) -> i32 {
        *self.palette.get(self.palette_scroll * PAL_COLS + i).unwrap_or(&0)
    }

    pub fn craft_grid(&self) -> Vec<i32> {
        let n = self.craft_size();
        (0..n * n).map(|i| self.craft[(i / n) * 3 + i % n].id).collect()
    }

    fn get_slot(&self, r: SlotRef) -> Stack {
        match (r, &self.open) {
            (SlotRef::Inv(i), _) => self.inv.s[i],
            (SlotRef::Craft(i), _) => self.craft[i],
            (SlotRef::Chest(i), Some(Open::Chest(k))) => self.chests.get(k).map_or(Stack::default(), |c| c[i]),
            (SlotRef::Furnace(i), Some(Open::Furnace(k))) => self.furnaces.get(k).map_or(Stack::default(), |f| f.inv[i]),
            _ => Stack::default(),
        }
    }

    fn set_slot(&mut self, r: SlotRef, st: Stack) {
        match (r, self.open.clone()) {
            (SlotRef::Inv(i), _) => self.inv.s[i] = st,
            (SlotRef::Craft(i), _) => self.craft[i] = st,
            (SlotRef::Chest(i), Some(Open::Chest(k))) => {
                if let Some(c) = self.chests.get_mut(&k) {
                    c[i] = st;
                }
            }
            (SlotRef::Furnace(i), Some(Open::Furnace(k))) => {
                if let Some(f) = self.furnaces.get_mut(&k) {
                    f.inv[i] = st;
                }
            }
            _ => {}
        }
    }

    /// Esse item pode ir nesse espaço? (armadura só no espaço da sua peça; o resultado da fornalha só sai)
    fn accepts(r: SlotRef, id: i32) -> bool {
        match r {
            SlotRef::Inv(i) if i >= SIZE => items::info(id).map_or(false, |inf| inf.armor_piece == (i - SIZE) as i32),
            SlotRef::Furnace(2) => false,
            _ => true,
        }
    }

    /// Botão "Limpar inventário" (só no criativo, em cima da mochila), como no Java.
    pub fn clear_rect(&self, w: f32, h: f32) -> Option<[f32; 4]> {
        if !self.creative || self.open.is_some() || self.at_table {
            return None;
        }
        let k = Self::ui_scale(h as u32);
        let (p, slots, _) = self.inv_layout(w, h);
        let y = slots.iter().find(|(r, _, _)| *r == SlotRef::Inv(HOTBAR)).map(|&(_, _, y)| y)?;
        let bw = 170.0 * k;
        Some([p[0] + p[2] - 18.0 * k - bw + 4.0 * k, y - 28.0 * k, bw, 22.0 * k])
    }

    fn clear_confirming(&self) -> bool {
        self.clear_confirm.map_or(false, |t| t.elapsed().as_secs_f32() < 3.0)
    }

    pub fn inv_click(&mut self, w: f32, h: f32, mx: f32, my: f32, right: bool, shift: bool) {
        if self.book_click(w, h, mx, my, shift) {
            return;
        }
        // limpar tudo: o primeiro clique pede confirmação (some em 3 s), o segundo apaga a mochila e a barra
        if let Some(c) = self.clear_rect(w, h) {
            if !right && mx >= c[0] && mx < c[0] + c[2] && my >= c[1] && my < c[1] + c[3] {
                crate::sound::play("clique", 0.4);
                if self.clear_confirming() {
                    for i in 0..SIZE {
                        self.inv.s[i] = Stack::default();
                    }
                    self.cursor = Stack::default();
                    self.clear_confirm = None;
                    self.notice("Inventário limpo".into());
                } else {
                    self.clear_confirm = Some(std::time::Instant::now());
                }
                return;
            }
        }
        let Some(r) = self.slot_at(w, h, mx, my) else {
            // fora dos espaços: fora do painel, joga fora o que está no cursor
            let (p, _, _) = self.inv_layout(w, h);
            let inside = mx >= p[0] && mx < p[0] + p[2] && my >= p[1] && my < p[1] + p[3];
            if !inside && !self.cursor.empty() {
                let st = self.cursor;
                self.cursor = Stack::default();
                if !self.creative {
                    self.throw_stack(st);
                }
            }
            return;
        };
        match r {
            SlotRef::Palette(i) => {
                let id = self.palette_item(i);
                if id == 0 {
                    return;
                }
                if shift {
                    self.inv.add(id, items::max_stack(id), 0);
                } else if right {
                    self.cursor = if self.cursor.id == id { Stack::new(id, (self.cursor.count + 1).min(items::max_stack(id)), 0) } else { Stack::new(id, 1, 0) };
                } else if self.cursor.id == id {
                    self.cursor = Stack::default(); // clicar de novo no mesmo item devolve para a paleta
                } else {
                    self.cursor = Stack::new(id, items::max_stack(id), 0);
                }
            }
            SlotRef::Result => self.take_result(shift),
            _ => {
                let st = self.get_slot(r);
                if shift && !st.empty() {
                    // passa direto entre a barra e a mochila (ou da grade para a mochila)
                    let rest = match r {
                        SlotRef::Inv(_) if self.open.is_some() => self.add_to_open(st),
                        SlotRef::Inv(i) if i < HOTBAR => self.inv.add_range(st.id, st.count, st.wear, HOTBAR, SIZE),
                        SlotRef::Inv(i) if i < SIZE => self.inv.add_range(st.id, st.count, st.wear, 0, HOTBAR),
                        _ => self.inv.add(st.id, st.count, st.wear),
                    };
                    self.set_slot(r, Stack::new(st.id, rest, st.wear));
                    return;
                }
                let cur = self.cursor;
                if right {
                    if cur.empty() {
                        if !st.empty() {
                            let half = (st.count + 1) / 2;
                            self.cursor = Stack::new(st.id, half, st.wear);
                            self.set_slot(r, Stack::new(st.id, st.count - half, st.wear));
                        }
                    } else if Self::accepts(r, cur.id) && (st.empty() || (st.id == cur.id && st.count < items::max_stack(st.id))) {
                        self.set_slot(r, Stack::new(cur.id, st.count.max(0) + 1, cur.wear));
                        self.cursor = Stack::new(cur.id, cur.count - 1, cur.wear);
                    }
                    return;
                }
                if cur.empty() {
                    self.cursor = st;
                    self.set_slot(r, Stack::default());
                } else if !Self::accepts(r, cur.id) {
                } else if st.empty() {
                    self.set_slot(r, cur);
                    self.cursor = Stack::default();
                } else if st.id == cur.id && items::max_stack(st.id) > 1 {
                    let room = items::max_stack(st.id) - st.count;
                    let k = room.min(cur.count);
                    self.set_slot(r, Stack::new(st.id, st.count + k, st.wear));
                    self.cursor = Stack::new(cur.id, cur.count - k, cur.wear);
                } else {
                    self.set_slot(r, cur);
                    self.cursor = st;
                }
            }
        }
    }

    /// Pega o resultado da grade (gasta um de cada ingrediente). Com Shift, faz o máximo que der direto na mochila.
    fn take_result(&mut self, all: bool) {
        loop {
            let Some(rec) = items::match_recipe(&self.craft_grid(), self.craft_size()) else { return };
            if all {
                if self.inv.add(rec.out, rec.count, 0) > 0 {
                    return; // não coube tudo (o que coube fica; raro)
                }
            } else {
                if !self.cursor.empty() && (self.cursor.id != rec.out || self.cursor.count + rec.count > items::max_stack(rec.out)) {
                    return;
                }
                self.cursor = Stack::new(rec.out, self.cursor.count.max(0) + rec.count, 0);
            }
            let n = self.craft_size();
            for i in 0..n * n {
                let j = (i / n) * 3 + i % n;
                let st = self.craft[j];
                if !st.empty() {
                    self.craft[j] = Stack::new(st.id, st.count - 1, st.wear);
                }
            }
            if !all {
                return;
            }
        }
    }

    /// Tecla 1-9 com o mouse em cima de um espaço: troca com aquele espaço da barra (como no Java).
    pub fn inv_number(&mut self, w: f32, h: f32, mx: f32, my: f32, n: usize) {
        match self.slot_at(w, h, mx, my) {
            Some(SlotRef::Palette(i)) => {
                let id = self.palette_item(i);
                if id != 0 {
                    self.inv.s[n] = Stack::new(id, items::max_stack(id), 0);
                }
            }
            Some(r @ SlotRef::Inv(_)) | Some(r @ SlotRef::Craft(_)) => {
                let a = self.get_slot(r);
                let b = self.inv.s[n];
                if Self::accepts(r, b.id) || b.empty() {
                    self.set_slot(r, b);
                    self.inv.s[n] = a;
                }
            }
            _ => {}
        }
    }

    pub fn inv_scroll(&mut self, up: bool) {
        let rows = self.palette.len().div_ceil(PAL_COLS);
        let max = rows.saturating_sub(PAL_ROWS);
        if up {
            self.palette_scroll = self.palette_scroll.saturating_sub(1);
        } else {
            self.palette_scroll = (self.palette_scroll + 1).min(max);
        }
    }

    /// Fechando o inventário: o que estava no cursor e na grade volta para a mochila (o que não couber cai).
    pub fn close_inventory(&mut self) {
        let mut back: Vec<Stack> = self.craft.to_vec();
        self.craft = [Stack::default(); 9];
        back.push(std::mem::take(&mut self.cursor));
        for st in back {
            if st.empty() {
                continue;
            }
            let rest = self.inv.add(st.id, st.count, st.wear);
            if rest > 0 {
                self.throw_stack(Stack::new(st.id, rest, st.wear));
            }
        }
        if self.is_client() {
            if let Some(o) = self.open.clone() {
                let (k, is_chest) = match &o {
                    crate::containers::Open::Chest(k) => (k.clone(), true),
                    crate::containers::Open::Furnace(k) => (k.clone(), false),
                };
                let v: Vec<i32> = k.split(',').filter_map(|s| s.parse().ok()).collect();
                let data = if is_chest {
                    self.chests.remove(&k).map(|c| crate::containers::serialize_slots(&c))
                } else {
                    self.furnaces.remove(&k).map(|f| f.serialize())
                };
                if let (Some(data), true) = (data, v.len() == 3) {
                    let t = if is_chest { crate::net::CHEST_SET } else { crate::net::FURNACE_SET };
                    if let Some(n) = &self.net {
                        n.send(crate::net::Out::new(t).i(v[0]).i(v[1]).i(v[2]).s(&data.replace("\\:", ":")), None);
                    }
                }
            }
        }
        self.screen = Screen::Play;
        self.at_table = false;
        self.open = None;
        self.grab_mouse = true;
    }

    pub fn draw_inventory(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        ui.rect(0.0, 0.0, w, h, rgba(0, 0, 0, 120));
        let (p, slots, s) = self.inv_layout(w, h);
        stone_panel(ui, p[0], p[1], p[2], p[3], k);
        let palette = self.creative && self.open.is_none() && !self.at_table;
        let title = match &self.open {
            Some(Open::Chest(_)) => "Baú",
            Some(Open::Furnace(_)) => "Fornalha",
            None if self.at_table => "Bancada",
            None if self.creative => "Criativo",
            None => "Inventário",
        };
        let grid_w = 9.0 * 48.0 * k - 4.0 * k;
        // no criativo os traços do título encurtam para caber o "rodinha" à direita
        stone_title(ui, title, p[0] + p[2] / 2.0, p[1] + 34.0 * k, if palette { grid_w - 240.0 * k } else { grid_w }, k);
        if palette {
            let rows = self.palette.len().div_ceil(PAL_COLS);
            ui.shadow(11.0 * k, p[0] + p[2] - 106.0 * k, p[1] + 30.0 * k, &format!("rodinha: {}/{}", self.palette_scroll + 1, rows.saturating_sub(PAL_ROWS) + 1), rgba(170, 158, 140, 230));
        }
        let hover = self.slot_at(w, h, self.mouse.0, self.mouse.1);
        let recipe = if palette || self.open.is_some() { None } else { items::match_recipe(&self.craft_grid(), self.craft_size()) };
        // fornalha: chama (o calor que resta) entre a entrada e o combustível, a seta com o progresso e uma dica
        if let Some(Open::Furnace(key)) = &self.open {
            let f = self.furnaces.get(key);
            let at = |r: SlotRef| slots.iter().find(|q| q.0 == r).map(|q| (q.1, q.2)).unwrap_or((0.0, 0.0));
            let ((ix, iy), (_, fy), (ox, oy)) = (at(SlotRef::Furnace(0)), at(SlotRef::Furnace(1)), at(SlotRef::Furnace(2)));
            let mid = (iy + fy + s) / 2.0;
            let fill = f.map_or(0.0, |f| if f.heat_max > 0.0 { ((f.heat - f.progress) / f.heat_max).clamp(0.0, 1.0) } else { 0.0 }) as f32;
            flame(ui, ix + s / 2.0 - 14.0 * k, mid - 14.0 * k, 28.0 * k, fill);
            arrow(ui, ix + s + 34.0 * k, mid - 14.0 * k, 50.0 * k, 28.0 * k, f.map_or(0.0, |f| f.progress.clamp(0.0, 1.0) as f32), k);
            ui.frame(ox - 3.0 * k, oy - 3.0 * k, s + 6.0 * k, s + 6.0 * k, 2.0 * k, rgba(232, 190, 90, 255));
            let inp = f.map_or(Stack::default(), |f| f.inv[0]);
            let hint = if inp.empty() {
                "Minério, areia, pedregulho, tronco ou carne crua em cima".to_string()
            } else if items::smelt(inp.id) == 0 {
                format!("{} não assa", items::name(inp.id))
            } else if f.map_or(true, |f| f.inv[1].empty() && f.heat <= 0.0) {
                "Falta combustível embaixo".to_string()
            } else {
                format!("Vira {}", items::name(items::smelt(inp.id)))
            };
            let tw = ui.text_width(12.0 * k, &hint);
            ui.shadow(12.0 * k, p[0] + p[2] / 2.0 - tw / 2.0, fy + s + 20.0 * k, &hint, rgba(170, 158, 140, 255));
        }
        let mut last_y = 0.0;
        for &(r, x, y) in &slots {
            if let SlotRef::Inv(i) = r {
                if i == 0 && last_y != 0.0 {
                    // separador entre a mochila e a barra
                    ui.rect(p[0] + 18.0 * k, y - 8.0 * k, p[2] - 36.0 * k, k, rgba(255, 255, 255, 30));
                }
            }
            last_y = y;
            let hot = hover == Some(r);
            slot_box(ui, x, y, s, hot, k);
            let st = match r {
                SlotRef::Palette(i) => {
                    let id = self.palette_item(i);
                    Stack::new(id, 1, 0)
                }
                SlotRef::Result => recipe.map_or(Stack::default(), |rec| Stack::new(rec.out, rec.count, 0)),
                _ => self.get_slot(r),
            };
            if let SlotRef::Inv(i) = r {
                if i >= SIZE && st.empty() {
                    let names = ["capacete", "peitoral", "calças", "botas"];
                    let t = names[i - SIZE];
                    let tw = ui.text_width(9.0 * k, t);
                    ui.text(9.0 * k, x + s / 2.0 - tw / 2.0, y + s / 2.0 + 3.0 * k, t, rgba(255, 255, 255, 60));
                }
            }
            if r == SlotRef::Result {
                arrow(ui, x - 50.0 * k, y + s / 2.0 - 12.0 * k, 38.0 * k, 24.0 * k, if recipe.is_some() { 1.0 } else { 0.0 }, k);
                let c = if recipe.is_some() { rgba(232, 190, 90, 255) } else { rgba(90, 80, 70, 255) };
                ui.frame(x - 3.0 * k, y - 3.0 * k, s + 6.0 * k, s + 6.0 * k, 2.0 * k, c);
            }
            ui.item(st, x + 4.0 * k, y + 4.0 * k, s - 8.0 * k, k);
        }

        // o livro de receitas (e o desenho fantasma da receita embaixo do mouse)
        let book_hover = self.draw_book(ui, w, h);
        if let Some(r) = book_hover {
            self.draw_ghost(ui, k, &slots, s, r);
            self.draw_book_tooltip(ui, w, h, r);
        }
        if let Some(c) = self.clear_rect(w, h) {
            let confirming = self.clear_confirming();
            let hot = self.mouse.0 >= c[0] && self.mouse.0 < c[0] + c[2] && self.mouse.1 >= c[1] && self.mouse.1 < c[1] + c[3];
            ui.rect(c[0], c[1], c[2], c[3], if confirming { rgba(150, 40, 34, 235) } else if hot { rgba(84, 76, 70, 240) } else { rgba(48, 45, 48, 235) });
            bevel(ui, c[0], c[1], c[2], c[3], true, k);
            let label = if confirming { "Clique de novo para apagar" } else { "Limpar inventário" };
            ui.centered(11.0 * k, c[0] + c[2] / 2.0, c[1] + 15.0 * k, label, if confirming || hot { rgba(255, 255, 255, 255) } else { rgba(200, 200, 205, 230) });
        }
        // nome do item embaixo do mouse
        if let Some(r) = hover {
            let st = match r {
                SlotRef::Palette(i) => Stack::new(self.palette_item(i), 1, 0),
                SlotRef::Result => recipe.map_or(Stack::default(), |rec| Stack::new(rec.out, rec.count, 0)),
                _ => self.get_slot(r),
            };
            if !st.empty() && self.cursor.empty() {
                let mut t = items::name(st.id);
                let d = items::durability(st.id);
                if d > 0 {
                    t += &format!("  ({}/{})", d - st.wear, d);
                }
                let tw = ui.text_width(13.0 * k, &t) + 14.0 * k;
                let (tx, ty) = (self.mouse.0 + 14.0 * k, self.mouse.1 - 6.0 * k);
                ui.rect(tx, ty - 16.0 * k, tw, 22.0 * k, rgba(16, 10, 24, 235));
                ui.frame(tx, ty - 16.0 * k, tw, 22.0 * k, k, rgba(90, 40, 160, 255));
                ui.shadow(13.0 * k, tx + 7.0 * k, ty, &t, rgba(255, 255, 255, 255));
            }
        }
        // o item preso no mouse
        if !self.cursor.empty() {
            let c = self.cursor;
            ui.item(c, self.mouse.0 - s / 2.0 + 4.0 * k, self.mouse.1 - s / 2.0 + 4.0 * k, s - 8.0 * k, k);
        }
    }

    // ------------------------------------------------------------------ pausa e morte
    pub fn buttons(&self, w: f32, h: f32) -> Vec<(&'static str, [f32; 4])> {
        let k = Self::ui_scale(h as u32);
        let (bw, bh) = (300.0 * k, 44.0 * k);
        let names: Vec<&'static str> = match self.screen {
            Screen::Pause if self.controls_open => vec!["Voltar"],
            Screen::Pause => {
                let mut v = vec!["Voltar ao jogo", "Controles", "Configurações"];
                if self.net.is_none() {
                    v.push("Abrir para LAN");
                }
                v.push(if self.is_client() { "Desconectar" } else { "Salvar e sair" });
                v
            }
            Screen::Dead => vec!["Renascer"],
            _ => vec![],
        };
        names
            .into_iter()
            .enumerate()
            .map(|(i, n)| {
                let y = if self.controls_open { self.controls_rect(w, h)[1] + self.controls_rect(w, h)[3] - bh - 20.0 * k } else { h / 2.0 + i as f32 * (bh + 12.0 * k) };
                (n, [(w - bw) / 2.0, y, bw, bh])
            })
            .collect()
    }

    /// Todas as teclas e botões do jogo (aba "Controles" da pausa).
    fn controls(&self) -> Vec<(&'static str, &'static str)> {
        let c = self.creative;
        vec![
            ("W A S D", "andar"),
            ("Espaço", if c { "pular  ·  dois toques: voar" } else { "pular  ·  nadar para cima" }),
            ("Shift", if c { "descer voando" } else { "descer nadando" }),
            ("Ctrl", "correr"),
            ("Botão esquerdo", if c { "quebrar bloco  ·  bater" } else { "segurar: quebrar bloco  ·  bater" }),
            ("Botão direito", "colocar bloco  ·  comer  ·  vestir  ·  abrir portas, baús, fornalhas e bancada"),
            ("Botão do meio", if c { "copiar o bloco mirado" } else { "—" }),
            ("Arco", "segure o botão esquerdo para puxar, solte para atirar"),
            ("Rodinha  ·  1 a 9", "trocar o item da mão"),
            ("E", "inventário e criação"),
            ("Q  ·  Ctrl+Q", "jogar fora um item  ·  a pilha toda"),
            ("T  ·  Enter  ·  /", "chat e comandos (/ajuda)"),
            ("F2", "tirar foto (pasta fotos)"),
            ("F3", "ligar/desligar a sombra dos cantos"),
            ("F4 (segurando)", "passar as horas depressa"),
            ("Esc", "pausar"),
        ]
    }

    fn controls_rect(&self, w: f32, h: f32) -> [f32; 4] {
        let k = Self::ui_scale(h as u32);
        let pw = (760.0 * k).min(w - 40.0);
        let ph = self.controls().len() as f32 * 28.0 * k + 160.0 * k;
        [(w - pw) / 2.0, ((h - ph) / 2.0).max(10.0), pw, ph]
    }

    fn draw_controls(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        let r = self.controls_rect(w, h);
        ui.rect(r[0], r[1], r[2], r[3], rgba(20, 22, 28, 225));
        ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, rgba(0, 0, 0, 180));
        ui.centered(28.0 * k, w / 2.0, r[1] + 50.0 * k, "Controles", rgba(245, 232, 205, 255));
        let lines = self.controls();
        let (kp, vp) = (15.0 * k, 14.0 * k);
        let kw = lines.iter().map(|l| ui.text_width(kp, l.0)).fold(0.0, f32::max);
        let mut y = r[1] + 92.0 * k;
        for (a, b) in lines {
            ui.shadow(kp, r[0] + 36.0 * k, y, a, rgba(240, 200, 110, 255));
            ui.shadow(vp, r[0] + 36.0 * k + kw + 24.0 * k, y, b, rgba(225, 225, 230, 255));
            y += 28.0 * k;
        }
    }

    pub fn draw_menu(&mut self, ui: &mut Ui, w: f32, h: f32) {
        let k = Self::ui_scale(h as u32);
        if self.screen == Screen::Pause && self.controls_open {
            ui.rect(0.0, 0.0, w, h, rgba(0, 0, 0, 140));
            self.draw_controls(ui, w, h);
            for (name, r) in self.buttons(w, h) {
                let hot = self.mouse.0 >= r[0] && self.mouse.0 < r[0] + r[2] && self.mouse.1 >= r[1] && self.mouse.1 < r[1] + r[3];
                ui.rect(r[0], r[1], r[2], r[3], if hot { rgba(96, 150, 70, 255) } else { rgba(64, 64, 72, 245) });
                ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, rgba(0, 0, 0, 180));
                ui.centered(16.0 * k, w / 2.0, r[1] + r[3] / 2.0 + 6.0 * k, name, rgba(255, 255, 255, 255));
            }
            return;
        }
        let (tint, title, sub) = match self.screen {
            Screen::Dead => (rgba(120, 0, 0, 140), "Você morreu", "Seus itens ficaram onde você caiu"),
            _ => (rgba(0, 0, 0, 140), "Jogo pausado", "Os mundos são gravados no mesmo formato do jogo Java"),
        };
        ui.rect(0.0, 0.0, w, h, tint);
        ui.centered(30.0 * k, w / 2.0, h / 2.0 - 70.0 * k, title, rgba(245, 232, 205, 255));
        ui.centered(13.0 * k, w / 2.0, h / 2.0 - 40.0 * k, sub, rgba(220, 220, 225, 220));
        let mut bottom = h / 2.0;
        for (name, r) in self.buttons(w, h) {
            let hot = self.mouse.0 >= r[0] && self.mouse.0 < r[0] + r[2] && self.mouse.1 >= r[1] && self.mouse.1 < r[1] + r[3];
            ui.rect(r[0], r[1], r[2], r[3], if hot { rgba(96, 150, 70, 255) } else { rgba(64, 64, 72, 245) });
            ui.frame(r[0], r[1], r[2], r[3], 2.0 * k, rgba(0, 0, 0, 180));
            ui.centered(16.0 * k, w / 2.0, r[1] + r[3] / 2.0 + 6.0 * k, name, rgba(255, 255, 255, 255));
            bottom = r[1] + r[3];
        }
        // LAN: o IP para os amigos (anfitrião) ou de quem é o mundo (amigo)
        if self.screen == Screen::Pause {
            for (i, l) in self.lan_info().iter().enumerate() {
                let c = if i == 0 { rgba(170, 240, 150, 255) } else { rgba(230, 230, 235, 240) };
                ui.centered(if i == 0 { 16.0 } else { 14.0 } * k, w / 2.0, bottom + (34.0 + i as f32 * 24.0) * k, l, c);
            }
        }
    }

    /// Clique num botão da pausa ou da morte. Retorna o nome do botão clicado.
    pub fn menu_click(&self, w: f32, h: f32) -> Option<&'static str> {
        self.buttons(w, h)
            .into_iter()
            .find(|(_, r)| self.mouse.0 >= r[0] && self.mouse.0 < r[0] + r[2] && self.mouse.1 >= r[1] && self.mouse.1 < r[1] + r[3])
            .map(|(n, _)| n)
    }
}

