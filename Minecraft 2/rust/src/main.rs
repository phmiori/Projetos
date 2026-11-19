//! Mundo de Blocos em Rust — primeira etapa da transição.
//!
//! O que já faz: abre o mesmo mundo salvo pelo jogo Java (ou um novo, pela semente), gera o terreno igualzinho
//! (mesmo código de geração, traduzido), desenha com os mesmos shaders e texturas, e deixa voar pelo mundo.
//! Ainda não tem: colocar/quebrar blocos, física de andar, bichos, inventário, LAN, salvar.
//!
//! Teclas: WASD anda, Espaço sobe, Shift desce, Ctrl acelera, Esc solta o mouse (clique para prender de novo),
//! F2 tira uma foto (pasta fotos/), F3 liga/desliga a oclusão nos cantos.
//!
//! Uso: mundo-de-blocos [--mundo pasta] [--semente N] [--comparar arquivo]

mod block;
mod mesher;
mod noise;
mod save;
mod shaders;
mod textures;
mod world;

use glow::HasContext;
use glutin::config::ConfigTemplateBuilder;
use glutin::context::{ContextApi, ContextAttributesBuilder, GlProfile, Version};
use glutin::display::GetGlDisplay;
use glutin::prelude::*;
use glutin::surface::SwapInterval;
use glutin_winit::{DisplayBuilder, GlWindow};
use raw_window_handle::HasRawWindowHandle;
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use winit::dpi::LogicalSize;
use winit::event::{DeviceEvent, ElementState, Event, MouseButton, WindowEvent};
use winit::event_loop::{ControlFlow, EventLoop};
use winit::keyboard::{KeyCode, PhysicalKey};
use winit::window::{CursorGrabMode, WindowBuilder};
use world::{Chunk, Generator, SEA};

const RADIUS: i32 = 8; // pedaços em volta do jogador (8 * 16 = 128 blocos)

enum Job {
    Load(i32, i32),
    Mesh(mesher::Region),
}
enum Done {
    Loaded(Chunk),
    Meshed(mesher::Mesh),
}

struct GpuMesh {
    vao: glow::VertexArray,
    vbo: glow::Buffer,
    quads: i32,
    wvao: Option<glow::VertexArray>,
    wvbo: Option<glow::Buffer>,
    wquads: i32,
}

fn as_bytes(v: &[u32]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, v.len() * 4) }
}

// ------------------------------------------------------------------ matrizes (colunas, como o OpenGL espera)
fn perspective(tan_x: f32, tan_y: f32, n: f32, f: f32) -> [f32; 16] {
    let mut m = [0f32; 16];
    m[0] = 1.0 / tan_x;
    m[5] = 1.0 / tan_y;
    m[10] = -(f + n) / (f - n);
    m[11] = -1.0;
    m[14] = -2.0 * f * n / (f - n);
    m
}
fn mul(a: &[f32; 16], b: &[f32; 16]) -> [f32; 16] {
    let mut r = [0f32; 16];
    for c in 0..4 {
        for row in 0..4 {
            r[c * 4 + row] = (0..4).map(|k| a[k * 4 + row] * b[c * 4 + k]).sum();
        }
    }
    r
}
fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
fn dot(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn norm(a: [f32; 3]) -> [f32; 3] {
    let l = dot(a, a).sqrt();
    [a[0] / l, a[1] / l, a[2] / l]
}

struct Camera {
    x: f64,
    y: f64,
    z: f64,
    yaw: f64,
    pitch: f64,
}
impl Camera {
    /// Mesma convenção do Java: yaw = π olha para -Z, pitch negativo olha para baixo.
    fn forward(&self) -> [f32; 3] {
        [
            (self.yaw.sin() * self.pitch.cos()) as f32,
            self.pitch.sin() as f32,
            (self.yaw.cos() * self.pitch.cos()) as f32,
        ]
    }
}

struct Gl {
    gl: glow::Context,
    block: glow::Program,
    water: glow::Program,
    sky: glow::Program,
    cross: glow::Program,
    empty_vao: glow::VertexArray,
    cross_vao: glow::VertexArray,
    cross_vbo: glow::Buffer,
    ebo: glow::Buffer,
    ebo_quads: usize,
    tex: glow::Texture,
}

unsafe fn compile(gl: &glow::Context, vs: &str, fs: &str) -> glow::Program {
    let p = gl.create_program().expect("programa");
    let mut list = Vec::new();
    for (kind, src) in [(glow::VERTEX_SHADER, vs), (glow::FRAGMENT_SHADER, fs)] {
        let s = gl.create_shader(kind).expect("shader");
        gl.shader_source(s, src);
        gl.compile_shader(s);
        if !gl.get_shader_compile_status(s) {
            panic!("shader não compilou: {}", gl.get_shader_info_log(s));
        }
        gl.attach_shader(p, s);
        list.push(s);
    }
    gl.link_program(p);
    if !gl.get_program_link_status(p) {
        panic!("programa não ligou: {}", gl.get_program_info_log(p));
    }
    for s in list {
        gl.detach_shader(p, s);
        gl.delete_shader(s);
    }
    p
}

impl Gl {
    unsafe fn u(&self, p: glow::Program, name: &str) -> Option<glow::UniformLocation> {
        self.gl.get_uniform_location(p, name)
    }

    /// Um só buffer de índices (0,1,2, 0,2,3 por face) para todas as malhas; cresce quando precisa.
    unsafe fn ensure_indices(&mut self, quads: usize) {
        if quads <= self.ebo_quads {
            return;
        }
        let n = quads.next_power_of_two().max(1 << 16);
        let mut idx: Vec<u32> = Vec::with_capacity(n * 6);
        for q in 0..n as u32 {
            let b = q * 4;
            idx.extend_from_slice(&[b, b + 1, b + 2, b, b + 2, b + 3]);
        }
        self.gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(self.ebo));
        self.gl.buffer_data_u8_slice(glow::ELEMENT_ARRAY_BUFFER, as_bytes(&idx), glow::STATIC_DRAW);
        self.ebo_quads = n;
    }

    unsafe fn upload(&mut self, data: &[u32]) -> (glow::VertexArray, glow::Buffer, i32) {
        let gl = &self.gl;
        let vao = gl.create_vertex_array().unwrap();
        let vbo = gl.create_buffer().unwrap();
        gl.bind_vertex_array(Some(vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(vbo));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, as_bytes(data), glow::STATIC_DRAW);
        for i in 0..3 {
            gl.enable_vertex_attrib_array(i);
            gl.vertex_attrib_pointer_i32(i, 1, glow::UNSIGNED_INT, 12, (i * 4) as i32);
        }
        gl.bind_buffer(glow::ELEMENT_ARRAY_BUFFER, Some(self.ebo));
        gl.bind_vertex_array(None);
        (vao, vbo, (data.len() / 12) as i32)
    }
}

