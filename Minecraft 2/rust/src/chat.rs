//! Chat da LAN (como o do Java): T ou Enter abre a caixa, Enter envia, Esc cancela. As mensagens ficam no
//! canto de baixo à esquerda e somem depois de 10 s (com a caixa aberta, as últimas 12 continuam visíveis).
//! Fotos (como o ChatImage.java): arraste um arquivo de imagem para a janela; ela é reduzida (maior lado 640)
//! e comprimida em JPEG, aparece aqui e vai para todos. As que chegam são conferidas antes de abrir.

use crate::net::{Out, CHAT, CHAT_IMAGE};
use crate::ui::{rgba, Color, Ui, PHOTO, PHOTO_SLOTS};
use crate::Game;
use std::path::PathBuf;
use std::sync::mpsc::Receiver;
use std::time::Instant;
use winit::keyboard::KeyCode;

pub const WHITE: Color = [1.0, 1.0, 1.0, 1.0];
const MINE: Color = [1.0, 1.0, 0.63, 1.0];
const GRAY: Color = [0.75, 0.75, 0.75, 1.0];
const RED: Color = [1.0, 0.59, 0.59, 1.0];
const MAX_INPUT: usize = 100;
/// tamanho máximo de uma foto pela rede, em bytes (o mesmo do Java)
const MAX_BYTES: usize = 1_500_000;
/// maior arquivo de origem aceito (fotos de celular têm uns 5 MB)
const MAX_FILE: u64 = 30 << 20;
/// maior imagem de origem, em pixels
const MAX_PIXELS: u64 = 60_000_000;

pub struct Line {
    text: String,
    color: Color,
    at: Instant,
    /// camada da textura de fotos, largura, altura e o número da foto (a camada é reaproveitada)
    photo: Option<(usize, u32, u32, u64)>,
}

#[derive(Default)]
pub struct Chat {
    pub open: bool,
    pub input: String,
    pub lines: Vec<Line>,
    /// fotos esperando para ir para a placa de vídeo
    pub pending: Vec<(usize, u32, u32, Vec<u8>)>,
    slot_ids: [u64; PHOTO_SLOTS],
    next_slot: usize,
    photo_seq: u64,
    sending: Option<Receiver<Result<Vec<u8>, String>>>,
    last_photo: Option<Instant>,
    /// Ctrl segurado (para o Ctrl+O)
    pub ctrl: bool,
    /// a janela do Windows de escolher arquivo está aberta (o jogo não pausa por perder o foco)
    pub picking: Option<Receiver<Result<String, String>>>,
}

/// Janela do Windows para escolher uma foto (a mesma do Java, pelo PowerShell). Devolve o caminho ou "" se cancelou.
fn pick_file() -> Result<String, String> {
    if !cfg!(windows) {
        return Err("escolher arquivo só funciona no Windows: arraste a foto para a janela do jogo".into());
    }
    let script = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; \
        Add-Type -AssemblyName System.Windows.Forms; \
        $o = New-Object System.Windows.Forms.Form; $o.TopMost = $true; \
        $f = New-Object System.Windows.Forms.OpenFileDialog; \
        $f.Title = 'Escolha uma foto para o chat'; \
        $f.Filter = 'Imagens|*.png;*.jpg;*.jpeg;*.gif;*.bmp|Todos os arquivos|*.*'; \
        if ($f.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.FileName) }";
    // caminho completo: o PATH de quem abriu o jogo pode não incluir a pasta do PowerShell
    let exe = std::env::var("SystemRoot")
        .or_else(|_| std::env::var("windir"))
        .map(|r| PathBuf::from(r).join("System32\\WindowsPowerShell\\v1.0\\powershell.exe"))
        .ok()
        .filter(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from("powershell"));
    let mut cmd = std::process::Command::new(exe);
    cmd.args(["-NoProfile", "-STA", "-NonInteractive", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // sem a janela preta do console
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).replace('\u{feff}', "").trim().to_string())
}

/// Foto que chegou pela rede: confere o tamanho antes de abrir (ninguém trava o jogo com uma imagem gigante).
fn decode_photo(data: &[u8]) -> Result<image::RgbaImage, String> {
    if data.is_empty() || data.len() > MAX_BYTES {
        return Err("foto com tamanho inválido".into());
    }
    let reader = image::io::Reader::new(std::io::Cursor::new(data)).with_guessed_format().map_err(|e| e.to_string())?;
    let (w, h) = reader.into_dimensions().map_err(|e| e.to_string())?;
    if w == 0 || h == 0 || w as u64 * h as u64 > 2_000_000 {
        return Err("foto grande demais".into());
    }
    let img = image::load_from_memory(data).map_err(|e| e.to_string())?.to_rgba8();
    Ok(if img.width() > PHOTO || img.height() > PHOTO { shrink_rgba(&img) } else { img })
}

