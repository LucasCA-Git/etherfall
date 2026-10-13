# ETHERFALL — Progresso

_Última atualização: 12/10/2026 · Entregas 10 e 11 (0.10 + 0.11)_

## 0.11.1 — ASCII equilibrado
- Células de 8 px por padrão (meio-termo: detalhe nos personagens e estética de terminal; saves migram).
- Contornos pelo **depth buffer**: toda borda de parede, árvore e objeto vira um traço na direção da borda.
- Meios-tons viram **hachuras**: chão com `/` `\` `-` em manchas alinhadas ao mundo, paredes com `|` `!` `[ ]`;
  `#` `@` só em luz forte. O brilho vai na cor, não em letras cada vez mais pesadas (acabaram os blocos de `o`/`+`).
- Personagens: grade fina a partir de 12 px; abaixo disso contorno + interior mais claro.
- Direções dos sprites do Flare corrigidas (estavam 45° deslocadas; conferido no ciclo de corrida) e todas as folhas
  regeneradas; andando contra a mira o herói recua de frente (passo invertido) em vez de virar de lado.
- Todas as folhas começam a carregar na abertura (criaturas não aparecem mais como modelo 3D por um instante).

## Novidades da 0.11 — itens, lendários, baús e imbuimento
- **Inventário (I):** 9 espaços de equipamento (arma, mão secundária, cabeça, peito, mãos, pernas, pés, anel, amuleto) e
  mochila de 24. Clique equipa, clique no equipamento desequipa, botão direito/Shift+clique larga no chão. Dica com
  atributos, comparação com o equipado e motivo quando não dá para usar (classe ou nível).
- **Raridades:** Comum, Incomum (1 afixo), Raro (2), Épico (3, às vezes já imbuído) e **Lendário**: 12 lendários únicos com
  nome, história e atributos fixos (ex.: *Juramento de Vaelmor*, *Coroa das Cinzas* do Dragão, *Presa da Serpe*,
  *Machado do Rei Goblin*). Armas e escudos são por classe; armaduras e joias servem a todos.
- **Armadura:** novo atributo que reduz o dano recebido (até 60%).
- **Imbuimento:** runas (fogo, gelo, sombra, sagrado, veneno, raio) caem de inimigos e baús; sentado numa fogueira,
  clique na runa para imbuir a arma. Golpes ganham dano extra e efeito: queimadura, lentidão, maldição, cura, veneno
  ou quebra de postura.
- **Loot:** inimigos derrubam itens conforme a força (chefes sempre, 2–3 itens, lendário próprio); o item é só seu por
  45 s, depois qualquer um pega. Ande por cima para pegar. Épicos e lendários brilham com um feixe de luz.
- **Baús espalhados ([F]):** madeira (1 item), ferro (2 + runa) e dourado (3 + runa, chance de lendário) — no castelo,
  na cripta, nas ruínas e ~22 pelo mapa. Cada personagem abre cada baú uma vez.
- Tudo é rolado e validado no servidor; o save guarda mochila, equipamento e baús abertos (itens adulterados são
  rejeitados ou limitados).

## Novidades da 0.10 — criaturas do Flare, herói/heroína e ASCII legível
- **Herói ou heroína:** escolha na tela inicial (e no lobby online); fica salvo no personagem. Os 14 visuais (7 classes × 2)
  são montados das camadas do Flare: placas na Vanguarda, túnica de mago no Arcanista, couro no Arqueiro etc.
- **Criaturas do Flare** (todas passam pelo pós-processo ASCII): Errante → zumbi, Colosso → Minotauro Colosso,
  Aranha → Formiga-Leão Gigante, Guardião Abissal → esqueleto de elite, Guerreiro Ancestral → esqueleto espectral.
- **Novas criaturas:** Goblin, Chefe Goblin (corneta chama o bando; acampamentos no meio do mapa), Esqueleto Soldado,
  Esqueleto Arqueiro (rajada de 3 flechas), Esqueleto Necromante (gelo, maldição, chuva de ossos), Formiga de Fogo
  (queimadura), Formiga Glacial (lentidão), Túmulo Amaldiçoado (ergue esqueletos), **Dragão das Cinzas** (chefe: sopro
  de 7 bolas de fogo, investida, rabada) e **Serpe Glacial** perto do lago.
