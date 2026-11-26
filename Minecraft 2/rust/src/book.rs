//! Livro de receitas (como o do Java): um botão de livro na grade de criação abre um painel ao lado com todas
//! as receitas. Passar o mouse mostra o desenho na grade; clicar monta a receita com os itens da mochila.

use crate::inventory::{Stack, SIZE};
use crate::items::{self, Recipe};
use crate::screens::{bevel, slot_box, stone_panel, stone_title};
use crate::ui::{rgba, Ui};
use crate::Game;

const COLS: usize = 5;

#[derive(Default)]
pub struct Book {
    pub open: bool,
    /// mostrar só o que dá para fazer agora
    pub only_ready: bool,
    pub scroll: usize,
}

/// Precisa da grade 3x3?
fn needs_table(r: &Recipe) -> bool {
    if r.shapeless { r.cells.len() > 4 } else { r.w > 2 || r.h > 2 }
}

/// Os itens que servem para o ingrediente (tábuas de bétula e de cerejeira valem como as comuns, menos nas
/// peças de madeira).
fn variants(r: &Recipe, item: i32) -> Vec<i32> {
    if item == 8 && !r.wood_piece { vec![8, 171, 425] } else { vec![item] }
}

/// O que a receita gasta: (item, quantidade), na ordem em que aparecem.
pub fn ingredients(r: &Recipe) -> Vec<(i32, i32)> {
    let mut v: Vec<(i32, i32)> = Vec::new();
    for &c in r.cells.iter().filter(|&&c| c != 0) {
        match v.iter_mut().find(|e| e.0 == c) {
            Some(e) => e.1 += 1,
            None => v.push((c, 1)),
        }
    }
    v
}

fn describe(r: &Recipe) -> String {
    ingredients(r).iter().map(|(i, n)| format!("{n} {}", items::name(*i))).collect::<Vec<_>>().join(" + ")
}

/// Quantas vezes dá para fazer a receita com o que há nos espaços dados.
pub fn times_craftable(r: &Recipe, slots: &[Stack]) -> i32 {
    ingredients(r)
        .iter()
        .map(|&(item, need)| {
            let ids = variants(r, item);
            slots.iter().filter(|s| !s.empty() && ids.contains(&s.id)).map(|s| s.count).sum::<i32>() / need
        })
        .min()
        .unwrap_or(0)
}

fn inside(m: (f32, f32), r: [f32; 4]) -> bool {
    m.0 >= r[0] && m.0 < r[0] + r[2] && m.1 >= r[1] && m.1 < r[1] + r[3]
}

/// Onde ficam as partes do painel do livro.
struct Layout {
    panel: [f32; 4],
    filter: [f32; 4],
    /// (posição na lista, retângulo)
    cells: Vec<(usize, [f32; 4])>,
    rows: usize,
}

impl Game {
    /// A grade de criação está na tela? (não na paleta do criativo, no baú ou na fornalha)
    pub fn crafting_shown(&self) -> bool {
        self.open.is_none() && (!self.creative || self.at_table)
    }

    /// Quanto o painel principal anda para a esquerda para o livro caber ao lado.
    pub fn book_shift(&self, k: f32) -> f32 {
        if self.book.open && self.crafting_shown() { (COLS as f32 * 48.0 * k + 32.0 * k + 14.0 * k) / 2.0 } else { 0.0 }
    }

    /// O botão do livro, no canto de baixo à direita da área de criação.
    fn book_button(&self, w: f32, h: f32) -> Option<[f32; 4]> {
        if !self.crafting_shown() {
            return None;
        }
        let k = Self::ui_scale(h as u32);
        let (p, slots, s) = self.inv_layout(w, h);
        // alinhado com a última coluna e a última linha de armadura
        let armor_y = slots.iter().find(|q| q.0 == crate::screens::SlotRef::Inv(SIZE + 3))?.2;
        Some([p[0] + 18.0 * k + 8.0 * 48.0 * k, armor_y, s, s])
    }

    /// 3 dá para fazer nesta grade; 2 cabe na grade mas faltam itens; 1 tem os itens mas precisa da bancada; 0 nada.
    fn rank(&self, r: &Recipe) -> i32 {
        let fits = !needs_table(r) || self.at_table;
        let has = self.creative || times_craftable(r, &self.available()) > 0;
        match (fits, has) {
            (true, true) => 3,
            (true, false) => 2,
            (false, true) => 1,
            (false, false) => 0,
        }
    }

    /// O que dá para usar: a mochila, a barra e o que já está na grade.
    fn available(&self) -> Vec<Stack> {
        self.inv.s[..SIZE].iter().chain(self.craft.iter()).copied().collect()
    }

