# ETHERFALL — Guia e banco de dados

Este guia reúne o que o jogo tem hoje (versão 0.13.1): classes, roteiro de níveis, criaturas, chefes, onde estão os itens
e que equipamento usar em cada fase. Os números vêm do código (`packages/shared/src/data`). Se você mudar o código,
mude este guia também.

> As coordenadas são em metros no mapa (**M**). O mundo tem 672 × 672 m e (0, 0) é o canto de cima à esquerda.
> O mapa é gerado pela semente do servidor; os locais abaixo valem para a semente padrão.

---

## 1. Regras rápidas que todo mundo deveria saber

- **Fogueira é refúgio.** Num raio de **9 m** de qualquer fogueira nenhum monstro nasce. Monstros não perseguem quem
  está lá dentro e, se entrarem na luz, voltam para o covil. Fogueira no meio do mato tem uma **tenda**. Animais ficam
  calmos perto do fogo. Sentar (**F**) recupera vida, vigor e mana e passa a ser seu ponto de renascer. Sentado,
  você também pode **redistribuir pontos** e **imbuir a arma** com runas.
- **Morrer** deixa sua essência (o XP do nível atual) onde você caiu. Volte lá para recuperar. Se morrer de novo
  antes disso, perde a essência.
- **Nível do inimigo:** o nome mostra "Nv". Ele fica **laranja** com 3 ou mais níveis acima do seu e **vermelho** com 6 ou mais.
  Por nível de diferença: vida +14%, dano +7,5% e XP +12%.
- **Itens:** só equipa itens até **5 níveis acima** do seu. Armas e mãos secundárias são da classe; armaduras e
  joias servem para todos. O que cai no chão é **seu por 45 s** (depois qualquer um pega).
- **Portais** de masmorra não funcionam com 3 s de dano recente.
- **Animais** (cervo, coelho, javali) só dão XP, sem itens. Chegue **andando**, porque correndo eles fogem antes.

---

## 2. Classes

| Classe | Papel | Atributos fortes | Arma / mão secundária | Melhor caminho para jogar sozinho | Melhor caminho em grupo |
|---|---|---|---|---|---|
| **Vanguarda** | tanque corpo a corpo | FOR, VIT, RES | Espada Longa / Escudo Pipa | **Paladino** (cura a si mesmo) | **Guardião** (segura os chefes) |
| **Arcanista** | dano mágico à distância | INT, VON | Cajado Arcano / Grimório | **Criomante** (lentidão e controle) | **Piromante** (dano em área) |
| **Curandeira** | suporte e cura | VON, VIT | Cetro da Aurora / Escudo Pipa | **Druida** (lobos espirituais lutam por você) | **Sacerdotisa da Aurora** |
| **Patrulheiro** | dano físico à distância | DES, RES | Arco Longo / Aljava | **Mestre das Feras** (lobos e falcão) | **Atirador de Elite** |
| **Ladina** | crítico e furtividade | DES, RES | Adagas Gêmeas / Adaga de Aparar | **Assassina** | **Envenenadora** (venenos acumulam) |
| **Bárbaro** | dano bruto corpo a corpo | FOR, VIT | Machado de Guerra / Troféu de Caça | **Fúria Sangrenta** (vive do roubo de vida) | **Chefe de Guerra** (brados para o grupo) |
| **Bruxo** | dano contínuo e invocações | INT, VON | Varinha de Osso / Grimório | **Demonologista** (cães de fogo tankam) | **Ceifador de Almas** |

**Atributos:**

| Atributo | Efeito |
|---|---|
| FOR, DES, INT e VON | Multiplicam o dano (ou a cura) das habilidades que usam esse atributo. A descrição de cada habilidade mostra qual. INT e VON também dão mana |
| VIT | Vida e postura |
| RES | Vigor: esquivas, bloqueios, corrida e ataques pesados |
| SOR | Ainda não tem efeito; está reservado para uma versão futura. Por enquanto, não invista |

Você ganha pontos a cada nível. Em geral, coloque **2 em cada 3 pontos no atributo de dano da classe** e o resto em VIT
até ter uns 25 de VIT, depois em RES. Os atributos têm rendimento decrescente: cada ponto vale menos depois de valores altos.

**Árvore de habilidades (K):** cada classe tem 76 nós em 3 caminhos. Escolher um caminho principal até o fim desbloqueia
as 2 habilidades mais fortes dele. Misturar caminhos funciona, mas atrasa os nós-chave. A redistribuição é grátis numa
fogueira.

---

