# ETHERFALL — Épicos e Histórias

> Artefato BMAD (fase 3 — create-epics-and-stories). Cada épico = uma Etapa do enunciado e termina em uma versão executável e testável.

## Épico 1 — Arquitetura ✅
- 1.1 Escolha da stack e ADRs → `architecture.md` ✅
- 1.2 Monorepo (shared/client), TS strict, Vite, Vitest, Playwright ✅
- 1.3 Protocolo de rede e contrato `Room` (testado) ✅
- 1.4 Modelo de dados persistente (rascunho SQL) ✅
- 1.5 Instruções de execução (README) ✅

## Épico 2 — Núcleo visual ✅
- 2.1 Pipeline ASCII 4 passes (sombra → cena MRT → células → composição) ✅
  - CA: glifo por material e contexto; atores nunca somem; 5 presets jogáveis
- 2.2 Atlas de glifos procedural (Unicode, mipmaps) ✅
- 2.3 Mundo procedural com seed: floresta, lago, rio, ruínas e fogueiras com alcançabilidade (BFS) ✅
- 2.4 Grama e árvores com vento, empurrão por atores e ondas de choque ✅
- 2.5 Água: ondas, ripples, espuma de margem, reflexos estilizados ✅
- 2.6 Luzes dinâmicas, sombras por sol, ciclo dia/noite pelo tick ✅
- 2.7 Câmera ¾ (suave, look-ahead, tremor, zoom, limites, folhagem translúcida) ✅
- 2.8 Métricas de desempenho em tela (FPS/CPU/GPU/instâncias) ✅

## Épico 3 — Gameplay 🟡
- 3.1 Física e colisões (tiles, círculos, CCD, separação por massa) ✅
- 3.2 Controles remapeáveis + gamepad + buffer de entrada ✅
- 3.3 Combate base (leve/pesado/carregado, esquiva, bloqueio, aparo, poise, crítico, contra-ataque) ✅
- 3.4 Inimigos: Errante Oco e Lobo de Cinza (FSM, telegráfico, leash, respawn) ✅
- 3.5 Vanguarda e Arcanista: Q/E ✅ · **1–4 e R** ⏳
- 3.6 XP, níveis 1–60, pontos de atributo, tela de distribuição ⏳ (curvas ✅)
- 3.7 Morte com marca de essência recuperável ⏳ (respawn em fogueira ✅)
- 3.8 Efeitos de status (veneno, sangramento, atordoamento) ⏳

## Épico 4 — Itens ⏳
- 4.1 Catálogo de itens orientado a dados (categorias, raridades, requisitos, peso, ícone ASCII)
- 4.2 Inventário e equipamentos com comparação
- 4.3 Tabelas de loot por criatura, região e atividade (servidor, idempotente)
- 4.4 Únicos: Lâmina do Último Juramento, Coração de Vhal, Escudo das Cinzas
- 4.5 Coleta interativa (árvore, veio mineral, plantas) e crafting com estações e *action skills*

## Épico 5 — Multiplayer ⏳ (núcleo pronto)
- 5.1 Servidor WebSocket (`packages/server`) usando `Room` ✅ contrato
- 5.2 Auth (argon2id, sessões), criação e seleção de personagem
- 5.3 Predição + reconciliação no cliente; interpolação de remotos
- 5.4 Postgres + migrações + transações idempotentes; Docker Compose completo
- 5.5 Reconexão, despejo de ociosos ✅ (no `Room`), chat, grupos
- 5.6 Teste de carga 16 jogadores + métricas de servidor

## Épico 6 — Chefão ⏳
- 6.1 Colosso das Raízes: segmentos com hitboxes, FSM por fase, áreas de dano
- 6.2 Câmera de arena e barra de chefe
- 6.3 Sincronização, regras para N jogadores, recompensas idempotentes, recuperação após desconexão

## Épico 7 — Polimento ⏳
- 7.1 Clima (neblina, chuva com ripples, tempestade com relâmpagos)
- 7.2 Animações, áudio por superfície e por bioma
- 7.3 Otimização (medição em GPU real), UX e acessibilidade