- **ASCII legível:** células de 10 px por padrão (ajustável 1–18; saves antigos migram), rampa de densidade curada
  (espaço → `. : - = + * # % @ W`), contraste forte (sombras somem, fogueiras e luz viram `#`/`@`), dithering mínimo,
  fonte em negrito ≥ 9 px. O **depth buffer** reconstrói a normal de cada célula: paredes usam `| ! [ ] I H`, chão usa
  `. , - _ ~ =`. Personagens ganham contornos internos (braço, cinto, capa).

## 0.9 — heróis com sprites isométricos (Flare)
- Os 7 heróis jogáveis agora são desenhados a partir das folhas do "Isometric Hero" (Clint Bellanger, Flare, CC-BY-SA 3.0),
  uma folha por classe montada a partir das camadas de armadura/cabeça/arma (`tools/build-hero-sheets.py`).
- 8 direções × 32 quadros: parado, corrida, golpe, bloqueio, impacto, morte, conjuração e disparo, ligados às ações reais.
- Cada herói é um quad virado para a câmera dentro da cena 3D, passando pelo mesmo pós-processo ASCII (contorno e glifos finos).
- Status (veneno, queimadura, lentidão, maldição, furtividade) tingem o sprite; `?sprites=0` volta aos modelos 3D.

## Novidades da 0.9 — árvores de habilidades livres e ícones (etapa 1 de 3 do "mundo vivo")

- **Árvore livre por classe** (`shared/data/talents.ts`), gerada a partir de dados de três braços:
  - 76 nós: início, anel de 6 nós, 3 braços de 22 nós e 3 pontes;
  - cada braço tem atributos, 3 notáveis, 2 habilidades novas e uma pedra angular;
  - um nó só pode ser comprado se estiver ligado ao que já é seu;
  - o braço com 5 ou mais pontos vira o título (substitui a antiga subclasse);
  - saves antigos e adulterados são podados para nós conectados, dentro dos pontos do nível.
- **42 habilidades novas** (`shared/data/treeskills.ts`), feitas só com dados: projéteis, zonas, golpes do céu, selos, curas e invocações.
  - Novo status **queimadura** (dano contínuo).
  - Novas invocações aliadas: Imagem Ilusória, Lobo Espiritual, Cão Infernal e Guerreiro Ancestral.
- **Atalhos configuráveis:** mensagem `equip` validada pelo servidor; `loadout` salvo no personagem; a barra mostra o que está equipado.
- **Ícones em arte ASCII** (`client/hud/icons.ts`): 40 motivos 9×9 coloridos pelo elemento, usados na barra de habilidades, nos nós da árvore e na lista de atalhos.
- **Tela K nova:** grafo em canvas (arrastar e zoom), dica ao passar o mouse, painel lateral com os caminhos e os atalhos.
- **Visual dos elementos:**
  - projéteis, zonas (fogo, veneno, espinhos, ilusão, estandarte) e golpes do céu tingidos pelo elemento;
  - meteoro de fogo e garras de sombra;
  - invocações espectrais coloridas.
- **Testes:** grafo conexo e simétrico em todas as classes; regra de vizinhança; atalhos; título; respec; as 42 habilidades executam e têm efeito; queimadura; save adulterado. O E2E compra nós clicando no canvas e equipa Luz Sagrada.
- **Próximas etapas:**
  - mapa 3× (672 m) com vilas, castelos e masmorras por nível;
  - dragões, salamandras e cultistas com ritual de invocação e diálogo;
  - animais andando e comendo pelo mapa.

## Novidades da 0.8.3 — jogar pela internet de graça

