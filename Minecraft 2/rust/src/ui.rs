//! Desenho 2D (barra, inventário, menus, textos) e dos itens soltos no mundo, num só lote por quadro.
//! Uma textura "atlas" junta as letras (Arial negrito, como o Java no Windows) e os desenhos dos itens
//! (itens.png, exportados do Java); os blocos usam as próprias texturas do mundo, como cubinhos isométricos.

use crate::block::{self, AIR, CROSS};
use crate::items;
use glow::HasContext;
use std::collections::HashMap;

const ATLAS: u32 = 1024;
const ITEMS_Y: u32 = 960; // onde ficam os desenhos dos itens no atlas
const SIZES: [u32; 5] = [11, 13, 16, 20, 30];

#[derive(Clone, Copy)]
struct Glyph {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    xmin: f32,
    ymin: f32,
    adv: f32,
}

pub type Color = [f32; 4];

pub fn rgba(r: u8, g: u8, b: u8, a: u8) -> Color {
    [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0, a as f32 / 255.0]
}

pub struct Ui {
    prog: glow::Program,
    vao: glow::VertexArray,
    vbo: glow::Buffer,
    atlas: glow::Texture,
    glyphs: HashMap<(u32, char), Glyph>,
    has_font: bool,
    /// x, y, z, u, v, camada (-1 = atlas), r, g, b, a
    verts: Vec<f32>,
}

const VS: &str = r#"#version 330 core
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLayer;
layout(location=3) in vec4 aColor;
uniform mat4 uMat;
out vec2 vUV; out float vLayer; out vec4 vColor;
void main(){ vUV = aUV; vLayer = aLayer; vColor = aColor; gl_Position = uMat * vec4(aPos, 1.0); }
"#;
const FS: &str = r#"#version 330 core
in vec2 vUV; in float vLayer; in vec4 vColor;
uniform sampler2D uAtlas; uniform sampler2DArray uBlocks;
out vec4 frag;
void main(){
  vec4 t = vLayer < 0.0 ? texture(uAtlas, vUV) : texture(uBlocks, vec3(vUV, vLayer));
  frag = t * vColor;
  if (frag.a < 0.01) discard;
}
"#;