fn fit(w: u32, h: u32) -> (u32, u32) {
    let k = (PHOTO as f64 / w.max(h) as f64).min(1.0);
    (((w as f64 * k).round() as u32).max(1), ((h as f64 * k).round() as u32).max(1))
}

fn shrink_rgba(img: &image::RgbaImage) -> image::RgbaImage {
    let (nw, nh) = fit(img.width(), img.height());
    image::imageops::resize(img, nw, nh, image::imageops::FilterType::Triangle)
}

/// Lê o arquivo (png, jpg, gif ou bmp), reduz (fundo branco onde era transparente) e devolve um JPEG pronto para a rede.
fn prepare_photo(path: &PathBuf) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(path).map_err(|_| "arquivo não encontrado".to_string())?;
    if !meta.is_file() {
        return Err("arquivo não encontrado".into());
    }
    if meta.len() > MAX_FILE {
        return Err("arquivo grande demais (máximo 30 MB)".into());
    }
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let bad = || "não é uma imagem que eu consiga abrir (use png, jpg, gif ou bmp)".to_string();
    let reader = image::io::Reader::new(std::io::Cursor::new(&data)).with_guessed_format().map_err(|_| bad())?;
    let (w, h) = reader.into_dimensions().map_err(|_| bad())?;
    if w == 0 || h == 0 || w as u64 * h as u64 > MAX_PIXELS {
        return Err("imagem grande demais".into());
    }
    let src = image::load_from_memory(&data).map_err(|_| bad())?.to_rgba8();
    let small = shrink_rgba(&src);
    let rgb = image::RgbImage::from_fn(small.width(), small.height(), |x, y| {
        let p = small.get_pixel(x, y).0;
        let a = p[3] as u32;
        let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
        image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])])
    });
    let mut best = Vec::new();
    for q in [85u8, 70, 50, 30] {
        best.clear();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut best, q).encode_image(&rgb).map_err(|e| e.to_string())?;
        if best.len() <= MAX_BYTES / 3 {
            break;
        }
    }
    Ok(best)
}

