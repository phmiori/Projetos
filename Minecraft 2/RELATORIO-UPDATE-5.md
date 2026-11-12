# Mundo de Blocos — Update 5: Combate à Distância

Relatório de 12/11/2026. Versão do jogo: **Update 5** (aparece no título da janela). Versão da rede: **5**
(os dois jogadores precisam do jogo novo).

## O que foi implementado

### Arco
- Item novo **Arco** (id 264), feito na bancada com 3 Gravetos + 3 Fios. Dura 384 disparos.
- Com o arco na mão, **segurar o botão esquerdo** puxa a corda e **soltar** dispara.
  A força cresce por 1 segundo: velocidade de 9 a 40 blocos/s e dano de 2 a 9.
  Um toque rápido (menos de 0,15 s) não dispara.
- Animação em primeira pessoa: a figura do arco muda em 3 fases de puxada com a flecha encaixada,
  o arco vem para o meio da tela e treme quando está no máximo.
- Sons: `arco_tensao` ao começar a puxar e `arco_disparo` ao soltar.
- No Criativo não gasta flecha nem o arco; na Sobrevivência gasta 1 flecha e 1 uso por disparo.

### Flechas
- Item novo **Flecha** (id 251): 1 Graveto + 1 Sílex + 1 Pena na bancada dão 4 flechas.
- Projétil físico (`src/Arrows.java`): gravidade, arrasto do ar (mais forte na água), avanço em passos
  de 0,2 bloco para não atravessar nada.
- Acerta criaturas e jogadores (nunca quem atirou; jogadores só na Sobrevivência), com empurrão.
- Prende em blocos (inclusive lajes, escadas e cercas, pelo formato real) e fica visível espetada.
  Se o bloco for quebrado, a flecha cai de novo.
- Some 60 s depois de presa. Flechas de jogador na Sobrevivência podem ser recolhidas ao encostar.
- O dano é o do disparo; a armadura reduz como nos outros golpes.

### Esqueleto
- Criatura hostil nova, 20 de vida, aparece no escuro (24% dos monstros) e queima no sol.
- Mantém distância: aproxima-se acima de 11 blocos, recua abaixo de 5 e anda de lado no meio.
- Só puxa o arco quando tem **linha de visão** até o jogador (não atira através de parede).
  Mira por 1,1 s, com animação de braços erguidos, arco e flecha; pausa de 0,8 a 1,8 s entre disparos.
- Flecha de 3 de dano, com o arco calculado para a distância e um pouco de erro.
- Solta 0 a 2 Ossos e, em metade das vezes, 1 a 2 Flechas.

### Outros itens e drops
- **Fio** (id 247): aranhas soltam 0 a 2 (e às vezes 1 Carvão).
- **Pena** (id 248): galinhas soltam 0 a 2, além do frango.
- **Osso** (id 249): usado como adubo — botão direito no trigo faz crescer uma fase.

### Multijogador
- O anfitrião simula todas as flechas: acertos, dano, coleta e sumiço são decididos só nele.
- O amigo pede o disparo (`SHOOT`); o anfitrião confere velocidade e dano e cria a flecha.
- Todos recebem o nascimento (`ARROW`), onde prendeu (`ARROW_STUCK`) e o sumiço (`ARROW_GONE`),
  e simulam o voo para o desenho. Quem entra depois recebe as flechas que já estão no mundo.
- Cada flecha tem um id dado pelo anfitrião e só existe uma vez; ao ser recolhida ela some para todos
  antes de virar item, então não duplica.
- O que a criatura morta por flecha solta vai para quem atirou.
- A animação do esqueleto mirando e o creeper piscando agora são enviados aos amigos.

### Áudio e efeitos
- 6 sons novos, trocáveis na pasta `sounds`: `esqueleto`, `arco_tensao`, `arco_disparo`,
  `flecha_madeira`, `flecha_pedra`, `flecha_criatura`. Os arquivos que você já personalizou não são tocados.
- Partículas vermelhas quando a flecha acerta uma criatura ou jogador.

### Empacotador
- `empacotar.bat` não apaga mais a pasta `dist` inteira: preserva `sounds`, `textures`, `worlds` e
  `settings.properties` que estiverem em `dist\MundoDeBlocos`.