- `iniciar-online.bat` / `iniciar-online.sh`: compila, baixa o cloudflared, abre um Cloudflare Quick Tunnel (HTTPS, sem conta) e sobe o servidor. O link público aparece na tela e vai para a área de transferência.
- O servidor ganhou `ETHERFALL_TRUST_PROXY=1`: atrás do túnel, o IP real vem de `CF-Connecting-IP` (só para conexões locais), e os limites por IP continuam valendo por jogador.
- `ETHERFALL_PUBLIC_URL` libera a origem do link público no WebSocket; outras origens continuam recusadas.
- Testes novos:
  - origem do túnel aceita e origem estranha recusada;
  - 10 jogadores pelo mesmo túnel aceitos;
  - controle sem o proxy: o limite de 8 continua valendo.
- Não testado de ponta a ponta com a Cloudflare real (a rede de testes bloqueia trycloudflare.com). Testado com um cloudflared simulado.

## Novidades da 0.8.2 — salas co-op com código

- **Salas privadas no servidor da rede local:** "Criar sala" gera um código de 5 caracteres (sem 0/O nem 1/I). Quem digita o código e clica em "Jogar" entra na mesma simulação. Limites:
  - até 24 salas por servidor;
  - 8 jogadores por sala;
  - a sala fecha depois de 2 min vazia.
- O mundo aberto continua existindo; cada sala é uma instância própria do mesmo mapa. O código aparece no HUD (`SALA XXXXX`).
- `/api/info` informa o número de salas e o total de jogadores. Novo teste de servidor: criar a sala, recusar código errado, o amigo entrar pelo código (em minúsculas e com espaços também) e ver o anfitrião no snapshot.
- O tamanho de célula agora vai até 1 px: em 1 e 2 px cada célula vira um ponto com o brilho da letra.

## Novidades da 0.8 — visual "ASCII MMORPG" (referência em vídeo do usuário)

- **Mundo em 3D de verdade** (`render3d/world3d.ts`): terreno com cores suavizadas entre tiles, penhascos, árvores (copas e pinheiros), arbustos, pedras, muralhas com ameias, torres, ruínas, pilares, tochas e fogueiras com chama tremulando. Paredes e copas na frente do jogador abrem um buraco pontilhado para ele continuar visível.
- **Filtro ASCII fino** (`render3d/asciiPost.ts`): a cena é renderizada a 4×6 amostras por célula. Cada célula vira uma letra com tinta proporcional ao brilho (rampa de 44 caracteres medida no próprio atlas), ou um traço em 8 ângulos quando há uma borda coerente. O fundo é um azul-noite.
- **Grama em traços**: o chão de grama é marcado no canal alfa e desenhado como traços que o vento e um campo de fluxo penteiam. Os personagens abrem a grama ao passar.
- **Personagens com o dobro de densidade**: os pixels de ator são marcados (alfa 0,7) e desenhados numa grade 2× mais fina, com um respiro escuro em volta. A aranha gigante ficou clara, como desenho de linhas.
- **Chuva** em riscos brancos inclinados pelo vento, com respingos no chão. Dentro do castelo e na cripta não chove.
- **Efeitos** (magias, decalques, chamas, números de dano) continuam na camada ASCII antiga, agora transparente por cima da cena 3D.
- **HUD monocromático** (molduras finas brancas, barras cinza tracejadas).
- `?actors=ascii` volta ao visual antigo; `?ascii=0` mostra a cena 3D crua; `?cell=` ajusta o tamanho das letras.
- **0.8.1 (feedback do usuário):**
  - células de 2 a 18 px (padrão 5);
  - letras rasterizadas no tamanho exato da célula, nítidas pixel a pixel;
  - grama em tufos de folhas 3D com física de mola (o personagem abre caminho e os golpes balançam);
  - personagens com contorno claro e sombreamento que mantém escuro o que é escuro (capa, armadura);
  - chão apagado, como o fundo vazio da referência.

## Novidades da 0.7 — online com contas, saves, invocações do Bruxo
- **Servidor online** (`packages/server`, Node + WebSocket) para jogar com amigos na rede local:
  - contas com usuário e senha (hash scrypt, limite de tentativas);
  - até 6 personagens por conta, nome único no servidor;
  - mundo autoritativo a 30 Hz, com saves a cada 10 s, ao sair e ao desligar;
  - quem reconecta continua onde parou;
  - inicia com `iniciar-servidor.bat`, `npm start` ou Docker.