/// Quebra a mensagem em linhas que cabem na largura (de preferência num espaço).
fn wrap(ui: &Ui, px: f32, text: &str, width: f32) -> Vec<String> {
    let mut parts = Vec::new();
    let mut rest: Vec<char> = text.chars().collect();
    while !rest.is_empty() {
        let mut n = rest.len();
        while n > 1 && ui.text_width(px, &rest[..n].iter().collect::<String>()) > width {
            n -= 1;
        }
        if n < rest.len() {
            if let Some(sp) = rest[..n].iter().rposition(|&c| c == ' ') {
                if sp > n / 2 {
                    n = sp + 1;
                }
            }
        }
        parts.push(rest[..n].iter().collect());
        rest.drain(..n);
    }
    parts
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
        self.push_line(Line { text, color, at: Instant::now(), photo: None });
    }

    fn push_line(&mut self, l: Line) {
        self.chat.lines.push(l);
        if self.chat.lines.len() > 50 {
            self.chat.lines.remove(0);
        }
        crate::sound::play("clique", 0.4);
    }

    /// Mensagem com foto: a foto vai para uma camada livre da textura (a mais antiga é reaproveitada).
    fn add_photo_line(&mut self, text: String, color: Color, img: image::RgbaImage) {
        let c = &mut self.chat;
        let slot = c.next_slot;
        c.next_slot = (slot + 1) % PHOTO_SLOTS;
        c.photo_seq += 1;
        c.slot_ids[slot] = c.photo_seq;
        let (w, h) = (img.width(), img.height());
        c.pending.push((slot, w, h, img.into_raw()));
        let seq = c.photo_seq;
        self.push_line(Line { text, color, at: Instant::now(), photo: Some((slot, w, h, seq)) });
    }

    /// Foto que chegou pela rede. Devolve se era válida (o anfitrião só repassa as válidas).
    pub fn receive_photo(&mut self, from: &str, data: &[u8]) -> bool {
        match decode_photo(data) {
            Ok(img) => {
                self.add_photo_line(format!("<{from}> enviou uma foto:"), WHITE, img);
                true
            }
            Err(e) => {
                eprintln!("Foto recebida ilegível: {e}");
                false
            }
        }
    }

    /// Arquivo arrastado para a janela: prepara a foto em segundo plano e manda quando estiver pronta.
    pub fn send_photo(&mut self, path: PathBuf) {
        if let Some(t) = self.chat.last_photo {
            if t.elapsed().as_millis() < 1500 || self.chat.sending.is_some() {
                self.add_chat("(espere um instante antes de mandar outra foto)".into(), GRAY);
                return;
            }
        }
        self.chat.last_photo = Some(Instant::now());
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        self.add_chat(format!("Preparando a foto {name}..."), GRAY);
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(prepare_photo(&path));
        });
        self.chat.sending = Some(rx);
    }

    /// Ctrl+O no chat: abre a janela de escolher arquivo (o jogo continua rodando por trás).
    pub fn pick_photo(&mut self) {
        if self.chat.picking.is_some() {
            return;
        }
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(pick_file());
        });
        self.chat.picking = Some(rx);
    }

    /// A foto que estava sendo preparada ficou pronta? Aparece aqui (a mesma imagem que os amigos vão ver) e vai pela rede.
    pub fn poll_photo(&mut self) {
        if let Some(rx) = &self.chat.picking {
            match rx.try_recv() {
                Ok(Ok(p)) => {
                    self.chat.picking = None;
                    if !p.is_empty() {
                        self.send_photo(PathBuf::from(p));
                    }
                }
                Ok(Err(e)) => {
                    self.chat.picking = None;
                    self.add_chat(format!("Não consegui abrir a janela de escolher arquivo: {e}"), RED);
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
                Err(_) => self.chat.picking = None,
            }
        }
        let Some(rx) = &self.chat.sending else { return };
        let r = match rx.try_recv() {
            Ok(r) => r,
            Err(std::sync::mpsc::TryRecvError::Empty) => return,
            Err(_) => Err("a preparação parou no meio".into()),
        };
        self.chat.sending = None;
        let jpg = match r.and_then(|j| decode_photo(&j).map(|img| (j, img))) {
            Ok(v) => v,
            Err(e) => {
                self.add_chat(format!("Não consegui mandar a foto: {e}"), RED);
                return;
            }
        };
        let me = if self.player_name.is_empty() { "Eu".to_string() } else { self.player_name.clone() };
        self.add_photo_line(format!("<{me}> enviou uma foto:"), MINE, jpg.1);
        match &self.net {
            Some(n) => n.send(Out::new(CHAT_IMAGE).s(&me).raw(&jpg.0), None),
            None => self.add_chat("(você está sozinho: abra o mundo para LAN no menu de pausa para os amigos verem)".into(), GRAY),
        }
    }

    /// Tecla com a caixa aberta (inclusive as repetidas, para o Backspace segurado).
    pub fn chat_key(&mut self, code: KeyCode, text: Option<&str>) {
        if code == KeyCode::KeyO && self.chat.ctrl {
            self.pick_photo();
            return;
        }
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
                ui.text(px, x + 6.0 * k, y + 17.0 * k, "   Enter envia   Ctrl+O escolhe uma foto (ou arraste o arquivo para a janela)   Esc cancela", [1.0, 1.0, 1.0, 0.43]);
            }
        }
        let top = 175.0 * k; // não invade a caixa de informações lá em cima
        let mut by = y - 6.0 * k;
        let max = if self.chat.open { 12 } else { 8 };
        'lines: for l in self.chat.lines.iter().rev().take(max) {
            let age = l.at.elapsed().as_secs_f32();
            let alpha = if self.chat.open { 1.0 } else if age < 8.0 { 1.0 } else if age < 10.0 { (10.0 - age) / 2.0 } else { 0.0 };
            if alpha <= 0.0 {
                break;
            }
            // a foto, se ainda estiver guardada, fica embaixo do texto da mensagem
            if let Some((slot, iw, ih, seq)) = l.photo {
                if self.chat.slot_ids[slot] == seq {
                    let s = ((bw - 12.0 * k) / iw as f32).min(190.0 * k / ih as f32).min(k);
                    let (dw, dh) = ((iw as f32 * s).max(1.0), (ih as f32 * s).max(1.0));
                    if by - dh - lh < top {
                        break;
                    }
                    by -= dh + 6.0 * k;
                    ui.rect(x, by - 3.0 * k, dw + 12.0 * k, dh + 6.0 * k, [0.0, 0.0, 0.0, 0.59 * alpha]);
                    ui.photo(slot, iw, ih, x + 6.0 * k, by, dw, dh, alpha);
                }
            }
            let parts = wrap(ui, px, &l.text, bw - 12.0 * k);
            for p in parts.iter().rev() {
                if by - lh < top {
                    break 'lines;
                }
                ui.rect(x, by - lh, bw, lh, [0.0, 0.0, 0.0, 0.47 * alpha]);
                ui.shadow(px, x + 6.0 * k, by - 5.0 * k, p, [l.color[0], l.color[1], l.color[2], alpha]);
                by -= lh;
            }
        }
    }
}
