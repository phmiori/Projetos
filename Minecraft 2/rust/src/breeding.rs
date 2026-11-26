//! Reprodução dos animais: cada espécie tem a sua comida. Dois adultos alimentados se aproximam e nasce um
//! filhote, com o mesmo modelo do adulto em tamanho menor, que cresce com o tempo.

use crate::block;
use crate::mob::*;
use crate::physics::Blocks;

/// Segundos até o filhote virar adulto (cada vez que come, adianta 10%).
pub const GROW_TIME: f64 = 600.0;
/// Segundos que o animal alimentado fica procurando um par.
pub const LOVE_TIME: f64 = 30.0;
/// Segundos de descanso depois de ter um filhote.
pub const REST_TIME: f64 = 300.0;
pub const BABY_SCALE: f64 = 0.5;

const APPLE: i32 = 205;
const RAW_BEEF: i32 = 206;
const RAW_FISH: i32 = 208;
const SEEDS: i32 = 237;
const WHEAT: i32 = 238;
const BREAD: i32 = 239;
const RAW_CHICKEN: i32 = 245;
const YELLOW_FLOWER: i32 = 26;

pub fn is_meat(id: i32) -> bool {
    matches!(id, 206 | 207 | 241 | 242 | 243 | 244 | 245 | 246 | 208 | 209)
}

/// A comida que faz cada animal se reproduzir. None: monstro (não se reproduz) ou lobo (qualquer carne).
pub fn food_of(t: usize) -> Option<i32> {
    Some(match t {
        PIG | DEER => APPLE,
        SHEEP | COW => WHEAT,
        MUSKOX => BREAD,
        CHICKEN | BIRD | FISH | TROPICAL | SALMON => SEEDS,
        RABBIT => YELLOW_FLOWER,
        FOX | SCORPION | EMPEROR => RAW_CHICKEN,
        BEAR | POLAR_BEAR | PENGUIN | SEAL | NARWHAL | CAT => RAW_FISH,
        TIGER | WHITE_TIGER | SHARK => RAW_BEEF,
        _ => return None, // monstros, aldeões, golem (e o lobo, que come qualquer carne)
    })
}

/// Comidas a mais, das plantações: cenoura (297), batata (298), beterraba (300), sementes dela (301) e a dourada (307).
fn also_eats(t: usize, item: i32) -> bool {
    match t {
        PIG => matches!(item, 297 | 298 | 300),
        RABBIT => matches!(item, 297 | 307),
        DEER => item == 297,
        CHICKEN | BIRD => item == 301,
        _ => false,
    }
}

impl Mob {
    pub fn is_baby(&self) -> bool {
        self.baby > 0.0
    }

    /// Esta espécie come este item? O lobo só depois de domesticado.
    pub fn likes(&self, item: i32) -> bool {
        if self.t == WOLF {
            self.tamed && is_meat(item)
        } else {
            food_of(self.t) == Some(item) || also_eats(self.t, item)
        }
    }

    /// Aceita comer agora: o filhote sempre; o adulto se não estiver apaixonado nem descansando.
    pub fn wants(&self, item: i32) -> bool {
        self.likes(item) && (self.is_baby() || (self.love <= 0.0 && self.rest <= 0.0))
    }

    /// Come: o filhote cresce mais depressa; o adulto fica pronto para se reproduzir.
    pub fn feed(&mut self) {
        if self.is_baby() {
            self.baby = (self.baby - GROW_TIME * 0.1).max(0.01);
        } else {
            self.love = LOVE_TIME;
            if self.sitting {
                (self.sitting, self.sit_after) = (false, true); // levanta para ir até o par
            }
            self.angry = 0.0;
            self.flee = 0.0;
            self.target = None;
        }
        self.bred = true;
    }

    /// Vira filhote (por `secs` segundos): caixa de colisão pela metade.
    pub fn set_baby(&mut self, secs: f64) {
        self.baby = secs;
        let k = if secs > 0.0 { BABY_SCALE } else { 1.0 };
        let i = info(self.t);
        (self.body.hw, self.body.h) = (i.hw * k, i.h * k);
    }

