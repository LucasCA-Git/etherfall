# ETHERFALL — ASCII Souls Online

RPG de ação **dark fantasy soulslike** para jogar no navegador, sozinho ou com amigos na mesma rede. Tudo é uma **cena 3D (mundo, castelo, florestas, personagens e monstros) desenhada inteira em ASCII fino** pela placa de vídeo, sobre um fundo azul-noite. A grama vira traços que o vento penteia, a chuva cai em riscos brancos, e os personagens usam o dobro de caracteres para ficarem nítidos.

> **Versão 0.8: visual "ASCII MMORPG".** São 7 classes jogáveis, cada uma com árvore de talentos e subclasses. Dá para jogar online com conta, senha e personagens salvos no servidor, ou offline com o progresso salvo no navegador. O que funciona e o que falta está em [`docs/PROGRESS.md`](docs/PROGRESS.md).

---

## 1. Como jogar

### Opção A — sozinho, sem instalar nada
Abra o arquivo **`etherfall.html`** no Chrome, Edge ou Firefox, escolha a classe, digite um nome e clique em **Entrar no mundo**.
- O progresso fica **salvo neste navegador** a cada 10 s e quando você fecha a aba.
- Na tela inicial aparece **"Continuar: Nome · Classe · Nv X"** para voltar ao personagem.
- O save fica no `localStorage` do navegador. Limpar os dados do site apaga os personagens offline.

### Opção B — online, com amigos na rede local (login e senha)
Um computador vira o **servidor**. Todos os outros só precisam do navegador.

