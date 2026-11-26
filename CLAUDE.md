# CLAUDE.md — ORDO Forge

Leia `PROGRESS.md` primeiro; arquitetura em `docs/ARCHITECTURE.md`.

## Comandos
`npm run dev` (127.0.0.1:5173) · `npm test` · `npm run typecheck` · `npm run build` · `npm run test:e2e` (`PW_CHANNEL=msedge` para usar o Edge instalado).

## Regras do projeto
- Metros em tudo. `Scene` é JSON puro; mutações só por `commit` (ou `preview/endPreview` em arrastos).
- Adicione aberturas DEPOIS de todas as salas (mover sala reata aberturas).
- Interface em pt-BR, paleta quente (latão/ferrugem/líquen). **Nada de neon ou “futurista”; evite clichês de interface gerada por IA.**
- Sem serviços pagos, sem IA, offline.
- Playtest e análise nunca mutam o projeto (clonar).
- Novas abas do painel direito: `src/ui/panels.tsx` + id em `RightTab` (`editor/ui.ts`) + comando em `editor/commands.ts`.
- Todo recurso novo de lógica ganha teste em `tests/`.

## Armadilhas
- StrictMode executa effects 2×: nunca proteja a adição de listeners com ref.
- Yaw do jogador 0 olha para −Z; frente do prop é +z local.
- Nav: células de 0,25 m podem cruzar dois degraus; `SAMPLE_SLACK` compensa.
- Sem Python na máquina: scripts de edição em node.