    /// Passa o tempo da paixão, do descanso e do crescimento.
    pub fn tick_breeding<W: Blocks>(&mut self, dt: f64, w: &W) {
        self.love = (self.love - dt).max(0.0);
        self.rest = (self.rest - dt).max(0.0);
        if self.love <= 0.0 {
            self.mating = 0.0;
            if self.sit_after {
                (self.sitting, self.sit_after) = (true, false);
            }
        }
        if self.baby > 0.0 {
            self.baby -= dt;
            if self.baby <= 0.0 {
                self.set_baby(0.0);
                // sem espaço para o tamanho de adulto: continua pequeno mais um pouco
                if self.body.collides(w) {
                    self.set_baby(1.0);
                }
            }
        }
    }
}

/// Para onde o animal quer ir (par, comida na mão do jogador ou o adulto, no caso do filhote) e se está calmo.
/// `offers` são os jogadores: (pés, item na mão).
pub fn choose_goal(mobs: &mut [Mob], i: usize, offers: &[([f64; 3], i32)]) {
    let m = &mobs[i];
    let d2 = |p: [f64; 3]| (p[0] - m.body.x).powi(2) + (p[2] - m.body.z).powi(2);
    // não segue a comida se acabou de apanhar
    let tempted = if m.angry > 3.0 || m.hurt > 0.0 {
        None
    } else {
        offers
            .iter()
            .filter(|(p, item)| m.wants(*item) && !(m.tamed && !m.is_baby()) && d2(*p) < 100.0 && (p[1] - m.body.y).abs() < 5.0)
            .map(|(p, _)| *p)
            .min_by(|a, b| d2(*a).total_cmp(&d2(*b)))
    };
    let nearest = |ok: &dyn Fn(&Mob) -> bool, reach: f64| {
        mobs.iter()
            .filter(|o| o.id != m.id && o.t == m.t && o.tamed == m.tamed && o.health > 0.0 && ok(o) && (o.body.y - m.body.y).abs() < 4.0)
            .map(|o| [o.body.x, o.body.y, o.body.z])
            .filter(|p| d2(*p) < reach * reach)
            .min_by(|a, b| d2(*a).total_cmp(&d2(*b)))
    };
    // (destino, até que distância precisa chegar)
    let mut goal = None;
    if m.love > 0.0 {
        goal = nearest(&|o| o.love > 0.0 && !o.is_baby(), 10.0).map(|p| (p, m.body.hw * 2.0 + 0.3));
    }
    if goal.is_none() {
        goal = tempted.map(|p| (p, m.body.hw + 1.6));
    }
    if goal.is_none() && m.is_baby() && !m.tamed {
        goal = nearest(&|o| !o.is_baby(), 16.0).map(|p| (p, 2.5));
    }
    let calm = tempted.is_some() || m.love > 0.0 || m.is_baby();
    let m = &mut mobs[i];
    m.calm = calm;
    if calm {
        m.angry = 0.0;
    }
    m.goal = goal;
}

/// Junta os pares: apaixonados encostados por 1,5 s geram um filhote. Devolve (espécie, lugar, índice de um pai).
pub fn mate(mobs: &mut [Mob], dt: f64) -> Vec<(usize, [f64; 3], usize)> {
    let mut births = Vec::new();
    for i in 0..mobs.len() {
        let a = &mobs[i];
        if a.love <= 0.0 || a.is_baby() || a.health <= 0.0 {
            continue;
        }
        let partner = mobs.iter().position(|b| {
            let reach = a.body.hw + b.body.hw + 0.9;
            b.id > a.id
                && b.t == a.t
                && b.tamed == a.tamed
                && b.love > 0.0
                && !b.is_baby()
                && b.health > 0.0
                && (b.body.x - a.body.x).powi(2) + (b.body.z - a.body.z).powi(2) < reach * reach
                && (b.body.y - a.body.y).abs() < 2.0
        });
        let Some(j) = partner else { continue };
        mobs[i].mating += dt;
        if mobs[i].mating < 1.5 {
            continue;
        }
        for k in [i, j] {
            (mobs[k].love, mobs[k].mating, mobs[k].rest, mobs[k].goal) = (0.0, 0.0, REST_TIME, None);
        }
        // nasce junto de um dos pais (um lugar onde um adulto cabe)
        let b = &mobs[i].body;
        births.push((mobs[i].t, [b.x, b.y + 0.05, b.z], i));
    }
    births
}