    fn book_list(&self) -> Vec<&'static Recipe> {
        let mut list: Vec<(i32, &'static Recipe)> = items::tables().recipes.iter().map(|r| (self.rank(r), r)).filter(|(k, _)| !self.book.only_ready || *k == 3).collect();
        list.sort_by_key(|e| -e.0);
        list.into_iter().map(|e| e.1).collect()
    }

    fn book_layout(&self, w: f32, h: f32, total: usize) -> Layout {
        let k = Self::ui_scale(h as u32);
        let (p, _, s) = self.inv_layout(w, h);
        let pitch = 48.0 * k;
        let panel = [p[0] + p[2] + 14.0 * k, p[1], COLS as f32 * pitch + 32.0 * k, p[3]];
        let filter = [panel[0] + 18.0 * k, panel[1] + 52.0 * k, panel[2] - 36.0 * k, 22.0 * k];
        let top = panel[1] + 84.0 * k;
        let rows = (((panel[1] + panel[3] - 46.0 * k - top) / pitch).floor() as usize).max(1);
        let scroll = self.book.scroll.min(total.div_ceil(COLS).saturating_sub(rows));
        let x0 = panel[0] + (panel[2] - (COLS as f32 * pitch - 4.0 * k)) / 2.0;
        let cells = (scroll * COLS..total.min((scroll + rows) * COLS))
            .map(|i| (i, [x0 + (i % COLS) as f32 * pitch, top + (i / COLS - scroll) as f32 * pitch, s, s]))
            .collect();
        Layout { panel, filter, cells, rows }
    }