struct Game {
    gen: Generator,
    save_dir: Option<PathBuf>,
    world_name: String,
    chunks: HashMap<(i32, i32), Arc<Chunk>>,
    loading: HashSet<(i32, i32)>,
    meshing: HashSet<(i32, i32)>,
    meshes: HashMap<(i32, i32), GpuMesh>,
    dirty: HashSet<(i32, i32)>,
    jobs: mpsc::Sender<Job>,
    done: mpsc::Receiver<Done>,
    cam: Camera,
    keys: HashSet<KeyCode>,
    grabbed: bool,
    ao: bool,
    start: Instant,
    last: Instant,
    frames: u32,
    fps_time: Instant,
    fps: u32,
    screenshot: bool,
}

impl Game {
    fn new(gen: Generator, save_dir: Option<PathBuf>, world_name: String, cam: Camera) -> Game {
        let (jtx, jrx) = mpsc::channel::<Job>();
        let (dtx, drx) = mpsc::channel::<Done>();
        let jrx = Arc::new(Mutex::new(jrx));
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).saturating_sub(2).clamp(2, 8);
        for i in 0..threads {
            let (jrx, dtx, gen, dir) = (jrx.clone(), dtx.clone(), gen.clone(), save_dir.clone());
            std::thread::Builder::new()
                .name(format!("pedacos-{i}"))
                .spawn(move || loop {
                    let job = { jrx.lock().unwrap().recv() };
                    let out = match job {
                        Ok(Job::Load(cx, cz)) => {
                            let saved = dir.as_ref().and_then(|d| save::read_chunk(d, cx, cz)).and_then(|b| Chunk::from_bytes(cx, cz, &b));
                            let c = match saved {
                                Some(mut c) => {
                                    c.compute_sky();
                                    c
                                }
                                None => gen.generate(cx, cz),
                            };
                            Done::Loaded(c)
                        }
                        Ok(Job::Mesh(region)) => Done::Meshed(mesher::build(&region)),
                        Err(_) => return,
                    };
                    if dtx.send(out).is_err() {
                        return;
                    }
                })
                .unwrap();
        }
        let now = Instant::now();
        Game {
            gen,
            save_dir,
            world_name,
            chunks: HashMap::new(),
            loading: HashSet::new(),
            meshing: HashSet::new(),
            meshes: HashMap::new(),
            dirty: HashSet::new(),
            jobs: jtx,
            done: drx,
            cam,
            keys: HashSet::new(),
            grabbed: false,
            ao: true,
            start: now,
            last: now,
            frames: 0,
            fps_time: now,
            fps: 0,
            screenshot: false,
        }
    }

    fn block_at(&self, x: i32, y: i32, z: i32) -> u8 {
        if !(0..world::SY).contains(&y) {
            return block::AIR;
        }
        match self.chunks.get(&(x >> 4, z >> 4)) {
            Some(c) => c.blocks[world::idx(x & 15, y, z & 15)],
            None => block::AIR,
        }
    }

    /// Pede os pedaços que faltam (do mais perto para o mais longe), monta as malhas e solta os que ficaram longe.
    fn stream(&mut self, g: &mut Gl) {
        let pcx = (self.cam.x.floor() as i32) >> 4;
        let pcz = (self.cam.z.floor() as i32) >> 4;
        // resultados prontos
        let mut budget = 24;
        while let Ok(d) = self.done.try_recv() {
            match d {
                Done::Loaded(c) => {
                    let k = (c.cx, c.cz);
                    self.loading.remove(&k);
                    self.chunks.insert(k, Arc::new(c));
                    for dx in -1..=1 {
                        for dz in -1..=1 {
                            self.dirty.insert((k.0 + dx, k.1 + dz));
                        }
                    }
                }
                Done::Meshed(m) => {
                    let k = (m.cx, m.cz);
                    self.meshing.remove(&k);
                    if (k.0 - pcx).abs() > RADIUS + 1 || (k.1 - pcz).abs() > RADIUS + 1 {
                        continue;
                    }
                    unsafe {
                        g.ensure_indices(m.opaque.len().max(m.water.len()) / 12 + 1);
                        if let Some(old) = self.meshes.remove(&k) {
                            free(g, old);
                        }
                        let (vao, vbo, quads) = g.upload(&m.opaque);
                        let (wvao, wvbo, wquads) = if m.water.is_empty() {
                            (None, None, 0)
                        } else {
                            let (a, b, q) = g.upload(&m.water);
                            (Some(a), Some(b), q)
                        };
                        self.meshes.insert(k, GpuMesh { vao, vbo, quads, wvao, wvbo, wquads });
                    }
                    budget -= 1;
                    if budget == 0 {
                        break;
                    }
                }
            }
        }
        // pedidos novos, em anéis a partir do jogador
        let mut wanted: Vec<(i32, i32, i32)> = Vec::new();
        for dx in -(RADIUS + 1)..=(RADIUS + 1) {
            for dz in -(RADIUS + 1)..=(RADIUS + 1) {
                wanted.push((dx * dx + dz * dz, pcx + dx, pcz + dz));
            }
        }
        wanted.sort_unstable();
        for &(_, cx, cz) in &wanted {
            if self.loading.len() >= 48 {
                break;
            }
            let k = (cx, cz);
            if !self.chunks.contains_key(&k) && !self.loading.contains(&k) {
                self.loading.insert(k);
                let _ = self.jobs.send(Job::Load(cx, cz));
            }
        }
        for &(_, cx, cz) in &wanted {
            if self.meshing.len() >= 24 {
                break;
            }
            let k = (cx, cz);
            if (cx - pcx).abs() > RADIUS || (cz - pcz).abs() > RADIUS || self.meshing.contains(&k) {
                continue;
            }
            if self.meshes.contains_key(&k) && !self.dirty.contains(&k) {
                continue;
            }
            let mut ready = true;
            let mut nb: Vec<Arc<Chunk>> = Vec::with_capacity(9);
            'n: for dx in -1..=1 {
                for dz in -1..=1 {
                    match self.chunks.get(&(cx + dx, cz + dz)) {
                        Some(c) => nb.push(c.clone()),
                        None => {
                            ready = false;
                            break 'n;
                        }
                    }
                }
            }
            if !ready {
                continue;
            }
            self.dirty.remove(&k);
            self.meshing.insert(k);
            let c: [Arc<Chunk>; 9] = match nb.try_into() {
                Ok(a) => a,
                Err(_) => continue,
            };
            let _ = self.jobs.send(Job::Mesh(mesher::Region { c, cx, cz }));
        }
        // longe demais: solta
        let far = |k: &(i32, i32), r: i32| (k.0 - pcx).abs() > r || (k.1 - pcz).abs() > r;
        let gone: Vec<(i32, i32)> = self.meshes.keys().filter(|k| far(k, RADIUS + 2)).cloned().collect();
        for k in gone {
            if let Some(m) = self.meshes.remove(&k) {
                unsafe { free(g, m) };
            }
        }
        self.chunks.retain(|k, _| !far(k, RADIUS + 4));
        self.dirty.retain(|k| !far(k, RADIUS + 2));
    }

    fn update(&mut self, dt: f64) {
        let f = self.cam.forward();
        let (fx, fz) = (self.cam.yaw.sin(), self.cam.yaw.cos());
        let (rx, rz) = (-fz, fx); // direita
        let _ = f;
        let mut mx = 0.0;
        let mut mz = 0.0;
        let mut my = 0.0;
        if self.keys.contains(&KeyCode::KeyW) { mx += fx; mz += fz; }
        if self.keys.contains(&KeyCode::KeyS) { mx -= fx; mz -= fz; }
        if self.keys.contains(&KeyCode::KeyD) { mx += rx; mz += rz; }
        if self.keys.contains(&KeyCode::KeyA) { mx -= rx; mz -= rz; }
        if self.keys.contains(&KeyCode::Space) { my += 1.0; }
        if self.keys.contains(&KeyCode::ShiftLeft) { my -= 1.0; }
        let fast = self.keys.contains(&KeyCode::ControlLeft);
        let speed = if fast { 30.0 } else { 11.0 };
        let l = ((mx * mx + mz * mz) as f64).sqrt();
        if l > 0.0 {
            self.cam.x += mx / l * speed * dt;
            self.cam.z += mz / l * speed * dt;
        }
        self.cam.y = (self.cam.y + my * speed * dt).clamp(1.0, 140.0);
    }

    unsafe fn render(&mut self, g: &mut Gl, w: u32, h: u32) {
        let gl = &g.gl;
        gl.viewport(0, 0, w as i32, h as i32);
        let view_dist = (RADIUS * 16 - 8) as f32;
        let tan_y = (70f32.to_radians() / 2.0).tan();
        let tan_x = tan_y * w as f32 / h.max(1) as f32;
        let f = self.cam.forward();
        let up0 = [0.0, 1.0, 0.0];
        let right = norm(cross(f, up0));
        let up = cross(right, f);
        let eye = [self.cam.x as f32, self.cam.y as f32, self.cam.z as f32];
        let view = [
            right[0], up[0], -f[0], 0.0,
            right[1], up[1], -f[1], 0.0,
            right[2], up[2], -f[2], 0.0,
            -dot(right, eye), -dot(up, eye), dot(f, eye), 1.0,
        ];
        let vp = mul(&perspective(tan_x, tan_y, 0.05, view_dist + 40.0), &view);
        let sun = norm([0.35, 0.85, 0.4]);
        let time = self.start.elapsed().as_secs_f32();
        let underwater = block::is_water(self.block_at(eye[0].floor() as i32, eye[1].floor() as i32, eye[2].floor() as i32));
        let common = |p: glow::Program| {
            gl.use_program(Some(p));
            gl.uniform_3_f32(g.u(p, "uSun").as_ref(), sun[0], sun[1], sun[2]);
            gl.uniform_3_f32(g.u(p, "uLightDir").as_ref(), sun[0], sun[1], sun[2]);
            gl.uniform_1_f32(g.u(p, "uLightStr").as_ref(), 1.0);
            gl.uniform_1_f32(g.u(p, "uDaylight").as_ref(), 1.0);
            gl.uniform_3_f32(g.u(p, "uCam").as_ref(), eye[0], eye[1], eye[2]);
            gl.uniform_1_f32(g.u(p, "uTime").as_ref(), time);
            gl.uniform_1_f32(g.u(p, "uViewDist").as_ref(), view_dist);
            gl.uniform_1_i32(g.u(p, "uUnderwater").as_ref(), underwater as i32);
        };

        // céu
        gl.disable(glow::DEPTH_TEST);
        gl.depth_mask(false);
        common(g.sky);
        gl.uniform_3_f32(g.u(g.sky, "uFwd").as_ref(), f[0], f[1], f[2]);
        gl.uniform_3_f32(g.u(g.sky, "uRight").as_ref(), right[0], right[1], right[2]);
        gl.uniform_3_f32(g.u(g.sky, "uUp").as_ref(), up[0], up[1], up[2]);
        gl.uniform_1_f32(g.u(g.sky, "uTanX").as_ref(), tan_x);
        gl.uniform_1_f32(g.u(g.sky, "uTanY").as_ref(), tan_y);
        gl.bind_vertex_array(Some(g.empty_vao));
        gl.draw_arrays(glow::TRIANGLES, 0, 3);

        // blocos
        gl.enable(glow::DEPTH_TEST);
        gl.depth_mask(true);
        gl.clear(glow::DEPTH_BUFFER_BIT);
        gl.enable(glow::CULL_FACE);
        gl.active_texture(glow::TEXTURE0);
        gl.bind_texture(glow::TEXTURE_2D_ARRAY, Some(g.tex));
        common(g.block);
        gl.uniform_matrix_4_f32_slice(g.u(g.block, "uViewProj").as_ref(), false, &vp);
        gl.uniform_1_i32(g.u(g.block, "uTex").as_ref(), 0);
        gl.uniform_1_f32(g.u(g.block, "uAOStr").as_ref(), if self.ao { 1.0 } else { 0.0 });
        gl.uniform_1_f32(g.u(g.block, "uWaterDrop").as_ref(), 0.0);
        let uchunk = g.u(g.block, "uChunk");
        let visible = |k: &(i32, i32)| {
            // descarta pedaços atrás da câmera (teste simples com a esfera do pedaço)
            let c = [k.0 as f32 * 16.0 + 8.0 - eye[0], 32.0 - eye[1], k.1 as f32 * 16.0 + 8.0 - eye[2]];
            dot(c, f) > -40.0
        };
        for (k, m) in &self.meshes {
            if m.quads == 0 || !visible(k) {
                continue;
            }
            gl.uniform_3_f32(uchunk.as_ref(), (k.0 * 16) as f32, 0.0, (k.1 * 16) as f32);
            gl.bind_vertex_array(Some(m.vao));
            gl.draw_elements(glow::TRIANGLES, m.quads * 6, glow::UNSIGNED_INT, 0);
        }

        // água: transparente, de trás para a frente
        gl.disable(glow::CULL_FACE);
        gl.enable(glow::BLEND);
        gl.blend_func(glow::SRC_ALPHA, glow::ONE_MINUS_SRC_ALPHA);
        gl.depth_mask(false);
        common(g.water);
        gl.uniform_matrix_4_f32_slice(g.u(g.water, "uViewProj").as_ref(), false, &vp);
        gl.uniform_1_i32(g.u(g.water, "uTex").as_ref(), 0);
        gl.uniform_1_i32(g.u(g.water, "uReflect").as_ref(), 1);
        gl.uniform_1_f32(g.u(g.water, "uWaterDrop").as_ref(), 0.12);
        let wchunk = g.u(g.water, "uChunk");
        let mut order: Vec<(&(i32, i32), &GpuMesh)> = self.meshes.iter().filter(|(k, m)| m.wquads > 0 && visible(k)).collect();
        let d2 = |k: &(i32, i32)| {
            let (dx, dz) = (k.0 as f32 * 16.0 + 8.0 - eye[0], k.1 as f32 * 16.0 + 8.0 - eye[2]);
            dx * dx + dz * dz
        };
        order.sort_by(|a, b| d2(b.0).partial_cmp(&d2(a.0)).unwrap());
        for (k, m) in order {
            gl.uniform_3_f32(wchunk.as_ref(), (k.0 * 16) as f32, 0.0, (k.1 * 16) as f32);
            gl.bind_vertex_array(m.wvao);
            gl.draw_elements(glow::TRIANGLES, m.wquads * 6, glow::UNSIGNED_INT, 0);
        }
        gl.depth_mask(true);

        // mira (inverte a cor do que está atrás)
        gl.disable(glow::DEPTH_TEST);
        gl.blend_func(glow::ONE_MINUS_DST_COLOR, glow::ZERO);
        gl.use_program(Some(g.cross));
        let (sx, sy) = (2.0 / w as f32, 2.0 / h as f32);
        let quads: [f32; 24] = [
            -9.0 * sx, -1.0 * sy, 9.0 * sx, -1.0 * sy, 9.0 * sx, 1.0 * sy, -9.0 * sx, -1.0 * sy, 9.0 * sx, 1.0 * sy, -9.0 * sx, 1.0 * sy,
            -1.0 * sx, -9.0 * sy, 1.0 * sx, -9.0 * sy, 1.0 * sx, -1.0 * sy, -1.0 * sx, -9.0 * sy, 1.0 * sx, -1.0 * sy, -1.0 * sx, -1.0 * sy,
        ];
        gl.bind_vertex_array(Some(g.cross_vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(g.cross_vbo));
        let bytes = std::slice::from_raw_parts(quads.as_ptr() as *const u8, quads.len() * 4);
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, bytes, glow::STREAM_DRAW);
        gl.draw_arrays(glow::TRIANGLES, 0, 12);
        let quads2: [f32; 12] = [
            -1.0 * sx, 1.0 * sy, 1.0 * sx, 1.0 * sy, 1.0 * sx, 9.0 * sy, -1.0 * sx, 1.0 * sy, 1.0 * sx, 9.0 * sy, -1.0 * sx, 9.0 * sy,
        ];
        let bytes = std::slice::from_raw_parts(quads2.as_ptr() as *const u8, quads2.len() * 4);
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, bytes, glow::STREAM_DRAW);
        gl.draw_arrays(glow::TRIANGLES, 0, 6);
        gl.disable(glow::BLEND);
        gl.enable(glow::DEPTH_TEST);

        if self.screenshot {
            self.screenshot = false;
            let mut px = vec![0u8; (w * h * 4) as usize];
            gl.read_pixels(0, 0, w as i32, h as i32, glow::RGBA, glow::UNSIGNED_BYTE, glow::PixelPackData::Slice(&mut px));
            let mut img = image::RgbaImage::new(w, h);
            for y in 0..h {
                for x in 0..w {
                    let i = (((h - 1 - y) * w + x) * 4) as usize;
                    img.put_pixel(x, y, image::Rgba([px[i], px[i + 1], px[i + 2], 255]));
                }
            }
            let _ = std::fs::create_dir_all("fotos");
            let name = format!("fotos/rust-{}.png", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0));
            if img.save(&name).is_ok() {
                println!("foto salva em {name}");
            }
        }
    }

    fn title(&self) -> String {
        let (x, z) = (self.cam.x.floor() as i32, self.cam.z.floor() as i32);
        let h = self.gen.height_at(x, z);
        let biome = world::BIOME_NAMES[self.gen.biome_at(x, z, h - 1) as usize];
        format!(
            "Mundo de Blocos (Rust, prévia) — {} · {} · X {:.0} Y {:.0} Z {:.0} · {} FPS · {} pedaços",
            self.world_name, biome, self.cam.x, self.cam.y, self.cam.z, self.fps, self.meshes.len()
        )
    }
}