impl Ui {
    pub unsafe fn new(gl: &glow::Context) -> Ui {
        let prog = crate::compile(gl, VS, FS);
        let vao = gl.create_vertex_array().unwrap();
        let vbo = gl.create_buffer().unwrap();
        gl.bind_vertex_array(Some(vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(vbo));
        let stride = 10 * 4;
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(0, 3, glow::FLOAT, false, stride, 0);
        gl.enable_vertex_attrib_array(1);
        gl.vertex_attrib_pointer_f32(1, 2, glow::FLOAT, false, stride, 12);
        gl.enable_vertex_attrib_array(2);
        gl.vertex_attrib_pointer_f32(2, 1, glow::FLOAT, false, stride, 20);
        gl.enable_vertex_attrib_array(3);
        gl.vertex_attrib_pointer_f32(3, 4, glow::FLOAT, false, stride, 24);
        gl.bind_vertex_array(None);

        // atlas: um quadradinho branco (para os retângulos), as letras e os itens
        let mut px = vec![0u8; (ATLAS * ATLAS * 4) as usize];
        for y in 0..4 {
            for x in 0..4 {
                let i = ((y * ATLAS + x) * 4) as usize;
                px[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
            }
        }
        let mut glyphs = HashMap::new();
        let font = ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arial.ttf"]
            .iter()
            .find_map(|p| std::fs::read(p).ok())
            .and_then(|d| fontdue::Font::from_bytes(d, fontdue::FontSettings::default()).ok());
        let has_font = font.is_some();
        if let Some(font) = &font {
            let chars: Vec<char> = (32u32..127).chain(160..256).filter_map(char::from_u32).chain(['—', '…', '•', '→', '←']).collect();
            let (mut cx, mut cy, mut row) = (8u32, 0u32, 0u32);
            for &size in &SIZES {
                for &ch in &chars {
                    let (m, bmp) = font.rasterize(ch, size as f32);
                    let (w, h) = (m.width as u32, m.height as u32);
                    if cx + w + 1 >= ATLAS {
                        cx = 0;
                        cy += row + 1;
                        row = 0;
                    }
                    if cy + h >= ITEMS_Y {
                        break; // não cabe mais nada (não deve acontecer com estes tamanhos)
                    }
                    for yy in 0..h {
                        for xx in 0..w {
                            let a = bmp[(yy * w + xx) as usize];
                            let i = (((cy + yy) * ATLAS + cx + xx) * 4) as usize;
                            px[i..i + 4].copy_from_slice(&[255, 255, 255, a]);
                        }
                    }
                    glyphs.insert((size, ch), Glyph { x: cx, y: cy, w, h, xmin: m.xmin as f32, ymin: m.ymin as f32, adv: m.advance_width });
                    cx += w + 1;
                    row = row.max(h);
                }
            }
        }
        if let Ok(img) = image::load_from_memory(include_bytes!("../dados/itens.png")) {
            let img = img.to_rgba8();
            for y in 0..img.height().min(ATLAS - ITEMS_Y) {
                for x in 0..img.width().min(ATLAS) {
                    let i = (((ITEMS_Y + y) * ATLAS + x) * 4) as usize;
                    px[i..i + 4].copy_from_slice(&img.get_pixel(x, y).0);
                }
            }
        }
        let atlas = gl.create_texture().unwrap();
        gl.bind_texture(glow::TEXTURE_2D, Some(atlas));
        gl.tex_image_2d(glow::TEXTURE_2D, 0, glow::RGBA8 as i32, ATLAS as i32, ATLAS as i32, 0, glow::RGBA, glow::UNSIGNED_BYTE, Some(&px));
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MIN_FILTER, glow::NEAREST as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MAG_FILTER, glow::NEAREST as i32);
        Ui { prog, vao, vbo, atlas, glyphs, has_font, verts: Vec::with_capacity(1 << 16) }
    }

    // ------------------------------------------------------------------ primitivas
    #[allow(clippy::too_many_arguments)]
    fn vert(&mut self, x: f32, y: f32, z: f32, u: f32, v: f32, layer: f32, c: Color) {
        self.verts.extend_from_slice(&[x, y, z, u, v, layer, c[0], c[1], c[2], c[3]]);
    }

    /// Quadrilátero qualquer (4 cantos em ordem), com coordenadas de textura.
    pub fn quad(&mut self, p: [[f32; 3]; 4], uv: [[f32; 2]; 4], layer: f32, c: Color) {
        for i in [0, 1, 2, 0, 2, 3] {
            self.vert(p[i][0], p[i][1], p[i][2], uv[i][0], uv[i][1], layer, c);
        }
    }

    fn quad2(&mut self, x0: f32, y0: f32, x1: f32, y1: f32, uv: [f32; 4], layer: f32, c: Color) {
        self.quad(
            [[x0, y0, 0.0], [x1, y0, 0.0], [x1, y1, 0.0], [x0, y1, 0.0]],
            [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]],
            layer,
            c,
        );
    }

    /// Quadrilátero de uma cor só (em 3D: as criaturas e as flechas).
    pub fn solid_quad(&mut self, p: [[f32; 3]; 4], c: Color) {
        let t = 2.0 / ATLAS as f32;
        self.quad(p, [[t, t]; 4], -1.0, c);
    }

    pub fn rect(&mut self, x: f32, y: f32, w: f32, h: f32, c: Color) {
        let t = 2.0 / ATLAS as f32;
        self.quad2(x, y, x + w, y + h, [t, t, t, t], -1.0, c);
    }

    /// Moldura (só as bordas).
    pub fn frame(&mut self, x: f32, y: f32, w: f32, h: f32, t: f32, c: Color) {
        self.rect(x, y, w, t, c);
        self.rect(x, y + h - t, w, t, c);
        self.rect(x, y + t, t, h - 2.0 * t, c);
        self.rect(x + w - t, y + t, t, h - 2.0 * t, c);
    }

    fn size_for(px: f32) -> u32 {
        *SIZES.iter().min_by_key(|&&s| ((s as f32 - px).abs() * 10.0) as i32).unwrap()
    }

    pub fn text_width(&self, px: f32, s: &str) -> f32 {
        let size = Self::size_for(px);
        let k = px / size as f32;
        s.chars().map(|c| self.glyphs.get(&(size, c)).or_else(|| self.glyphs.get(&(size, '?'))).map_or(0.0, |g| g.adv)).sum::<f32>() * k
    }