/// Animal que não se reproduz (monstro) não mostra dica nenhuma.
pub fn hint(m: &Mob) -> Option<String> {
    let name = &info(m.t).name;
    let food = food_of(m.t)?;
    let food = if food < 200 { block::info(food as u8).name.to_string() } else { crate::items::name(food) };
    Some(format!("{name}: come {}", food.to_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::survival::Rng;

    struct Flat;
    impl Blocks for Flat {
        fn get(&self, _x: i32, y: i32, _z: i32) -> u8 {
            if y < 0 { block::SNOW } else { block::AIR }
        }
    }

    #[test]
    fn todo_animal_tem_comida_e_monstro_nao() {
        let mut r = Rng::new();
        for t in 0..TYPES {
            let m = Mob::new(t, 0.0, 0.0, 0.0, 1, &mut r);
            assert_eq!(food_of(t).is_some(), !m.hostile() && !matches!(t, WOLF | VILLAGER | IRON_GOLEM), "tipo {t}");
        }
    }

    #[test]
    fn duas_vacas_alimentadas_tem_um_filhote() {
        let mut r = Rng::new();
        let w = Flat;
        let mut mobs = vec![Mob::new(COW, 0.0, 0.0, 0.0, 1, &mut r), Mob::new(COW, 5.0, 0.0, 0.0, 2, &mut r)];
        assert!(!mobs[0].wants(APPLE) && mobs[0].wants(WHEAT));
        mobs[0].feed();
        mobs[1].feed();
        assert!(!mobs[0].wants(WHEAT), "apaixonada não come de novo");
        let dt = 1.0 / 60.0;
        let mut births = Vec::new();
        for _ in 0..1200 {
            for i in 0..2 {
                choose_goal(&mut mobs, i, &[]);
                mobs[i].tick_breeding(dt, &w);
                let sight = Sight { w: &w, p: [100.0, 0.0, 100.0], can_target: false, owner: None, target: None, line_of_sight: false };
                mobs[i].update(dt, &sight, &mut r);
            }
            births = mate(&mut mobs, dt);
            if !births.is_empty() {
                break;
            }
        }
        assert_eq!(births.len(), 1, "não nasceu o filhote");
        assert!(mobs[0].rest > 0.0 && mobs[1].love == 0.0);
    }

    #[test]
    fn filhote_menor_cresce_nao_solta_nada_e_fica_salvo() {
        let mut r = Rng::new();
        let mut m = Mob::new(SEAL, 0.0, 0.0, 0.0, 7, &mut r);
        m.set_baby(GROW_TIME);
        m.bred = true;
        assert!((m.body.h - info(SEAL).h * 0.5).abs() < 1e-9);
        assert!(m.drops(&mut r).is_empty());
        let back = Mob::load(&m.save(), &mut r).unwrap();
        assert!(back.is_baby() && back.bred && (back.body.hw - m.body.hw).abs() < 1e-9);
        m.feed();
        assert!((m.baby - GROW_TIME * 0.9).abs() < 1e-9, "comer adianta o crescimento");
        m.tick_breeding(GROW_TIME, &Flat);
        assert!(!m.is_baby() && (m.body.h - info(SEAL).h).abs() < 1e-9);
    }

    #[test]
    fn cervo_segue_a_comida_em_vez_de_fugir() {
        let mut r = Rng::new();
        let w = Flat;
        let mut mobs = vec![Mob::new(DEER, 0.0, 0.0, 0.0, 1, &mut r)];
        let player = [6.0, 0.0, 0.0];
        for _ in 0..240 {
            choose_goal(&mut mobs, 0, &[(player, APPLE)]);
            let sight = Sight { w: &w, p: player, can_target: true, owner: None, target: None, line_of_sight: false };
            mobs[0].update(1.0 / 60.0, &sight, &mut r);
        }
        assert!(mobs[0].body.x > 2.0, "o cervo devia chegar perto: x = {}", mobs[0].body.x);
    }
}
