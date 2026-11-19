# Mundo de Blocos em Rust (transição)

O jogo completo continua sendo o Java (`src/`). Esta pasta é a versão nova, em Rust, que vai crescendo aos poucos
até poder substituir o Java. As duas ficam lado a lado e abrem pelo mesmo launcher:

- **JOGAR**: o jogo Java de sempre.
- **Versão Rust (prévia)**: esta versão. O launcher compila sozinho quando o código muda (precisa do Rust
  instalado: https://rustup.rs). A primeira compilação demora alguns minutos; as outras, segundos.

## O que é reaproveitado do Java

| O quê | Como |
|---|---|
| Mundos salvos (`worlds/`) | Abre o último mundo jogado no Java, na posição salva do jogador, lendo os pedaços salvos (só leitura por enquanto: nada é gravado). |
| Geração do terreno | Traduzida linha por linha do `World.java`: mesma semente = mesmo mundo, bloco por bloco (conferido com `comparar-geracao.bat`). |
| Blocos | `dados/blocos.txt` é exportado do `Block.java` (`exportar-blocos.bat`): mesmos ids, formas, texturas e caixas. |
| Texturas | Os mesmos PNGs da pasta `textures/`. |
| Shaders | Copiados do `GLRenderer.java` (céu, nuvens, neblina, luz, água) e o mesmo formato de vértice do `Mesher.java`. |

## O que já funciona

- Mundo infinito: os pedaços são gerados e montados em várias threads ao mesmo tempo.
- Céu, nuvens, neblina, água transparente com reflexo, oclusão nos cantos, luz do céu (com a luz que entra embaixo de saliências).
- Física do jogador (traduzida do `Player.java`/`Entity.java`): gravidade, pulo, colisão com cubos, lajes e escadas,
  subida sozinha de degraus de meio bloco, nadar, e voar com dois toques no Espaço (só no criativo).
- Ciclo de dia e noite: sol e lua girando, pôr do sol, estrelas, luz mais fraca de noite. Começa na hora salva do
  mundo e o dia dura 48 minutos, como no Java.
- Usa as configurações do Java (`settings.properties`): distância de visão, campo de visão, sensibilidade do mouse,
  sombra nos cantos, reflexos e vsync.
- Teclas: **WASD** anda, **Espaço** pula (dois toques: voa), **Shift** desce voando, **Ctrl** corre, **Esc** solta o
  mouse (clique para prender), **F2** tira uma foto (pasta `fotos/`), **F3** liga/desliga a sombra dos cantos,
  **F4** (segurando) passa as horas depressa.
- O título da janela mostra o mundo, o dia e a hora, o bioma, a posição e o FPS.

## Próximos passos (na ordem sugerida)

1. Quebrar e colocar blocos, salvando no mesmo formato do Java (aí os dois abrem o mesmo mundo com as mudanças).
2. Luz de tochas e lava, sombras do sol, água corrente.
3. Interface (barra, inventário, menus).
4. Bichos, itens, receitas, fornalhas, baús.
5. LAN (o mesmo protocolo do `Net.java`, para dar para jogar Java com Rust durante a transição).

## Ferramentas

- `exportar-blocos.bat`: depois de criar ou mudar blocos no Java, atualiza `dados/blocos.txt`.
- `comparar-geracao.bat`: gera pedaços com o Java e com o Rust e confere se saíram iguais (rode depois de
  mexer na geração do mundo em qualquer um dos dois).
- Linha de comando: `mundo-de-blocos.exe [--mundo worlds\nome] [--semente N] [--posicao x y z yaw pitch] [--sem-vsync]`.
