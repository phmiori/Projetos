# Mundo de Blocos em Rust (o jogo principal)

Esta pasta é o jogo, reescrito em Rust a partir do Java (`src/`). O Java continua no projeto como "versão antiga":
os mundos, as texturas, os sons e as configurações são os mesmos, e as duas versões jogam juntas pela LAN.

- **JOGAR** no launcher (`Mundo de Blocos.exe`) abre esta versão.
  - Quem tem o Rust instalado (https://rustup.rs) e a pasta do código: o launcher compila sozinho quando o código
    muda (a primeira vez demora alguns minutos) e copia o executável novo para `rust/bin`.
  - Quem não tem o Rust: o launcher usa o executável pronto `rust/bin/mundo-de-blocos.exe`, que vem pelo GitHub.
    Não precisa instalar nada.
- **Versão Java (antiga)**, o botão menor do launcher: o jogo Java de sempre (precisa do JDK 21, ou do pacote do
  `empacotar.bat`, que já leva o Java e também esta versão).

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

- **Menu inicial** como o do Java: a lista dos mundos da pasta `worlds/` (o último jogado primeiro, com o modo, a
  semente e quando foi jogado), **Jogar**, **Criar novo mundo** (nome, semente opcional, criativo ou sobrevivência,
  nome do personagem), **Excluir mundo** (clique duas vezes: o primeiro pede confirmação) e **Sair**, com o último mundo girando ao fundo. Os mundos criados aqui abrem no Java (mesma
  pasta, mesmo `meta.properties`, mesma conta de semente com letras e o mesmo ponto de nascimento). "Salvar e sair"
  na pausa volta para o menu.
- **Sons**: os mesmos `.wav` da pasta `sounds/` (se você trocou algum no Java, ouve o seu aqui também), com as regras
  do `Sounds.java`: quebrar e colocar conforme o material, passos, respingo, pegar itens, comer, dano, a voz de cada
  criatura de tempos em tempos e ao atacar, pavio e explosão do creeper, flechas, domar o lobo e os cliques do menu.
  Volume pela distância, som do lado certo e o volume das configurações do Java.
- **Sombras do sol** (mapa de sombras do `GLRenderer.java`, com o mesmo cache: só é refeito quando o sol anda, você
  sai da região ou um pedaço perto muda). Desligam junto com a opção "sombras" das configurações do Java.
- Mundo infinito: os pedaços são gerados e montados em várias threads ao mesmo tempo.
- Céu, nuvens, neblina, água transparente com reflexo, oclusão nos cantos, luz do céu (com a luz que entra embaixo de saliências).
- Física do jogador (traduzida do `Player.java`/`Entity.java`): gravidade, pulo, colisão com cubos, lajes e escadas,
  subida sozinha de degraus de meio bloco, nadar, e voar com dois toques no Espaço (só no criativo).
- Ciclo de dia e noite: sol e lua girando, pôr do sol, estrelas, luz mais fraca de noite. Começa na hora salva do
  mundo e o dia dura 48 minutos, como no Java.
- Usa as configurações do Java (`settings.properties`): distância de visão, campo de visão, sensibilidade do mouse,
  sombra nos cantos, reflexos e vsync.
- Teclas: **WASD** anda, **Espaço** pula (dois toques: voa), **Shift** desce voando, **Ctrl** corre, **Esc** pausa,
  **E** abre o inventário, **Q** joga fora, **Esc** pausa (a aba **Controles** da pausa lista todas as teclas), **F2** tira uma foto (pasta `fotos/`), **F3** liga/desliga a sombra dos cantos,
  **F4** (segurando) passa as horas depressa.
- Quebrar e colocar blocos com as regras do Java: escadas viradas para onde você olha e invertidas na metade de
  cima, lajes em cima/embaixo e laje sobre laje virando bloco inteiro, lajes verticais, portas de dois blocos (botão
  direito abre e fecha), tochas na parede, pingentes pendurados, blocos com frente virados para você. Plantas e
  tochas sem apoio caem, e areia e cascalho despencam. Contorno no bloco mirado.
- **Interface** como a do Java: barra com os ícones (cubinhos com as texturas do mundo e os desenhos dos itens),
  quantidades e desgaste das ferramentas, nome do item ao trocar, caixa de informações no canto e a lista de controles na pausa.
- **Inventário** (**E**): no criativo, a paleta com todos os blocos e itens (rodinha rola; clicar de novo no mesmo item
  devolve; Shift+clique manda direto para a mochila; **Limpar inventário** esvazia a mochila e a barra, com um
  segundo clique para confirmar); na sobrevivência, armadura e a grade de criação 2x2 (3x3 na
  bancada, com o botão direito nela), com as receitas do Java. Clique pega/coloca/troca, botão direito pega metade ou
  coloca um, Shift+clique passa entre a barra e a mochila, **1-9** com o mouse em cima manda para a barra.
  No inventário de sobrevivência: o **boneco do personagem** olha para o mouse e mostra a armadura vestida;
  **Shift+clique** numa peça de armadura ou no escudo veste no espaço certo; o **espaço do escudo** deixa o escudo
  na mão esquerda (defende com o botão direito quando a mão está vazia ou com arma ou ferramenta).
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
- **Arco e flechas**: segurar o botão esquerdo puxa a corda (barrinha embaixo da mira), soltar dispara; quanto mais
  puxado, mais longe e mais forte. As flechas acertam criaturas, prendem nos blocos (e caem se o bloco sumir) e, na
  sobrevivência, dá para recolher passando por cima. O arco se gasta.
- **Dinamite**: acende com a pederneira (botão direito), explode em 3 s com a força do Java e acende as outras que
  estiverem perto (reação em cadeia). Enquanto o pavio queima, o bloco pisca.
- **Lavoura**: a enxada transforma grama ou terra em terra arada, as sementes viram trigo, o trigo cresce com luz (mais
  rápido perto da água), o osso serve de adubo e o trigo maduro dá trigo e sementes.
- **Cama**: o botão direito define onde você renasce e, de noite (sem monstros por perto), pula para a manhã.
- **Vida do mundo** (`World.tickGrowth`): folhas sem tronco por perto somem, mudas viram árvores, a grama se espalha
  pela terra e morre debaixo de blocos, terra arada abandonada volta a ser terra.
- **Configurações** (na pausa e no menu): VSync, volume, distância de visão, sombras, reflexos, sombra nos cantos,
  campo de visão e sensibilidade do mouse. Mudam na hora e são gravadas no mesmo `settings.properties` do Java
  (valem para as duas versões).
- **Mão em primeira pessoa** (`Hand.java`): o braço com a cor da pele e da camisa do personagem e o item na mão (bloco
  como cubinho com as texturas, ferramentas empunhadas, o resto em pé), balançando ao andar e dando o golpe ao bater,
  quebrar ou colocar; o arco vem para o meio da tela ao puxar a corda.
- **Ferramentas em 3D** (`src/tool_model.rs`): picareta, pá, machado, enxada e espada na mão (sua e dos amigos na
  LAN) são modelos de caixas — cabo de seção quadrada, cabeça maciça, lâmina que afina até o fio, guarda e pomo —
  com texturas de madeira, couro, pedra, ferro escovado e diamante desenhadas pelo próprio jogo, luz de cima e a
  sombra perto da mão. Os ícones do inventário continuam planos.
- **Ferramentas de ouro, esmeralda e cobre** (só na versão Rust, ids 320–334 = 320 + tipo×3 + material): picareta,
  machado, pá, espada e enxada de cada uma, feitas na bancada como as outras (lingote de ouro, esmeralda, lingote de
  cobre). Ouro: rápida (11) mas dura pouco (90 usos) e minera como pedra; cobre: 190 usos, velocidade 5, nível de
  pedra; esmeralda: 1500 usos, velocidade 9,5, minera tudo como o diamante.
- **Ferramentas de rubi, safira e ametista** (ids 335–349 = 335 + tipo×3 + material): rubi 1000 usos e velocidade
  10; safira 1400 usos e velocidade 9; ametista 650 usos, velocidade 10,5 e nível de ferro.
- **Armaduras de ouro, cobre, esmeralda, rubi, safira e ametista** (ids 350–373 = 350 + peça×6 + material), feitas
  como as outras com lingote de ouro, lingote de cobre ou a gema; aparecem com a cor do material no boneco do
  inventário e na mão.
- **Cada material com o seu desenho 3D** (`tool_model.rs`, `style`): madeira é simples (cabeça grossa amarrada com
  couro, pontas cegas); pedra e cobre são rústicos (pedaços tortos, amarrados); ferro e ouro são forjados (o ouro com
  anéis brilhantes no cabo); diamante, esmeralda, rubi, safira e ametista são lendários (crista e coroa na picareta,
  pontas e lâmina em meia-lua no machado, pá em lança, espada mais longa com abas na guarda, gemas embutidas, anéis
  de metal no cabo e uma gema no pomo).
- **Minérios de gemas** (só na versão Rust, nos mundos novos): rubi e safira entre y 8 e 56, ametista lá no fundo
  (abaixo de y 36, junto da ardósia-abismo). Precisam de picareta de ferro ou melhor, soltam a gema (Rubi 317, Safira
  318, Ametista 319) e dão experiência; 9 gemas fazem o bloco (bloco de rubi/safira/ametista) e o bloco volta a dar
  9 gemas. Blocos 250–255; os itens que os colocam são 434–439.
- **Itens em 3D** (`src/item_model.rs`): os outros itens na mão também são modelos de caixas — graveto, lingotes,
  gemas, pedaços de carvão/sílex/cobre, maçã, cenoura, batata, beterraba, carnes, frango, peixe, pão, torta, melancia,
  sopa, grãos, trigo, couro, fio, pena, osso, pederneira, flecha, arco, ovos de criatura com pintas, armaduras
  (capacete, peitoral, calças, botas), baldes (vazio, água, lava), vara de pescar, barco, escudo (também na mão
  esquerda) e pérola do End. As cores saem do próprio ícone (as duas cores principais do desenho, sem o contorno).
- **Partículas** (`Particles.java`): pedacinhos com as cores da textura saltando do bloco batido ou quebrado,
  respingos ao acertar criaturas com flecha, sangue da mordida do tubarão, fumaça e fagulhas das explosões e a
  fumacinha do pavio da dinamite.
- **LAN com o Java** (o mesmo protocolo do `Net.java`, versão 21; funciona pelo Radmin VPN):
  - **Jogar em LAN** no menu: digite o IP de quem abriu o mundo (no Java ou no Rust). O terreno sai da semente e o
    anfitrião manda só os pedaços modificados; o seu progresso (posição, vida, inventário) fica guardado com ele.
  - **Abrir para LAN** na pausa: amigos do Java ou do Rust entram no seu mundo; a pausa mostra o IP para eles
    digitarem. O mundo continua andando com a pausa aberta, como no Java.
  - Sincroniza os blocos, os outros jogadores (o boneco com as cores do personagem, o item na mão e o nome em cima),
    criaturas, itens no chão (o anfitrião decide quem pega), flechas, explosões, baús e fornalhas (guardados pelo
    anfitrião), a hora, golpes nas criaturas, lobos e ovos de criatura.
  - **Chat**: **T** ou **Enter** abre a caixa, **Enter** envia, **Esc** cancela. As mensagens ficam no canto de baixo
    e somem depois de 10 s (as suas em amarelo). **Fotos**: **Ctrl+O** com o chat aberto escolhe uma imagem (png, jpg, gif
    ou bmp), ou arraste o arquivo para a janela; ela é reduzida e comprimida como no Java e aparece no chat de todos (Java e Rust).
  - Com o Rust de anfitrião, as criaturas enxergam os amigos como no Java: cada uma persegue, ataca ou atira no
    jogador mais perto, aparecem também em volta dos amigos e o chão em volta deles fica carregado. As flechas
    (de esqueletos e de jogadores) acertam os amigos.
- **Pausa** (**Esc**, ou quando a janela perde o foco) com "Voltar ao jogo", "Controles" (todas as teclas), "Configurações" e "Salvar e sair" (volta ao menu).
- Grava os pedaços mudados, a posição, a hora, o inventário, a vida, a fome, os baús, as fornalhas e as criaturas a cada
  30 s e ao fechar (só o que conhece no `meta.properties`; amigos da LAN e o resto ficam como o Java deixou).
- Água corrente (traduzida do `World.java`): cai, escorre para o desnível mais perto formando cachoeiras, espalha
  até 7 blocos no plano, seca quando perde a fonte e leva embora plantas e tochas no caminho.
- Luz de tochas e lava: cada pedaço calcula a sua, ela passa para os vizinhos quando eles carregam e é refeita em
  volta quando uma tocha é colocada ou tirada (ou quando um bloco tapa ou destapa a luz).

**Cuidados**: não abra o mesmo mundo no Java e no Rust ao mesmo tempo (um gravaria por cima do outro). Os itens
soltos no chão não são gravados (no Java também não).

## Próximos passos (na ordem sugerida)

1. (nada pendente da LAN; sugestões são bem-vindas)

## Ferramentas

- `ferramentas/estilizar-texturas.py` (Python com numpy e Pillow): **o estilo atual** das texturas dos blocos, em
  64 px por face, "desenhado": formas limpas (pedras com contorno, tábuas com emendas, veios da casca, folhas), poucos
  tons com luz e sombra em degraus e quase nenhum chuvisco. As cores vêm de `textures/originais-16px`; os blocos com
  desenho (baú, porta, fornalha, plantas...) são ampliados com bordas suaves. Rode
  `python rust/ferramentas/estilizar-texturas.py` (ou com os nomes de algumas texturas) na pasta do jogo.
- `ferramentas/gerar-texturas.py`: o estilo anterior, realista (não rode por cima sem querer voltar a ele).
- `ferramentas/gerar-icones.py`: refaz os ícones dos itens em 32 x 32 (volume, luz, veio na madeira, brilho no
  metal, facetas nas gemas), a partir dos desenhos de 16 px guardados em `textures/itens/originais-16px`.
- `ferramentas/desenhar-ferramentas.py`: desenha as ferramentas (picareta, pá, machado, espada e enxada de cada
  material) em 32 x 32, no estilo da pá e da picareta de diamante.
- `exportar-blocos.bat`: depois de criar ou mudar blocos, itens ou receitas no Java, atualiza os arquivos de `dados/`.
- `comparar-geracao.bat`: gera pedaços com o Java e com o Rust e confere se saíram iguais (rode depois de
  mexer na geração do mundo em qualquer um dos dois).
- Linha de comando: sem nada abre o menu; `mundo-de-blocos.exe [--mundo worlds\nome] [--semente N] [--posicao x y z yaw pitch] [--voando] [--hora 0..1] [--so-ler] [--abrir-lan] [--entrar IP [nome]] [--dizer quadro texto] [--foto-chat quadro arquivo] [--amigo-teste] [--excluir-teste quadro] [--limpar-teste quadro] [--vestir-teste quadro] [--zoologico] [--sem-vsync]`
  (`--so-ler`: abre sem gravar nada)
  (`--hora`: 0 = nascer do sol, 0,25 = meio-dia, 0,5 = pôr do sol, 0,75 = meia-noite).
