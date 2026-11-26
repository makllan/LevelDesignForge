# Testes — o que foi executado e o que não foi

## Executado (25/11/2026)
- **Vitest — 54 testes passando** (`npm test`): `schema` (5), `rooms` (17), `playtest` (9), `templates` (6: o Núcleo do bunker é resolvido andando por um piloto automático), `analysis` (10: grade, progressão, Companion, LOS, quebra de cadeia detectada), `export` (7: SVG sem NaN, CSVs, JSON, ritmo, presets de Smart Rooms).
- **`tsc --noEmit` e `vite build`**: sem erros.
- **Navegador embutido do desenvolvimento (inspeção manual)**: desenhar salas, portas com vão real no 3D, inspetor, desfazer, props, F5 com prompts e abertura de portas, carregar o Núcleo do bunker, abas Análise/Progressão/Paisagem/Ritmo/Atmosfera/Replay/Variantes/Projeto renderizando, criar terreno. Companion no bunker: 0 erros, 3 sugestões.

## Playwright — escrito, mas NÃO passa neste ambiente
`e2e/fluxo.spec.ts` tem 6 cenários (abrir modelo + Companion, Progressão, desenhar/desfazer/refazer, F5 ↔ editor, exportação, salvar/recarregar). Executado com `PW_CHANNEL=msedge` (Edge instalado; nenhum navegador foi baixado), **os 6 falharam**, com `Target crashed` ao clicar no modelo na caixa Projetos: o processo da página caiu, provavelmente ao iniciar o WebGL em software no Edge headless. Não investiguei a causa; portanto **os cenários e2e não estão validados**, e podem ter erros próprios (seletores) que o crash escondeu. Próximo passo: rodar com `npx playwright install chromium` ou com GPU disponível e corrigir o que aparecer.

## NÃO executado / limites
- Desempenho em GPU real (o ambiente renderiza WebGL por software, ~2 fps).
- Arrastar e soltar da biblioteca; GLB aberto em Blender; PNG da planta (só o SVG é testado por unidade).
- Ghost Replay com trajetória longa e Reality Lab restaurando cenas grandes: só estrutura/unidade.
- Acessibilidade automatizada (axe) e leitores de tela.
- Navegadores além de Chromium/Edge.
