//! Ruído e sorteios, iguaizinhos aos do Java (World.hash, noise, fbm e java.util.Random):
//! com a mesma semente, o mundo gerado aqui é bloco por bloco o mesmo do jogo Java.
//! (Conferido com `mundo-de-blocos --comparar`, que compara pedaços gerados pelos dois.)

/// World.hash: contas de int do Java (estouram e dão a volta), `>>>` é deslocamento sem sinal.
#[inline]
pub fn hash(x: i32, z: i32, s: i32) -> f64 {
    let mut h = x
        .wrapping_mul(374761393)
        .wrapping_add(z.wrapping_mul(668265263))
        .wrapping_add(s.wrapping_mul(1442695041));
    h = (h ^ ((h as u32 >> 13) as i32)).wrapping_mul(1274126177);
    h ^= (h as u32 >> 16) as i32;
    (h & 0x7fffffff) as f64 / 2147483647.0
}

#[inline]
pub fn hash3(x: i32, y: i32, z: i32, s: i32) -> f64 {
    let mut h = x
        .wrapping_mul(374761393)
        .wrapping_add(y.wrapping_mul(1103515245))
        .wrapping_add(z.wrapping_mul(668265263))
        .wrapping_add(s.wrapping_mul(1442695041));
    h = (h ^ ((h as u32 >> 13) as i32)).wrapping_mul(1274126177);
    h ^= (h as u32 >> 16) as i32;
    (h & 0x7fffffff) as f64 / 2147483647.0
}

pub fn noise(x: f64, z: f64, s: i32) -> f64 {
    let x0 = x.floor() as i32;
    let z0 = z.floor() as i32;
    let fx = x - x0 as f64;
    let fz = z - z0 as f64;
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uz = fz * fz * (3.0 - 2.0 * fz);
    let a = hash(x0, z0, s);
    let b = hash(x0.wrapping_add(1), z0, s);
    let c = hash(x0, z0.wrapping_add(1), s);
    let d = hash(x0.wrapping_add(1), z0.wrapping_add(1), s);
    let ab = a + (b - a) * ux;
    let cd = c + (d - c) * ux;
    ab + (cd - ab) * uz
}

pub fn noise3(x: f64, y: f64, z: f64, s: i32) -> f64 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let z0 = z.floor() as i32;
    let fx = x - x0 as f64;
    let fy = y - y0 as f64;
    let fz = z - z0 as f64;
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uy = fy * fy * (3.0 - 2.0 * fy);
    let uz = fz * fz * (3.0 - 2.0 * fz);
    let c000 = hash3(x0, y0, z0, s);
    let c100 = hash3(x0 + 1, y0, z0, s);
    let c010 = hash3(x0, y0 + 1, z0, s);
    let c110 = hash3(x0 + 1, y0 + 1, z0, s);
    let c001 = hash3(x0, y0, z0 + 1, s);
    let c101 = hash3(x0 + 1, y0, z0 + 1, s);
    let c011 = hash3(x0, y0 + 1, z0 + 1, s);
    let c111 = hash3(x0 + 1, y0 + 1, z0 + 1, s);
    let x00 = c000 + (c100 - c000) * ux;
    let x10 = c010 + (c110 - c010) * ux;
    let x01 = c001 + (c101 - c001) * ux;
    let x11 = c011 + (c111 - c011) * ux;
    let y0v = x00 + (x10 - x00) * uy;
    let y1v = x01 + (x11 - x01) * uy;
    y0v + (y1v - y0v) * uz
}

pub fn fbm(x: f64, z: f64, octaves: i32, s: i32) -> f64 {
    let (mut sum, mut amp, mut norm, mut f) = (0.0, 1.0, 0.0, 1.0);
    for i in 0..octaves {
        sum += noise(x * f, z * f, s.wrapping_add(i * 31)) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2.0;
    }
    sum / norm
}

/// java.util.Random (o mesmo gerador congruente de 48 bits), usado nas árvores.
pub struct JavaRandom {
    seed: i64,
}

impl JavaRandom {
    const MULT: i64 = 0x5DEECE66D;
    const MASK: i64 = (1 << 48) - 1;

    pub fn new(seed: i64) -> Self {
        JavaRandom { seed: (seed ^ Self::MULT) & Self::MASK }
    }

    fn next(&mut self, bits: u32) -> i32 {
        self.seed = (self.seed.wrapping_mul(Self::MULT).wrapping_add(0xB)) & Self::MASK;
        (self.seed as u64 >> (48 - bits)) as i32
    }

    pub fn next_double(&mut self) -> f64 {
        let hi = (self.next(26) as i64) << 27;
        let lo = self.next(27) as i64;
        (hi + lo) as f64 * (1.0 / (1i64 << 53) as f64)
    }

    pub fn next_int(&mut self, bound: i32) -> i32 {
        if bound & (-bound) == bound {
            return ((bound as i64 * self.next(31) as i64) >> 31) as i32;
        }
        loop {
            let bits = self.next(31);
            let val = bits % bound;
            if bits.wrapping_sub(val).wrapping_add(bound - 1) >= 0 {
                return val;
            }
        }
    }

    pub fn next_bool(&mut self) -> bool {
        self.next(1) != 0
    }
}
