//! Sons, traduzidos do Sounds.java: os mesmos arquivos WAV da pasta `sounds/` (o Java cria os padrão na primeira
//! vez; quem trocou algum ouve o seu aqui também). Um mixador próprio toca vários sons de uma vez, com volume pela
//! distância, lado (esquerda/direita) e uma pequena variação de tom para não soar repetitivo.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

const RATE: f64 = 44100.0;
/// Os nomes do Sounds.LIST (os arquivos que existem).
const NAMES: &[&str] = &[
    "quebrar_terra", "quebrar_areia", "quebrar_pedra", "quebrar_madeira", "quebrar_planta", "quebrar_vidro", "colocar",
    "drop", "coletar", "passo_grama", "passo_areia", "passo_pedra", "passo_madeira", "dano", "comer", "respingo", "porco",
    "ovelha", "galinha", "morto_vivo", "aranha", "vaca", "pavio", "explosao", "criatura_dano", "esqueleto", "passaro",
    "lobo", "urso", "raposa", "domar", "rugido", "miau", "pinguim", "boi", "arco_tensao", "arco_disparo",
    "flecha_madeira", "flecha_pedra", "flecha_criatura", "clique",
];

struct Voice {
    data: Arc<Vec<f32>>,
    pos: f64,
    speed: f64,
    left: f32,
    right: f32,
}

struct Mixer {
    samples: HashMap<&'static str, Arc<Vec<f32>>>,
    voices: Mutex<Vec<Voice>>,
    master: Mutex<f32>,
    /// mantém a saída de áudio viva (o cpal para de tocar quando ela é descartada)
    _stream: Mutex<Option<SendStream>>,
}