## 3. Roteiro de níveis (melhor caminho de up)

O XP para subir cresce rápido: do nível 1 ao 2 são 150; do 10 ao 11, 4.183; do 20 ao 21, 12.062; do 30 ao 31, 22.580.
O nível máximo é 60. Descobrir locais dá XP uma vez (regiões, vila, castelos, masmorras, círculos).

| Seu nível | Onde ir | O que caçar | Por quê |
|---|---|---|---|
| **1–5** | Floresta do Crepúsculo (início, 337, 418) | Errantes Ocos, Lobos de Cinza, goblins soltos | Fogueira no acampamento; Ruínas e Lago dão XP de descoberta |
| **5–9** | Vale de Pedravelha (131, 391) | goblins, lobos e os primeiros esqueletos | A vila é segura, tem fogueira na praça e os aldeões dão dicas (**F**) |
| **7–12** | Colinas dos Goblins (522, 552) | dois acampamentos goblin; o **Chefe Goblin** fica na Toca do Rei | Goblins têm pouca vida, muitos juntos dão muito XP. O chefe dá o **Machado do Rei Goblin** |
| **10–16** | Bosque de Vaelmor (342, 234) | esqueletos, vampiros, o **Castelo de Vaelmor** e a **Cripta Afundada** | A Cripta (portal dentro do castelo) tem baús de ferro e um dourado no fim |
| **15–17** | Círculo de Invocação de Vaelmor (397, 269) | Arauto Nv 15 + cultistas; Demônio Nv 17 se deixar o ritual terminar | Arauto e cultistas dão bom XP. O demônio é um chefe de 900 XP base |
| **14–22** | Brejo Sombrio (561, 361) | necromantes, formigas-leão, Túmulos Amaldiçoados | **Cemitério** → **Necrópole Submersa** (chefe: Túmulo Amaldiçoado) |
| **20–30** | Picos Gelados (538, 108) | Formigas Glaciais e esqueletos arqueiros | **Ninho da Serpe** (Serpe Glacial) e **Caverna de Gelo**. Leve fogo (runa ou imbuimento) |
| **28–40** | Terras de Cinza (169, 580) | Formigas de Fogo, Minotauros, vampiros | **Covil do Dragão das Cinzas** (chefe máximo) e **Forja Afundada** (Minotauro Colosso) |
| **34–45** | Fortaleza do Juramento (113, 135) | esqueletos de elite, vampiros, Minotauro Colosso no pátio | Muitos baús dourados. O último círculo de invocação (Nv 44) fica ao norte |
| **45–60** | chefes e baús dourados de Cinzas e Juramento | Dragão, Serpe e demônios | Os lendários e as runas saem daqui |

**Dicas para subir mais rápido:**

- Mate grupos perto de uma fogueira: você descansa sem andar e os monstros não entram na luz.
- Inimigos 2 ou 3 níveis acima dão bem mais XP e ainda são seguros. Com 6 ou mais níveis acima, só em grupo.
- Fogueiras no meio das estradas entre regiões são paradas de descanso. Use para trocar de região sem morrer.
- Em grupo, a Curandeira e o Guardião deixam o grupo puxar chefes 5 níveis acima.

---

## 4. Criaturas

| Criatura | Vida base | XP base | Onde |
|---|---|---|---|
| Coelho / Cervo / Javali | 20 / 70 / 160 | 4 / 12 / 30 | Bandos nas regiões verdes, no brejo e na neve. O javali revida |
| Goblin / Chefe Goblin | 90 / 280 | 25 / 95 | Crepúsculo, Pedravelha e Colinas (Chefe na Toca do Rei) |
| Lobo de Cinza | 105 | 30 | Crepúsculo até os Picos |
| Errante Oco | 170 | 45 | Crepúsculo, Pedravelha, Vaelmor e Brejo; também em masmorras |
| Esqueleto Soldado / Arqueiro / Necromante | 150 / 110 / 120 | 40 / 45 / 55 | De Pedravelha em diante; muito comuns na Fortaleza |
| Nobre Vampírico | 360 | 120 | Vaelmor, Cinzas e Juramento |
| Formiga-Leão Gigante | 420 | 140 | Colinas, Brejo e Cripta |
| Túmulo Amaldiçoado | 420 | 130 | Brejo e chefes da Cripta e da Necrópole |
| Formiga Glacial / de Fogo | 150 | 50 | Picos / Cinzas |
| Cultista do Abismo / Arauto do Abismo | 140 / 320 | 60 / 160 | Círculos de Invocação |
| **Minotauro Colosso** | 1.400 | 420 | Vaelmor (raro), Cinzas, Juramento; chefe da Forja |
| **Serpe Glacial** | 1.800 | 700 | Ninho da Serpe e Caverna de Gelo |
| **Demônio do Abismo** | 2.600 | 900 | Invocado quando um ritual termina |
| **Dragão das Cinzas** | 3.400 | 1.400 | Covil do Dragão das Cinzas |

