# ETHERFALL — PRD (Product Requirements Document)

> Artefato BMAD (fase 2 — Planning). Fonte: especificação do projeto (seções 1–24). Versão 0.1 · 12/10/2026

## 1. Objetivo
Construir um vertical slice jogável e multiplayer de ETHERFALL, um MMORPG 2D soulslike com renderização ASCII por GPU, e evoluí-lo incrementalmente em 7 etapas verificáveis.

## 2. Requisitos funcionais (FR)

| ID | Requisito | Etapa | Status |
|---|---|---|---|
| FR1 | Personagem controlável (WASD, mira por mouse, gamepad) com remapeamento | 2 | ✅ |
| FR2 | Câmera top-down ¾: seguir suave, look-ahead, tremor, zoom, limites | 2 | ✅ (áreas de chefe: Etapa 6) |
| FR3 | Renderização ASCII por shader com 5 presets e configuração ao vivo | 2 | ✅ |
| FR4 | Floresta procedural com seed, lago, rio, ruínas e fogueiras; alcançabilidade garantida | 2 | ✅ |
| FR5 | Vegetação reage a vento, atores e ondas de choque; água com ondas, ripples e reflexos | 2 | ✅ (chuva: Etapa 7) |
| FR6 | Iluminação dinâmica (fogueiras, tocha, magia, impactos) + ciclo dia/noite pelo tick | 2 | ✅ (relâmpagos: Etapa 7) |
| FR7 | Física: colisão de corpos, tiles, projéteis, knockback por massa, sub-stepping | 3 | ✅ base · (objetos destrutíveis: Etapa 4) |
| FR8 | Combate: stamina, leve/pesado/carregado, esquiva (i-frames), bloqueio, aparo, poise, crítico pelas costas, contra-ataque, cancelamento por regras, buffer de entrada | 3 | ✅ |
| FR9 | Classes Vanguarda e Arcanista com Q/E | 3 | ✅ Q/E · (1–4/R: Etapa 3) |
| FR10 | Inimigos com IA (FSM, telegráficos, compromisso de direção, leash, respawn) | 3 | ✅ 2 tipos |
| FR11 | Morte → fogueira; descanso em fogueira define o retorno | 3 | ✅ (marca de essência: Etapa 3) |
| FR12 | Níveis 1–60, atributos D&D-like, curvas configuráveis | 3 | 🟡 curvas e atributos prontos; ganho de XP e pontos pendente |
| FR13 | Itens orientados a dados, raridades, únicos com mecânicas, tabelas de loot | 4 | ⏳ |
| FR14 | Coleta e crafting com *action skills* | 4 | ⏳ |
| FR15 | Servidor autoritativo WebSocket, auth, sync, reconexão | 5 | 🟡 núcleo `Room` + protocolo testados; transporte de rede pendente |
| FR16 | Persistência em Postgres com migrações e transações idempotentes | 5 | ⏳ (modelo na arquitetura §6) |
| FR17 | Colosso das Raízes (3 fases, hitboxes por segmento, recompensas idempotentes) | 6 | ⏳ |
| FR18 | Clima (neblina, chuva, tempestade, vento) sincronizado | 7 | 🟡 vento sincronizado |
| FR19 | HUD completo (vida/stamina/mana, recargas, alvo, chefe, log, mapa, ficha, menus) | 2–5 | 🟡 inventário/missões/chat/grupo pendentes |
| FR20 | Áudio com feedback por ação e espacialização | 7 | 🟡 SFX procedurais + ambiência já presentes |

## 3. Requisitos não funcionais (NFR)
- **NFR1 Desempenho:** 60 FPS na máquina de referência. O custo da pipeline escala com as células.
- **NFR2 Autoridade:** o cliente envia só intenções; dano, loot, XP, crafting e economia ficam no servidor.
- **NFR3 Determinismo:** mesma seed e mesmas entradas geram o mesmo estado (`stateHash`).
- **NFR4 Segurança:** senhas com argon2id, sem segredos no código, sanitização de nomes e mensagens, idempotência econômica.
- **NFR5 Qualidade:** TS strict, testes de unidade na simulação (≥ 80% de cobertura; atual 95,7%) e E2E headless.
- **NFR6 Observabilidade:** métricas de FPS/CPU/GPU no cliente; no servidor, tick time, entidades, jogadores, latência e tempo de DB (Etapa 5).

## 4. Personas e jornada do slice
"Ana" (Vanguarda) e "Bruno" (Arcanista) entram, exploram a Floresta do Crepúsculo, coletam, lutam, fabricam e enfrentam juntos o Colosso das Raízes. Ao reconectar, os dois recuperam inventário e progressão.

## 5. Chefões — conceitos (3) — implementar 1 por completo na Etapa 6
1. **O Colosso das Raízes** (Floresta do Crepúsculo). Madeira petrificada e ruínas; braços e raízes com colisores próprios.
   - Fase 1, *Despertar:* varreduras lentas e pancadas legíveis.
   - Fase 2, *Ruptura:* o terreno muda, surgem raízes, aparecem ataques em área.
   - Fase 3, *Coração Exposto:* janelas de vulnerabilidade, mais velocidade e agressividade.
2. **A Matriarca do Lodo Cinzento** (Pântano das Cinzas). Uma criatura anfíbia que submerge e emerge e deixa poças venenosas. A neblina reduz a visão, então ela é rastreada pelos ripples na água. Ataques de língua com telegráfico em linha.
3. **O Arauto do Eclipse** (Terras do Eclipse). Um cavaleiro gigante que manipula luz e sombra: apaga as fontes de luz da arena e ataca a partir de silhuetas. Na fase final o mundo inverte para paleta "negativa", o que exige ler os glifos pelo contorno.

## 6. Critérios de aceitação (enunciado §23) — rastreabilidade
| Critério | Verificação | Status |
|---|---|---|
| O jogo inicia localmente | `npm run dev`; E2E `smoke.mjs` | ✅ |
| Movimento e colisão corretos | `physics.test.ts`; E2E (Δx) | ✅ |
| ASCII com animação real | E2E + screenshots (vento, água, fogo) | ✅ |
| Vegetação reage ao vento | shader de chão (benders/vento) + folhas | ✅ |
| Água com movimento e reflexos | shader de água + passe de reflexo | ✅ |
| Combate com stamina e recuperação | `combat.test.ts` (12 casos) | ✅ |
| Classes com habilidades diferentes | `combat.test.ts` › class abilities | ✅ |
| XP e níveis funcionam | — | ⏳ Etapa 3 |
| Inventário mantém itens | — | ⏳ Etapa 4 |
| Loot/crafting pelo servidor | — | ⏳ Etapa 4 |
| Chefe com fases e telegráficos | — | ⏳ Etapa 6 |
| Dois clientes jogam juntos | `room.test.ts` (núcleo) | 🟡 rede real na Etapa 5 |
| Estado compartilhado correto | `room.test.ts` | 🟡 |
| Dados mantidos após reconexão | — | ⏳ Etapa 5 |
| Recompensas não duplicadas | — | ⏳ Etapas 4–6 |
| Instruções completas de instalação | `README.md` | ✅ |
| Testes essenciais passam | `npm test` (56) + `npm run e2e` | ✅ |