unsafe fn free(g: &Gl, m: GpuMesh) {
    g.gl.delete_vertex_array(m.vao);
    g.gl.delete_buffer(m.vbo);
    if let Some(v) = m.wvao {
        g.gl.delete_vertex_array(v);
    }
    if let Some(b) = m.wvbo {
        g.gl.delete_buffer(b);
    }
}

/// Compara pedaços gerados pelo Java (ferramentas/CompararGeracao.java) com os gerados aqui.
fn compare(path: &str) -> ! {
    let data = std::fs::read(path).expect("não consegui ler o arquivo do Java");
    let seed = i32::from_be_bytes(data[0..4].try_into().unwrap());
    let scale = f64::from_be_bytes(data[4..12].try_into().unwrap());
    let n = i32::from_be_bytes(data[12..16].try_into().unwrap());
    let gen = Generator { seed, biome_scale: scale };
    let mut p = 16;
    let (mut diff_chunks, mut diff_blocks) = (0, 0);
    for _ in 0..n {
        let cx = i32::from_be_bytes(data[p..p + 4].try_into().unwrap());
        let cz = i32::from_be_bytes(data[p + 4..p + 8].try_into().unwrap());
        p += 8;
        let java = &data[p..p + world::VOLUME];
        p += world::VOLUME;
        let c = gen.generate(cx, cz);
        let d = c.blocks.iter().zip(java).filter(|(a, b)| a != b).count();
        if d > 0 {
            diff_chunks += 1;
            diff_blocks += d;
            if diff_chunks <= 5 {
                let i = c.blocks.iter().zip(java).position(|(a, b)| a != b).unwrap();
                println!("pedaço {cx},{cz}: {d} blocos diferentes (primeiro: índice {i}, rust {} java {})", c.blocks[i], java[i]);
            }
        }
    }
    println!("semente {seed}, biomas x{scale}: {n} pedaços comparados, {diff_chunks} diferentes, {diff_blocks} blocos diferentes");
    std::process::exit(if diff_chunks == 0 { 0 } else { 1 });
}