- **Saves offline** no navegador: autosave a cada 10 s e lista "Continuar" na tela inicial.
- **Saves validados no carregamento:** pontos impossíveis, talentos de outra classe ou subclasse antes do nível 10 são corrigidos.
- **Redistribuir pontos (respec)** sentado na fogueira: devolve atributos e talentos.
- **Invocações do Bruxo:**
  - **Invocar Diabretes** (tecla 2): dois diabretes de fogo por 25 s;
  - **Guardião Abissal** (R): demônio gigante por 30 s.

  As criaturas seguem o Bruxo, lutam contra os inimigos (e são atacadas por eles), e os abates dão XP ao Bruxo. O Poço de Almas saiu do kit do Bruxo.
- **Animação mais fluida:** as poses se misturam em vez de saltar; a passada tem quadril e ombros em contrarrotação, balanço e cabeça estabilizada.
- **README** reescrito como guia do jogador: como jogar, classes, como subir de nível, talentos, subclasses e como trocar de classe ou de build.


## Novidades da 0.6 — pixel art, 4 classes novas e o Colosso de Ossos
- **Personagens e monstros em pixel art:** o 3D virou sprite.
  - Os modelos são desenhados em baixa resolução (1 pixel de sprite = 2 pixels de tela; `?px=1..4` ajusta).
  - Têm contorno escuro de 1 px, paleta reduzida com pontilhado e ampliação sem suavizar.
  - A câmera fica presa à grade de pixels, então os sprites não tremem.
  - Todas as animações e direções saem automaticamente, sempre sincronizadas com o servidor.
- **4 classes novas** (agora são 7). Cada uma tem 6 habilidades, árvore de talentos e 2 subclasses:
  - **Patrulheiro** (arco longo): Rajada de 5 flechas, Salto Evasivo para trás, Flecha Envenenada, Armadilha de Espinhos (prende), Chuva de Flechas e Olho do Falcão (+35% de dano). Subclasses: Atirador de Elite ou Guardião da Mata.
  - **Ladina** (adagas gêmeas): Lâmina Venenosa, Passo Sombrio, Leque de Facas e Bomba de Fumaça (fica furtiva: os inimigos perdem você e o próximo golpe é uma emboscada, +60%). Também Golpe Fatal e Dança das Lâminas. Subclasses: Assassina ou Envenenadora.
  - **Bárbaro** (machado de guerra a duas mãos): Grito de Guerra (+25% de dano no grupo), Salto Brutal, Redemoinho, Pancada Atordoante, Machado Arremessado e Fúria Ancestral. Subclasses: Chefe de Guerra ou Fúria Sangrenta.
  - **Bruxo** (grimório e cajado de osso): Raio Sombrio (maldição contínua), Passo do Vazio, Dreno de Vida (cura 60% do dano), Poço de Almas, Maldição e Chamado do Abismo (garras do vazio). Subclasses: Pacto Infernal ou Ceifador de Almas.
- **Mecânicas novas no servidor:**
  - rajadas de projéteis;
  - veneno e maldição como dano contínuo, com números verde e roxo subindo;
  - fúria (+dano);
  - furtividade (a IA ignora o jogador furtivo);
  - roubo de vida por golpe;
  - saltos para trás.

  Novos talentos: força dos venenos/maldições e velocidade de movimento.
- **Colosso de Ossos (monstro épico, ~4 m):** 1400 de vida e uma clava de fêmur. Ataca com Varrida, Pisão (onda de choque) e Esmagamento (aviso vermelho). Pelo menos 2 vagam nas regiões distantes; aparecem em laranja no minimapa.
- **Tela inicial** com as 7 classes. Efeitos próprios: flechas e facas de verdade, machado girando, raios verdes do Bruxo, chuva de flechas, garras do vazio, fumaça, armadilha e poço de almas.