**No computador que vai hospedar** (precisa do [Node.js 20 ou mais novo](https://nodejs.org)):
- **Windows:** dê dois cliques em **`iniciar-servidor.bat`**. Na primeira vez ele instala as dependências e compila.
- **Linux/macOS:** `./iniciar-servidor.sh`
- **Ou pelo terminal:** `npm install` e depois `npm start`.

O servidor mostra os endereços:
```
  ETHERFALL — servidor online
  Neste computador:  http://localhost:8080
  Na rede local:     http://192.168.0.15:8080
```
**Para cada jogador:**
1. Abra o endereço da rede local no navegador.
2. Vá em **Online (servidor)** e depois **Criar conta** (usuário + senha).
3. Escolha a classe nos cartões, dê um nome ao personagem e clique em **Criar personagem**.
4. Clique em **Jogar** para entrar no **mundo aberto**, que todos do servidor compartilham.

**Co-op em sala com código:**
1. Quem vai abrir o grupo clica em **Criar sala** ao lado do personagem. O jogo mostra um código de 5 letras (ex.: `SALA K7QXM`) no canto da tela.
2. Os amigos digitam esse código no campo **Código da sala**, acima da lista de personagens, e clicam em **Jogar**.
3. Cada sala é uma cópia separada do mundo, com até **8 jogadores**, monstros próprios e progresso salvo normalmente. Ela fecha sozinha 2 minutos depois que todos saem.

Detalhes do modo online:
- Cada conta tem até **6 personagens**. O nome do personagem é único no servidor.
- O servidor salva todos os personagens **a cada 10 s**, ao sair do jogo e ao desligar (Ctrl+C). Ao voltar, você reaparece onde parou.
- As contas ficam em `data/accounts.json`. As senhas são guardadas apenas como hash **scrypt**, nunca em texto.
- Se a mesma conta entrar em outro lugar, a sessão antiga é desconectada (e salva).
- Se os amigos não conseguirem conectar, libere a porta **8080** no firewall do computador que hospeda. No Windows, aceite o aviso "Permitir acesso" do Node.js na primeira execução.

### Opção B2 — online pela internet, de graça (amigos em qualquer lugar)
No computador que vai hospedar, dê dois cliques em **`iniciar-online.bat`** (Linux/macOS: `./iniciar-online.sh`). Ele:
1. compila o jogo (como o `iniciar-servidor.bat`);
2. baixa o **cloudflared** na primeira vez (Cloudflare Tunnel, gratuito e sem conta) para a pasta `tools/`;
3. abre um túnel e mostra um link como `https://palavra-palavra-palavra.trycloudflare.com`, que já fica copiado para a área de transferência.

Passe o link aos amigos: eles abrem no navegador, criam a conta e jogam (mundo aberto ou sala com código), de qualquer rede.
- O jogo só fica no ar enquanto essa janela estiver aberta no seu PC.
- O link **muda a cada vez** que você inicia. Para ter um endereço fixo, crie uma conta gratuita na Cloudflare e um túnel nomeado com um domínio seu.
- O túnel já usa HTTPS, então as senhas não trafegam abertas. Mesmo assim, é um servidor de amigos: não reutilize senhas importantes.
- Os túneis rápidos sem conta não têm garantia de disponibilidade da Cloudflare.

**Com Docker:** `docker compose up --build` sobe o mesmo servidor em `http://localhost:8080`, com os dados em `./data/`.

> O servidor foi feito para **rede local / amigos**. Ele usa HTTP simples, sem HTTPS. Para expor na internet, coloque um proxy com HTTPS na frente e não reutilize senhas importantes.

### Opção C — desenvolvimento
```bash
npm install
npm run dev            # cliente com hot reload em http://localhost:5173 (modo offline)
npm run build          # typecheck + cliente + servidor
npm run server         # sobe o servidor já compilado
npm run build:single   # gera o HTML único packages/client/dist/etherfall.html
```

---

## 2. Controles

| Ação | Tecla |
|---|---|
| Mover | WASD / setas |
| Mirar | Mouse |
| Ataque leve | Botão esquerdo |
| Ataque pesado (segure para carregar) | Botão do meio ou **V** |
| Bloquear — erga **no instante do golpe** para **aparar** | Botão direito |
| Esquiva (invulnerável por um instante) | Espaço |
| Correr | Shift |
| Habilidades da classe | **Q, E, 1, 2, 3, 4** (e **R** para o Bruxo) |
| Sentar na fogueira / usar portal | **F** |
| Ficha de atributos | **C** |
| Talentos e subclasse | **K** |
| Mapa / Menu / Desempenho | **M** / **Esc** / **F3** |
| Zoom | Roda do mouse |

Todas as teclas podem ser trocadas em **Esc → Controles**. Gamepad: analógicos movem e miram, RT ataca, RB pesado, LT bloqueia, A esquiva.

---

## 3. As classes

| Classe | Arma | Estilo | Destaques |
|---|---|---|---|
| **Vanguarda** | Espada e escudo | Tanque corpo a corpo, aparar e contra-atacar | Impacto Sísmico, Investida, Guarda de Ferro (−60% de dano), Contra-ataque |
| **Bárbaro** | Machado de guerra (2 mãos) | Dano bruto, armadura nos golpes | Grito de Guerra (+25% de dano no grupo), Salto Brutal, Redemoinho, Fúria Ancestral |
| **Ladina** | Adagas gêmeas | Furtividade, veneno, golpes pelas costas | Bomba de Fumaça (some e o próximo golpe causa +60%), Lâmina Venenosa, Golpe Fatal, Dança das Lâminas |
| **Patrulheiro** | Arco longo | Distância, armadilhas, veneno | Rajada de 5 flechas, Salto Evasivo, Armadilha de Espinhos (prende), Chuva de Flechas |
| **Arcanista** | Cajado | Magia de controle e área | Lança de Gelo (lentidão), Campo de Ruptura, Selo de Contenção, Colapso Astral |
| **Bruxo** | Grimório e cajado de osso | Maldições, dreno de vida, **invocações** | Raio Sombrio, Dreno de Vida, **Invocar Diabretes** (2 diabretes de fogo por 25 s), Maldição, **R: Guardião Abissal** (demônio gigante por 30 s) |
| **Curandeira** | Cajado da Aurora | Suporte: cura e proteção do grupo | Luz Curativa, Égide, Santuário, Purificar, Bênção da Aurora |

Passe o mouse sobre as habilidades na barra inferior para ver custo, recarga e o que fazem.

**Invocações do Bruxo:** as criaturas lutam ao seu lado e seguem você. Os inimigos também atacam elas, o que ajuda a tirar a pressão de cima de você. Abates feitos pelas invocações **dão XP para o Bruxo**. Elas somem quando o tempo acaba ou quando você morre.

---

## 4. Progressão

### Experiência (XP)
Você ganha XP **matando monstros** e **descobrindo locais** (o nome aparece na tela na primeira visita).

| Fonte | XP |
|---|---|
| Lobo de Cinza | 30 |
| Errante Oco (esqueleto) | 45 |
| Nobre Vampírico | 120 |
| Aranha Gigante | 140 |
| **Colosso de Ossos** (gigante, ~4 m) | **420** |
| Lago Espelhado / Ruínas do Juramento | 40 / 60 |
| Castelo de Vaelmor / Cripta Afundada | 100 / 150 |

XP total para chegar ao nível: **2 → 150**, **3 → 543**, **5 → 2.312**, **10 → 14.735**, **15 → 42.478**, **20 → 89.591** (o máximo é o nível 60).

**Marca de essência:** ao morrer, o XP do nível atual vira uma marca brilhante no lugar da morte. Volte lá e toque nela para recuperar. Se morrer de novo antes, aquela marca se perde. Nível e pontos nunca são perdidos.

### A cada nível você ganha
- **3 pontos de atributo** (tecla **C**):
  - **Força:** armas pesadas.
  - **Destreza:** armas ágeis, arco e adagas.
  - **Vitalidade:** vida e equilíbrio.
  - **Resistência:** stamina.
  - **Inteligência:** dano mágico e mana.
  - **Vontade:** mana e curas.
  - **Sorte:** ainda sem uso.

  Até 20 pontos cada atributo rende 100%, de 20 a 40 rende metade, e acima de 40 um quarto.
- **1 ponto de talento** (tecla **K**). São 3 ramos por classe com 4 talentos cada; cada talento pede o anterior do mesmo ramo.
- **No nível 10, a subclasse** (tecla **K**). É uma escolha **definitiva** entre duas especializações:

| Classe | Subclasses |
|---|---|
| Vanguarda | Paladino · Berserker |
| Bárbaro | Chefe de Guerra · Fúria Sangrenta |
| Ladina | Assassina · Envenenadora |
| Patrulheiro | Atirador de Elite · Guardião da Mata |
| Arcanista | Criomante · Mago de Sangue |
| Bruxo | Pacto Infernal · Ceifador de Almas |
| Curandeira | Sacerdotisa da Aurora · Inquisidora |

### Melhor maneira de subir de nível
1. **Explore primeiro.** Visitar Ruínas, Lago, Castelo e Cripta dá 350 XP sem lutar, mais de dois terços do caminho até o nível 3.
2. **Nos níveis 1–5:** lobos e esqueletos perto do acampamento. Eles reaparecem a cada 35–40 s, então fique numa área e circule entre os grupos.
3. **Nos níveis 5–10:** o **Castelo de Vaelmor** (esqueletos e o Nobre Vampírico na torre de menagem) e a **Cripta** (aranhas gigantes). A cripta fica no subsolo; entre pelo portal com **F**.
4. **A partir do 10:** caçe o **Colosso de Ossos** nas regiões distantes (pontos laranja no minimapa). Ele dá 420 XP. Em grupo é muito mais seguro: um tanque segura, a Curandeira cura e o resto bate pelas costas.
5. **Sente nas fogueiras (F):** a fogueira vira seu ponto de renascimento e o lugar para redistribuir pontos.
6. **Jogue o combate:** aparar (bloquear no instante do golpe) deixa o inimigo vulnerável, e o golpe seguinte causa **2,5×**. Golpes **pelas costas** causam **1,5×**. Quando o chão fica **vermelho**, é um ataque perigoso: esquive.

---

## 5. Mudar de classe e de build

- **Trocar os pontos (respec):** sente numa fogueira (**F**), abra os talentos (**K**) e clique em **Redistribuir pontos**. Todos os pontos de atributo e de talento voltam para você redistribuir. É grátis, e a subclasse continua a mesma.
- **Trocar de classe:** a classe é do personagem, então crie **outro personagem**.
  - **Online:** a tela de personagens tem **Criar personagem**. Escolha a classe nos cartões acima. São até 6 por conta.
  - **Offline:** na tela inicial, escolha outra classe e use **outro nome**. Cada combinação de nome e classe é um save separado.
- **Trocar de subclasse:** não é possível. Ela é a identidade do personagem; para outra subclasse, crie outro personagem.

---

## 6. O mundo

- **Acampamento do Crepúsculo:** ponto de partida, com fogueira.
- **Floresta do Crepúsculo:** lobos, esqueletos e, nas bordas, vampiros, aranhas e colossos.
- **Castelo de Vaelmor (norte):** muralhas, pátio com fogueira e torre de menagem. Dentro dele não chove.
- **Cripta Afundada:** oito salas subterrâneas cheias de aranhas gigantes. A entrada é pelo portal na torre de menagem, e o portal não funciona se você levou dano nos últimos 3 s.
- **Clima:** começa seco e chove cerca de 30% do tempo, quase sempre garoa; tempestades com raios são raras. Os ciclos de dia e noite são iguais para todos no servidor.

---

## 7. Servidor — configuração

Variáveis de ambiente (opcionais):

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `8080` | Porta HTTP/WebSocket |
| `HOST` | `0.0.0.0` | Interface (use `127.0.0.1` para só este computador) |
| `ETHERFALL_DATA` | `data/accounts.json` | Arquivo de contas e personagens |
| `MAX_PLAYERS` | `32` | Jogadores ao mesmo tempo |
| `ETHERFALL_SEED` | `20261012` | Semente do mundo (todos veem o mesmo mapa) |

- **Backup:** copie `data/accounts.json`.
- **Apagar uma conta:** remova a entrada dela nesse arquivo com o servidor desligado.
- **Senhas:** não há "esqueci a senha" ainda.

**Rede:**
- O jogo é autoritativo no servidor: o servidor calcula tudo e os navegadores só enviam comandos, o que impede trapaça pelo cliente.
- Em rede local a latência é imperceptível.
- A imagem fica cerca de 66 ms atrasada para suavizar a movimentação dos outros jogadores.

---

## 8. Desenvolvimento

```bash
npm test                 # 131 testes: simulação, combate, talentos, invocações, saves, contas, servidor WebSocket
npm run build && npm run e2e   # E2E no Chromium: classes, fogueira, talentos, login online, saves offline
```
O E2E precisa de um Chromium. Use `CHROMIUM_PATH=/caminho/chrome` ou `npx playwright install chromium`.

**Parâmetros de URL:**
- `?class=vanguard|barbarian|rogue|ranger|arcanist|warlock|healer&name=Ana&autostart=1`
- `&preset=color|mono|highContrast|cinematic|performance`
- `&day=0..1&rain=0..1&seed=N`
- `&cell=1..18`: altura das letras do mundo 3D, em pixels (o menu Esc também ajusta pelo "Tamanho das células"). O padrão é 5. De 8 para cima, os personagens usam letras com metade do tamanho. Em 1 e 2, cada célula vira um ponto.
- `&ascii=0`: mostra a cena 3D crua, sem o filtro ASCII (depuração).
- `&actors=ascii`: volta ao visual antigo (mundo ASCII 2D com bonecos ASCII).
- `&mode=offline`: abre na aba offline mesmo num servidor.
- `&server=host:porta`: conecta a outro servidor.

**Estrutura:**
```
packages/shared   simulação determinística (combate, classes, talentos, IA, invocações), protocolo, Room, saves
packages/client   cena 3D + filtro ASCII (render3d/), camada de efeitos ASCII (render/), HUD, áudio, transporte local e WebSocket
packages/server   servidor Node (HTTP + WebSocket): contas, personagens salvos, loop autoritativo a 30 Hz
_bmad-output/     artefatos BMAD: brief, PRD, arquitetura, épicos, sprint-status
docs/PROGRESS.md  progresso, problemas conhecidos e próximos passos
```
A arquitetura completa está em [`_bmad-output/planning-artifacts/architecture.md`](_bmad-output/planning-artifacts/architecture.md).

## Licença e originalidade
Todo o conteúdo (nomes, criaturas, mapas, glifos, modelos e sons procedurais) é original deste projeto.
