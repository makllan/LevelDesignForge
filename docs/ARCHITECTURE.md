# Arquitetura

## Princípio
Um único `Scene` (JSON puro) é a fonte de verdade. Planta 2D, 3D, colisão, playtest e análise **derivam** dele; nenhum mantém estado próprio de geometria.

## Camadas (`src/`)
| Pasta | Responsabilidade |
|---|---|
| `core` | Tipos, matemática, defaults, esquema com validação/migração (`schema.ts`), marcadores |
| `editor` | `store` (zustand + immer, histórico por snapshots), `rooms`/`actions` (mutações puras sobre `Scene`), `commands` (paleta + atalhos), `ui` (estado de interface, separado) |
| `geometry` | Paredes com aberturas reais, escadas, terreno por heightmap, `colliders` (OBB, lajes com furos, rampas, terreno) |
| `render` | `Renderer3D` three.js direto (sem R3F), `propGeo` (props paramétricos) |
| `blueprint` | Planta em canvas 2D: `draw`, `hit`, `PlanController` (ferramentas) |
| `playtest` | `PlaySim` puro (sem DOM, testável) + `Playtest.tsx` (render, HUD, ponteiro) |
| `analysis` | `navgrid` → `progression`, `los`, `companion` |
| `export` | Exportadores de texto/SVG puros |
| `templates` | Os três modelos, construídos pelas mesmas ações do editor |
| `storage` | IndexedDB (projetos + autosave), arquivo `.ordoforge.json` |
| `ui` | Painéis React; abas extras entram em `ui/panels.tsx` |

## Convenções
- **Coordenadas**: mundo three.js Y-up (X leste, Z sul). Planta (x,y) → mundo (x, _, z). `rot` em graus de +x para +y. A frente de um prop é +z local. Yaw 0 do jogador olha para −Z.
- **Histórico**: `commit(label, recipe)` é atômico; arrastos usam `preview` → `endPreview`. `patchProject/patchMeta/patchSettings` marcam sujo sem histórico.
- **Paredes compartilhadas**: cada segmento existe uma vez, com `sources[]`; mover/redimensionar uma sala remove e reata as aberturas por fração da aresta.
- **Aberturas reais**: vãos são cortados na geometria (sem booleanas); lógica da porta: `{mode: free|locked|requires, requires[], oneWay, fake, startOpen}`.
- **Playtest/Análise**: operam em clone JSON da cena; nunca mutam o projeto.

## Análise
1. `buildNavGrid`: uma camada por pavimento; célula caminhável = tem apoio, degrau ≤ limite, corpo cabe (mesmo `pushOut` do playtest). Portas/bloqueios entram desligados e cada um registra as células que fecha (`gate`).
2. `analyzeProgression`: ponto fixo — a cada rodada o jogador cuidadoso coleta o que alcança, abre portas cujos requisitos já tem, ativa o que for ativável, até estabilizar. Resultado: etapas em ordem, objetos presos, salas inalcançáveis, rota até a saída.
3. `analyzeScene` transforma tudo em achados com id estável (ignoráveis via `project.dismissed`).

## Persistência
Esquema versionado (`SCHEMA_VERSION`); `schema.ts` valida, migra e rejeita arquivos inválidos com mensagem. Autosave em IndexedDB; recuperação na abertura.

## Decisões
- **Sem R3F**: o editor precisa de controle fino de recursos e instanciamento; um renderer imperativo simplificou picking e gizmo.
- **Snapshots em vez de patches** no histórico: cenas são pequenas (centenas de entidades) e imutáveis com Immer compartilham estrutura.
- **Props paramétricos** (caixas, cilindros, prismas) em vez de modelos importados: greybox legível, zero ativos externos, tudo offline.
