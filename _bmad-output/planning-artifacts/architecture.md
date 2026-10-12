# ETHERFALL — Documento de Arquitetura

> Artefato BMAD (fase 3 — Solutioning). Versão 0.1 · 12/10/2026 · Autor: equipe ETHERFALL (Lucas Alecrim + Claude)

## 1. Análise da stack

### Decisão: TypeScript de ponta a ponta + WebGL2 próprio + Node autoritativo

| Critério | Godot 4 (GDScript/C#) + backend separado | **TypeScript + WebGL2 + Node** (escolhida) |
|---|---|---|
| Simulação compartilhada cliente/servidor | Duas linguagens (GDScript no cliente, outra no servidor) → regras duplicadas, divergência na predição | **Mesmo código** (`packages/shared`) roda no servidor e na predição do cliente; determinismo testável |
| Pipeline ASCII por GPU | Ótima (shaders Godot), mas presa ao pipeline 2D da engine | Controle total: MRT, passe por célula, atlas de glifos próprios |
| Distribuição | Exportação por plataforma | Navegador: zero instalação; o mesmo build pode virar desktop (Tauri/Electron) depois |
| Testes automatizados | GUT/GdUnit, difícil em CI headless com render | Vitest (lógica) + Playwright/Chromium headless com WebGL2 por software (E2E com screenshots) |
| Ecossistema de rede | ENet/WebSocket via engine | `ws`/uWebSockets, Postgres (`pg`), Redis — maduros |
| Física 2D | Godot Physics pronta | Física própria (círculos + tiles), determinística e suficiente para top-down |

**Trade-offs aceitos**
- Escrevemos a física (círculo×círculo, círculo×tile, sub-stepping anti-tunneling). Para top-down isso é pequeno, testável e determinístico. Corpos rígidos complexos (empilhamento, juntas) ficam fora do escopo inicial.
- Sem editor visual de cenas: o conteúdo é **orientado a dados** (ações, classes, inimigos e mundo procedural) e cabe nesse modelo.
- WebGL2 é obrigatório. Tem suporte em ~97% dos navegadores atuais. Sem WebGL2 o jogo mostra erro claro na tela de título.

### Componentes
- **Cliente:** Vite 7 + TypeScript 5.9 (strict) + WebGL2 puro (sem engine), WebAudio procedural e DOM para o HUD.
- **Simulação/servidor:** TypeScript puro, sem DOM, sem `Math.random` e sem relógio de parede. Tick fixo de 30 Hz.
- **Persistência (Etapa 5):** PostgreSQL 16, com migrações SQL versionadas. Redis opcional para presença e filas.
- **Transporte (Etapa 5):** WebSocket (JSON v1 → binário se o profiling exigir). Pode trocar por WebTransport/UDP mais tarde sem mudar o `Room`.
- **Infra:** Docker Compose (cliente hoje; servidor, Postgres e Redis na Etapa 5).

## 2. Visão de módulos (os 14 do enunciado)

```
etherfall/
├── packages/shared/src          # roda no servidor E no cliente
│   ├── math/        vec2, rng (mulberry32), noise (value/fbm)        → 4. Mundo / util
│   ├── world/       tiles, worldgen (seed → bioma, lago, rio, ruínas) → 4. Mundo e geração procedural
│   ├── physics/     spatialHash, collision (tiles, círculos, CCD)    → 3. Física e colisões
│   ├── data/        actions, classes, enemies, curves (orientado a dados) → 6. Classes/progressão, 7. Itens (futuro)
│   ├── combat/      combat.ts (frames, i-frames, parry, poise, crit)  → 2. Controle e combate
│   ├── entities/    factory, playerControl, enemyAI                    → 5. Entidades, NPCs e inimigos
│   ├── sim/         simulation (tick fixo), types, context             → núcleo autoritativo
│   └── net/         protocol, snapshot (interest mgmt), room           → 9. Multiplayer e replicação
├── packages/client/src
│   ├── render/      renderer, shaders, glyphAtlas, materials, worldLayer (chunks), actors, settings → 1. Cliente e renderização
│   ├── game/        game (orquestração), camera, environment (dia/noite, vento), interp, effects, particles
│   ├── input/       input (teclado/mouse/gamepad), keymap (remapeável)
│   ├── hud/         hud, overlay, menu (gráficos/controles/áudio), map, ficha → 11. Interface e HUD
│   ├── audio/       audio (WebAudio procedural, espacial)                → 12. Áudio e efeitos
│   └── net/         localTransport (Transport)                          → 9. (lado cliente)
├── packages/server  (Etapa 5)   WebSocket + auth + Postgres            → 10. Backend
├── packages/client/e2e          smoke E2E (Playwright)                  → 14. Testes e observabilidade
└── tools/                       build single-file                       → 13. Ferramentas
```

Regra de dependência: `client → shared`. O `shared` nunca importa DOM, WebGL ou rede. Assim o servidor e os testes rodam o código de jogo exatamente como o cliente.

## 3. Simulação autoritativa

- **Tick fixo de 30 Hz** (`TICK_RATE`). Renderização em qualquer FPS, com interpolação entre os 2 últimos snapshots.
- **Ordem do tick:** `prevPos` → broadphase dinâmica → intenções (jogador/IA) → pré-movimento das ações (investidas, rastreamento, spawn de projéteis) → integração + colisões (sub-steps) → separação de corpos → acertos em frames ativos → relógios, regeneração, morte e respawn.
- **Determinismo:** um único `Rng` semeado e iteração em ordem de inserção do `Map`. `stateHash()` permite detectar dessincronização (teste: 900 ticks com entradas idênticas geram hashes idênticos).
- **Ações orientadas a dados** (`data/actions.ts`): `startup/active/recovery`, custo, recarga, `lunge`, `iframes`, `hyperArmor`, `cancelFrom`, `trackUntil`/`turnRate` (inimigos se comprometem com a direção), `chargeable`, `telegraph`, `projectile`. Uma classe nova é só dado.
- **Contrato de acerto** (`resolveHit`): i-frames > aparo > bloqueio/quebra de guarda > dano (escalonamento com soft cap, crítico pelas costas ×1,5, contra-ataque ×2,5, absorção) > poise (ignorado em hyper armor) > knockback/massa > morte.

## 4. Pipeline de renderização ASCII

```
 [sombras]  elipses instanciadas ─MAX blend─▶ máscara R8 (resolução da cena)
 [cena]     chão (fullscreen, tiles+ruído+vento+ondas+luzes+sombra)
            reflexos (instâncias espelhadas, descartadas fora da água)
            objetos (instâncias com profundidade = Y da base)          ─▶ MRT
               RT0 = cor iluminada   RT1 = (material, param do glifo, emissivo, prioridade)
 [células]  1 fragmento por célula ASCII: amostragem por prioridade (atores > efeitos > cenário),
            Sobel nas células vizinhas, escolha do glifo, LOD por distância, névoa, dithering Bayer,
            paletas (cor/mono/alto contraste), halo emissivo  ─▶ FG(rgb,linha) + BG(rgb,coluna)
 [composição] por pixel: atlas de glifos (mipmaps + textureGrad), grão, vinheta, flash
```

- **O mundo tem geometria real** (formas instanciadas e tiles) e os caracteres são só a aparência final. Colisão vem do `shared`, nunca da imagem.
- **O shader de cena escolhe o glifo pelo contexto:** a grama tem 4 buckets (ereta, `/`, `\`, amassada) a partir do vento e dos "benders" (atores e ondas de choque). A água usa a fase da onda e ripples de passos, projéteis e esquivas. A lâmina usa a orientação real da espada (`─╲│╱`). Copas e pinheiros usam ruído.
- **Grade travada no mundo:** a câmera é quantizada em células e a composição desloca pelo resto, então a rolagem é suave sem "fervura" de caracteres.
- **Legibilidade:** atores têm prioridade de célula. A folhagem fica translúcida (dither) ao redor do jogador e dos 7 atores mais próximos. Telegráficos são setores pontilhados que se preenchem conforme o startup avança (vermelho pulsante = perigoso).
- **Custos:** o passe de célula roda em `cols×rows` (~12 k fragmentos em 1280×720). A composição faz 3 leituras por pixel. Props estáticos ficam em VBOs por chunk de 16 m, desenhados só quando visíveis. O que é dinâmico (atores, partículas, chamas) é reenviado por quadro.
- **Configuração ao vivo (Esc → Gráficos):** tamanho de célula, resolução interna (amostras por célula), densidade, paleta, contraste, contornos, brilho de magia, distância de renderização, granulação, detalhe por distância, dithering, velocidade de animação, fundo, vinheta e limite de partículas. Há 5 presets.

## 5. Rede (Etapa 5 — contrato já implementado e testado)

- **Mensagens** (`net/protocol.ts`): `hello{version}` → `join{name,classId}` → `input{cmds[]}` / `ping`. O servidor responde `welcome`, `snapshot{snap,ackSeq}`, `events`, `pong` e `error`.
- **O cliente só envia intenções** (`InputCommand {seq,mx,my,aim,buttons}`). O servidor sanitiza: limita o movimento, normaliza a mira, aplica máscara de bits, descarta `seq` repetido ou fora de ordem e rejeita mensagens que não são objeto.
- **`Room`:** exige `hello`, limita jogadores (`maxPlayers`, padrão 16) e aplica uma fila por sessão (overflow preserva bordas de botão). Sem input por 0,5 s, solta botões. Despeja sessões ociosas (padrão 120 s). `ackSeq` é o último comando **aplicado**.
- **Interest management:** o snapshot só traz entidades no raio (36 m). Eventos só se envolverem o jogador ou ocorrerem no raio.
- **Plano de predição:** o cliente roda `Simulation` local só com o próprio jogador e reaplica os comandos pendentes após cada `ackSeq` (reconciliação com suavização de erro). Entidades remotas são interpoladas (~100 ms de buffer).
- **Escala inicial:** 1 processo = 1 região, 8–16 jogadores (meta medida em teste de carga na Etapa 5). Regiões adicionais = novos `Room`s, com transferência de sessão entre processos.

## 6. Modelo de dados persistente (rascunho para a migração `0001` da Etapa 5)

```sql
CREATE TABLE accounts (id uuid PRIMARY KEY, email citext UNIQUE NOT NULL, pass_hash text NOT NULL, -- argon2id
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE characters (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
  name text UNIQUE NOT NULL, class_id text NOT NULL, level int NOT NULL DEFAULT 1, xp bigint NOT NULL DEFAULT 0,
  attrs jsonb NOT NULL, unspent_points int NOT NULL DEFAULT 0, hp int NOT NULL, region text NOT NULL,
  safe_x real NOT NULL, safe_y real NOT NULL, essence bigint NOT NULL DEFAULT 0, version int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE item_instances (id uuid PRIMARY KEY, item_id text NOT NULL, owner_char uuid REFERENCES characters,
  slot text, qty int NOT NULL DEFAULT 1 CHECK (qty > 0), rolls jsonb, origin text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE reward_claims (char_id uuid REFERENCES characters, source_key text, claimed_at timestamptz DEFAULT now(),
  PRIMARY KEY (char_id, source_key));                    -- idempotência de loot/chefes
CREATE TABLE ledger (id bigserial PRIMARY KEY, char_id uuid, kind text, delta jsonb, idempotency_key text UNIQUE,
  at timestamptz DEFAULT now());                         -- histórico econômico + anti-replay
CREATE TABLE essence_marks (char_id uuid PRIMARY KEY REFERENCES characters, region text, x real, y real, amount bigint);
-- + professions, recipes_known, discoveries, quests, settings
```
Regras: toda operação econômica roda em uma transação com `idempotency_key`. Recompensas de chefe usam `reward_claims (char, encounter_instance)`. Os personagens usam *optimistic locking* (`version`).

## 7. Desempenho — metas e medições

- **Meta:** 60 FPS em 1920×1080, célula 9 px, em uma máquina de referência (GPU integrada classe Intel Iris Xe / Apple M1). O passe pesado (células) escala com o número de células, não com os pixels.
- **Medido neste ambiente (CI headless, GPU por software SwiftShader, 1280×720):** ~10–14 FPS, CPU de quadro 2–6 ms, GPU (software) 105–206 ms. Esses números **não** representam hardware real e só servem de regressão. A medição em GPU real fica registrada no `PROGRESS.md` quando houver.
- **Instrumentação embutida:** FPS, CPU ms, GPU ms (`EXT_disjoint_timer_query_webgl2`), chunks, instâncias, células, partículas (F3).

## 8. ADRs resumidos

1. **ADR-001:** TS/WebGL2 em vez de Godot, para ter simulação única, testabilidade headless e distribuição web (trade-offs na §1).
2. **ADR-002:** física própria em vez de Box2D/planck, para ter determinismo, CCD simples e foco em top-down. Pode ser revisitada se surgirem corpos rígidos complexos.
3. **ADR-003:** perspectiva **top-down oblíqua ¾**, em que objetos altos se estendem para cima a partir da base e a profundidade vem do Y da base.
4. **ADR-004:** tick de 30 Hz, com acertos resolvidos só em frames ativos e entrada com buffer de 8 ticks.
5. **ADR-005:** o glifo é decidido em 2 estágios: o material e o parâmetro na cena, e a composição final na célula (prioridade, LOD, bordas).
6. **ADR-006:** HUD em DOM em vez de dentro do shader, por acessibilidade, texto nítido e custo zero na GPU.
