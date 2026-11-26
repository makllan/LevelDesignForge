# PROGRESS — ORDO Forge

Última atualização: 25/11/2026. Este arquivo é o ponto de retomada: leia-o primeiro.

## Estado atual

| Fase | Escopo | Estado |
|---|---|---|
| 1 | Scene Core, Editor Core, paredes/aberturas reais, Blueprint 2D, Renderer 3D, props (~105), persistência, UI base | **Feito** |
| 2 | Playtest, modelos, Núcleo do bunker | **Feito** — o bunker é resolvido andando em teste |
| 3 | Paisagem: terreno, esculpir, semente, trilhas, scatter, nivelar, converter em objetos | **Feito** (`ui/LandscapePanel.tsx`) |
| 4 | Análise: grade de navegação, LOS, progressão, Design Companion, grafo de dependências | **Feito** (`analysis/`, `ui/AnalysisPanel.tsx`) |
| 5 | Pacing, Atmosfera, Ghost Replay, Reality Lab, Sketch to Space, escala do personagem | **Feito** (`ui/ProductionPanels.tsx`) |
| 6 | Exportações, Smart Rooms, e2e, docs | **Feito** (`export/`, `ui/ExportDialog.tsx`, `ui/SmartRooms.tsx`, `e2e/`, `docs/`) |

## Como rodar
```
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # vitest (54 testes)
npm run typecheck
npm run build
npm run test:e2e   # PW_CHANNEL=msedge usa o Edge instalado
```

## Onde está cada coisa
Ver `docs/ARCHITECTURE.md`. Abas do painel direito: `src/ui/panels.tsx`. Comandos/atalhos: `src/editor/commands.ts`.

## Próximos passos
Ver `docs/ROADMAP.md` e `docs/KNOWN_ISSUES.md`. Prioridade sugerida: verificar o 3D e o playtest em GPU real, depois cenários múltiplos e união poligonal de ambientes.

## Armadilhas já resolvidas
- React StrictMode roda effects duas vezes: nunca proteja a *adição* de listeners com um ref.
- Aberturas só depois de todas as salas.
- Nav em células de 0,25 m cruza dois degraus: `SAMPLE_SLACK`.
- Heredocs com aspas curvas/apóstrofos quebram no bash desta máquina: use a ferramenta de escrita de arquivos.