A vida e o XP crescem com o nível da criatura. Um Esqueleto Nv 30 tem cerca de 5× a vida do Nv 1.

### Rituais de invocação

Há 4 círculos: Vaelmor Nv 15, Brejo Nv 21, Cinzas Nv 39 e Juramento Nv 44. Um Arauto e 3 Cultistas cantam quando você
chega a uns 13 m. São 6 falas, uma a cada 2,5 s, e depois vem a invocação. **Mate o Arauto antes da última fala** e o
círculo se rompe. Se não conseguir, o Demônio surge (nível do círculo + 2). Matando o demônio, ou com o círculo
rompido, o círculo descansa 5 minutos e depois o ritual pode recomeçar.

---

## 5. Onde estão os itens

**Raridades:** comum → incomum → raro → épico → **lendário**. Quanto maior a raridade, mais afixos o item tem; o valor
de cada afixo cresce com o nível do item, até um teto.

| Fonte | O que dá |
|---|---|
| **Baú de Madeira** | 1 item, quase sempre comum ou incomum |
| **Baú de Ferro** | 2 itens, muitas vezes raros; 35% de chance de runa |
| **Baú Dourado** | 3 itens, raros a épicos (~13% de lendário cada); 80% de chance de runa |
| Inimigo comum | 16% de chance de 1 item; 5% de runa |
| Elite (Chefe Goblin, vampiro, formiga-leão, túmulo, Arauto) | 55% de chance de item; 20% de runa |
| **Chefe** (Minotauro, Serpe, Demônio, Dragão) | 2–3 itens de raro para cima; 80% de runa |

Os baús abrem **uma vez por personagem**. O nível dos itens é o da região:

| Região | Baús | Dourados |
|---|---|---|
| Floresta do Crepúsculo | 1 | 0 |
| Vale de Pedravelha | 13 | 1 |
| Colinas dos Goblins | 13 | 0 |
| Bosque de Vaelmor | 11 | 1 |
| Brejo Sombrio | 14 | 3 |
| Picos Gelados | 12 | 3 |
| Terras de Cinza | 17 | 5 |
| Fortaleza do Juramento | 19 | 6 |

Em toda masmorra há baús de ferro nas salas e um **Baú Dourado atrás do último guardião**. A vila e os castelos também
têm baús. No minimapa os baús fechados aparecem como quadradinhos: marrom (madeira), prata (ferro) e ouro (dourado).

### Lendários (12)

| Lendário | Tipo | Classe | Efeitos | Onde cai |
|---|---|---|---|---|
| Juramento de Vaelmor | Espada Longa | Vanguarda | dano, roubo de vida, vida; **Sagrado** | Minotauro Colosso, Nobre Vampírico |
| Coroa das Cinzas | Elmo | todas | vida, dano contínuo, armadura | **Dragão das Cinzas** |
| Presa da Serpe | Adagas | Ladina | crítico, dano físico; **Gelo** | **Serpe Glacial** |
| Manto do Necromante | Túnica | todas | mana, recarga, dano arcano | Esqueleto Necromante, Túmulo Amaldiçoado |
| Machado do Rei Goblin | Machado | Bárbaro | dano físico, fúria; **Veneno** | **Chefe Goblin** |
| Varinha do Abismo | Varinha | Bruxo | dano contínuo, roubo de vida; **Sombra** | **Demônio do Abismo**, Arauto do Abismo |
| Arco de Sevaraen | Arco | Patrulheiro | dano físico, velocidade, crítico; **Raio** | qualquer chefe ou baú dourado |
| Cetro da Primeira Aurora | Cetro | Curandeira | poder de cura, mana; **Sagrado** | qualquer chefe ou baú dourado |
| Cajado da Tempestade | Cajado | Arcanista | dano arcano, recarga; **Raio** | qualquer chefe ou baú dourado |
| Muralha de Ferro | Escudo | Vanguarda / Curandeira | absorção de bloqueio, armadura, vida | qualquer chefe ou baú dourado |
| Anel do Errante | Anel | todas | recuperação de vigor, vigor | qualquer chefe ou baú dourado |
| Amuleto do Juramento Partido | Amuleto | todas | fúria (mais dano com pouca vida), dano | qualquer chefe ou baú dourado |

