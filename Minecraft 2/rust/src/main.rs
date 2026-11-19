//! Mundo de Blocos em Rust — em transição a partir do jogo Java.
//!
//! O que já faz: abre o mesmo mundo salvo pelo jogo Java (ou um novo, pela semente), gera o terreno igualzinho
//! (mesmo código de geração, traduzido), desenha com os mesmos shaders e texturas, tem a física do jogador
//! (andar, pular, nadar, voar no criativo) e o ciclo de dia e noite, e usa as configurações do settings.properties.
//! Quebra e coloca blocos no criativo (escadas, lajes, portas, tochas na parede) e grava no mesmo formato do Java.
//! Ainda não tem: bichos, inventário, LAN, sobrevivência.
//!
//! Teclas: WASD anda, Espaço pula (dois toques: voa, no criativo), Shift desce voando, Ctrl corre,
//! botão esquerdo quebra, direito coloca (ou abre porta), do meio pega o bloco, 1-9 e a rodinha escolhem o bloco,
//! Esc solta o mouse (clique para prender de novo), F2 foto (pasta fotos/), F3 sombra dos cantos,
//! F4 (segurando) passa as horas depressa.
//!
//! Uso: mundo-de-blocos [--mundo pasta] [--semente N] [--posicao x y z yaw pitch] [--hora 0..1] [--comparar arquivo]

mod block;
mod edit;
mod fluid;
mod light;
mod mesher;
mod noise;
mod physics;
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
use physics::{Input, Player, EYE};
use raw_window_handle::HasRawWindowHandle;
use save::DAY_LENGTH;
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use winit::dpi::LogicalSize;
use winit::event::{DeviceEvent, ElementState, Event, MouseButton, MouseScrollDelta, WindowEvent};
use winit::event_loop::{ControlFlow, EventLoop};
use winit::keyboard::{KeyCode, PhysicalKey};
use winit::window::{CursorGrabMode, WindowBuilder};
use world::{Chunk, Generator, SEA};

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

fn as_bytes<T>(v: &[T]) -> &[u8] {
    unsafe { std::slice::from_raw_parts(v.as_ptr() as *const u8, std::mem::size_of_val(v)) }
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

/// Sol, lua e luz do momento, com as mesmas contas do GLRenderer/World do Java.
struct Sky {
    sun: [f32; 3],
    light: [f32; 3],
    light_str: f32,
    daylight: f32,
}

fn sky_at(time: f64) -> Sky {
    let a = time / DAY_LENGTH * std::f64::consts::PI * 2.0;
    let (sx, sy, sz) = (a.cos() * 0.92, a.sin(), 0.38);
    let l = (sx * sx + sy * sy + sz * sz).sqrt();
    let sun = [(sx / l) as f32, (sy / l) as f32, (sz / l) as f32];
    let daylight = ((a.sin() + 0.12) / 0.4).clamp(0.0, 1.0) as f32;
    let (light, light_str) = if sun[1] > 0.02 {
        (sun, ((sun[1] - 0.02) / 0.25).min(1.0)) // de dia a luz vem do sol
    } else {
        ([-sun[0], -sun[1], -sun[2]], 0.16 * ((-sun[1] - 0.02) / 0.2).clamp(0.0, 1.0)) // de noite, fraca, da lua
    };
    Sky { sun, light, light_str, daylight }
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
    line: glow::Program,
    line_vao: glow::VertexArray,
    line_vbo: glow::Buffer,
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

/// Os pedaços carregados, vistos como um mundo só (para a física).
struct Loaded<'a>(&'a HashMap<(i32, i32), Arc<Chunk>>);
impl physics::Blocks for Loaded<'_> {
    fn get(&self, x: i32, y: i32, z: i32) -> u8 {
        if !(0..world::SY).contains(&y) {
            return block::AIR;
        }
        match self.0.get(&(x >> 4, z >> 4)) {
            Some(c) => c.blocks[world::idx(x & 15, y, z & 15)],
            None => block::AIR,
        }
    }
}