    /// Texto com a linha de base em y.
    pub fn text(&mut self, px: f32, x: f32, y: f32, s: &str, c: Color) {
        if !self.has_font {
            return;
        }
        let size = Self::size_for(px);
        let k = px / size as f32;
        let mut pen = x;
        let a = ATLAS as f32;
        for ch in s.chars() {
            let Some(g) = self.glyphs.get(&(size, ch)).or_else(|| self.glyphs.get(&(size, '?'))).copied() else { continue };
            if g.w > 0 {
                let gx = (pen + g.xmin * k).round();
                let gy = (y - (g.ymin + g.h as f32) * k).round();
                self.quad2(gx, gy, gx + g.w as f32 * k, gy + g.h as f32 * k, [g.x as f32 / a, g.y as f32 / a, (g.x + g.w) as f32 / a, (g.y + g.h) as f32 / a], -1.0, c);
            }
            pen += g.adv * k;
        }
    }

    /// Texto com sombra (como o Ui.shadow do Java).
    pub fn shadow(&mut self, px: f32, x: f32, y: f32, s: &str, c: Color) {
        let o = (px / 13.0).max(1.0).round();
        self.text(px, x + o, y + o, s, [0.0, 0.0, 0.0, 0.7 * c[3]]);
        self.text(px, x, y, s, c);
    }

    pub fn centered(&mut self, px: f32, cx: f32, y: f32, s: &str, c: Color) {
        let w = self.text_width(px, s);
        self.shadow(px, cx - w / 2.0, y, s, c);
    }

    /// Caixa escura de informações (Ui.hudBox do Java).
    pub fn hud_box(&mut self, x: f32, y: f32, w: f32, h: f32, k: f32) {
        self.rect(x, y, w, h, rgba(12, 12, 16, 165));
        self.frame(x, y, w, h, k.max(1.0), rgba(255, 255, 255, 28));
    }

    // ------------------------------------------------------------------ ícones
    /// Ícone de um item: blocos viram cubinhos isométricos com as texturas do mundo; plantas e tochas, a
    /// figura plana; os outros itens usam o desenho exportado do Java.
    pub fn icon(&mut self, id: i32, x: f32, y: f32, s: f32) {
        let b = block::block_of_item(id);
        if b != AIR {
            let info = block::info(b);
            let tex = block::texture(b) as f32;
            if block::shape(b) == CROSS {
                self.quad2(x, y, x + s, y + s, [0.0, 0.0, 1.0, 1.0], tex * 6.0 + 4.0, [1.0; 4]);
                return;
            }
            if info.kind == block::K_DOOR {
                // porta: as duas metades da textura, uma em cima da outra
                let (lo, up) = (if info.mat == 1 { 214.0 } else { 108.0 }, if info.mat == 1 { 215.0 } else { 109.0 });
                let (x0, x1) = (x + s * 0.25, x + s * 0.75);
                self.quad2(x0, y, x1, y + s / 2.0, [0.0, 0.0, 1.0, 1.0], up * 6.0 + 4.0, [1.0; 4]);
                self.quad2(x0, y + s / 2.0, x1, y + s, [0.0, 0.0, 1.0, 1.0], lo * 6.0 + 4.0, [1.0; 4]);
                return;
            }
            // altura do cubinho: lajes e camas ficam mais baixas
            let mut top = 0.0f32;
            if !info.boxes.is_empty() && info.kind != block::K_STAIR {
                let hmax = info.boxes.iter().map(|(c, _)| c[4]).fold(0.0f32, f32::max);
                top = 1.0 - hmax;
            }
            let (cx, w) = (x + s / 2.0, s * 0.92);
            let y0 = y + s * 0.04 + top * w / 2.0;
            let t = [cx, y0];
            let ur = [cx + w / 2.0, y0 + w / 4.0];
            let c = [cx, y0 + w / 2.0];
            let ul = [cx - w / 2.0, y0 + w / 4.0];
            let yb = y + s * 0.04 + w;
            let ll = [cx - w / 2.0, yb - w / 4.0];
            let bt = [cx, yb];
            let lr = [cx + w / 2.0, yb - w / 4.0];
            let p = |a: [f32; 2]| [a[0], a[1], 0.0];
            let full = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
            let vt = 1.0 - top; // o lado mostra só a parte de baixo da textura
            let side = [[0.0, 1.0 - vt], [1.0, 1.0 - vt], [1.0, 1.0], [0.0, 1.0]];
            self.quad([p(t), p(ur), p(c), p(ul)], full, tex * 6.0 + 2.0, [1.0, 1.0, 1.0, 1.0]);
            self.quad([p(ul), p(c), p(bt), p(ll)], side, tex * 6.0 + 4.0, [0.8, 0.8, 0.8, 1.0]);
            self.quad([p(c), p(ur), p(lr), p(bt)], side, tex * 6.0, [0.62, 0.62, 0.62, 1.0]);
            return;
        }
        if let Some(i) = items::info(id) {
            let (col, row) = ((i.icon % 32) as f32, (i.icon / 32) as f32);
            let a = ATLAS as f32;
            let (u0, v0) = (col * 16.0 / a, (ITEMS_Y as f32 + row * 16.0) / a);
            self.quad2(x, y, x + s, y + s, [u0, v0, u0 + 16.0 / a, v0 + 16.0 / a], -1.0, [1.0; 4]);
        }
    }

