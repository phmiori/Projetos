//! Comandos digitados no chat (começam com "/"). Só quem digitou vê a resposta.

use crate::chat::WHITE;
use crate::Game;

const OK: [f32; 4] = [0.65, 1.0, 0.55, 1.0];
const ERROR: [f32; 4] = [1.0, 0.59, 0.59, 1.0];

#[derive(Debug, PartialEq)]
pub enum Command {
    /// true = criativo, false = sobrevivência
    GameMode(bool),
    Help,
}

/// Entende o texto (com a "/"). O erro é a mensagem para mostrar.
pub fn parse(text: &str) -> Result<Command, String> {
    let line = text.trim().trim_start_matches('/').to_lowercase();
    if let Some(rest) = line.strip_prefix("gamemode") {
        // vale com ou sem espaço: "/gamemode 1" e "/gamemode1"
        return match rest.trim() {
            "0" | "survival" | "sobrevivencia" | "sobrevivência" => Ok(Command::GameMode(false)),
            "1" | "creative" | "criativo" => Ok(Command::GameMode(true)),
            _ => Err("Use /gamemode 0 (sobrevivência) ou /gamemode 1 (criativo)".into()),
        };
    }
    match line.as_str() {
        "ajuda" | "help" | "?" => Ok(Command::Help),
        _ => Err(format!("Comando desconhecido: {}. Digite /ajuda", text.trim())),
    }
}

impl Game {
    pub fn run_command(&mut self, text: &str) {
        match parse(text) {
            Ok(Command::Help) => {
                self.add_chat("Comandos:".into(), WHITE);
                self.add_chat("/gamemode 0  -  modo sobrevivência".into(), WHITE);
                self.add_chat("/gamemode 1  -  modo criativo".into(), WHITE);
            }
            Ok(Command::GameMode(creative)) => {
                if self.is_client() {
                    self.add_chat("No mundo de outra pessoa não dá para trocar o modo de jogo".into(), ERROR);
                    return;
                }
                self.set_game_mode(creative);
                let name = if creative { "criativo" } else { "sobrevivência" };
                self.add_chat(format!("Modo de jogo: {name}"), OK);
            }
            Err(e) => self.add_chat(e, ERROR),
        }
    }

    pub fn set_game_mode(&mut self, creative: bool) {
        if self.creative == creative {
            return;
        }
        self.creative = creative;
        if !creative {
            // para de voar; a queda só conta a partir de agora
            self.player.flying = false;
            self.player.fall_dist = 0.0;
            self.player.landed_fall = 0.0;
        }
        self.break_progress = 0.0;
        self.break_pos = None;
        self.clear_confirm = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gamemode_com_e_sem_espaco() {
        for t in ["/gamemode 0", "/gamemode0", "  /GameMode   0 ", "/gamemode survival"] {
            assert_eq!(parse(t), Ok(Command::GameMode(false)), "{t}");
        }
        for t in ["/gamemode 1", "/gamemode1", "/gamemode criativo"] {
            assert_eq!(parse(t), Ok(Command::GameMode(true)), "{t}");
        }
        assert_eq!(parse("/ajuda"), Ok(Command::Help));
        for t in ["/gamemode", "/gamemode 2", "/gamemode 10", "/voar", "/"] {
            assert!(parse(t).is_err(), "{t}");
        }
    }
}