struct SendStream(#[allow(dead_code)] cpal::Stream);
// o Stream do cpal só não é Send por precaução de algumas plataformas; aqui ele só é guardado, nunca usado de outra thread
unsafe impl Send for SendStream {}

static MIXER: OnceLock<Option<Mixer>> = OnceLock::new();
static RNG: Mutex<u64> = Mutex::new(0x9E3779B97F4A7C15);

fn rand() -> f64 {
    let mut s = RNG.lock().unwrap();
    *s ^= *s << 13;
    *s ^= *s >> 7;
    *s ^= *s << 17;
    (*s >> 11) as f64 / (1u64 << 53) as f64
}

/// Carrega os sons e liga a saída de áudio. Sem placa de som (ou sem a pasta), o jogo segue mudo.
pub fn init(volume: f32) {
    MIXER.get_or_init(|| {
        let mut samples = HashMap::new();
        for &n in NAMES {
            if let Some(d) = std::fs::read(format!("sounds/{n}.wav")).ok().and_then(|b| read_wav(&b)) {
                samples.insert(n, Arc::new(d));
            }
        }
        let m = Mixer { samples, voices: Mutex::new(Vec::new()), master: Mutex::new(volume), _stream: Mutex::new(None) };
        Some(m)
    });
    if let Some(Some(m)) = MIXER.get() {
        match start_stream() {
            Ok(s) => {
                *m._stream.lock().unwrap() = Some(SendStream(s));
                println!("{} sons carregados", m.samples.len());
            }
            Err(e) => eprintln!("Sons desligados: {e}"),
        }
    }
}

/// Toca um som "na cabeça" do jogador.
pub fn play(name: &str, volume: f64) {
    voice(name, volume, 0.0, 0.92 + rand() * 0.16);
}

/// Toca um som vindo de um ponto do mundo: mais baixo de longe, e do lado certo.
/// `ear` é a posição dos olhos e `yaw` para onde a câmera olha.
pub fn play_at(name: &str, at: [f64; 3], ear: [f64; 3], yaw: f64, volume: f64) {
    let (dx, dy, dz) = (at[0] - ear[0], at[1] - ear[1], at[2] - ear[2]);
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    let fade = (1.0 - dist / 24.0).max(0.0);
    if fade <= 0.0 {
        return;
    }
    let (rx, rz) = (-yaw.cos(), yaw.sin()); // direita da câmera
    let pan = if dist < 0.5 { 0.0 } else { (dx * rx + dz * rz) / dist };
    voice(name, volume * fade * fade, pan * 0.8, 0.9 + rand() * 0.2);
}

fn voice(name: &str, volume: f64, pan: f64, pitch: f64) {
    let Some(Some(m)) = MIXER.get() else { return };
    let master = *m.master.lock().unwrap();
    if master <= 0.0 {
        return;
    }
    let Some(data) = m.samples.get(name) else { return };
    let v = volume as f32 * master;
    let l = v * ((1.0 - pan as f32) / 2.0).sqrt() * 1.41;
    let r = v * ((1.0 + pan as f32) / 2.0).sqrt() * 1.41;
    let mut vs = m.voices.lock().unwrap();
    if vs.len() > 24 {
        vs.remove(0);
    }
    vs.push(Voice { data: data.clone(), pos: 0.0, speed: pitch, left: l, right: r });
}

fn start_stream() -> Result<cpal::Stream, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let host = cpal::default_host();
    let dev = host.default_output_device().ok_or("sem saída de áudio")?;
    let cfg = dev.default_output_config().map_err(|e| e.to_string())?;
    let channels = cfg.channels() as usize;
    let out_rate = cfg.sample_rate().0 as f64;
    let step = RATE / out_rate; // os sons estão em 44,1 kHz; a placa pode estar em 48 kHz
    let sc: cpal::StreamConfig = cfg.clone().into();
    let err = |e| eprintln!("áudio: {e}");
    let mut buf: Vec<(f32, f32)> = Vec::new();
    let mut fill = move |frames: usize| -> Vec<(f32, f32)> {
        buf.clear();
        buf.resize(frames, (0.0, 0.0));
        if let Some(Some(m)) = MIXER.get() {
            let mut vs = m.voices.lock().unwrap();
            vs.retain_mut(|v| {
                for o in buf.iter_mut() {
                    let p0 = v.pos as usize;
                    if p0 + 1 >= v.data.len() {
                        return false;
                    }
                    let f = (v.pos - p0 as f64) as f32;
                    let s = v.data[p0] * (1.0 - f) + v.data[p0 + 1] * f;
                    o.0 += s * v.left;
                    o.1 += s * v.right;
                    v.pos += v.speed * step;
                }
                true
            });
        }
        // compressão suave para vários sons juntos não estourarem
        buf.iter().map(|&(l, r)| (((l * 1.1).tanh() * 0.977), ((r * 1.1).tanh() * 0.977))).collect()
    };
    let stream = match cfg.sample_format() {
        cpal::SampleFormat::F32 => dev.build_output_stream(
            &sc,
            move |out: &mut [f32], _| {
                let mix = fill(out.len() / channels);
                for (fr, &(l, r)) in out.chunks_mut(channels).zip(mix.iter()) {
                    for (c, s) in fr.iter_mut().enumerate() {
                        *s = if channels == 1 { (l + r) * 0.5 } else if c % 2 == 0 { l } else { r };
                    }
                }
            },
            err,
            None,
        ),
        cpal::SampleFormat::I16 => dev.build_output_stream(
            &sc,
            move |out: &mut [i16], _| {
                let mix = fill(out.len() / channels);
                for (fr, &(l, r)) in out.chunks_mut(channels).zip(mix.iter()) {
                    for (c, s) in fr.iter_mut().enumerate() {
                        let v = if channels == 1 { (l + r) * 0.5 } else if c % 2 == 0 { l } else { r };
                        *s = (v * 32000.0) as i16;
                    }
                }
            },
            err,
            None,
        ),
        f => return Err(format!("formato de áudio {f:?} não suportado")),
    }
    .map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}