## Novidades da 0.5 — personagens 3D (estilo Dark Eden / Diablo II), talentos e subclasses
- **Visual híbrido:** o mundo continua ASCII por GPU, e personagens e monstros agora são **modelos 3D** (three.js) num canvas transparente por cima, com câmera ortográfica inclinada 35°, calibrada para cair nos mesmos pixels do mundo ASCII. Eles têm luz do dia/noite, sombras no chão, tochas e fogueiras iluminando a armadura, flash branco ao levar golpe, tom azul na lentidão e brilho vermelho no aviso de golpe perigoso.
  - Vanguarda: armadura de placas, elmo com viseira e cruz dourada, penacho, capa, tabardo, escudo-pipa (vai à frente ao bloquear) e espada.
  - Arcanista: manto roxo, capuz pontudo com olhos azuis e cajado retorcido com cristal.
  - Curandeira: túnica branca, diadema e cajado-sol.
  - Inimigos: Errante Oco (esqueleto com elmo enferrujado), Lobo de Cinza (galope em 4 patas, mandíbula), Nobre Vampírico (sobretudo, gola alta, garras) e Aranha Gigante (~4 m de envergadura, 8 patas com IK 3D).
  - As poses vêm dos mesmos frame data do servidor (windup, ativo, recuperação). `?actors=ascii` volta aos bonecos ASCII.
- **Árvore de talentos (K):** 3 ramos por classe com 4 talentos cada (1 ponto por nível) e **subclasse no nível 10**:
  - Vanguarda: Paladino ou Berserker;
  - Arcanista: Criomante ou Mago de Sangue;
  - Curandeira: Sacerdotisa da Aurora ou Inquisidora.

  Tudo validado no servidor (dano, crítico, roubo de vida, recarga, cura, absorção, vida/mana/stamina).
- **Números de dano estilo Ragnarok:** grandes, com contorno, saltam e caem. Críticos maiores e laranja, cura verde subindo, "MISS" na esquiva.
- **Fogueiras com bancos de tronco:** F senta o personagem no tronco livre mais próximo, virado para o fogo; mover ou atacar levanta.
- **Clima alternado:** começa seco, chove ~30% do tempo (garoa na maior parte, tempestade rara) e nunca chove dentro do castelo nem da cripta.
- **Criaturas:** Aranha Gigante muito maior (raio 1,4) e o novo **Nobre Vampírico** (garras, investida perigosa, projétil de sangue) na torre de menagem e na floresta distante.


## Novidades da 0.4 — arte de verdade, clima e mundo maior
- **Personagens pintados ("recortes animados"):** cada parte do corpo (elmo, peitoral, ombreiras, capa, escudo brasonado, espada, capuz, manto rúnico, véu, cajados, crânio, costelas, pelagem, quitina) é pintada em código (Canvas2D, gradientes, placas, dobras, pelos) num atlas e posicionada sobre os ossos do esqueleto 2D. Fim dos "palitos".
- **Camada ASCII fina para atores:** personagens e criaturas usam uma grade com o dobro da resolução (4× mais glifos), com o glifo seguindo o sombreamento pintado e contorno em traço na silhueta. O cenário continua na grade normal.
- **Escala:** personagens ~1,75 m, árvores 1,5× maiores, zoom padrão 1,05.
- **Curandeira (nova classe):** Luz Curativa (Q), Égide (E, -35% de dano nos aliados), Sentença Radiante (1), Santuário (2, cura aliados e fere inimigos), Purificar (3, remove lentidão/enraizamento), Bênção da Aurora (4). Cura validada no servidor (evento `heal`).
- **Aranha Gigante (estilo D&D):** 8 patas com IK e marcha alternada, abdômen com caveira e ampulheta, presas, olhos em brasa. Picada, Bote (perigoso) e Teia (projétil que deixa lento).
- **Mundo 224×224 m** com o **Castelo de Vaelmor** (muralha com ameias, 4 torres, portão com tochas, pátio com fogueira, torre de menagem) e a **Cripta Afundada** (8 salas escavadas na rocha, corredores, tochas, fogueira, aranhas). Entrada por portal (F) na torre de menagem; portais recusam quem apanhou nos últimos 3 s.
- **Clima determinístico pelo tick:** chuva (riscos inclinados pelo vento, respingos, chão molhado, céu mais escuro), tempestades com relâmpagos e trovões, som de chuva. `?rain=0..1` força a chuva.
- **Física da grama:** campo de molas (96×96, 0,5 m) em volta da câmera; personagens empurram e a grama balança de volta; ondas de choque, raios, esquivas e golpes chicoteiam a grama.
- **Vento nas árvores:** frentes de rajada que atravessam a floresta, copas inclinam mais no topo (cisalhamento), vento mais forte na chuva.
- **Minimapa** circular (terreno, muralhas, fogueiras, tochas, portais, inimigos, aliados, nome da região) e mapa M com portais e locais.
- Validado na GPU do usuário (RTX 3050 / D3D11): 165 FPS, GPU ~3,5 ms.


