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
| Blocos | `dados/blocos.txt` é exportado do `Block.java` (`exportar-blocos.bat`): mesmos ids, formas, texturas, caixas, dureza e ferramenta certa. |
| Itens e receitas | `dados/itens.txt`, `itens.png` e `receitas.txt` são exportados do `Items.java`: mesmos nomes, desenhos, ferramentas, comida, armaduras e receitas. |
| Criaturas | `dados/bichos.txt` é exportado do `Mob.java`: os 27 desenhos (com as variações), tamanhos, vidas e velocidades. As criaturas salvas no Java aparecem aqui, e as daqui voltam no Java. |
| Inventário, vida, fome, baús e fornalhas | Lidos e gravados no `meta.properties` no mesmo formato do Java. |
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
- Teclas: **WASD** anda, **Espaço** pula (dois toques: voa), **Shift** desce voando, **Ctrl** corre, **Esc** pausa,
  **E** abre o inventário, **Q** joga fora, **F1** mostra/esconde a ajuda, **F2** tira uma foto (pasta `fotos/`), **F3** liga/desliga a sombra dos cantos,
  **F4** (segurando) passa as horas depressa.
- Quebrar e colocar blocos com as regras do Java: escadas viradas para onde você olha e invertidas na metade de
  cima, lajes em cima/embaixo e laje sobre laje virando bloco inteiro, lajes verticais, portas de dois blocos (botão
  direito abre e fecha), tochas na parede, pingentes pendurados, blocos com frente virados para você. Plantas e
  tochas sem apoio caem, e areia e cascalho despencam. Contorno no bloco mirado.
- **Interface** como a do Java: barra com os ícones (cubinhos com as texturas do mundo e os desenhos dos itens),
  quantidades e desgaste das ferramentas, nome do item ao trocar, caixa de informações no canto e a ajuda (**F1**).
- **Inventário** (**E**): no criativo, a paleta com todos os blocos e itens (rodinha rola; clicar de novo no mesmo item
  devolve; Shift+clique manda direto para a mochila); na sobrevivência, armadura e a grade de criação 2x2 (3x3 na
  bancada, com o botão direito nela), com as receitas do Java. Clique pega/coloca/troca, botão direito pega metade ou
  coloca um, Shift+clique passa entre a barra e a mochila, **1-9** com o mouse em cima manda para a barra.
- **Sobrevivência**: o bloco vai rachando enquanto você segura o botão (mais rápido com a ferramenta certa, e só dá
  item com a picareta certa), o que ele solta cai no chão girando e é puxado para você, as ferramentas gastam e
  quebram, colocar gasta da mão, **Q** joga fora. Vida, fome, fôlego embaixo d'água, dano de queda, lava e cacto,
  armadura que diminui o dano, comer e vestir com o botão direito. Ao morrer os itens caem onde você estava.
- **Baús e fornalhas** (botão direito abre), guardados no `meta.properties` igual ao Java: o baú do iglu vem com os
  mesmos itens que viria no Java; as fornalhas assam o tempo todo (8 s por item, com os combustíveis e o que assa
  exportados do Java) e o bloco acende enquanto assa; quebrar um baú ou uma fornalha espalha o que havia dentro;
  Shift+clique passa itens entre eles e a mochila.
- **Criaturas** (traduzidas do `Mob.java`/`Mobs.java`): os 27 bichos com os desenhos do Java (pernas, asas e caudas
  balançando), nascendo nos mesmos lugares (animais por bioma, peixes, tubarão e narval, pássaros, monstros no
  escuro), fugindo, pastando, revidando, voando e nadando. Monstros atacam (o creeper explode quebrando blocos, o
  esqueleto atira flechas), queimam no sol; bater neles usa o dano da ferramenta e eles soltam o que o Java solta.
  Lobo domesticável com osso (carne cura, mão vazia senta/levanta), tubarão caçando peixes e brigando com narval,
  ovos de criatura no criativo. Os bichos de terra dormem com o pedaço quando você vai longe e voltam depois.
- **Pausa** (**Esc**, ou quando a janela perde o foco) com "Voltar ao jogo" e "Salvar e sair".
- Grava os pedaços mudados, a posição, a hora, o inventário, a vida, a fome, os baús, as fornalhas e as criaturas a cada
  30 s e ao fechar (só o que conhece no `meta.properties`; amigos da LAN e o resto ficam como o Java deixou).
- Água corrente (traduzida do `World.java`): cai, escorre para o desnível mais perto formando cachoeiras, espalha
  até 7 blocos no plano, seca quando perde a fonte e leva embora plantas e tochas no caminho.
- Luz de tochas e lava: cada pedaço calcula a sua, ela passa para os vizinhos quando eles carregam e é refeita em
  volta quando uma tocha é colocada ou tirada (ou quando um bloco tapa ou destapa a luz).

**Cuidados**: não abra o mesmo mundo no Java e no Rust ao mesmo tempo (um gravaria por cima do outro). Os itens
soltos no chão não são gravados (no Java também não).

## Próximos passos (na ordem sugerida)

1. Sons e sombras do sol.
2. Menu inicial para escolher e criar mundos.
3. Cama, enxada e trigo, arco e flechas do jogador, dinamite.
5. LAN (o mesmo protocolo do `Net.java`, para dar para jogar Java com Rust durante a transição).

## Ferramentas

- `exportar-blocos.bat`: depois de criar ou mudar blocos, itens ou receitas no Java, atualiza os arquivos de `dados/`.
- `comparar-geracao.bat`: gera pedaços com o Java e com o Rust e confere se saíram iguais (rode depois de
  mexer na geração do mundo em qualquer um dos dois).
- Linha de comando: `mundo-de-blocos.exe [--mundo worlds\nome] [--semente N] [--posicao x y z yaw pitch] [--voando] [--hora 0..1] [--so-ler] [--zoologico] [--sem-vsync]`
  (`--so-ler`: abre sem gravar nada)
  (`--hora`: 0 = nascer do sol, 0,25 = meio-dia, 0,5 = pôr do sol, 0,75 = meia-noite).