/// Lê um WAV PCM (8/16/24/32 bits inteiro ou 32 bits float, mono ou estéreo, qualquer taxa) e devolve mono 44,1 kHz.
pub fn read_wav(b: &[u8]) -> Option<Vec<f32>> {
    if b.len() < 12 || &b[0..4] != b"RIFF" || &b[8..12] != b"WAVE" {
        return None;
    }
    let u16_at = |i: usize| u16::from_le_bytes([b[i], b[i + 1]]);
    let u32_at = |i: usize| u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]);
    let (mut fmt, mut ch, mut rate, mut bits) = (0u16, 0usize, 0f64, 0usize);
    let mut data: Option<&[u8]> = None;
    let mut i = 12;
    while i + 8 <= b.len() {
        let id = &b[i..i + 4];
        let len = u32_at(i + 4) as usize;
        let body = &b[i + 8..(i + 8 + len).min(b.len())];
        if id == b"fmt " && body.len() >= 16 {
            fmt = u16_at(i + 8);
            ch = u16_at(i + 10) as usize;
            rate = u32_at(i + 12) as f64;
            bits = u16_at(i + 22) as usize;
            if fmt == 0xFFFE && body.len() >= 26 {
                fmt = u16_at(i + 8 + 24); // WAVE_FORMAT_EXTENSIBLE: o formato de verdade vem no subformato
            }
        } else if id == b"data" {
            data = Some(body);
        }
        i += 8 + len + (len & 1);
    }
    let data = data?;
    if ch == 0 || rate <= 0.0 || !(fmt == 1 || (fmt == 3 && bits == 32)) {
        return None;
    }
    let bps = bits / 8;
    if bps == 0 {
        return None;
    }
    let frames = data.len() / (bps * ch);
    let sample = |o: usize| -> f32 {
        let s = &data[o..o + bps];
        match (fmt, bits) {
            (3, _) => f32::from_le_bytes([s[0], s[1], s[2], s[3]]),
            (_, 8) => (s[0] as f32 - 128.0) / 128.0,
            (_, 16) => i16::from_le_bytes([s[0], s[1]]) as f32 / 32768.0,
            (_, 24) => (((s[2] as i32) << 24 | (s[1] as i32) << 16 | (s[0] as i32) << 8) >> 8) as f32 / 8388608.0,
            (_, 32) => i32::from_le_bytes([s[0], s[1], s[2], s[3]]) as f32 / 2147483648.0,
            _ => 0.0,
        }
    };
    let mono: Vec<f32> = (0..frames).map(|f| (0..ch).map(|c| sample((f * ch + c) * bps)).sum::<f32>() / ch as f32).collect();
    let ratio = rate / RATE;
    if (ratio - 1.0).abs() < 1e-6 {
        return Some(mono);
    }
    let n = (frames as f64 / ratio) as usize;
    Some(
        (0..n)
            .map(|i| {
                let p = i as f64 * ratio;
                let p0 = p as usize;
                let f = (p - p0 as f64) as f32;
                mono[p0.min(frames - 1)] * (1.0 - f) + mono[(p0 + 1).min(frames - 1)] * f
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn le_os_wav_do_java() {
        let b = std::fs::read("../sounds/clique.wav").expect("sounds/clique.wav");
        let d = super::read_wav(&b).expect("wav");
        assert!(d.len() > 1000 && d.iter().any(|s| s.abs() > 0.05));
    }
}

/// Som de quebrar o bloco (BlockGame.breakSound).
pub fn break_sound(b: u8) -> &'static str {
    use crate::block::*;
    if b == 18 || b == ICE || b == PACKED_ICE || b == BLUE_ICE || b == 218 {
        return "quebrar_vidro";
    }
    if b == SAND || b == GRAVEL || b == SNOW {
        return "quebrar_areia";
    }
    if b == WOOL {
        return "quebrar_planta";
    }
    match info(b).material {
        M_WOOD => "quebrar_madeira",
        M_PLANT => "quebrar_planta",
        M_SOIL => "quebrar_terra",
        _ => "quebrar_pedra",
    }
}

/// Som do passo sobre o bloco (BlockGame.stepSound).
pub fn step_sound(b: u8) -> &'static str {
    use crate::block::*;
    if b == SAND || b == GRAVEL || b == SNOW {
        return "passo_areia";
    }
    match info(b).material {
        M_WOOD => "passo_madeira",
        M_SOIL | M_PLANT => "passo_grama",
        _ => if b == WOOL { "passo_grama" } else { "passo_pedra" },
    }
}