## Novidades da 0.3 — personagens "realistas" e magias
- **Esqueleto 2D animado (rig)** para todos os atores, em pé, em ¾ (referência: vídeo do mago). Membros em cápsula com sombreamento cilíndrico. O glifo de cada célula vem da luz (rampa de densidade `.:-=+*oaedQ#%&@M`) e o contorno é em traço fino na silhueta. Animações de parado (respiração), andar/correr (ciclo de passada pela distância percorrida), ataques com keyframes tirados dos frame data do servidor, carga, conjuração, bloqueio, rolamento, atordoamento, aparo, descanso e morte (queda).
  - Vanguarda: armadura, elmo com penacho e viseira, capa que esvoaça, tabardo, escudo (vai à frente ao bloquear) e espada.
  - Arcanista: manto longo, capuz, faixa de runas e cajado com orbe que brilha na conjuração.
  - Errante Oco: morto-vivo esquelético (costelas, crânio, olhos em brasa, lâmina enferrujada que avermelha no golpe perigoso).
  - Lobo de Cinza: quadrúpede com galope de 4 patas, salto e mordida.
- **Arcanista 1–4:** Lança de Gelo (fileira de espinhos que avança, lentidão), Campo de Ruptura (zona rúnica que fere e retarda), Selo de Contenção (prende o alvo mais próximo na mira), Colapso Astral (conjuração longa; raios avisados no chão caem do céu).
- **Vanguarda 1–4:** Corte Ascendente (quebra o equilíbrio), Guarda de Ferro (-60% de dano, imune a atordoamento), Contra-ataque (liberado por aparo ou esquiva perfeita), Fúria do Bastião (giro com armadura que acerta várias vezes).
- **Efeitos de status no servidor:** lentidão, enraizamento, guarda de ferro e contra-ataque, com duração, renovação e expiração. Zonas no chão e golpes atrasados também.
- Padrão visual: células de 7 px e zoom inicial 1,2.


## Novidades da 0.2
- **Bug crítico corrigido:** atores, fogueiras e props ficavam invisíveis ou "transparentes" ao mover a câmera. Causa: o `glClear` respeita a máscara de escrita de profundidade, que ficava desligada no fim de cada quadro, então a profundidade do quadro anterior nunca era limpa. Validado na GPU real do usuário (RTX 3050 Laptop, ANGLE/D3D11): 165 FPS, GPU 0,5–3,8 ms.
- **Visual dos personagens:** atores desenhados 30% maiores que o colisor, com contorno escuro; ombreiras e penacho (Vanguarda), capuz e faixa de runas (Arcanista), orelhas (Lobo). Telegráficos continuam no alcance real.
- **Música de fogueira:** tema procedural em Ré menor (Dm–B♭–Gm–A, ~62 BPM): pad de cordas, arpejo dedilhado, melodia ocasional e reverb. O volume cresce perto das fogueiras. Controle em Esc → Áudio & Mundo.
- **XP e níveis (servidor):** XP por abate e por descoberta de locais (Ruínas do Juramento +60, Lago Espelhado +40). Subida de vários níveis de uma vez, limite no 60, +3 pontos por nível, status recalculados.
- **Distribuição de atributos:** ficha (C) com botões `+`, via mensagem `allocate` validada pelo servidor.
- **Marca de essência:** ao morrer, o XP do nível atual vira uma marca brilhante no local da morte. Tocar nela recupera o XP; morrer de novo antes disso perde a marca antiga. Nível e pontos nunca são perdidos.


