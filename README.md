# ORDO Forge — Level Design Studio

Ferramenta local para prototipar níveis de survival horror (referências: *Resident Evil 2 Remake* e *Alan Wake 2*) para o jogo **ORDO**: uma instalação subterrânea da Igreja no interior da França.

Roda 100% no navegador, offline, sem serviços pagos e sem IA. Unidade única: **metros**. Uma única fonte de verdade alimenta a planta 2D, o 3D, o playtest e a análise.

## Rodar

```
npm install
npm run dev          # http://127.0.0.1:5173
npm run build        # typecheck + bundle de produção em dist/
npm test             # 54 testes (Vitest)
npm run test:e2e     # Playwright (veja docs/TESTING.md)
```

## O que dá para fazer

| Área | Recursos |
|---|---|
| Espaço | Salas retangulares e irregulares, corredores, paredes compartilhadas, portas/janelas/arcos que **abrem vãos reais** na parede, múltiplos pavimentos e subsolos, escadas, rampas, vãos no piso |
| Edição | Seleção múltipla, agrupar, alinhar, copiar/colar/duplicar, gizmo 3D, snap 0,1/0,25/0,5/1 m, desfazer/refazer por snapshots, paleta de comandos (Ctrl+K), menu de contexto |
| Objetos | ~105 props em 10 categorias, formas paramétricas, 23 tipos de marcador, luzes |
| Smart Rooms | Escritório, arquivo, almoxarifado, sala de máquinas, enfermaria, capela, cela, descanso, corredor técnico — sala + mobília coerente (Ctrl+K → “Smart Rooms”) |
| Paisagem | Terreno por semente, esculpir (elevar/rebaixar/suavizar/nivelar), trilhas, estradas, rios, vegetação por pincel, nivelar sob ambientes, converter em objetos |
| Playtest | 1ª/3ª pessoa, colisão, portas, chaves, cartões, fusíveis, interruptores, gerador, atalhos, saída, estado temporário (F5) |
| Análise | Grade de navegação em camadas, validação de progressão (ponto fixo com chaves e portas), linha de visão, Design Companion, grafo de dependências |
| Direção | Pacing Director (curva de tensão + avisos), Atmosphere Studio, Ghost Replay (trajetória + mapa de calor), Reality Lab (variantes), Sketch to Space (croqui calibrado) |
| Exportar | `.ordoforge.json`, planta SVG/PNG, dimensões CSV, lista de objetos CSV, progressão/marcadores JSON, modelo GLB |
| Modelos | Núcleo do bunker, O silêncio da floresta, Instalação subterrânea |

## Atalhos

`Ctrl+S` salvar · `Ctrl+Z`/`Ctrl+Shift+Z` desfazer/refazer · `Ctrl+D` duplicar · `Ctrl+C/V` copiar/colar · `Del` excluir · `F` focar · `Q/W/E/R` selecionar/mover/girar/escalar · `F5` playtest · `Esc` sair · `Ctrl+K` paleta · `?` ajuda.

## Documentação

[ARCHITECTURE](docs/ARCHITECTURE.md) · [ROADMAP](docs/ROADMAP.md) · [TESTING](docs/TESTING.md) · [CHANGELOG](docs/CHANGELOG.md) · [KNOWN_ISSUES](docs/KNOWN_ISSUES.md) · [PROGRESS](PROGRESS.md) · [CLAUDE.md](CLAUDE.md)

## Direção visual

Paleta de latão, ferrugem e líquen sobre fundo escuro quente; Barlow / Barlow Condensed / IBM Plex Mono. Sem neon nem cores “futuristas” de propósito: a interface é uma mesa de desenho de arquivo, não um painel de nave.
