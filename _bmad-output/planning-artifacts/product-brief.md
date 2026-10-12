# ETHERFALL — Product Brief

> Artefato BMAD (fase 1 — Analysis). 12/10/2026

## Visão
Um MMORPG 2D sandbox persistente com o combate exigente dos soulslikes, renderizado inteiramente como uma composição ASCII dinâmica por GPU. Cada árvore, onda, golpe e criatura gigante ganha vida em caracteres que reagem a vento, luz, água e impacto.

## Problema / oportunidade
- MMORPGs costumam trocar habilidade por números ("apertar rotação"). Soulslikes são quase sempre single-player ou têm co-op limitado.
- Jogos em ASCII costumam ser matrizes estáticas. Há espaço para uma estética ASCII *cinematográfica*, com física, luz e animação reais.

## Público
Jogadores de soulslike e roguelike que gostam de dificuldade justa e de leitura de padrões, além de fãs de MMO sandbox (coleta, crafting, economia) que querem combate com consequência.

## Pilares
1. **Combate legível e punitivo:** stamina, esquiva com i-frames, bloqueio, aparo, poise e telegráficos claros.
2. **Mundo vivo em ASCII:** geometria real convertida em glifos, com vento, água, luz dinâmica e ciclo dia/noite.
3. **Sandbox persistente:** coleta, crafting, loot por tabelas e economia sem pay-to-win.
4. **Cooperação contra colossos:** chefões muito maiores que o jogador, com fases e hitboxes por segmento.

## Diferenciais
- Pipeline ASCII em 4 passes, com glifos escolhidos por material, contexto e orientação de bordas.
- Simulação autoritativa única (TypeScript) no servidor e no cliente: anti-cheat por construção e predição sem divergência.

## Escopo do primeiro protótipo (vertical slice)
Um jogador entra, escolhe classe, explora a floresta, coleta, luta, obtém itens, fabrica, sobe de nível e enfrenta o Colosso das Raízes. Um segundo jogador entra no mesmo mundo e ambos mantêm os dados ao reconectar.

## Métricas de sucesso do protótipo
- Os 17 critérios de aceitação do PRD (§6) verificados por testes automatizados ou roteiro manual.
- 60 FPS na máquina de referência; 16 jogadores em uma região sem degradação de tick (teste de carga).
- Nenhuma duplicação de recompensa sob requisições repetidas (teste de idempotência).