## ✅ Concluído e verificado
- **Arquitetura:** stack escolhida, ADRs, módulos, protocolo de rede e rascunho do modelo de dados. Ver `_bmad-output/planning-artifacts/architecture.md`.
- **Simulação autoritativa determinística** (`packages/shared`): tick de 30 Hz, RNG semeado, `stateHash` e teste de determinismo de 900 ticks.
- **Mundo procedural** (seed 20261012): Floresta do Crepúsculo 160×160 m com ~2.500 árvores e pinheiros, arbustos, rochas, lago com centro profundo e margem de areia, rio vadeável, trilhas, ruínas com muros quebrados e pilares, 2 fogueiras e 18 pontos de inimigos. Alcançabilidade garantida por BFS (testada).
- **Física:** colisão círculo×tile e círculo×círculo, separação por massa, sub-stepping anti-tunneling (testado a 30 m/s), água rasa lenta e água profunda bloqueante. Projéteis passam por cima da água.
- **Combate soulslike:** stamina com atraso de regeneração, ataque leve com combo alternado, pesado com carga (até ×1,7), esquiva com i-frames e passo para trás, bloqueio com absorção e custo de stamina, quebra de guarda, aparo (janela de 5 ticks, sem rearmar no spam), contra-ataque crítico ×2,5, golpe pelas costas ×1,5, poise e stagger, hyper armor, knockback por massa, buffer de entrada de 8 ticks e cancelamento em esquiva só a partir de `cancelFrom` (e só com stamina).
- **Classes:** Vanguarda (espada e escudo; Q Impacto Sísmico, E Investida) e Arcanista (cajado; Q Projétil Etéreo, E Passo Espectral), com custos, recargas, alcance, frames, interação com atributos, colisão, VFX e SFX próprios.
- **Inimigos:** Errante Oco (talho e golpe descendente "perigoso") e Lobo de Cinza (mordida e salto). FSM com aggro, perseguição, strafe, ataque telegrafado com compromisso de direção, recarga entre ataques, desvio de obstáculos, leash com cura e respawn.
- **Morte e fogueiras:** "VOCÊ PERECEU", retorno à última fogueira; descansar (F) restaura vida, stamina e mana e define o ponto de retorno.
- **Renderização ASCII por GPU** em 4 passes (sombras → cena MRT → células → composição):
  - grama com 4 estados de glifo por vento e por atores (se dobra ao redor de quem passa e ondula com rajadas e ondas de choque);
  - árvores e pinheiros balançando, folhas caindo com o vento;
  - água com ondas, espuma de margem, ripples (passos, projéteis, esquivas, impactos) e reflexos estilizados;
  - luzes dinâmicas (fogueiras com cintilação, tocha à noite, magia, aparos e impactos) e sombras dependentes do sol;
  - ciclo dia/noite derivado do tick do servidor (8 min por dia);
  - legibilidade: prioridade de célula (atores > efeitos > cenário), folhagem translúcida ao redor dos atores, contornos por Sobel, telegráficos pontilhados que se preenchem;
  - grade travada no mundo (sem "fervura" ao rolar), LOD por distância, névoa, dithering, granulação, vinheta;
  - 5 presets (colorido, monocromático, alto contraste, cinematográfico, desempenho) e 15 parâmetros ao vivo no menu.
- **Câmera ¾:** segue com suavização, look-ahead da mira, tremor por trauma, zoom e limites do mundo.
- **Entrada:** teclado, mouse e gamepad, remapeamento persistido, cliques curtos nunca perdidos.
- **HUD:** vida/stamina/mana com barra de "dano atrasado", barra de habilidades com recargas e falta de recurso, quadro de alvo, log, toasts, números flutuantes, nomes e vida de inimigos, prompt de fogueira, mapa (M), ficha de atributos (C), menu (gráficos, controles, áudio e mundo, ajuda), métricas de FPS/CPU/GPU e painel F3.
- **Áudio procedural** (WebAudio, sem assets): golpes, impactos, bloqueio, aparo, esquiva, magia, onda de choque, morte, telegráficos, passos por superfície (grama/água) e ambiência de vento, fogo e água com pan estéreo e atenuação por distância.
- **Núcleo multiplayer (`Room`)**, testado: `hello` obrigatório com versão, limite de jogadores, sanitização de nomes e entradas, anti-replay por `seq`, fila com preservação de bordas, liberação de entradas obsoletas, despejo de ociosos, `ackSeq` aplicado, interest management de snapshots e eventos. O cliente já usa o `Room` pelas mensagens reais do protocolo (`LocalTransport`).

