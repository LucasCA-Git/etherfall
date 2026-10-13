# Créditos de arte

## Heróis, heroínas, criaturas e vegetação — Flare
- **Origem:** projeto [Flare](https://github.com/flareteam/flare-game) (mod `fantasycore`): avatares masculino e
  feminino em camadas (armaduras, cabeças, armas, escudos) e criaturas (goblins, esqueletos, zumbi, minotauro,
  formigas, formiga-leão, serpes/dragões, túmulo amaldiçoado) e tilesets `grassland` e `snowplains` (árvores,
  pinheiros, árvores mortas, tendas, lápides). Também o pacote "Isometric Hero" de Clint Bellanger, enviado como referência.
- **Autores:** artistas do Flare — Clint Bellanger e demais listados em
  [CREDITS.txt](https://github.com/flareteam/flare-game/blob/master/CREDITS.txt) do projeto Flare.
- **Licença:** [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- **Alterações:** atlases do Flare desempacotados, camadas compostas por classe e gênero, quadros reescalados,
  recortados, reempacotados e exportados em WebP (`tools/flare-sheets.py`).
- Os arquivos derivados em `packages/client/src/assets/flare/` e `packages/client/src/assets/flora/` são distribuídos
  sob a mesma licença CC-BY-SA 3.0 (`tools/flare-flora.py` gera a vegetação).

Para regenerar: `python3 tools/flare-sheets.py <checkout do flare-game> packages/client/src/assets/flare packages/client/src/render3d/flareSheets.gen.ts`

Todo o resto (código, mundo, glifos, efeitos, shaders) é original deste projeto.
