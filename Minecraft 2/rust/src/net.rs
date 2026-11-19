//! Jogar em LAN com o mesmo protocolo do Net.java (também pelo Radmin VPN): o Rust entra num mundo aberto pelo
//! Java (ou pelo Rust) e abre o próprio mundo para amigos do Java ou do Rust.
//!
//! TCP simples: cada pacote = tamanho (int) + tipo (byte) + dados, em big-endian e com os textos no "UTF-8
//! modificado" do DataOutputStream do Java. Uma thread por conexão lê os pacotes e os põe numa fila; o jogo trata a
//! fila a cada quadro. Quem manda no mundo é o anfitrião: criaturas, itens no chão, flechas, baús e fornalhas; os
//! amigos geram o terreno pela semente e recebem só o que foi modificado.

use crate::inventory::Stack;
use crate::{block, items, mob, Game};
use std::collections::HashMap;
use std::io::{BufReader, BufWriter, Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};

pub const PORT: u16 = 25600;
/// Tem que ser igual ao Net.VERSION do Java (os dois jogos só se conectam na mesma versão).
pub const VERSION: i32 = 21;

pub const HELLO: u8 = 1;
pub const WELCOME: u8 = 2;
pub const JOIN: u8 = 3;
pub const LEAVE: u8 = 4;
pub const STATE: u8 = 5;
pub const BLOCK: u8 = 6;
pub const TIME: u8 = 7;
pub const MOBS: u8 = 8;
pub const HIT_MOB: u8 = 9;
pub const DAMAGE: u8 = 10;
pub const GIVE: u8 = 11;
pub const SAVE_STATE: u8 = 12;
pub const BYE: u8 = 13;
pub const CHAT: u8 = 14;
pub const EXPLODE: u8 = 15;
pub const CHEST_OPEN: u8 = 16;
pub const CHEST_DATA: u8 = 17;
pub const CHEST_SET: u8 = 18;
pub const DROP_NEW: u8 = 19;
pub const SHOOT: u8 = 20;
pub const ARROW: u8 = 21;
pub const ARROW_STUCK: u8 = 22;
pub const ARROW_GONE: u8 = 23;
pub const DROP_REQ: u8 = 24;
pub const DROP_GONE: u8 = 25;
pub const DROP_SET: u8 = 26;
pub const DROP_SYNC: u8 = 27;
pub const DROP_OFFER: u8 = 28;
pub const DROP_TAKEN: u8 = 29;
pub const CHAT_IMAGE: u8 = 30;
pub const MOB_USE: u8 = 31;
pub const TOAST: u8 = 32;
pub const MOB_SPAWN: u8 = 33;
pub const FURNACE_OPEN: u8 = 34;
pub const FURNACE_DATA: u8 = 35;
pub const FURNACE_SET: u8 = 36;
pub const BLOOD: u8 = 37;
pub const CLOSED: u8 = 99;

// ------------------------------------------------------------------ montar e ler pacotes
pub struct Out {
    t: u8,
    b: Vec<u8>,
}

impl Out {
    pub fn new(t: u8) -> Out {
        Out { t, b: Vec::new() }
    }
    pub fn i(mut self, v: i32) -> Out {
        self.b.extend_from_slice(&v.to_be_bytes());
        self
    }
    pub fn f(mut self, v: f64) -> Out {
        self.b.extend_from_slice(&(v as f32).to_be_bytes());
        self
    }
    pub fn dbl(mut self, v: f64) -> Out {
        self.b.extend_from_slice(&v.to_be_bytes());
        self
    }
    pub fn bo(mut self, v: bool) -> Out {
        self.b.push(v as u8);
        self
    }
    /// DataOutputStream.writeUTF: tamanho (u16) + UTF-8 modificado.
    pub fn s(mut self, v: &str) -> Out {
        let mut e = Vec::new();
        for c in v.encode_utf16() {
            if (1..=0x7F).contains(&c) {
                e.push(c as u8);
            } else if c <= 0x7FF {
                e.push(0xC0 | (c >> 6) as u8);
                e.push(0x80 | (c & 0x3F) as u8);
            } else {
                e.push(0xE0 | (c >> 12) as u8);
                e.push(0x80 | ((c >> 6) & 0x3F) as u8);
                e.push(0x80 | (c & 0x3F) as u8);
            }
            if e.len() > 65000 {
                break;
            }
        }
        self.b.extend_from_slice(&(e.len() as u16).to_be_bytes());
        self.b.extend_from_slice(&e);
        self
    }
    pub fn raw(mut self, v: &[u8]) -> Out {
        self.b.extend_from_slice(&(v.len() as i32).to_be_bytes());
        self.b.extend_from_slice(v);
        self
    }
}

/// Leitor de um pacote recebido (faltando bytes, devolve zeros: pacote estranho não derruba o jogo).
pub struct In<'a> {
    d: &'a [u8],
    p: usize,
}

impl<'a> In<'a> {
    pub fn new(d: &'a [u8]) -> In<'a> {
        In { d, p: 0 }
    }
    fn take(&mut self, n: usize) -> &'a [u8] {
        let s = &self.d[self.p.min(self.d.len())..(self.p + n).min(self.d.len())];
        self.p += n;
        s
    }
    pub fn i(&mut self) -> i32 {
        let s = self.take(4);
        if s.len() < 4 { 0 } else { i32::from_be_bytes([s[0], s[1], s[2], s[3]]) }
    }
    pub fn f(&mut self) -> f64 {
        let s = self.take(4);
        if s.len() < 4 { 0.0 } else { f32::from_be_bytes([s[0], s[1], s[2], s[3]]) as f64 }
    }
    pub fn dbl(&mut self) -> f64 {
        let s = self.take(8);
        if s.len() < 8 { 0.0 } else { f64::from_be_bytes(s.try_into().unwrap()) }
    }
    pub fn bo(&mut self) -> bool {
        self.take(1).first().map_or(false, |&b| b != 0)
    }
    pub fn s(&mut self) -> String {
        let l = self.take(2);
        if l.len() < 2 {
            return String::new();
        }
        let n = u16::from_be_bytes([l[0], l[1]]) as usize;
        let b = self.take(n);
        let mut u: Vec<u16> = Vec::new();
        let mut i = 0;
        while i < b.len() {
            let c = b[i] as u16;
            if c & 0x80 == 0 {
                u.push(c);
                i += 1;
            } else if c & 0xE0 == 0xC0 && i + 1 < b.len() {
                u.push(((c & 0x1F) << 6) | (b[i + 1] as u16 & 0x3F));
                i += 2;
            } else if i + 2 < b.len() {
                u.push(((c & 0x0F) << 12) | ((b[i + 1] as u16 & 0x3F) << 6) | (b[i + 2] as u16 & 0x3F));
                i += 3;
            } else {
                break;
            }
        }
        String::from_utf16_lossy(&u)
    }
    pub fn raw(&mut self) -> Vec<u8> {
        let n = self.i().max(0) as usize;
        self.take(n).to_vec()
    }
}