## 🟡 Parcialmente concluído
- **R (suprema/contextual):** ainda não definido.
- **Progressão:** XP só vem de abates e descobertas. Grupo/divisão de XP fica para a Etapa 5. A regra de essência na desconexão (manter a marca no servidor) será definida com a persistência.
- **Multiplayer:** o núcleo autoritativo está pronto, mas não há servidor WebSocket nem predição/reconciliação. Hoje o jogo roda com a autoridade **em processo** (um jogador).
- **Física:** sem objetos destrutíveis nem corpos rígidos empurráveis. Partículas têm gravidade e quique.
- **Docker:** `Dockerfile` e `docker-compose.yml` (cliente via nginx) foram escritos, mas **não foram validados** neste ambiente (sem daemon Docker). Validar com `docker compose up --build`.

## ⏳ Não iniciado
Inventário, itens, loot e crafting (Etapa 4) · Postgres, auth e reconexão real (Etapa 5) · Colosso das Raízes (Etapa 6) · clima com chuva, neblina e tempestade, e relâmpagos (Etapa 7) · missões, chat e grupos · marca de essência ao morrer · efeitos de status.

## Problemas conhecidos
- **Desempenho não medido em GPU real.** Em CI (SwiftShader, só CPU) roda a ~10 FPS. Medir em hardware e registrar aqui.
- A clareira inicial tem bastante terra (3 trilhas convergem nela).
- As teclas I, J e G só mostram um aviso de "ainda não implementado".
- Glifos Unicode dependem das fontes do sistema. Fallback: DejaVu Sans Mono, Menlo, Consolas ou monospace.
- O deslocamento de hora do dia no menu é uma ferramenta local de desenvolvimento e não deve existir no servidor.

## Testes executados (nesta entrega)
- 0.4: `npm test` **93/93** (+16: mundo/castelo/masmorra, portais, Curandeira, Aranha); E2E +8 checagens (Curandeira na chuva, portal da cripta).
- `npm test`: **77/77** (world 11, physics 5, combat 29, room 11, progression 10, abilities 11). Cobertura do `shared`: **95,7% linhas / 92,8% ramos**.
- `npx tsc` (shared e client, strict): sem erros.
- `npm run e2e`: **24/24 checagens** em 4 sessões (Vanguarda; Arcanista à noite; preset cinematográfico ao meio-dia; monocromático). Cobre spawn, movimento por teclado real, ataque gastando stamina, habilidade Q, esquiva, grade ASCII ativa e ausência de erros no console.
- **Revisão ECC** (agente `typescript-reviewer`): 11 achados, todos corrigidos, com testes de regressão (um deles validado por teste de mutação).
- O E2E revelou um bug real: abaixo de 10 FPS a simulação andava em câmera lenta (o `dt` era limitado antes do relógio autoritativo). Corrigido: o transporte usa o tempo real e só os efeitos visuais usam `dt` limitado.

## Próximas tarefas (Entrega 2 → Etapa 3)
1. **Chefão cooperativo** (referência: vídeo da aranha gigante): corpo segmentado, patas articuladas (IK sobre o mesmo rig), fases, anel telegráfico, filhotes e recompensas idempotentes.
2. **Servidor WebSocket real + grupo** (painel de party), para o coop de verdade.
5. Começar a Etapa 4 (itens orientados a dados e inventário).

## Comandos
```bash
npm install && npm run dev       # jogar (http://localhost:5173)
npm test                         # testes
npm run build && npm run e2e     # build + E2E headless
npm run build:single             # HTML único autocontido
docker compose up --build        # cliente em container (http://localhost:8080)
```