    /// Desenha o botão do livro e, se aberto, o painel. Devolve a receita embaixo do mouse.
    pub fn draw_book(&mut self, ui: &mut Ui, w: f32, h: f32) -> Option<&'static Recipe> {
        let button = self.book_button(w, h)?;
        let k = Self::ui_scale(h as u32);
        let mouse = self.mouse;
        let hot = inside(mouse, button);
        slot_box(ui, button[0], button[1], button[2], hot, k);
        if self.book.open {
            ui.frame(button[0] - 2.0 * k, button[1] - 2.0 * k, button[2] + 4.0 * k, button[3] + 4.0 * k, 2.0 * k, rgba(232, 190, 90, 255));
        }
        book_icon(ui, button[0], button[1], button[2], self.book.open);
        if !self.book.open {
            if hot {
                tooltip(ui, mouse, k, w, &["Abrir o livro de receitas".to_string()]);
            }
            return None;
        }
        let list = self.book_list();
        let l = self.book_layout(w, h, list.len());
        let p = l.panel;
        stone_panel(ui, p[0], p[1], p[2], p[3], k);
        stone_title(ui, "Receitas", p[0] + p[2] / 2.0, p[1] + 34.0 * k, p[2] - 40.0 * k, k);
        let f = l.filter;
        slot_box(ui, f[0], f[1] + k, 20.0 * k, inside(mouse, f), k);
        if self.book.only_ready {
            ui.rect(f[0] + 5.0 * k, f[1] + 6.0 * k, 10.0 * k, 10.0 * k, rgba(232, 190, 90, 255));
        }
        ui.shadow(11.0 * k, f[0] + 28.0 * k, f[1] + 15.0 * k, "Só o que dá para fazer agora", rgba(226, 212, 188, 255));
        let mut hovered = None;
        for &(i, c) in &l.cells {
            let r = list[i];
            let rank = self.rank(r);
            let on = inside(mouse, c);
            slot_box(ui, c[0], c[1], c[2], on, k);
            let tint = match rank {
                3 => rgba(90, 200, 90, 70),
                0 => rgba(200, 50, 40, 60),
                _ => rgba(0, 0, 0, 0),
            };
            ui.rect(c[0] + 2.0 * k, c[1] + 2.0 * k, c[2] - 4.0 * k, c[3] - 4.0 * k, tint);
            ui.item(Stack::new(r.out, r.count, 0), c[0] + 4.0 * k, c[1] + 4.0 * k, c[2] - 8.0 * k, k);
            if rank < 2 {
                ui.rect(c[0] + 2.0 * k, c[1] + 2.0 * k, c[2] - 4.0 * k, c[3] - 4.0 * k, rgba(30, 28, 32, 150));
            }
            if on {
                hovered = Some(r);
            }
        }
        if list.is_empty() {
            ui.centered(12.0 * k, p[0] + p[2] / 2.0, p[1] + 150.0 * k, "Nada por enquanto", rgba(170, 158, 140, 255));
        }
        let total = list.len().div_ceil(COLS);
        let first = self.book.scroll.min(total.saturating_sub(l.rows));
        let dim = rgba(170, 158, 140, 255);
        ui.centered(11.0 * k, p[0] + p[2] / 2.0, p[1] + p[3] - 30.0 * k, "Clique: monta na grade (Shift: o máximo)", dim);
        ui.centered(11.0 * k, p[0] + p[2] / 2.0, p[1] + p[3] - 14.0 * k, &format!("Rodinha: linhas {}-{} de {total}", (first + 1).min(total), (first + l.rows).min(total)), dim);
        hovered
    }

    /// O texto da receita embaixo do mouse (desenhado por cima de tudo).
    pub fn draw_book_tooltip(&self, ui: &mut Ui, w: f32, h: f32, r: &Recipe) {
        let k = Self::ui_scale(h as u32);
        let mut lines = vec![format!("{} {}", r.count, items::name(r.out)), describe(r)];
        if needs_table(r) && !self.at_table {
            lines.push("Precisa da bancada (3x3)".to_string());
        }
        tooltip(ui, self.mouse, k, w, &lines);
    }

    /// Desenho "fantasma" da receita dentro da grade vazia.
    pub fn draw_ghost(&self, ui: &mut Ui, k: f32, slots: &[(crate::screens::SlotRef, f32, f32)], s: f32, r: &Recipe) {
        let n = if self.at_table { 3 } else { 2 };
        if self.craft.iter().any(|c| !c.empty()) || (needs_table(r) && n < 3) {
            return;
        }
        for (i, &item) in r.cells.iter().enumerate() {
            if item == 0 {
                continue;
            }
            let (x, y) = if r.shapeless { (i % n, i / n) } else { (i % r.w, i / r.w) };
            if let Some(&(_, sx, sy)) = slots.iter().find(|q| q.0 == crate::screens::SlotRef::Craft(y * 3 + x)) {
                ui.item(Stack::new(item, 1, 0), sx + 4.0 * k, sy + 4.0 * k, s - 8.0 * k, k);
                ui.rect(sx + 2.0 * k, sy + 2.0 * k, s - 4.0 * k, s - 4.0 * k, rgba(42, 39, 44, 150));
            }
        }
    }

    /// Cliques no botão e no painel do livro. Retorna true se o clique era do livro.
    pub fn book_click(&mut self, w: f32, h: f32, mx: f32, my: f32, shift: bool) -> bool {
        let Some(button) = self.book_button(w, h) else { return false };
        if inside((mx, my), button) {
            self.book.open = !self.book.open;
            crate::sound::play("clique", 0.4);
            return true;
        }
        if !self.book.open {
            return false;
        }
        let list = self.book_list();
        let l = self.book_layout(w, h, list.len());
        if !inside((mx, my), l.panel) {
            return false;
        }
        if inside((mx, my), l.filter) {
            self.book.only_ready = !self.book.only_ready;
            self.book.scroll = 0;
            crate::sound::play("clique", 0.4);
        } else if let Some(&(i, _)) = l.cells.iter().find(|c| inside((mx, my), c.1)) {
            self.fill_grid(list[i], shift);
        }
        true // clicar no painel não joga fora o que está no mouse
    }

    /// Rodinha em cima do livro. Retorna true se era do livro.
    pub fn book_wheel(&mut self, w: f32, h: f32, up: bool) -> bool {
        if !self.book.open || !self.crafting_shown() {
            return false;
        }
        let list = self.book_list();
        let l = self.book_layout(w, h, list.len());
        if !inside(self.mouse, l.panel) {
            return false;
        }
        let max = list.len().div_ceil(COLS).saturating_sub(l.rows);
        self.book.scroll = if up { self.book.scroll.min(max).saturating_sub(1) } else { (self.book.scroll + 1).min(max) };
        true
    }

    /// Monta a receita na grade: o que estava nela volta para a mochila. No criativo os itens são de graça.
    pub fn fill_grid(&mut self, r: &'static Recipe, all: bool) {
        let n = if self.at_table { 3 } else { 2 };
        if needs_table(r) && n < 3 {
            self.notice("Essa receita precisa da grade 3x3 da bancada".into());
            return;
        }
        for i in 0..9 {
            let st = std::mem::take(&mut self.craft[i]);
            if !st.empty() && !self.creative {
                let rest = self.inv.add(st.id, st.count, st.wear);
                if rest > 0 {
                    self.throw_stack(Stack::new(st.id, rest, st.wear));
                }
            }
        }
        let times = if self.creative { 64 } else { times_craftable(r, &self.inv.s[..SIZE]) };
        if times < 1 {
            self.notice(format!("Faltam itens: {}", describe(r)));
            return;
        }
        let sets = if all { times.min(64) } else { 1 };
        for (k, &item) in r.cells.iter().enumerate() {
            if item == 0 {
                continue;
            }
            let cell = if r.shapeless { (k / n) * 3 + k % n } else { (k / r.w) * 3 + k % r.w };
            let want = sets.min(items::max_stack(item));
            if self.creative {
                self.craft[cell] = Stack::new(item, want, 0);
                continue;
            }
            // entre as variantes (tábuas), usa a que a mochila tem mais
            let have = |id: i32| self.inv.s[..SIZE].iter().filter(|s| s.id == id).map(|s| s.count).sum::<i32>();
            let id = variants(r, item).into_iter().max_by_key(|&id| have(id)).unwrap_or(item);
            let mut left = want.min(have(id));
            let got = left;
            for s in self.inv.s[..SIZE].iter_mut().filter(|s| s.id == id) {
                let take = left.min(s.count);
                if take > 0 {
                    left -= take;
                    *s = Stack::new(s.id, s.count - take, s.wear);
                }
            }
            if got > 0 {
                self.craft[cell] = Stack::new(id, got, 0);
            }
        }
        crate::sound::play("clique", 0.4);
    }
}