// ------------------------------------------------------------------ conexões
/// Uma conexão: escreve daqui (com buffer) e uma thread lê e põe os pacotes na fila.
#[derive(Clone)]
pub struct Conn {
    w: Arc<Mutex<BufWriter<TcpStream>>>,
    stream: Arc<TcpStream>,
    pub closed: Arc<AtomicBool>,
}

impl Conn {
    fn new(s: TcpStream) -> std::io::Result<Conn> {
        s.set_nodelay(true)?;
        let w = BufWriter::with_capacity(1 << 16, s.try_clone()?);
        Ok(Conn { w: Arc::new(Mutex::new(w)), stream: Arc::new(s), closed: Arc::new(AtomicBool::new(false)) })
    }

    pub fn send(&self, o: &Out) {
        if self.closed.load(Ordering::Relaxed) {
            return;
        }
        let mut w = self.w.lock().unwrap();
        let ok = w.write_all(&(o.b.len() as i32).to_be_bytes()).and_then(|_| w.write_all(&[o.t])).and_then(|_| w.write_all(&o.b));
        if ok.is_err() {
            self.closed.store(true, Ordering::Relaxed);
        }
    }

    pub fn flush(&self) {
        if self.closed.load(Ordering::Relaxed) {
            return;
        }
        if self.w.lock().unwrap().flush().is_err() {
            self.closed.store(true, Ordering::Relaxed);
        }
    }

    pub fn close(&self) {
        self.flush();
        self.closed.store(true, Ordering::Relaxed);
        let _ = self.stream.shutdown(std::net::Shutdown::Both);
    }

    /// Começa a ler em segundo plano: cada pacote vai para a fila com o número desta conexão.
    fn start_reading(&self, id: usize, tx: Sender<(usize, u8, Vec<u8>)>) {
        let (s, closed) = (self.stream.try_clone(), self.closed.clone());
        let Ok(s) = s else { return };
        std::thread::Builder::new()
            .name("rede-leitura".into())
            .spawn(move || {
                let mut r = BufReader::with_capacity(1 << 16, s);
                while let Ok((t, d)) = read_packet(&mut r) {
                    if tx.send((id, t, d)).is_err() {
                        return;
                    }
                }
                closed.store(true, Ordering::Relaxed);
                let _ = tx.send((id, CLOSED, Vec::new()));
            })
            .ok();
    }
}

fn read_packet<R: Read>(r: &mut R) -> std::io::Result<(u8, Vec<u8>)> {
    let mut h = [0u8; 5];
    r.read_exact(&mut h)?;
    let len = i32::from_be_bytes([h[0], h[1], h[2], h[3]]);
    if !(0..=64 << 20).contains(&len) {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "pacote inválido"));
    }
    let mut d = vec![0u8; len as usize];
    r.read_exact(&mut d)?;
    Ok((h[4], d))
}

/// Endereços desta máquina para os amigos digitarem (o do Radmin começa com 26.).
pub fn local_addresses() -> Vec<String> {
    let mut v = Vec::new();
    // "conectar" um soquete UDP não manda nada: só pergunta ao sistema qual placa de rede iria até lá
    for probe in ["26.0.0.1:80", "8.8.8.8:80", "192.168.0.1:80"] {
        if let Ok(s) = UdpSocket::bind("0.0.0.0:0") {
            if s.connect(probe).is_ok() {
                if let Ok(a) = s.local_addr() {
                    let ip = a.ip().to_string();
                    let label = if ip.starts_with("26.") { format!("{ip} (Radmin)") } else { ip };
                    if !label.starts_with("0.") && !label.starts_with("127.") && !v.contains(&label) {
                        v.push(label);
                    }
                }
            }
        }
    }
    v
}

// ------------------------------------------------------------------ outros jogadores
pub struct Remote {
    pub id: i32,
    pub name: String,
    /// pele, cabelo, camisa, calça (índices do Persona.java)
    pub persona: [usize; 4],
    pub pos: [f64; 3],
    pub yaw: f64,
    pub pitch: f64,
    target: [f64; 5],
    pub walk: f64,
    pub speed: f64,
    pub swing: f64,
    pub held: i32,
    pub has_state: bool,
    /// só no anfitrião: a conexão desse amigo
    pub conn: Option<usize>,
}

impl Remote {
    fn new(id: i32, name: String, persona: [usize; 4]) -> Remote {
        Remote { id, name, persona, pos: [0.0; 3], yaw: 0.0, pitch: 0.0, target: [0.0; 5], walk: 0.0, speed: 0.0, swing: 0.0, held: 0, has_state: false, conn: None }
    }

    fn set_target(&mut self, t: [f64; 5], swinging: bool, held: i32) {
        self.target = t;
        if swinging && self.swing <= 0.0 {
            self.swing = 0.3;
        }
        self.held = held;
        if !self.has_state {
            self.pos = [t[0], t[1], t[2]];
            self.yaw = t[3];
            self.has_state = true;
        }
    }

    /// Anda suavemente até a última posição recebida (Remote.update).
    fn update(&mut self, dt: f64) {
        let k = (dt * 12.0).min(1.0);
        let (ox, oz) = (self.pos[0], self.pos[2]);
        for a in 0..3 {
            self.pos[a] += (self.target[a] - self.pos[a]) * k;
        }
        let dy = (self.target[3] - self.yaw).sin().atan2((self.target[3] - self.yaw).cos());
        self.yaw += dy * k;
        self.pitch += (self.target[4] - self.pitch) * k;
        let moved = ((self.pos[0] - ox).powi(2) + (self.pos[2] - oz).powi(2)).sqrt();
        self.walk += moved;
        self.speed += (if dt > 0.0 { moved / dt } else { 0.0 } - self.speed) * (dt * 8.0).min(1.0);
        self.swing = (self.swing - dt).max(0.0);
    }
}

pub fn persona_from(v: [i32; 4]) -> [usize; 4] {
    let lens = [6, 8, 9, 7];
    [0, 1, 2, 3].map(|i| v[i].rem_euclid(lens[i]) as usize)
}

// ------------------------------------------------------------------ o estado da rede no jogo
pub enum Role {
    Client(Conn),
    Host { conns: Arc<Mutex<HashMap<usize, Conn>>>, stop: Arc<AtomicBool> },
}