fn main() {
    // roda na pasta do jogo (onde ficam textures/ e worlds/), venha de onde vier
    let args: Vec<String> = std::env::args().collect();
    let arg = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    if let Some(p) = arg("--comparar") {
        compare(&p);
    }
    let game_dir = arg("--pasta").map(PathBuf::from).unwrap_or_else(|| {
        let exe = std::env::current_exe().unwrap_or_default();
        // rust/target/release/mundo-de-blocos.exe -> pasta do jogo (3 acima); senão a pasta atual
        exe.ancestors().find(|d| d.join("textures").is_dir()).map(|d| d.to_path_buf()).unwrap_or_else(|| PathBuf::from("."))
    });
    let _ = std::env::set_current_dir(&game_dir);

    let info = match arg("--mundo") {
        Some(m) => save::read_world(&PathBuf::from(m)),
        None => save::latest_world(&PathBuf::from("worlds")),
    };
    let seed_arg = arg("--semente").and_then(|s| s.parse::<i32>().ok());
    let (gen, save_dir, name, cam) = match (&info, seed_arg) {
        (Some(w), None) => {
            let gen = Generator { seed: w.seed, biome_scale: w.biome_scale };
            let cam = match w.player {
                Some(p) => Camera { x: p[0], y: p[1] + 1.62, z: p[2], yaw: p[3], pitch: p[4] },
                None => Camera { x: 0.5, y: gen.height_at(0, 0) as f64 + 3.0, z: 0.5, yaw: 0.0, pitch: -0.2 },
            };
            (gen, Some(w.dir.clone()), w.name.clone(), cam)
        }
        _ => {
            let gen = Generator { seed: seed_arg.unwrap_or(2024), biome_scale: 2.0 };
            let y = gen.height_at(0, 0).max(SEA) as f64 + 3.0;
            let cam = Camera { x: 0.5, y, z: 0.5, yaw: 0.0, pitch: -0.2 };
            let name = format!("semente {}", gen.seed);
            (gen, None, name, cam)
        }
    };
    // --posicao x y z yaw pitch: começa num lugar escolhido (bom para comparar fotos com o Java)
    let mut cam = cam;
    if let Some(i) = args.iter().position(|a| a == "--posicao") {
        let v: Vec<f64> = args[i + 1..].iter().take(5).filter_map(|s| s.parse().ok()).collect();
        if v.len() == 5 {
            cam = Camera { x: v[0], y: v[1], z: v[2], yaw: v[3], pitch: v[4] };
        }
    }
    println!("Mundo de Blocos (Rust): {name} — semente {}, biomas x{}", gen.seed, gen.biome_scale);

    let event_loop = EventLoop::new().expect("loop de eventos");
    let wb = WindowBuilder::new().with_title("Mundo de Blocos (Rust, prévia)").with_inner_size(LogicalSize::new(1280.0, 720.0));
    let template = ConfigTemplateBuilder::new().with_depth_size(24);
    let (window, gl_config) = DisplayBuilder::new()
        .with_window_builder(Some(wb))
        .build(&event_loop, template, |configs| configs.reduce(|a, c| if c.num_samples() > a.num_samples() && c.num_samples() <= 4 { c } else { a }).unwrap())
        .expect("não consegui abrir a janela OpenGL");
    let window = window.expect("janela");
    let display = gl_config.display();
    let ctx_attrs = ContextAttributesBuilder::new()
        .with_profile(GlProfile::Core)
        .with_context_api(ContextApi::OpenGl(Some(Version::new(3, 3))))
        .build(Some(window.raw_window_handle()));
    let surf_attrs = window.build_surface_attributes(Default::default());
    let (gl_surface, gl_ctx) = unsafe {
        let surface = display.create_window_surface(&gl_config, &surf_attrs).expect("superfície OpenGL");
        let ctx = display.create_context(&gl_config, &ctx_attrs).expect("OpenGL 3.3").make_current(&surface).expect("contexto");
        (surface, ctx)
    };
    let vsync = !args.iter().any(|a| a == "--sem-vsync");
    let _ = gl_surface.set_swap_interval(&gl_ctx, if vsync { SwapInterval::Wait(NonZeroU32::new(1).unwrap()) } else { SwapInterval::DontWait });

    let gl = unsafe {
        glow::Context::from_loader_function(|s| {
            let s = std::ffi::CString::new(s).unwrap();
            display.get_proc_address(&s) as *const _
        })
    };
    let atlas = textures::load(&PathBuf::from("textures"));
    if !atlas.missing.is_empty() {
        println!("texturas que faltam na pasta textures (rode o jogo Java uma vez para criá-las): {}", atlas.missing.join(", "));
    }
    let mut g = unsafe {
        let block_p = compile(&gl, shaders::BLOCK_VS, &shaders::block_fs());
        let water_p = compile(&gl, shaders::BLOCK_VS, &shaders::water_fs());
        let sky_p = compile(&gl, shaders::FULL_VS, &shaders::sky_fs());
        let cross_p = compile(&gl, shaders::CROSSHAIR_VS, shaders::CROSSHAIR_FS);
        let empty_vao = gl.create_vertex_array().unwrap();
        let cross_vao = gl.create_vertex_array().unwrap();
        let cross_vbo = gl.create_buffer().unwrap();
        gl.bind_vertex_array(Some(cross_vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(cross_vbo));
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(0, 2, glow::FLOAT, false, 8, 0);
        gl.bind_vertex_array(None);
        let tex = gl.create_texture().unwrap();
        gl.bind_texture(glow::TEXTURE_2D_ARRAY, Some(tex));
        gl.tex_image_3d(
            glow::TEXTURE_2D_ARRAY,
            0,
            glow::RGBA8 as i32,
            atlas.size as i32,
            atlas.size as i32,
            atlas.layers as i32,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            Some(&atlas.pixels),
        );
        gl.generate_mipmap(glow::TEXTURE_2D_ARRAY);
        gl.tex_parameter_i32(glow::TEXTURE_2D_ARRAY, glow::TEXTURE_MIN_FILTER, glow::NEAREST_MIPMAP_LINEAR as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D_ARRAY, glow::TEXTURE_MAG_FILTER, glow::NEAREST as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D_ARRAY, glow::TEXTURE_MAX_LEVEL, 4);
        gl.tex_parameter_i32(glow::TEXTURE_2D_ARRAY, glow::TEXTURE_WRAP_S, glow::REPEAT as i32);
        gl.tex_parameter_i32(glow::TEXTURE_2D_ARRAY, glow::TEXTURE_WRAP_T, glow::REPEAT as i32);
        let ebo = gl.create_buffer().unwrap();
        let mut g = Gl { gl, block: block_p, water: water_p, sky: sky_p, cross: cross_p, empty_vao, cross_vao, cross_vbo, ebo, ebo_quads: 0, tex };
        g.ensure_indices(1 << 16);
        g
    };
    drop(atlas);

    let mut game = Game::new(gen, save_dir, name, cam);
    let auto_shot = arg("--foto-e-sair").and_then(|s| s.parse::<u32>().ok());
    let mut shots_frames = 0u32;
    event_loop.set_control_flow(ControlFlow::Poll);
    event_loop
        .run(move |event, elwt| match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => elwt.exit(),
                WindowEvent::Resized(s) => {
                    if s.width > 0 && s.height > 0 {
                        gl_surface.resize(&gl_ctx, NonZeroU32::new(s.width).unwrap(), NonZeroU32::new(s.height).unwrap());
                    }
                }
                WindowEvent::Focused(false) => {
                    game.keys.clear();
                }
                WindowEvent::KeyboardInput { event, .. } => {
                    if let PhysicalKey::Code(code) = event.physical_key {
                        if event.state == ElementState::Pressed {
                            game.keys.insert(code);
                            match code {
                                KeyCode::Escape => {
                                    game.grabbed = false;
                                    let _ = window.set_cursor_grab(CursorGrabMode::None);
                                    window.set_cursor_visible(true);
                                }
                                KeyCode::F2 => game.screenshot = true,
                                KeyCode::F3 => game.ao = !game.ao,
                                _ => {}
                            }
                        } else {
                            game.keys.remove(&code);
                        }
                    }
                }
                WindowEvent::MouseInput { state: ElementState::Pressed, button: MouseButton::Left, .. } => {
                    if !game.grabbed {
                        game.grabbed = true;
                        let _ = window.set_cursor_grab(CursorGrabMode::Confined).or_else(|_| window.set_cursor_grab(CursorGrabMode::Locked));
                        window.set_cursor_visible(false);
                    }
                }
                WindowEvent::RedrawRequested => {
                    let now = Instant::now();
                    let dt = (now - game.last).as_secs_f64().min(0.1);
                    game.last = now;
                    game.update(dt);
                    game.stream(&mut g);
                    let size = window.inner_size();
                    if let Some(n) = auto_shot {
                        // modo de teste: espera os pedaços carregarem, tira a foto e fecha
                        shots_frames += 1;
                        if shots_frames == n {
                            game.screenshot = true;
                        }
                    }
                    unsafe { game.render(&mut g, size.width.max(1), size.height.max(1)) };
                    gl_surface.swap_buffers(&gl_ctx).unwrap();
                    game.frames += 1;
                    if game.fps_time.elapsed().as_secs_f64() >= 1.0 {
                        game.fps = game.frames;
                        game.frames = 0;
                        game.fps_time = Instant::now();
                        window.set_title(&game.title());
                        if auto_shot.is_some() {
                            println!("{}", game.title());
                        }
                    }
                    if let Some(n) = auto_shot {
                        if shots_frames > n {
                            elwt.exit();
                        }
                    }
                }
                _ => {}
            },
            Event::DeviceEvent { event: DeviceEvent::MouseMotion { delta }, .. } => {
                if game.grabbed {
                    game.cam.yaw -= delta.0 * 0.0025;
                    game.cam.pitch = (game.cam.pitch - delta.1 * 0.0025).clamp(-1.55, 1.55);
                }
            }
            Event::AboutToWait => window.request_redraw(),
            _ => {}
        })
        .unwrap();
}