/// O livrinho verde (Ui.bookIcon do Java); aberto fica mais claro.
fn book_icon(ui: &mut Ui, x: f32, y: f32, s: f32, open: bool) {
    let u = s / 44.0;
    let r = |ui: &mut Ui, x0: f32, y0: f32, w: f32, h: f32, c: crate::ui::Color| ui.rect(x + x0 * u, y + y0 * u, w * u, h * u, c);
    r(ui, 9.0, 11.0, 26.0, 25.0, rgba(20, 40, 20, 255));
    r(ui, 9.0, 9.0, 23.0, 23.0, if open { rgba(90, 170, 80, 255) } else { rgba(60, 130, 55, 255) });
    r(ui, 12.0, 29.0, 20.0, 4.0, rgba(235, 228, 205, 255)); // as páginas
    r(ui, 13.0, 11.0, 2.5, 18.0, rgba(30, 70, 30, 255)); // a lombada
    r(ui, 19.0, 14.0, 10.0, 2.5, rgba(170, 230, 150, 255));
    r(ui, 19.0, 20.0, 7.0, 2.5, rgba(170, 230, 150, 255));
}

/// Caixinha de texto ao lado do mouse, sem sair da tela pela direita.
fn tooltip(ui: &mut Ui, mouse: (f32, f32), k: f32, screen_w: f32, lines: &[String]) {
    let px = 13.0 * k;
    let width = lines.iter().map(|l| ui.text_width(px, l)).fold(0.0, f32::max) + 14.0 * k;
    let height = lines.len() as f32 * 18.0 * k + 6.0 * k;
    let tx = (mouse.0 + 14.0 * k).min(screen_w - width - 4.0).max(4.0);
    let ty = mouse.1 + 18.0 * k;
    ui.rect(tx, ty, width, height, rgba(16, 10, 24, 240));
    bevel(ui, tx, ty, width, height, true, k);
    ui.frame(tx, ty, width, height, k, rgba(90, 40, 160, 255));
    for (i, l) in lines.iter().enumerate() {
        let c = if i == 0 { rgba(255, 255, 255, 255) } else { rgba(200, 192, 215, 255) };
        ui.shadow(px, tx + 7.0 * k, ty + 16.0 * k + i as f32 * 18.0 * k, l, c);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recipe(out: i32) -> &'static Recipe {
        items::tables().recipes.iter().find(|r| r.out == out).unwrap()
    }

    #[test]
    fn conta_quantas_vezes_da_para_fazer() {
        // bancada: 4 tábuas, valendo as de bétula e as de cerejeira misturadas
        let bancada = recipe(20);
        assert_eq!(ingredients(bancada), vec![(8, 4)]);
        let slots = [Stack::new(8, 3, 0), Stack::new(171, 4, 0), Stack::new(425, 2, 0)];
        assert_eq!(times_craftable(bancada, &slots), 2);
        assert_eq!(times_craftable(bancada, &slots[..1]), 0);
        // graveto precisa de 2 tábuas
        assert_eq!(times_craftable(recipe(200), &slots), 4);
    }

    #[test]
    fn picareta_so_cabe_na_bancada() {
        assert!(needs_table(recipe(217)));
        assert!(!needs_table(recipe(20)) && !needs_table(recipe(200)));
    }
}