    /// Ícone com quantidade e barra de desgaste (como o drawItem do Java).
    pub fn item(&mut self, st: crate::inventory::Stack, x: f32, y: f32, s: f32, k: f32) {
        if st.empty() {
            return;
        }
        self.icon(st.id, x, y, s);
        if st.count > 1 {
            let t = st.count.to_string();
            let w = self.text_width(13.0 * k, &t);
            self.shadow(13.0 * k, x + s - w + 2.0 * k, y + s + 1.0 * k, &t, [1.0; 4]);
        }
        let max = items::durability(st.id);
        if max > 0 && st.wear > 0 {
            let f = (1.0 - st.wear as f32 / max as f32).clamp(0.0, 1.0);
            self.rect(x + 2.0 * k, y + s - 3.0 * k, s - 4.0 * k, 3.0 * k, rgba(0, 0, 0, 200));
            let c = [1.0 - f, 0.3 + 0.6 * f, 0.15, 1.0];
            self.rect(x + 2.0 * k, y + s - 3.0 * k, (s - 4.0 * k) * f, 2.0 * k, c);
        }
    }

    // ------------------------------------------------------------------ desenhar
    /// Desenha o lote com a matriz dada (tela: projeção ortográfica; mundo: a da câmera) e esvazia.
    pub unsafe fn flush(&mut self, gl: &glow::Context, mat: &[f32; 16], blocks: glow::Texture) {
        if self.verts.is_empty() {
            return;
        }
        gl.use_program(Some(self.prog));
        gl.uniform_matrix_4_f32_slice(gl.get_uniform_location(self.prog, "uMat").as_ref(), false, mat);
        gl.active_texture(glow::TEXTURE1);
        gl.bind_texture(glow::TEXTURE_2D, Some(self.atlas));
        gl.active_texture(glow::TEXTURE0);
        gl.bind_texture(glow::TEXTURE_2D_ARRAY, Some(blocks));
        gl.uniform_1_i32(gl.get_uniform_location(self.prog, "uBlocks").as_ref(), 0);
        gl.uniform_1_i32(gl.get_uniform_location(self.prog, "uAtlas").as_ref(), 1);
        gl.bind_vertex_array(Some(self.vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(self.vbo));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, crate::as_bytes(&self.verts), glow::STREAM_DRAW);
        gl.draw_arrays(glow::TRIANGLES, 0, (self.verts.len() / 10) as i32);
        self.verts.clear();
    }
}

/// Canto de cima à esquerda (u, v) do desenho do item no atlas.
pub fn item_uv(icon: i32) -> (f32, f32) {
    let a = ATLAS as f32;
    (((icon % 32) * 16) as f32 / a, (ITEMS_Y as f32 + ((icon / 32) * 16) as f32) / a)
}

/// Projeção da tela: (0,0) no canto de cima à esquerda, em pixels.
pub fn ortho(w: f32, h: f32) -> [f32; 16] {
    [2.0 / w, 0.0, 0.0, 0.0, 0.0, -2.0 / h, 0.0, 0.0, 0.0, 0.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0]
}