pub struct Net {
    pub role: Role,
    rx: Receiver<(usize, u8, Vec<u8>)>,
    pub my_id: i32,
    pub remotes: HashMap<i32, Remote>,
    next_remote_id: i32,
    state_timer: f64,
    mob_timer: f64,
    time_timer: f64,
    save_timer: f64,
    drop_timer: f64,
    /// aplicando uma mudança que veio da rede (não manda de volta)
    pub applying: bool,
    /// mudanças em pedaços que ainda não carregaram aqui: valem quando carregarem
    pub pending: HashMap<(i32, i32), Vec<(i32, i32, i32, u8, u8)>>,
    /// anfitrião: estado salvo de cada amigo ("lan.<nome>" no meta.properties)
    pub lan_players: HashMap<String, String>,
    /// anfitrião: quem está com cada fornalha aberta
    furnace_holder: HashMap<String, usize>,
}

/// O que o anfitrião mandou ao entrar (WELCOME).
pub struct Welcome {
    pub name: String,
    pub seed: i32,
    pub creative: bool,
    pub time: f64,
    pub day: i32,
    pub spawn: [f64; 3],
    pub state: String,
    pub biome_scale: f64,
    pub chunks: HashMap<(i32, i32), Vec<u8>>,
}

/// Amigo: conecta no anfitrião e faz o aperto de mão (bloqueia até 6 s; rode numa thread).
pub fn connect(ip: &str, name: &str, persona: [usize; 4]) -> Result<(Net, Welcome), String> {
    let ip = ip.replace(" (Radmin)", "");
    let ip = ip.trim();
    let addr = if ip.contains(':') { ip.to_string() } else { format!("{ip}:{PORT}") };
    let sock = std::net::ToSocketAddrs::to_socket_addrs(&addr).map_err(|e| format!("endereço inválido: {e}"))?.next().ok_or("endereço inválido")?;
    let s = TcpStream::connect_timeout(&sock, std::time::Duration::from_secs(6))
        .map_err(|e| format!("não consegui conectar em {addr} ({e}). Confira o IP, se o mundo foi aberto para LAN e o firewall."))?;
    let _ = s.set_read_timeout(Some(std::time::Duration::from_secs(60)));
    let conn = Conn::new(s.try_clone().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let p = persona.map(|v| v as i32);
    conn.send(&Out::new(HELLO).i(VERSION).s(name).i(p[0]).i(p[1]).i(p[2]).i(p[3]));
    conn.flush();
    let mut r = BufReader::new(s.try_clone().map_err(|e| e.to_string())?);
    let (t, d) = read_packet(&mut r).map_err(|e| format!("conexão interrompida: {e}"))?;
    let mut d = In::new(&d);
    if t == BYE {
        return Err(d.s());
    }
    if t != WELCOME {
        return Err("resposta inesperada do anfitrião".into());
    }
    let w_name = d.s();
    let (seed, creative, time, day) = (d.i(), d.bo(), d.dbl(), d.i());
    let spawn = [d.f(), d.f(), d.f()];
    let my_id = d.i();
    let state = d.s();
    let biome_scale = d.dbl();
    let raw = d.raw();
    let mut chunks = HashMap::new();
    let mut m = In::new(&raw);
    for _ in 0..m.i() {
        let (cx, cz) = (m.i(), m.i());
        chunks.insert((cx, cz), m.raw());
    }
    let _ = s.set_read_timeout(None);
    // o resto dos pacotes vem pela thread de leitura (o BufReader do aperto de mão pode ter guardado bytes a mais,
    // então a leitura continua nele mesmo)
    let (tx, rx) = channel();
    let closed = conn.closed.clone();
    std::thread::Builder::new()
        .name("rede-leitura".into())
        .spawn(move || {
            while let Ok((t, d)) = read_packet(&mut r) {
                if tx.send((0, t, d)).is_err() {
                    return;
                }
            }
            closed.store(true, Ordering::Relaxed);
            let _ = tx.send((0, CLOSED, Vec::new()));
        })
        .ok();
    let net = Net::new(Role::Client(conn), rx, my_id);
    Ok((net, Welcome { name: format!("LAN: {w_name}"), seed, creative, time, day, spawn, state, biome_scale, chunks }))
}

impl Net {
    fn new(role: Role, rx: Receiver<(usize, u8, Vec<u8>)>, my_id: i32) -> Net {
        Net {
            role,
            rx,
            my_id,
            remotes: HashMap::new(),
            next_remote_id: 1,
            state_timer: 0.0,
            mob_timer: 0.0,
            time_timer: 0.0,
            save_timer: 10.0,
            drop_timer: 0.0,
            applying: false,
            pending: HashMap::new(),
            lan_players: HashMap::new(),
            furnace_holder: HashMap::new(),
        }
    }

    /// Anfitrião: abre a porta e aceita amigos em segundo plano.
    pub fn host(lan_players: HashMap<String, String>) -> Result<Net, String> {
        let l = TcpListener::bind(("0.0.0.0", PORT)).map_err(|e| format!("Não consegui abrir na porta {PORT}: {e}"))?;
        let (tx, rx) = channel();
        let conns: Arc<Mutex<HashMap<usize, Conn>>> = Arc::new(Mutex::new(HashMap::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let (c2, s2) = (conns.clone(), stop.clone());
        let _ = l.set_nonblocking(true);
        std::thread::Builder::new()
            .name("rede-servidor".into())
            .spawn(move || {
                let mut next = 1usize;
                while !s2.load(Ordering::Relaxed) {
                    match l.accept() {
                        Ok((s, _)) => {
                            let _ = s.set_nonblocking(false);
                            if let Ok(c) = Conn::new(s) {
                                c.start_reading(next, tx.clone());
                                c2.lock().unwrap().insert(next, c);
                                next += 1;
                            }
                        }
                        Err(_) => std::thread::sleep(std::time::Duration::from_millis(50)),
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        let mut n = Net::new(Role::Host { conns, stop }, rx, 0);
        n.lan_players = lan_players;
        Ok(n)
    }

    pub fn is_host(&self) -> bool {
        matches!(self.role, Role::Host { .. })
    }

    /// Manda ao anfitrião (amigo) ou a todos os amigos que já entraram (anfitrião), menos `except`.
    pub fn send(&self, o: Out, except: Option<usize>) {
        match &self.role {
            Role::Client(c) => c.send(&o),
            Role::Host { conns, .. } => {
                let joined: Vec<usize> = self.remotes.values().filter_map(|r| r.conn).collect();
                for (id, c) in conns.lock().unwrap().iter() {
                    if Some(*id) != except && joined.contains(id) {
                        c.send(&o);
                    }
                }
            }
        }
    }

    fn send_to(&self, conn: usize, o: Out) {
        if let Role::Host { conns, .. } = &self.role {
            if let Some(c) = conns.lock().unwrap().get(&conn) {
                c.send(&o);
            }
        }
    }

    fn flush(&self) {
        match &self.role {
            Role::Client(c) => c.flush(),
            Role::Host { conns, .. } => {
                let mut m = conns.lock().unwrap();
                for c in m.values() {
                    c.flush();
                }
                m.retain(|_, c| !c.closed.load(Ordering::Relaxed));
            }
        }
    }

    /// Fecha tudo (o anfitrião avisa os amigos; o amigo se despede).
    pub fn close(&mut self, reason: &str) {
        match &self.role {
            Role::Client(c) => {
                c.send(&Out::new(BYE).s("saiu"));
                c.close();
            }
            Role::Host { conns, stop } => {
                stop.store(true, Ordering::Relaxed);
                for c in conns.lock().unwrap().values() {
                    c.send(&Out::new(BYE).s(reason));
                    c.close();
                }
            }
        }
    }

    fn remote_by_conn(&self, conn: usize) -> Option<i32> {
        self.remotes.values().find(|r| r.conn == Some(conn)).map(|r| r.id)
    }
}

pub fn join_packet(id: i32, name: &str, p: [usize; 4]) -> Out {
    Out::new(JOIN).i(id).s(name).i(p[0] as i32).i(p[1] as i32).i(p[2] as i32).i(p[3] as i32)
}

/// Estado salvo do amigo no mundo do anfitrião: x;y;z;yaw;pitch;vida;fome;inventário (Remote.stateString).
pub fn state_string(g: &Game) -> String {
    let p = &g.player;
    format!("{};{};{};{};{};{};{};{}", p.x, p.y, p.z, p.yaw, p.pitch, g.health, g.food, g.inv.serialize().replace("\\:", ":"))
}

fn mob_anim(m: &mob::Mob) -> f64 {
    match m.t {
        mob::CREEPER => m.fuse,
        mob::SKELETON => m.aim,
        _ if m.fighter() => (m.tamed as i32 + if m.sitting { 2 } else { 0 } + if m.angry > 0.0 { 4 } else { 0 }) as f64,
        mob::BIRD => m.flying as i32 as f64,
        _ => 0.0,
    }
}

fn apply_mob_anim(m: &mut mob::Mob, a: f64) {
    match m.t {
        mob::CREEPER => m.fuse = a,
        mob::SKELETON => m.aim = a,
        _ if m.fighter() => {
            let f = a as i32;
            m.tamed = f & 1 != 0;
            m.sitting = f & 2 != 0;
            m.angry = if f & 4 != 0 { 1.0 } else { 0.0 };
        }
        mob::BIRD => m.flying = a > 0.5,
        _ => {}
    }
}

fn drop_packet(d: &crate::survival::Drop) -> Out {
    let b = &d.body;
    Out::new(DROP_NEW).i(d.id).i(d.st.id).i(d.st.count).i(d.st.wear).f(b.x).f(b.y).f(b.z).f(b.vx).f(b.vy).f(b.vz).f(d.phase)
}

pub fn arrow_packet(a: &crate::mobs::Arrow, sound: bool) -> Out {
    Out::new(ARROW).i(a.id).i(a.owner).f(a.p[0]).f(a.p[1]).f(a.p[2]).f(a.v[0]).f(a.v[1]).f(a.v[2]).bo(sound)
}

pub fn stuck_packet(a: &crate::mobs::Arrow) -> Out {
    let b = [a.p[0].floor() as i32, a.p[1].floor() as i32, a.p[2].floor() as i32];
    Out::new(ARROW_STUCK).i(a.id).f(a.p[0]).f(a.p[1]).f(a.p[2]).f(a.d[0]).f(a.d[1]).f(a.d[2]).i(b[0]).i(b[1]).i(b[2])
}

/// Chave "x,y,z" dos baús e fornalhas, como no Java.
fn key(x: i32, y: i32, z: i32) -> String {
    format!("{x},{y},{z}")
}

impl Game {
    pub fn is_client(&self) -> bool {
        self.net.as_ref().map_or(false, |n| !n.is_host())
    }

    pub fn is_host(&self) -> bool {
        self.net.as_ref().map_or(false, |n| n.is_host())
    }

    /// Um bloco mudou neste jogo: o anfitrião repassa a todos; o amigo avisa o anfitrião.
    pub fn net_block(&self, x: i32, y: i32, z: i32, b: u8, rot: u8) {
        if let Some(n) = &self.net {
            if n.applying && !n.is_host() {
                return;
            }
            n.send(Out::new(BLOCK).i(x).i(y).i(z).i(b as i32 | (rot as i32) << 8), None);
        }
    }

    /// Mudança vinda da rede: aplica (ou guarda até o pedaço carregar).
    fn remote_set(&mut self, x: i32, y: i32, z: i32, b: u8, rot: u8) {
        if !(0..crate::world::SY).contains(&y) || b as usize >= block::count() {
            return;
        }
        let k = (x >> 4, z >> 4);
        if !self.chunks.contains_key(&k) {
            if let Some(n) = self.net.as_mut() {
                n.pending.entry(k).or_default().push((x, y, z, b, rot));
            }
            return;
        }
        if let Some(n) = self.net.as_mut() {
            n.applying = true;
        }
        let was = self.get(x, y, z);
        if self.is_host() && was != b && (was == block::CHEST || was == block::FURNACE || was == block::FURNACE_LIT) {
            self.spill_container(x, y, z, was); // um amigo quebrou o baú/fornalha: o conteúdo cai no chão
        }
        self.set(x, y, z, b, rot);
        if let Some(n) = self.net.as_mut() {
            n.applying = false;
        }
    }

    /// Um pedaço carregou: aplica as mudanças da rede que chegaram antes dele.
    pub fn net_chunk_loaded(&mut self, cx: i32, cz: i32) {
        let list = self.net.as_mut().and_then(|n| n.pending.remove(&(cx, cz)));
        for (x, y, z, b, rot) in list.unwrap_or_default() {
            self.remote_set(x, y, z, b, rot);
        }
    }

    /// Abre o mundo para a LAN.
    pub fn open_to_lan(&mut self) {
        if self.net.is_some() {
            return;
        }
        match Net::host(self.lan_saved.clone()) {
            Ok(n) => {
                self.net = Some(n);
                let ips = local_addresses();
                self.notice(format!("Aberto na LAN! Seu IP: {}  porta {PORT}", ips.first().cloned().unwrap_or("?".into())));
            }
            Err(e) => self.notice(e),
        }
    }

    /// Fecha a rede (o amigo manda o progresso antes).
    pub fn close_net(&mut self, reason: &str) {
        if self.is_client() {
            let s = state_string(self);
            if let Some(n) = &self.net {
                n.send(Out::new(SAVE_STATE).s(&s), None);
            }
        }
        if let Some(mut n) = self.net.take() {
            n.close(reason);
        }
    }

    /// Todo quadro: trata as mensagens e manda o estado.
    pub fn net_update(&mut self, dt: f64) {
        if self.net.is_none() {
            return;
        }
        let mut msgs = Vec::new();
        if let Some(n) = &self.net {
            while let Ok(m) = n.rx.try_recv() {
                msgs.push(m);
            }
        }
        for (conn, t, d) in msgs {
            if self.is_host() {
                self.host_packet(conn, t, &d);
            } else {
                self.client_packet(t, &d);
            }
            if self.net.is_none() {
                return;
            }
        }
        let host = self.is_host();
        let (px, py, pz, yaw, pitch) = (self.player.x, self.player.y, self.player.z, self.player.yaw, self.player.pitch);
        let held = self.inv.s[self.slot];
        let held = if held.empty() { 0 } else { held.id };
        let swing = self.swing > 0.2;
        let mobs_out = if host {
            let mut o = Out::new(MOBS).i(self.mobs.len() as i32);
            for m in &self.mobs {
                o = o.i(m.id).i(m.t as i32).f(m.body.x).f(m.body.y).f(m.body.z).f(m.yaw).f(m.walk).bo(m.hurt > 0.0).f(mob_anim(m));
            }
            Some(o)
        } else {
            None
        };
        let save = if host { None } else { Some(state_string(self)) };
        let (time, day) = (self.time, self.day);
        let moving: Vec<(i32, [f64; 6])> = if host {
            self.drops.iter().filter(|d| !d.body.on_ground || d.body.vx.abs() + d.body.vz.abs() > 0.05).take(200).map(|d| (d.id, [d.body.x, d.body.y, d.body.z, d.body.vx, d.body.vy, d.body.vz])).collect()
        } else {
            Vec::new()
        };
        // anfitrião: oferece os itens do chão a quem chegou perto
        let mut offers = Vec::new();
        if host {
            for d in self.drops.iter_mut() {
                d.pending = (d.pending - dt).max(0.0);
                if d.age < d.delay || d.pending > 0.0 {
                    continue;
                }
                let n = self.net.as_ref().unwrap();
                if let Some(r) = n.remotes.values().find(|r| r.has_state && (r.pos[0] - d.body.x).abs() < 1.3 && (r.pos[2] - d.body.z).abs() < 1.3 && (r.pos[1] + 0.9 - d.body.y).abs() < 1.5) {
                    if let Some(c) = r.conn {
                        offers.push((c, Out::new(DROP_OFFER).i(d.id).i(d.st.id).i(d.st.count).i(d.st.wear)));
                        d.pending = 1.0;
                    }
                }
            }
        }
        let n = self.net.as_mut().unwrap();
        for r in n.remotes.values_mut() {
            r.update(dt);
        }
        for (c, o) in offers {
            n.send_to(c, o);
        }
        n.state_timer -= dt;
        if n.state_timer <= 0.0 {
            n.state_timer = 0.05; // 20 vezes por segundo
            n.send(Out::new(STATE).i(n.my_id).f(px).f(py).f(pz).f(yaw).f(pitch).bo(swing).i(held), None);
        }
        if host {
            n.time_timer -= dt;
            if n.time_timer <= 0.0 {
                n.time_timer = 2.0;
                n.send(Out::new(TIME).dbl(time).i(day), None);
            }
            n.mob_timer -= dt;
            if n.mob_timer <= 0.0 {
                n.mob_timer = 0.1;
                n.send(mobs_out.unwrap(), None);
            }
            n.drop_timer -= dt;
            if n.drop_timer <= 0.0 && !moving.is_empty() {
                n.drop_timer = 0.2;
                let mut o = Out::new(DROP_SYNC).i(moving.len() as i32);
                for (id, v) in moving {
                    o = o.i(id).f(v[0]).f(v[1]).f(v[2]).f(v[3]).f(v[4]).f(v[5]);
                }
                n.send(o, None);
            }
        } else {
            n.save_timer -= dt;
            if n.save_timer <= 0.0 {
                n.save_timer = 10.0;
                n.send(Out::new(SAVE_STATE).s(&save.unwrap()), None);
            }
        }
        n.flush();
    }

    // ------------------------------------------------------------------ amigo
    fn client_packet(&mut self, t: u8, data: &[u8]) {
        let mut d = In::new(data);
        match t {
            JOIN => {
                let (id, name) = (d.i(), d.s());
                let p = persona_from([d.i(), d.i(), d.i(), d.i()]);
                if id != 0 {
                    self.notice(format!("{name} entrou no mundo"));
                }
                if let Some(n) = self.net.as_mut() {
                    n.remotes.insert(id, Remote::new(id, name, p));
                }
            }
            LEAVE => {
                let id = d.i();
                if let Some(r) = self.net.as_mut().and_then(|n| n.remotes.remove(&id)) {
                    self.notice(format!("{} saiu do mundo", r.name));
                }
            }
            STATE => {
                let id = d.i();
                let t = [d.f(), d.f(), d.f(), d.f(), d.f()];
                let (sw, held) = (d.bo(), d.i());
                if let Some(r) = self.net.as_mut().and_then(|n| n.remotes.get_mut(&id)) {
                    r.set_target(t, sw, held);
                }
            }
            BLOCK => {
                let (x, y, z, v) = (d.i(), d.i(), d.i(), d.i());
                self.remote_set(x, y, z, (v & 0xFF) as u8, ((v >> 8) & 3) as u8);
            }
            TIME => {
                self.time = d.dbl();
                self.day = d.i();
            }
            MOBS => {
                let n = d.i().max(0) as usize;
                let mut seen = Vec::with_capacity(n);
                for _ in 0..n {
                    let (id, t) = (d.i(), d.i());
                    let (x, y, z, yaw, walk) = (d.f(), d.f(), d.f(), d.f(), d.f());
                    let (hurt, anim) = (d.bo(), d.f());
                    if t < 0 || t as usize >= mob::TYPES {
                        continue;
                    }
                    let i = match self.mobs.iter().position(|m| m.id == id) {
                        Some(i) => i,
                        None => {
                            let m = mob::Mob::new(t as usize, x, y, z, id, &mut self.rng);
                            self.mobs.push(m);
                            self.mobs.len() - 1
                        }
                    };
                    let m = &mut self.mobs[i];
                    m.body.vx = (x - m.body.x) * 10.0; // para a animação das pernas
                    m.body.vz = (z - m.body.z) * 10.0;
                    (m.body.x, m.body.y, m.body.z, m.yaw, m.walk) = (x, y, z, yaw, walk);
                    if hurt {
                        m.hurt = 0.1;
                    }
                    apply_mob_anim(m, anim);
                    seen.push(id);
                }
                self.mobs.retain(|m| seen.contains(&m.id));
            }
            EXPLODE => {
                let (x, y, z, power) = (d.f(), d.f(), d.f(), d.f());
                self.blast_effects([x, y, z], power);
            }
            ARROW => {
                let (id, owner) = (d.i(), d.i());
                let p = [d.f(), d.f(), d.f()];
                let v = [d.f(), d.f(), d.f()];
                let sound = d.bo();
                self.arrows.retain(|a| a.id != id);
                let mut a = crate::mobs::Arrow::new(p, v, 0.0, -3, false);
                (a.id, a.owner, a.life) = (id, owner, 90.0);
                self.arrows.push(a);
                if sound && owner != self.net.as_ref().map_or(0, |n| n.my_id) {
                    self.sfx("arco_disparo", p, 0.8);
                }
            }
            ARROW_STUCK => {
                let id = d.i();
                let p = [d.f(), d.f(), d.f()];
                let dir = [d.f(), d.f(), d.f()];
                if let Some(a) = self.arrows.iter_mut().find(|a| a.id == id) {
                    (a.p, a.d, a.v, a.stuck) = (p, dir, [0.0; 3], true);
                }
            }
            ARROW_GONE => {
                let (id, kind) = (d.i(), d.i());
                let p = [d.f(), d.f(), d.f()];
                self.arrows.retain(|a| a.id != id);
                if kind == 1 {
                    self.sfx("flecha_criatura", p, 0.9);
                    self.hit_bits(p, 0xB02020, 10);
                }
            }
            CHEST_DATA => {
                let (x, y, z) = (d.i(), d.i(), d.i());
                let data = d.s();
                let k = key(x, y, z);
                self.chests.insert(k.clone(), crate::containers::parse_slots(&data, crate::containers::CHEST_SIZE));
                if self.screen == crate::Screen::Play {
                    self.open = Some(crate::containers::Open::Chest(k));
                    self.screen = crate::Screen::Inventory;
                    self.release_mouse = true;
                }
            }
            FURNACE_DATA => {
                let (x, y, z) = (d.i(), d.i(), d.i());
                let data = d.s();
                let k = key(x, y, z);
                if self.screen != crate::Screen::Play {
                    // não dá para abrir agora: devolve na hora
                    if let Some(n) = &self.net {
                        n.send(Out::new(FURNACE_SET).i(x).i(y).i(z).s(&data), None);
                    }
                    return;
                }
                self.furnaces.insert(k.clone(), crate::containers::Furnace::parse(&data));
                self.open = Some(crate::containers::Open::Furnace(k));
                self.screen = crate::Screen::Inventory;
                self.release_mouse = true;
            }
            DROP_NEW => {
                let (id, item, count, wear) = (d.i(), d.i(), d.i(), d.i());
                let p = [d.f(), d.f(), d.f()];
                let v = [d.f(), d.f(), d.f()];
                let phase = d.f();
                if items::exists(item) && count > 0 && !self.drops.iter().any(|x| x.id == id) {
                    self.add_drop(id, Stack::new(item, count, wear), p, v, 0.0, phase);
                }
            }
            DROP_GONE => {
                let id = d.i();
                self.drops.retain(|x| x.id != id);
            }
            DROP_SET => {
                let (id, count) = (d.i(), d.i());
                if let Some(x) = self.drops.iter_mut().find(|x| x.id == id) {
                    if count > 0 {
                        x.st.count = count;
                    }
                }
            }
            DROP_SYNC => {
                for _ in 0..d.i().max(0) {
                    let id = d.i();
                    let v = [d.f(), d.f(), d.f(), d.f(), d.f(), d.f()];
                    if let Some(x) = self.drops.iter_mut().find(|x| x.id == id) {
                        let b = &mut x.body;
                        if (b.x - v[0]).abs() + (b.y - v[1]).abs() + (b.z - v[2]).abs() > 0.4 {
                            (b.x, b.y, b.z) = (v[0], v[1], v[2]); // perto: deixa a queda local; longe: encaixa
                        }
                        (b.vx, b.vy, b.vz) = (v[3], v[4], v[5]);
                    }
                }
            }
            DROP_OFFER => {
                // o anfitrião diz que chegamos perto de um item: pega se couber
                let (id, item, count, wear) = (d.i(), d.i(), d.i(), d.i());
                let mut left = count;
                if self.health > 0.0 && items::exists(item) {
                    left = self.inv.add(item, count, wear);
                    if left < count {
                        crate::sound::play("coletar", 0.7);
                    }
                }
                if let Some(n) = &self.net {
                    n.send(Out::new(DROP_TAKEN).i(id).i(left), None);
                }
            }
            DAMAGE => {
                let (n, x, z) = (d.f(), d.f(), d.f());
                if !self.creative && self.health > 0.0 {
                    self.hit(n);
                    let (kx, kz) = (self.player.x - x, self.player.z - z);
                    let kl = (kx * kx + kz * kz).sqrt().max(0.01);
                    self.player.vx += kx / kl * 8.0;
                    self.player.vz += kz / kl * 8.0;
                    self.player.vy = 5.0;
                }
            }
            GIVE => {
                let (item, count, from) = (d.i(), d.i(), d.s());
                self.inv.add(item, count, 0);
                self.notice(format!("{from}: +{count} {}", items::name(item)));
            }
            CHAT => {
                let (from, text) = (d.s(), d.s());
                self.notice(format!("<{from}> {text}"));
            }
            BLOOD => {
                let p = [d.f(), d.f(), d.f()];
                self.blood(p);
            }
            TOAST => {
                let s = d.s();
                self.notice(s);
            }
            BYE => {
                let why = d.s();
                self.net_ended(why);
            }
            CLOSED => self.net_ended("Conexão com o anfitrião perdida".into()),
            _ => {}
        }
    }

    /// O amigo perdeu a conexão: volta ao menu com o motivo.
    fn net_ended(&mut self, why: String) {
        if let Some(mut n) = self.net.take() {
            n.close("");
        }
        self.remotes_gone();
        self.open_menu();
        self.menu.error = Some(why);
    }

    fn remotes_gone(&mut self) {
        self.mobs.clear();
        self.drops.clear();
        self.arrows.clear();
    }

    // ------------------------------------------------------------------ anfitrião
    fn host_packet(&mut self, conn: usize, t: u8, data: &[u8]) {
        let mut d = In::new(data);
        let rid = self.net.as_ref().and_then(|n| n.remote_by_conn(conn));
        if rid.is_none() && t != HELLO && t != BYE && t != CLOSED {
            return;
        }
        let rid = rid.unwrap_or(-1);
        match t {
            HELLO => {
                let version = d.i();
                let name = d.s();
                let p = persona_from([d.i(), d.i(), d.i(), d.i()]);
                let n = self.net.as_mut().unwrap();
                if version != VERSION {
                    n.send_to(conn, Out::new(BYE).s("Versões diferentes do jogo: atualize os dois para a mesma versão."));
                    n.flush();
                    return;
                }
                let name = if name.trim().is_empty() { "Amigo".to_string() } else { name };
                let taken = |u: &str, n: &Net, me: &str| u.eq_ignore_ascii_case(me) || n.remotes.values().any(|r| r.name.eq_ignore_ascii_case(u));
                let mut unique = name.clone();
                let mut k = 2;
                while taken(&unique, n, &self.player_name) {
                    unique = format!("{name} {k}");
                    k += 1;
                }
                let id = n.next_remote_id;
                n.next_remote_id += 1;
                let saved = n.lan_players.get(&unique).cloned().unwrap_or_default();
                let modified = self.export_modified();
                let mut o = Out::new(WELCOME)
                    .s(&self.world_name)
                    .i(self.gen.seed)
                    .bo(self.creative)
                    .dbl(self.time)
                    .i(self.day)
                    .f(self.spawn[0])
                    .f(self.spawn[1])
                    .f(self.spawn[2])
                    .i(id)
                    .s(&saved)
                    .dbl(self.gen.biome_scale);
                o = o.raw(&modified);
                let me = (self.player_name.clone(), self.persona);
                let drops: Vec<Out> = self.drops.iter().map(drop_packet).collect();
                let arrows: Vec<(Out, Option<Out>)> = self.arrows.iter().map(|a| (arrow_packet(a, false), if a.stuck { Some(stuck_packet(a)) } else { None })).collect();
                let n = self.net.as_mut().unwrap();
                n.send_to(conn, o);
                n.send_to(conn, join_packet(0, if me.0.is_empty() { "Anfitrião" } else { &me.0 }, me.1));
                for r in n.remotes.values() {
                    n.send_to(conn, join_packet(r.id, &r.name, r.persona));
                }
                for o in drops {
                    n.send_to(conn, o);
                }
                for (a, s) in arrows {
                    n.send_to(conn, a);
                    if let Some(s) = s {
                        n.send_to(conn, s);
                    }
                }
                n.send(join_packet(id, &unique, p), None);
                let mut r = Remote::new(id, unique.clone(), p);
                r.conn = Some(conn);
                n.remotes.insert(id, r);
                self.notice(format!("{unique} entrou no mundo"));
            }
            STATE => {
                d.i();
                let t = [d.f(), d.f(), d.f(), d.f(), d.f()];
                let (sw, held) = (d.bo(), d.i());
                let n = self.net.as_mut().unwrap();
                if let Some(r) = n.remotes.get_mut(&rid) {
                    r.set_target(t, sw, held);
                }
                n.send(Out::new(STATE).i(rid).f(t[0]).f(t[1]).f(t[2]).f(t[3]).f(t[4]).bo(sw).i(held), Some(conn));
            }
            BLOCK => {
                let (x, y, z, v) = (d.i(), d.i(), d.i(), d.i());
                // o set repassa a todos (como o listener do Java)
                self.remote_set(x, y, z, (v & 0xFF) as u8, ((v >> 8) & 3) as u8);
            }
            SHOOT => {
                let p = [d.f(), d.f(), d.f()];
                let v = [d.f(), d.f(), d.f()];
                let (dmg, pickup) = (d.f(), d.bo());
                let sp = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
                if sp <= 42.0 && (0.0..=9.5).contains(&dmg) {
                    self.spawn_arrow(crate::mobs::Arrow::new(p, v, dmg, -1, pickup && !self.creative), rid);
                }
            }
            DROP_REQ => {
                let (item, count, wear) = (d.i(), d.i(), d.i());
                let p = [d.f(), d.f(), d.f()];
                let v = [d.f(), d.f(), d.f()];
                let delay = d.f();
                if items::exists(item) && count >= 1 && count <= items::max_stack(item) && wear >= 0 && (0.0..=3.0).contains(&delay) && v.iter().all(|c| c.abs() < 30.0) {
                    self.spawn_drop(Stack::new(item, count, wear), p, v, delay);
                }
            }
            DROP_TAKEN => {
                let (id, left) = (d.i(), d.i());
                if left <= 0 {
                    self.drops.retain(|x| x.id != id);
                    if let Some(n) = &self.net {
                        n.send(Out::new(DROP_GONE).i(id), None);
                    }
                } else if let Some(x) = self.drops.iter_mut().find(|x| x.id == id) {
                    if left < x.st.count {
                        x.st.count = left;
                        if let Some(n) = &self.net {
                            n.send(Out::new(DROP_SET).i(id).i(left), None);
                        }
                    }
                    x.pending = 2.0; // inventário cheio: não insiste por um tempo
                }
            }
            CHEST_OPEN => {
                let (x, y, z) = (d.i(), d.i(), d.i());
                if self.get(x, y, z) != block::CHEST {
                    return;
                }
                let k = self.chest_for(x, y, z);
                let s = crate::containers::serialize_slots(&self.chests[&k]).replace("\\:", ":");
                self.net.as_ref().unwrap().send_to(conn, Out::new(CHEST_DATA).i(x).i(y).i(z).s(&s));
            }
            CHEST_SET => {
                let (x, y, z) = (d.i(), d.i(), d.i());
                let s = d.s();
                if self.get(x, y, z) == block::CHEST {
                    self.chests.insert(key(x, y, z), crate::containers::parse_slots(&s, crate::containers::CHEST_SIZE));
                }
            }
            FURNACE_OPEN => {
                let (x, y, z) = (d.i(), d.i(), d.i());
                let b = self.get(x, y, z);
                if b != block::FURNACE && b != block::FURNACE_LIT {
                    return;
                }
                let k = key(x, y, z);
                let mine = self.open == Some(crate::containers::Open::Furnace(k.clone()));
                let n = self.net.as_mut().unwrap();
                if mine {
                    n.send_to(conn, Out::new(TOAST).s("O anfitrião está usando essa fornalha"));
                    return;
                }
                if n.furnace_holder.get(&k).map_or(false, |&c| c != conn) {
                    n.send_to(conn, Out::new(TOAST).s("Outro jogador está usando essa fornalha"));
                    return;
                }
                n.furnace_holder.insert(k.clone(), conn);
                let f = self.furnaces.entry(k).or_default().serialize().replace("\\:", ":");
                self.net.as_ref().unwrap().send_to(conn, Out::new(FURNACE_DATA).i(x).i(y).i(z).s(&f));
            }
            FURNACE_SET => {
                let (x, y, z) = (d.i(), d.i(), d.i());
                let s = d.s();
                let k = key(x, y, z);
                let n = self.net.as_mut().unwrap();
                if n.furnace_holder.get(&k) != Some(&conn) {
                    return; // só quem abriu devolve
                }
                n.furnace_holder.remove(&k);
                let b = self.get(x, y, z);
                if b == block::FURNACE || b == block::FURNACE_LIT {
                    self.furnaces.insert(k, crate::containers::Furnace::parse(&s));
                }
            }
            HIT_MOB => {
                let id = d.i();
                let (dmg, kx, kz) = (d.f(), d.f(), d.f());
                if let Some(i) = self.mobs.iter().position(|m| m.id == id) {
                    self.damage_mob(i, dmg, [kx, kz]);
                }
            }
            SAVE_STATE => {
                let s = d.s();
                let n = self.net.as_mut().unwrap();
                if let Some(r) = n.remotes.get(&rid) {
                    n.lan_players.insert(r.name.clone(), s);
                }
            }
            CHAT => {
                d.s();
                let text: String = d.s().chars().take(100).collect();
                let n = self.net.as_ref().unwrap();
                let name = n.remotes.get(&rid).map(|r| r.name.clone()).unwrap_or_default();
                n.send(Out::new(CHAT).s(&name).s(&text), Some(conn));
                self.notice(format!("<{name}> {text}"));
            }
            CHAT_IMAGE => {
                // fotos do chat do Java: esta versão não mostra, mas repassa aos outros
                d.s();
                let photo = d.raw();
                let n = self.net.as_ref().unwrap();
                let name = n.remotes.get(&rid).map(|r| r.name.clone()).unwrap_or_default();
                n.send(Out::new(CHAT_IMAGE).s(&name).raw(&photo), Some(conn));
            }
            MOB_SPAWN => {
                let t = d.i();
                let (x, y, z, yaw) = (d.f(), d.f(), d.f(), d.f());
                if t >= 0 && (t as usize) < mob::TYPES && self.chunks.contains_key(&((x.floor() as i32) >> 4, (z.floor() as i32) >> 4)) {
                    if let Some(i) = self.add_mob(t as usize, x, y, z) {
                        self.mobs[i].yaw = yaw;
                    }
                }
            }
            MOB_USE => {
                let (id, held) = (d.i(), d.i());
                let name = self.net.as_ref().unwrap().remotes.get(&rid).map(|r| r.name.clone()).unwrap_or_default();
                if let Some(i) = self.mobs.iter().position(|m| m.id == id) {
                    if let Some(msg) = self.mob_use(i, held, &name) {
                        self.net.as_ref().unwrap().send_to(conn, Out::new(TOAST).s(&msg));
                    }
                }
            }
            BYE | CLOSED => {
                let n = self.net.as_mut().unwrap();
                n.furnace_holder.retain(|_, c| *c != conn);
                if let Role::Host { conns, .. } = &n.role {
                    if let Some(c) = conns.lock().unwrap().remove(&conn) {
                        c.close();
                    }
                }
                if let Some(r) = n.remotes.remove(&rid) {
                    n.send(Out::new(LEAVE).i(rid), None);
                    self.notice(format!("{} saiu do mundo", r.name));
                }
            }
            _ => {}
        }
    }

    /// Os pedaços modificados (do disco e os mexidos agora), no formato do World.exportModified.
    fn export_modified(&self) -> Vec<u8> {
        let mut all: HashMap<(i32, i32), Vec<u8>> = HashMap::new();
        if let Some(dir) = &self.save_dir {
            if let Ok(rd) = std::fs::read_dir(dir.join("chunks")) {
                for e in rd.flatten() {
                    let n = e.file_name().to_string_lossy().to_string();
                    let Some(stem) = n.strip_suffix(".dat") else { continue };
                    let v: Vec<i32> = stem.split('_').filter_map(|s| s.parse().ok()).collect();
                    if v.len() == 2 {
                        if let Ok(b) = std::fs::read(e.path()) {
                            all.insert((v[0], v[1]), b);
                        }
                    }
                }
            }
        }
        for k in &self.modified {
            if let Some(c) = self.chunks.get(k) {
                all.insert(*k, c.to_bytes());
            }
        }
        let mut o = Out::new(0).i(all.len() as i32);
        for ((cx, cz), b) in all {
            o = o.i(cx).i(cz).raw(&b);
        }
        o.b
    }

    /// Anfitrião: põe a flecha no mundo e avisa os amigos (owner 0 = o anfitrião).
    pub fn spawn_arrow(&mut self, mut a: crate::mobs::Arrow, owner: i32) {
        self.arrow_id += 1;
        a.id = self.arrow_id;
        a.owner = owner;
        if let Some(n) = &self.net {
            n.send(arrow_packet(&a, true), None);
        }
        if owner != 0 {
            self.sfx("arco_disparo", a.p, 0.8);
        }
        self.arrows.push(a);
    }

    /// Botão para o painel de LAN da pausa: linhas de texto com o estado da rede.
    pub fn lan_info(&self) -> Vec<String> {
        match &self.net {
            Some(n) if n.is_host() => {
                let ips = local_addresses();
                vec![
                    format!("Aberto na LAN  ·  {} amigo(s) conectado(s)", n.remotes.len()),
                    format!("Seus amigos entram com o IP: {}", if ips.is_empty() { "?".to_string() } else { ips.join("   ou   ") }),
                    format!("Porta {PORT}  ·  pelo Radmin, use o IP que começa com 26."),
                ]
            }
            Some(n) => vec![format!("Você está no mundo de outro jogador ({} jogadores)", n.remotes.len() + 1), "O progresso fica salvo com o anfitrião".into()],
            None => vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn texto_igual_ao_java() {
        // DataOutputStream.writeUTF("ção") = 00 05 C3 A7 C3 A3 6F
        let o = Out::new(0).s("ção");
        assert_eq!(o.b, vec![0, 5, 0xC3, 0xA7, 0xC3, 0xA3, 0x6F]);
        let mut i = In::new(&o.b);
        assert_eq!(i.s(), "ção");
        let o = Out::new(0).i(-2).f(1.5).dbl(0.25).bo(true);
        let mut i = In::new(&o.b);
        assert_eq!((i.i(), i.f(), i.dbl(), i.bo()), (-2, 1.5, 0.25, true));
    }
}