- O zip leva sons e texturas personalizados, mas não os seus mundos nem as suas configurações.

## Arquivos

| Arquivo | Mudança |
| --- | --- |
| `src/Arrows.java` | Novo: física, colisão e desenho das flechas |
| `src/Items.java` | Fio, Pena, Osso, Flecha, Arco; receitas; ícones; figuras do arco puxado |
| `src/Mob.java` | Esqueleto (IA, modelo, mira), drops de aranha, galinha e esqueleto |
| `src/Mobs.java` | Disparos dos esqueletos, tabela de aparecimento |
| `src/World.java` | `lineOfSight` (linha de visão) |
| `src/Hand.java` | Arco em primeira pessoa com animação de carga |
| `src/Particles.java` | Respingos de acerto |
| `src/Sounds.java` | 6 sons novos |
| `src/Net.java` | Versão 5; pacotes `SHOOT`, `ARROW`, `ARROW_STUCK`, `ARROW_GONE` |
| `src/BlockGame.java` | Controle do arco, acertos, coleta, rede, osso como adubo, título com a versão, testes automáticos |
| `empacotar.ps1` | Preserva personalizações da pasta `dist` |

Nenhum bloco novo (continuam 170). Nenhum id antigo mudou, então mundos e inventários salvos abrem como antes.

## Testes realizados

Testes automáticos, rodando o jogo de verdade numa cópia do mundo salvo (`-Dbench.arrows`), em modo Sobrevivência:

| Teste | Resultado |
| --- | --- |
| Fabricar arco e flechas pelas receitas | 1 arco e 8 flechas, ingredientes consumidos |
| Disparo com carga máxima num porco a 5 blocos | Vida 10 → 1 (dano 9) |
| Segunda flecha | Porco morto e removido |
| Flecha na parede de tábuas | Presa na parede, marcada como recolhível |
| Esqueleto a 10 blocos, 7 s | 2 a 3 disparos, jogador perdeu 3 de vida por acerto, esqueleto manteve cerca de 10 blocos |
| Recolher flecha presa | 5 → 6 flechas no inventário, flecha sumiu do mundo |
| Parede entre esqueleto e jogador, 7 s | 0 disparos |
| Salvar e reler o mundo antigo | Arco e flechas no inventário salvo; baús mantidos |
| Rede, dois jogos na mesma máquina | Amigo entrou, viu o esqueleto e a flecha presa do anfitrião |
| Amigo atira | 2 flechas criadas pelo anfitrião com dono certo; inventário 10 → 8 |
| Amigo recolhe as flechas presas | 8 → 10, flechas removidas dos dois lados |
| Amigo usa o baú do anfitrião | Abriu com 5 pães, pegou os 5; no anfitrião o baú ficou com 0 |
| Flecha do amigo no anfitrião | Anfitrião perdeu 9 de vida (segunda rodada) |
| `empacotar` | Gerou `dist\MundoDeBlocos.zip` (104 MB); sons, texturas e mundos da pasta `dist` intactos |

## O que não foi testado

- **Ninguém jogou com as mãos.** A sensação do arco, a animação e os sons não foram vistos nem ouvidos por uma pessoa.
- **Flecha acertando o amigo** (do anfitrião ou de esqueleto): o caminho usa o mesmo aviso de dano dos golpes de
  monstro, mas no teste o amigo morreu de queda antes de ser alvejado.
- **Dois computadores de verdade:** o teste de rede foi com dois jogos na mesma máquina.
- **A distribuição gerada não foi aberta** depois de empacotada; `run.bat` não foi alterado.
- A regressão das funções antigas ficou no que os testes exercitam (receitas, inventário, baú, criaturas,
  salvamento, rede). Dinamite, cama e plantação não foram reexecutados nesta atualização.

## Observações

- Flechas em voo ou presas não são salvas com o mundo.
- Durante os testes automáticos a janela do jogo ignora teclado e mouse de propósito (só com `-Dbench.arrows`).
  No jogo normal isso não se aplica.
- Itens no chão continuam locais de cada jogador, como antes.