struct Game {
    gen: Generator,
    save_dir: Option<PathBuf>,
    /// pedaços mudados que ainda não foram gravados
    modified: HashSet<(i32, i32)>,
    fall_queue: Vec<(i32, i32, i32)>,
    fall_timer: f64,
    fluid_queue: Vec<(i32, i32, i32)>,
    fluid_set: HashSet<(i32, i32, i32)>,
    fluid_timer: f64,
    aim: Option<edit::Hit>,
    hotbar: [i32; 9],
    slot: usize,
    l_held: bool,
    r_held: bool,
    l_pending: bool,
    r_pending: bool,
    m_pending: bool,
    cool_l: f64,
    cool_r: f64,
    last_save: Instant,
    notice: Option<(String, Instant)>,
    world_name: String,
    settings: save::Settings,
    radius: i32,
    creative: bool,
    chunks: HashMap<(i32, i32), Arc<Chunk>>,
    loading: HashSet<(i32, i32)>,
    meshing: HashSet<(i32, i32)>,
    meshes: HashMap<(i32, i32), GpuMesh>,
    dirty: HashSet<(i32, i32)>,
    jobs: mpsc::Sender<Job>,
    done: mpsc::Receiver<Done>,
    player: Player,
    time: f64,
    day: i32,
    keys: HashSet<KeyCode>,
    last_space: Option<Instant>,
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
    #[allow(clippy::too_many_arguments)]
    fn new(gen: Generator, save_dir: Option<PathBuf>, world_name: String, settings: save::Settings, player: Player, creative: bool, time: f64, day: i32, hotbar: [i32; 9]) -> Game {
        let (jtx, jrx) = mpsc::channel::<Job>();
        let (dtx, drx) = mpsc::channel::<Done>();
        let jrx = Arc::new(Mutex::new(jrx));
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).saturating_sub(2).clamp(2, 8);
        for i in 0..threads {
            let (jrx, dtx, gen, dir) = (jrx.clone(), dtx.clone(), gen.clone(), save_dir.clone());
            // (os pedaços gravados por esta versão são lidos de volta do disco do mesmo jeito)
            std::thread::Builder::new()
                .name(format!("pedacos-{i}"))
                .spawn(move || loop {
                    let job = { jrx.lock().unwrap().recv() };
                    let out = match job {
                        Ok(Job::Load(cx, cz)) => {
                            let saved = dir.as_ref().and_then(|d| save::read_chunk(d, cx, cz)).and_then(|b| Chunk::from_bytes(cx, cz, &b));
                            let c = match saved {
                                Some(mut c) => {
                                    c.prepare();
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
        let radius = (settings.view_dist + 15) / 16;
        let ao = settings.ao;
        Game {
            gen,
            save_dir,
            modified: HashSet::new(),
            fall_queue: Vec::new(),
            fall_timer: 0.0,
            fluid_queue: Vec::new(),
            fluid_set: HashSet::new(),
            fluid_timer: 0.0,
            aim: None,
            hotbar,
            slot: 0,
            l_held: false,
            r_held: false,
            l_pending: false,
            r_pending: false,
            m_pending: false,
            cool_l: 0.0,
            cool_r: 0.0,
            last_save: now,
            notice: None,
            world_name,
            settings,
            radius,
            creative,
            chunks: HashMap::new(),
            loading: HashSet::new(),
            meshing: HashSet::new(),
            meshes: HashMap::new(),
            dirty: HashSet::new(),
            jobs: jtx,
            done: drx,
            player,
            time,
            day,
            keys: HashSet::new(),
            last_space: None,
            grabbed: false,
            ao,
            start: now,
            last: now,
            frames: 0,
            fps_time: now,
            fps: 0,
            screenshot: false,
        }
    }

    fn eye(&self) -> [f32; 3] {
        [self.player.x as f32, (self.player.y + EYE) as f32, self.player.z as f32]
    }

    fn forward(&self) -> [f32; 3] {
        let (y, p) = (self.player.yaw, self.player.pitch);
        [(y.sin() * p.cos()) as f32, p.sin() as f32, (y.cos() * p.cos()) as f32]
    }

    /// Pede os pedaços que faltam (do mais perto para o mais longe), monta as malhas e solta os que ficaram longe.
    fn stream(&mut self, g: &mut Gl) {
        let r = self.radius;
        let pcx = (self.player.x.floor() as i32) >> 4;
        let pcz = (self.player.z.floor() as i32) >> 4;
        let mut budget = 24;
        while let Ok(d) = self.done.try_recv() {
            match d {
                Done::Loaded(c) => {
                    let k = (c.cx, c.cz);
                    self.loading.remove(&k);
                    // água corrente salva é reavaliada: a que não tem mais de onde vir seca aos poucos
                    let flowing: Vec<(i32, i32, i32)> = if c.from_store {
                        (0..world::VOLUME)
                            .filter(|&i| block::water_level(c.blocks[i]) > 0)
                            .map(|i| (k.0 * 16 + (i >> 10) as i32, (i & 63) as i32, k.1 * 16 + ((i >> 6) & 15) as i32))
                            .collect()
                    } else {
                        Vec::new()
                    };
                    self.chunks.insert(k, Arc::new(c));
                    for (x, y, z) in flowing {
                        self.schedule_fluid(x, y, z);
                    }
                    self.spill_light(k.0, k.1);
                    for dx in -1..=1 {
                        for dz in -1..=1 {
                            self.dirty.insert((k.0 + dx, k.1 + dz));
                        }
                    }
                }
                Done::Meshed(m) => {
                    let k = (m.cx, m.cz);
                    self.meshing.remove(&k);
                    if (k.0 - pcx).abs() > r + 1 || (k.1 - pcz).abs() > r + 1 {
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
        let mut wanted: Vec<(i32, i32, i32)> = Vec::new();
        for dx in -(r + 1)..=(r + 1) {
            for dz in -(r + 1)..=(r + 1) {
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
            if (cx - pcx).abs() > r || (cz - pcz).abs() > r || self.meshing.contains(&k) {
                continue;
            }
            if self.meshes.contains_key(&k) && !self.dirty.contains(&k) {
                continue;
            }
            let mut nb: Vec<Arc<Chunk>> = Vec::with_capacity(9);
            for dx in -1..=1 {
                for dz in -1..=1 {
                    if let Some(c) = self.chunks.get(&(cx + dx, cz + dz)) {
                        nb.push(c.clone());
                    }
                }
            }
            let c: [Arc<Chunk>; 9] = match nb.try_into() {
                Ok(a) => a,
                Err(_) => continue, // falta algum vizinho
            };
            self.dirty.remove(&k);
            self.meshing.insert(k);
            let _ = self.jobs.send(Job::Mesh(mesher::Region { c, cx, cz }));
        }
        let far = |k: &(i32, i32), d: i32| (k.0 - pcx).abs() > d || (k.1 - pcz).abs() > d;
        let gone: Vec<(i32, i32)> = self.meshes.keys().filter(|k| far(k, r + 2)).cloned().collect();
        for k in gone {
            if let Some(m) = self.meshes.remove(&k) {
                unsafe { free(g, m) };
            }
        }
        if self.modified.iter().any(|k| far(k, r + 4)) {
            self.save_chunks(Some((pcx, pcz, r + 4)));
        }
        let modified = &self.modified;
        self.chunks.retain(|k, _| !far(k, r + 4) || modified.contains(k));
        self.dirty.retain(|k| !far(k, r + 2));
    }

    fn key(&self, k: KeyCode) -> bool {
        self.keys.contains(&k)
    }

    fn update(&mut self, dt: f64) {
        // relógio do mundo (F4 segurado passa as horas 60x mais depressa)
        self.time += dt * if self.key(KeyCode::F4) { 60.0 } else { 1.0 };
        while self.time >= DAY_LENGTH {
            self.time -= DAY_LENGTH;
            self.day += 1;
        }
        // física só com o chão em volta carregado (senão cairia no vazio)
        let (px, pz) = (self.player.x.floor() as i32 >> 4, self.player.z.floor() as i32 >> 4);
        let ready = (-1..=1).all(|dx| (-1..=1).all(|dz| self.chunks.contains_key(&(px + dx, pz + dz))));
        if !ready {
            return;
        }
        let input = Input {
            fwd: self.key(KeyCode::KeyW),
            back: self.key(KeyCode::KeyS),
            left: self.key(KeyCode::KeyA),
            right: self.key(KeyCode::KeyD),
            jump: self.key(KeyCode::Space),
            sneak: self.key(KeyCode::ShiftLeft) || self.key(KeyCode::ShiftRight),
            sprint: self.key(KeyCode::ControlLeft),
        };
        // passos de no máximo 1/30 s, como um quadro lento no Java
        let mut left = dt;
        while left > 0.0 {
            let step = left.min(1.0 / 30.0);
            self.player.update(step, input, &Loaded(&self.chunks));
            left -= step;
        }
        self.tick_falling(dt);
        self.tick_fluids(dt);

        // mira (7 blocos no criativo, 5 na sobrevivência, como no Java)
        let eye = self.eye();
        let f = self.forward();
        self.aim = self.raycast([eye[0] as f64, eye[1] as f64, eye[2] as f64], [f[0] as f64, f[1] as f64, f[2] as f64], if self.creative { 7.0 } else { 5.0 });
        self.cool_l -= dt;
        self.cool_r -= dt;
        let (lp, rp, mp) = (self.l_pending, self.r_pending, self.m_pending);
        self.l_pending = false;
        self.r_pending = false;
        self.m_pending = false;
        if !self.creative {
            if lp || rp {
                self.notice("Por enquanto a versão Rust só edita mundos no modo criativo".into());
            }
            return;
        }
        // segurando o botão, repete a cada 0,2 s
        if lp || (self.l_held && self.cool_l <= 0.0) {
            if self.aim.is_some() {
                self.break_aimed();
                self.cool_l = 0.2;
            }
        }
        if rp || (self.r_held && self.cool_r <= 0.0) {
            if self.aim.is_some() {
                self.use_aimed();
                self.cool_r = 0.2;
            }
        }
        if mp {
            self.pick_aimed();
        }
        // grava de tempos em tempos (como o Java)
        if self.last_save.elapsed().as_secs() >= 30 {
            self.save_all();
        }
    }

    fn notice(&mut self, text: String) {
        self.notice = Some((text, Instant::now()));
    }

    /// Grava os pedaços mudados e a posição, a hora e a barra no meta.properties (o resto do arquivo fica igual).
    fn save_all(&mut self) {
        self.last_save = Instant::now();
        self.save_chunks(None);
        let Some(dir) = self.save_dir.clone() else { return };
        let p = &self.player;
        let mut v: Vec<(&str, String)> = vec![
            ("jogador.x", p.x.to_string()),
            ("jogador.y", p.y.to_string()),
            ("jogador.z", p.z.to_string()),
            ("jogador.yaw", p.yaw.to_string()),
            ("jogador.pitch", p.pitch.to_string()),
            ("jogador.voando", p.flying.to_string()),
            ("hora", self.time.to_string()),
            ("diaDuracao", DAY_LENGTH.to_string()),
            ("dia", self.day.to_string()),
            ("ultimoJogo", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0).to_string()),
        ];
        if let Some(inv) = save::hotbar_inventory(&dir, &self.hotbar) {
            v.push(("inventario", inv));
        }
        if let Err(e) = save::update_meta(&dir, &v) {
            println!("não consegui gravar o meta.properties: {e}");
        }
    }

    unsafe fn render(&mut self, g: &mut Gl, w: u32, h: u32) {
        let gl = &g.gl;
        gl.viewport(0, 0, w as i32, h as i32);
        let view_dist = self.settings.view_dist as f32;
        let tan_y = (self.settings.fov.to_radians() / 2.0).tan();
        let tan_x = tan_y * w as f32 / h.max(1) as f32;
        let f = self.forward();
        let right = norm(cross(f, [0.0, 1.0, 0.0]));
        let up = cross(right, f);
        let eye = self.eye();
        let view = [
            right[0], up[0], -f[0], 0.0,
            right[1], up[1], -f[1], 0.0,
            right[2], up[2], -f[2], 0.0,
            -dot(right, eye), -dot(up, eye), dot(f, eye), 1.0,
        ];
        let vp = mul(&perspective(tan_x, tan_y, 0.05, view_dist + 40.0), &view);
        let sky = sky_at(self.time);
        let time = self.start.elapsed().as_secs_f32();
        let underwater = self.player.head_in_water;
        let common = |p: glow::Program| {
            gl.use_program(Some(p));
            gl.uniform_3_f32(g.u(p, "uSun").as_ref(), sky.sun[0], sky.sun[1], sky.sun[2]);
            gl.uniform_3_f32(g.u(p, "uLightDir").as_ref(), sky.light[0], sky.light[1], sky.light[2]);
            gl.uniform_1_f32(g.u(p, "uLightStr").as_ref(), sky.light_str);
            gl.uniform_1_f32(g.u(p, "uDaylight").as_ref(), sky.daylight);
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
        // descarta pedaços fora da visão: atrás da câmera ou longe demais
        let visible = |k: &(i32, i32)| {
            let c = [k.0 as f32 * 16.0 + 8.0 - eye[0], 32.0 - eye[1], k.1 as f32 * 16.0 + 8.0 - eye[2]];
            let d2 = c[0] * c[0] + c[2] * c[2];
            dot(c, f) > -40.0 && d2 < (view_dist + 24.0) * (view_dist + 24.0)
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
        gl.uniform_1_i32(g.u(g.water, "uReflect").as_ref(), self.settings.reflections as i32);
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

        // contorno do bloco mirado
        if let Some(h) = self.aim {
            let b = self.get(h.b[0], h.b[1], h.b[2]);
            let info = block::info(b);
            let (mut lo, mut hi) = ([0.0f32; 3], [1.0f32; 3]);
            if !info.boxes.is_empty() {
                lo = [1.0; 3];
                hi = [0.0; 3];
                for (c, _) in &info.boxes {
                    for a in 0..3 {
                        lo[a] = lo[a].min(c[a]);
                        hi[a] = hi[a].max(c[a + 3]);
                    }
                }
            }
            let e = 0.002;
            let o = [h.b[0] as f32, h.b[1] as f32, h.b[2] as f32];
            let p0 = [o[0] + lo[0] - e, o[1] + lo[1] - e, o[2] + lo[2] - e];
            let p1 = [o[0] + hi[0] + e, o[1] + hi[1] + e, o[2] + hi[2] + e];
            let c = |i: usize| [if i & 1 != 0 { p1[0] } else { p0[0] }, if i & 2 != 0 { p1[1] } else { p0[1] }, if i & 4 != 0 { p1[2] } else { p0[2] }];
            let mut lines: Vec<f32> = Vec::with_capacity(72);
            for (a, b) in [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)] {
                lines.extend_from_slice(&c(a));
                lines.extend_from_slice(&c(b));
            }
            gl.enable(glow::BLEND);
            gl.blend_func(glow::SRC_ALPHA, glow::ONE_MINUS_SRC_ALPHA);
            gl.use_program(Some(g.line));
            gl.uniform_matrix_4_f32_slice(g.u(g.line, "uViewProj").as_ref(), false, &vp);
            gl.bind_vertex_array(Some(g.line_vao));
            gl.bind_buffer(glow::ARRAY_BUFFER, Some(g.line_vbo));
            gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, as_bytes(&lines), glow::STREAM_DRAW);
            gl.draw_arrays(glow::LINES, 0, 24);
        }

        // mira (inverte a cor do que está atrás)
        gl.disable(glow::DEPTH_TEST);
        gl.blend_func(glow::ONE_MINUS_DST_COLOR, glow::ZERO);
        gl.use_program(Some(g.cross));
        let (sx, sy) = (2.0 / w as f32, 2.0 / h as f32);
        let rect = |x0: f32, y0: f32, x1: f32, y1: f32| [x0 * sx, y0 * sy, x1 * sx, y0 * sy, x1 * sx, y1 * sy, x0 * sx, y0 * sy, x1 * sx, y1 * sy, x0 * sx, y1 * sy];
        let mut quads = Vec::with_capacity(36);
        quads.extend_from_slice(&rect(-9.0, -1.0, 9.0, 1.0));
        quads.extend_from_slice(&rect(-1.0, -9.0, 1.0, -1.0));
        quads.extend_from_slice(&rect(-1.0, 1.0, 1.0, 9.0));
        gl.bind_vertex_array(Some(g.cross_vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(g.cross_vbo));
        gl.buffer_data_u8_slice(glow::ARRAY_BUFFER, as_bytes(&quads), glow::STREAM_DRAW);
        gl.draw_arrays(glow::TRIANGLES, 0, 18);
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
            let name = format!("fotos/rust-{}.png", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
            if img.save(&name).is_ok() {
                println!("foto salva em {name}");
            }
        }
    }

    /// Mesmo relógio do Java: a hora 0 do mundo é 6h da manhã (o sol nascendo).
    fn clock(&self) -> String {
        let h = (self.time / DAY_LENGTH * 24.0 + 6.0) % 24.0;
        format!("{:02}:{:02}", h as i32, ((h - h.floor()) * 60.0) as i32)
    }

    fn title(&self) -> String {
        let (x, z) = (self.player.x.floor() as i32, self.player.z.floor() as i32);
        let h = self.gen.height_at(x, z);
        let biome = world::BIOME_NAMES[self.gen.biome_at(x, z, h - 1) as usize];
        format!(
            "Mundo de Blocos (Rust, prévia) — {} · Dia {}, {} · {} · X {:.0} Y {:.0} Z {:.0}{} · {} FPS",
            self.world_name,
            self.day,
            self.clock(),
            biome,
            self.player.x,
            self.player.y,
            self.player.z,
            if self.player.flying { " · voando" } else { "" },
            self.fps
        ) + &self.held_text()
    }

    fn held_text(&self) -> String {
        if let Some((t, at)) = &self.notice {
            if at.elapsed().as_secs() < 4 {
                return format!(" · {t}");
            }
        }
        let item = self.hotbar[self.slot];
        let b = block::block_of_item(item);
        let name = if b != block::AIR { block::info(b).name.clone() } else if item > 0 { format!("item {item}") } else { "mão vazia".into() };
        format!(" · [{}] {}", self.slot + 1, name)
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
    let args: Vec<String> = std::env::args().collect();
    let arg = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    if let Some(p) = arg("--comparar") {
        compare(&p);
    }
    // roda na pasta do jogo (onde ficam textures/ e worlds/), venha de onde vier
    let game_dir = arg("--pasta").map(PathBuf::from).unwrap_or_else(|| {
        let exe = std::env::current_exe().unwrap_or_default();
        exe.ancestors().find(|d| d.join("textures").is_dir()).map(|d| d.to_path_buf()).unwrap_or_else(|| PathBuf::from("."))
    });
    let _ = std::env::set_current_dir(&game_dir);
    let settings = save::read_settings();

    let info = match arg("--mundo") {
        Some(m) => save::read_world(&PathBuf::from(m)),
        None => save::latest_world(&PathBuf::from("worlds")),
    };
    let seed_arg = arg("--semente").and_then(|s| s.parse::<i32>().ok());
    let mut player = Player::default();
    let mut hotbar = [1, 3, 8, 6, 18, 19, 31, 9, 30]; // a barra inicial do criativo do Java
    let (gen, save_dir, name, creative, mut time, day) = match (&info, seed_arg) {
        (Some(w), None) => {
            let gen = Generator { seed: w.seed, biome_scale: w.biome_scale };
            match w.player {
                Some(p) => {
                    (player.x, player.y, player.z, player.yaw, player.pitch) = (p[0], p[1], p[2], p[3], p[4]);
                    player.flying = w.creative && w.flying;
                }
                None => {
                    (player.x, player.y, player.z) = (0.5, gen.height_at(0, 0).max(SEA) as f64 + 1.0, 0.5);
                }
            }
            if w.hotbar.iter().any(|&i| i > 0) {
                hotbar = w.hotbar;
            }
            (gen, Some(w.dir.clone()), w.name.clone(), w.creative, w.time, w.day)
        }
        _ => {
            let gen = Generator { seed: seed_arg.unwrap_or(2024), biome_scale: 2.0 };
            (player.x, player.y, player.z) = (0.5, gen.height_at(0, 0).max(SEA) as f64 + 1.0, 0.5);
            let name = format!("semente {}", gen.seed);
            (gen, None, name, true, DAY_LENGTH * 0.3, 1)
        }
    };
    // --posicao x y z yaw pitch: começa num lugar escolhido (bom para comparar fotos com o Java)
    if let Some(i) = args.iter().position(|a| a == "--posicao") {
        let v: Vec<f64> = args[i + 1..].iter().take(5).filter_map(|s| s.parse().ok()).collect();
        if v.len() == 5 {
            (player.x, player.y, player.z, player.yaw, player.pitch) = (v[0], v[1], v[2], v[3], v[4]);
            player.flying = false; // num lugar escolhido começa a pé (use --voando para começar voando)
        }
    }
    // --hora 0..1: fração do dia (0 = nascer do sol, 0,25 = meio-dia, 0,5 = pôr do sol, 0,75 = meia-noite)
    if let Some(h) = arg("--hora").and_then(|s| s.parse::<f64>().ok()) {
        time = h.rem_euclid(1.0) * DAY_LENGTH;
    }
    if args.iter().any(|a| a == "--voando") {
        player.flying = true;
    }
    println!("Mundo de Blocos (Rust): {name} — semente {}, biomas x{}, {}", gen.seed, gen.biome_scale, if creative { "criativo" } else { "sobrevivência" });

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
    let vsync = settings.vsync && !args.iter().any(|a| a == "--sem-vsync");
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
        let line_p = compile(&gl, shaders::LINE_VS, shaders::LINE_FS);
        let line_vao = gl.create_vertex_array().unwrap();
        let line_vbo = gl.create_buffer().unwrap();
        gl.bind_vertex_array(Some(line_vao));
        gl.bind_buffer(glow::ARRAY_BUFFER, Some(line_vbo));
        gl.enable_vertex_attrib_array(0);
        gl.vertex_attrib_pointer_f32(0, 3, glow::FLOAT, false, 12, 0);
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
        let mut g = Gl { gl, block: block_p, water: water_p, sky: sky_p, cross: cross_p, empty_vao, cross_vao, cross_vbo, line: line_p, line_vao, line_vbo, ebo, ebo_quads: 0, tex };
        g.ensure_indices(1 << 16);
        g
    };
    drop(atlas);

    let read_only = args.iter().any(|a| a == "--so-ler");
    let mut game = Game::new(gen, if read_only { None } else { save_dir.clone() }, name, settings, player, creative, time, day, hotbar);
    // a leitura dos pedaços salvos continua valendo mesmo em --so-ler (só não grava)
    let _ = &save_dir;
    // modo de teste: --foto-e-sair N tira uma foto no quadro N e fecha; --andar segura W o tempo todo
    let auto_shot = arg("--foto-e-sair").and_then(|s| s.parse::<u32>().ok());
    if args.iter().any(|a| a == "--andar") {
        game.keys.insert(KeyCode::KeyW);
    }
    // --clicar quadro botão (e=esquerdo, d=direito), várias vezes: aperta o botão no quadro dado (testes)
    let mut clicks: Vec<(u32, char)> = Vec::new();
    for (i, a) in args.iter().enumerate() {
        if a == "--clicar" {
            if let (Some(f), Some(b)) = (args.get(i + 1).and_then(|s| s.parse().ok()), args.get(i + 2).and_then(|s| s.chars().next())) {
                clicks.push((f, b));
            }
        }
    }
    if let Some(s) = arg("--espaco").and_then(|s| s.parse::<usize>().ok()) {
        game.slot = s.clamp(1, 9) - 1;
    }
    let mut frame_no = 0u32;
    event_loop.set_control_flow(ControlFlow::Poll);
    event_loop
        .run(move |event, elwt| match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => {
                    game.save_all();
                    elwt.exit();
                }
                WindowEvent::Resized(s) => {
                    if s.width > 0 && s.height > 0 {
                        gl_surface.resize(&gl_ctx, NonZeroU32::new(s.width).unwrap(), NonZeroU32::new(s.height).unwrap());
                    }
                }
                WindowEvent::Focused(false) => {
                    if auto_shot.is_none() {
                        game.keys.clear();
                    }
                }
                WindowEvent::KeyboardInput { event, .. } => {
                    if let PhysicalKey::Code(code) = event.physical_key {
                        if event.state == ElementState::Pressed {
                            if !event.repeat {
                                match code {
                                    KeyCode::Escape => {
                                        game.grabbed = false;
                                        let _ = window.set_cursor_grab(CursorGrabMode::None);
                                        window.set_cursor_visible(true);
                                    }
                                    KeyCode::F2 => game.screenshot = true,
                                    KeyCode::Digit1 | KeyCode::Digit2 | KeyCode::Digit3 | KeyCode::Digit4 | KeyCode::Digit5 | KeyCode::Digit6
                                    | KeyCode::Digit7 | KeyCode::Digit8 | KeyCode::Digit9 => {
                                        game.slot = code as usize - KeyCode::Digit1 as usize;
                                    }
                                    KeyCode::F3 => game.ao = !game.ao,
                                    KeyCode::Space => {
                                        // dois toques rápidos no espaço: voa (só no criativo, como no Java)
                                        let now = Instant::now();
                                        if game.creative && game.last_space.map_or(false, |t| now - t < std::time::Duration::from_millis(300)) {
                                            game.player.flying = !game.player.flying;
                                            game.player.vy = 0.0;
                                            game.last_space = None;
                                        } else {
                                            game.last_space = Some(now);
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            game.keys.insert(code);
                        } else {
                            game.keys.remove(&code);
                        }
                    }
                }
                WindowEvent::MouseInput { state, button, .. } => {
                    let down = state == ElementState::Pressed;
                    if !game.grabbed {
                        if down && button == MouseButton::Left {
                            game.grabbed = true;
                            let _ = window.set_cursor_grab(CursorGrabMode::Confined).or_else(|_| window.set_cursor_grab(CursorGrabMode::Locked));
                            window.set_cursor_visible(false);
                        }
                    } else {
                        match button {
                            MouseButton::Left => {
                                game.l_held = down;
                                if down {
                                    game.l_pending = true;
                                }
                            }
                            MouseButton::Right => {
                                game.r_held = down;
                                if down {
                                    game.r_pending = true;
                                }
                            }
                            MouseButton::Middle => {
                                if down {
                                    game.m_pending = true;
                                }
                            }
                            _ => {}
                        }
                    }
                }
                WindowEvent::MouseWheel { delta, .. } => {
                    let d = match delta {
                        MouseScrollDelta::LineDelta(_, y) => y,
                        MouseScrollDelta::PixelDelta(p) => p.y as f32,
                    };
                    if d != 0.0 {
                        let n = if d > 0.0 { 8 } else { 1 }; // rodinha para cima volta um espaço
                        game.slot = (game.slot + n) % 9;
                    }
                }
                WindowEvent::RedrawRequested => {
                    let now = Instant::now();
                    let dt = (now - game.last).as_secs_f64().min(0.25);
                    game.last = now;
                    game.update(dt);
                    game.stream(&mut g);
                    let size = window.inner_size();
                    frame_no += 1;
                    for &(f, b) in &clicks {
                        if f == frame_no {
                            if b == 'e' { game.l_pending = true } else { game.r_pending = true }
                        }
                    }
                    if auto_shot == Some(frame_no) {
                        game.screenshot = true;
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
                            println!("{} · chão: {} · mira: {:?}", game.title(), game.player.on_ground, game.aim.map(|h| h.b));
                        }
                    }
                    if auto_shot.map_or(false, |n| frame_no > n) {
                        game.save_all();
                        elwt.exit();
                    }
                }
                _ => {}
            },
            Event::DeviceEvent { event: DeviceEvent::MouseMotion { delta }, .. } => {
                if game.grabbed {
                    let s = game.settings.sensitivity;
                    game.player.yaw -= delta.0 * s; // mouse para a direita gira para a direita
                    game.player.pitch = (game.player.pitch - delta.1 * s).clamp(-1.55, 1.55);
                }
            }
            Event::AboutToWait => window.request_redraw(),
            _ => {}
        })
        .unwrap();
}
