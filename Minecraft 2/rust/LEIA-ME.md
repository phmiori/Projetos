# Mundo de Blocos em Rust (transição)

O jogo completo continua sendo o Java (`src/`). Esta pasta é a versão nova, em Rust, que vai crescendo aos poucos
até poder substituir o Java. As duas ficam lado a lado e abrem pelo mesmo launcher:

- **JOGAR**: o jogo Java de sempre.
- **Versão Rust (prévia)**: esta versão. O launcher compila sozinho quando o código muda (precisa do Rust
  instalado: https://rustup.rs). A primeira compilação demora alguns minutos; as outras, segundos.

## O que é reaproveitado do Java

| O quê | Como |
|---|---|
| Mundos salvos (`worlds/`) | Abre o último mundo jogado no Java, na posição salva, e grava as mudanças no mesmo formato: o que você constrói aqui aparece no Java, e vice-versa. |
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
- Quebrar e colocar blocos (só em mundos no modo criativo, por enquanto), com as regras do Java: escadas viradas para
  onde você olha e invertidas na metade de cima, lajes em cima/embaixo e laje sobre laje virando bloco inteiro, lajes
  verticais, portas de dois blocos (botão direito abre e fecha), tochas na parede, pingentes pendurados, blocos com
  frente virados para você. Plantas e tochas sem apoio caem, e areia e cascalho despencam. Contorno no bloco mirado.
- Usa a sua barra do inventário salvo; **1-9** e a rodinha escolhem o bloco, o **botão do meio** pega o bloco mirado.
- Grava os pedaços mudados, a posição, a hora e a barra a cada 30 s e ao fechar (só as chaves que conhece no
  `meta.properties`; baús, fornalhas, bichos e o resto ficam como o Java deixou).
- Água corrente (traduzida do `World.java`): cai, escorre para o desnível mais perto formando cachoeiras, espalha
  até 7 blocos no plano, seca quando perde a fonte e leva embora plantas e tochas no caminho.
- Luz de tochas e lava: cada pedaço calcula a sua, ela passa para os vizinhos quando eles carregam e é refeita em
  volta quando uma tocha é colocada ou tirada (ou quando um bloco tapa ou destapa a luz).
- O título da janela mostra o mundo, o dia e a hora, o bioma, a posição, o FPS e o bloco na mão.

**Cuidados**: não abra o mesmo mundo no Java e no Rust ao mesmo tempo (um gravaria por cima do outro). Baús e
fornalhas ainda não podem ser quebrados aqui (o conteúdo deles fica no `meta.properties`).

## Próximos passos (na ordem sugerida)

1. Modo sobrevivência: tempo para quebrar, itens que caem, inventário.
2. Interface (barra, inventário, menus).
3. Sombras do sol.
4. Bichos, receitas, fornalhas, baús.
5. LAN (o mesmo protocolo do `Net.java`, para dar para jogar Java com Rust durante a transição).

## Ferramentas

- `exportar-blocos.bat`: depois de criar ou mudar blocos no Java, atualiza `dados/blocos.txt`.
- `comparar-geracao.bat`: gera pedaços com o Java e com o Rust e confere se saíram iguais (rode depois de
  mexer na geração do mundo em qualquer um dos dois).
- Linha de comando: `mundo-de-blocos.exe [--mundo worlds\nome] [--semente N] [--posicao x y z yaw pitch] [--voando] [--hora 0..1] [--so-ler] [--sem-vsync]`
  (`--so-ler`: abre sem gravar nada)
  (`--hora`: 0 = nascer do sol, 0,25 = meio-dia, 0,5 = pôr do sol, 0,75 = meia-noite).