Quando sai um lendário de um chefe que tem lendário próprio, há 70% de chance de ser o dele.

### Runas e imbuimento

As runas caem de baús de ferro e dourados, de elites e de chefes. **Sentado numa fogueira**, abra o inventário (**I**) e
clique na runa para imbuir a arma. Elementos disponíveis:

| Elemento | Efeito |
|---|---|
| **Fogo** | queima o alvo |
| **Gelo** | deixa o alvo lento |
| **Sombra** | amaldiçoa o alvo |
| **Sagrado** | cada golpe cura você |
| **Veneno** | envenena o alvo |
| **Raio** | quebra a postura do alvo |

A arma imbuída também dá dano extra. Para enfrentar formigas glaciais e a Serpe, use **Fogo**. Contra vampiros e
mortos-vivos, **Sagrado**. Contra chefes de muita postura, **Raio**.

---

## 6. Melhor equipamento por fase

Cada parte tem um bônus fixo:

| Parte | Bônus fixo |
|---|---|
| Elmo | armadura e vida |
| Capuz | mana |
| Couraça | muita armadura e vida |
| Túnica | mana |
| Manoplas | armadura e dano |
| Grevas | armadura e vigor |
| Botas | velocidade |
| Anel | crítico |
| Amuleto | vida e mana |

A **armadura** reduz o dano recebido até um teto de 60%.

| Fase | Raridade-alvo | O que procurar |
|---|---|---|
| **Nv 1–10** | comum/incomum | Qualquer peça que aumente vida ou armadura. Troque a arma sempre que achar uma de nível maior. Abra todos os baús de Pedravelha |
| **Nv 10–20** | raro | Arma com o dano da sua classe, mais roubo de vida ou crítico. Couraça/Elmo para quem luta de perto; Túnica/Capuz para conjuradores. A primeira runa vai na arma |
| **Nv 20–30** | raro/épico | Peças com 3–4 afixos. Recarga das habilidades no elmo e no amuleto. Velocidade nas botas. Runa de **Fogo** antes dos Picos |
| **Nv 30–45** | épico | Baús dourados de Cinzas e Juramento. Comece a caçar o lendário da sua classe |
| **Nv 45+** | lendário | Lendário da classe + Coroa das Cinzas ou Manto do Necromante + Anel do Errante / Amuleto do Juramento Partido |

**Afixos prioritários por classe:**

| Classe | Arma | Armaduras e joias | Lendários-alvo |
|---|---|---|---|
| Vanguarda | dano, roubo de vida | armadura, vida, absorção de bloqueio | Juramento de Vaelmor, Muralha de Ferro, Coroa das Cinzas |
| Arcanista | dano arcano, crítico | mana, recuperação de mana, recarga | Cajado da Tempestade, Manto do Necromante |
| Curandeira | poder de cura | recuperação de mana, recarga, vida | Cetro da Primeira Aurora, Muralha de Ferro, Manto do Necromante |
| Patrulheiro | dano físico, crítico | velocidade, recuperação de vigor | Arco de Sevaraen, Anel do Errante |
| Ladina | crítico, dano físico | recuperação de vigor, velocidade | Presa da Serpe, Anel do Errante |
| Bárbaro | dano físico, roubo de vida | vida, armadura, fúria | Machado do Rei Goblin, Amuleto do Juramento Partido, Coroa das Cinzas |
| Bruxo | dano contínuo, roubo de vida | mana, recarga, dano arcano | Varinha do Abismo, Coroa das Cinzas, Manto do Necromante |

---

## 7. Masmorras

| Masmorra | Entrada | Nível | Chefe | Destaque |
|---|---|---|---|---|
| Cripta Afundada | pátio interno do Castelo de Vaelmor | 9–16 | Túmulo Amaldiçoado | primeira masmorra; formigas-leão nas salas grandes |
| Necrópole Submersa | Cemitério Amaldiçoado (Brejo) | 14–22 | Túmulo Amaldiçoado | arqueiros e necromantes em toda sala |
| Caverna de Gelo | Boca da Caverna (Picos, 584, 128) | 20–30 | Serpe Glacial | leve uma arma com Fogo |
| Forja Afundada | Fortaleza do Juramento | 28–40 | Minotauro Colosso | formigas de fogo; Juramento de Vaelmor |

Cada masmorra começa numa **sala com fogueira, sem criaturas**. Use essa sala para respirar entre as investidas.
