/**
 * Asset Library — props gerados por formas simples (sem downloads).
 * Convenções: unidades em metros; origem = centro da base da pegada; frente = +z local.
 */
import type { ParamValue, Vec3 } from '../core/types';

export type PropCategory = 'arch' | 'office' | 'industrial' | 'military' | 'medical' | 'religious' | 'containment' | 'nature' | 'gameplay' | 'scale';
export type GameplayKind =
  | 'key' | 'card' | 'fuse' | 'switch' | 'generator' | 'trigger' | 'checkpoint' | 'objective' | 'exit'
  | 'elevator' | 'block' | 'shortcut' | 'pickup' | 'enemy';

export type PartShape = 'box' | 'cyl' | 'sph' | 'cone' | 'prism';
export interface Part {
  s: PartShape;
  /** centro x/z; y = base da peça */
  x: number; y: number; z: number;
  /** dimensões: box = w,h,d; cyl/cone = diâmetro,h,diâmetro; sph = diâmetro (h ignorado); prism = w,h,d (telhado em empena ao longo de z) */
  w: number; h: number; d: number;
  c: string;
  rx?: number; ry?: number; rz?: number;
  /** peça translúcida (vidro) */
  glass?: boolean;
}

export interface ParamDef { key: string; label: string; type: 'number' | 'text' | 'bool' | 'select'; def: ParamValue; options?: string[]; min?: number; max?: number; step?: number }

export interface PropDef {
  id: string;
  name: string;
  category: PropCategory;
  tags: string[];
  parts: Part[];
  /** Caixa envolvente calculada das peças (m): largura(x), altura(y), profundidade(z). */
  size: Vec3;
  collider: 'box' | 'none';
  gameplay?: GameplayKind;
  params: ParamDef[];
  /** Altura padrão de colocação acima do piso (ex.: quadro na parede). */
  y0?: number;
}

export const CATEGORY_LABEL: Record<PropCategory, string> = {
  arch: 'Arquitetura', office: 'Escritório', industrial: 'Industrial', military: 'Militar', medical: 'Hospitalar',
  religious: 'Religioso', containment: 'Contenção paranormal', nature: 'Natureza', gameplay: 'Gameplay', scale: 'Escala humana',
};

// Paleta: tons de pintura, madeira, metal e ferrugem — nada de neon.
const K = {
  wood: '#7b5c3f', woodD: '#58412e', woodL: '#a18362', metal: '#6d7173', metalD: '#44484a', metalL: '#9a9c9a',
  paint: '#b4aa92', white: '#cfc9ba', red: '#8f3b2c', redD: '#6a2a20', green: '#55663f', greenD: '#37452b', olive: '#5d6046',
  blue: '#4f6372', glass: '#7ea0a4', black: '#26241f', concrete: '#8a867c', stone: '#78756b', skin: '#9d8068',
  fabric: '#6a5a4f', yellow: '#b8923a', bark: '#5b4636', rust: '#8a5636', lead: '#55585a', cloth: '#a79f8c', gold: '#b89545',
  grass: '#667a45', leaf: '#4a6137', water: '#5c7782',
};

const box = (x: number, y: number, z: number, w: number, h: number, d: number, c: string, o: Partial<Part> = {}): Part => ({ s: 'box', x, y, z, w, h, d, c, ...o });
const cyl = (x: number, y: number, z: number, r: number, h: number, c: string, o: Partial<Part> = {}): Part => ({ s: 'cyl', x, y, z, w: r * 2, h, d: r * 2, c, ...o });
const sph = (x: number, y: number, z: number, r: number, c: string, o: Partial<Part> = {}): Part => ({ s: 'sph', x, y, z, w: r * 2, h: r * 2, d: r * 2, c, ...o });
const cone = (x: number, y: number, z: number, r: number, h: number, c: string, o: Partial<Part> = {}): Part => ({ s: 'cone', x, y, z, w: r * 2, h, d: r * 2, c, ...o });
const prism = (x: number, y: number, z: number, w: number, h: number, d: number, c: string, o: Partial<Part> = {}): Part => ({ s: 'prism', x, y, z, w, h, d, c, ...o });

export function partBounds(p: Part): { min: Vec3; max: Vec3 } {
  const hw = p.w / 2, hd = p.d / 2;
  const hh = p.s === 'sph' ? p.h : p.h;
  const corners: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) corners.push([sx * hw, sy * hh, sz * hd]);
  const rx = ((p.rx ?? 0) * Math.PI) / 180, ry = ((p.ry ?? 0) * Math.PI) / 180, rz = ((p.rz ?? 0) * Math.PI) / 180;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let [x, y, z] of corners) {
    // pivô de rotação no centro da peça
    y -= hh / 2;
    let t = y * Math.cos(rx) - z * Math.sin(rx); z = y * Math.sin(rx) + z * Math.cos(rx); y = t;
    t = x * Math.cos(ry) + z * Math.sin(ry); z = -x * Math.sin(ry) + z * Math.cos(ry); x = t;
    t = x * Math.cos(rz) - y * Math.sin(rz); y = x * Math.sin(rz) + y * Math.cos(rz); x = t;
    y += hh / 2;
    const w: Vec3 = [x + p.x, y + p.y, z + p.z];
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], w[i]); max[i] = Math.max(max[i], w[i]); }
  }
  return { min, max };
}

function sizeOf(parts: Part[]): Vec3 {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) { const b = partBounds(p); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); } }
  return [Math.max(0.05, max[0] - min[0]), Math.max(0.02, max[1] - Math.max(0, min[1])), Math.max(0.05, max[2] - min[2])];
}

const DEFS: PropDef[] = [];
function def(id: string, name: string, category: PropCategory, tags: string, parts: Part[], o: Partial<Pick<PropDef, 'collider' | 'gameplay' | 'params' | 'y0'>> = {}) {
  DEFS.push({ id, name, category, tags: tags.split(/[\s,]+/).filter(Boolean), parts, size: sizeOf(parts), collider: o.collider ?? 'box', gameplay: o.gameplay, params: o.params ?? [], y0: o.y0 });
}

const codeParam: ParamDef = { key: 'code', label: 'Código', type: 'text', def: 'A' };
const labelParam: ParamDef = { key: 'label', label: 'Rótulo', type: 'text', def: '' };
const radiusParam = (d: number): ParamDef => ({ key: 'radius', label: 'Raio (m)', type: 'number', def: d, min: 0.3, max: 30, step: 0.25 });

// ------------------------------------------------------------ Arquitetura
def('arch.pillar_sq', 'Pilar quadrado', 'arch', 'pilar coluna estrutura concreto', [box(0, 0, 0, 0.4, 3, 0.4, K.concrete), box(0, 0, 0, 0.55, 0.15, 0.55, K.stone), box(0, 2.85, 0, 0.55, 0.15, 0.55, K.stone)]);
def('arch.pillar_round', 'Pilar redondo', 'arch', 'pilar coluna redonda', [cyl(0, 0, 0, 0.25, 3, K.concrete), cyl(0, 0, 0, 0.33, 0.15, K.stone), cyl(0, 2.85, 0, 0.33, 0.15, K.stone)]);
def('arch.beam', 'Viga', 'arch', 'viga estrutura teto', [box(0, 0, 0, 4, 0.4, 0.3, K.metalD), box(0, 0.4, 0, 4, 0.06, 0.45, K.metal)], { y0: 2.5 });
def('arch.fence_wood', 'Cerca de madeira', 'arch', 'cerca madeira divisa', [box(-0.95, 0, 0, 0.1, 1.2, 0.1, K.woodD), box(0.95, 0, 0, 0.1, 1.2, 0.1, K.woodD), box(0, 0.35, 0, 1.9, 0.12, 0.05, K.wood), box(0, 0.8, 0, 1.9, 0.12, 0.05, K.wood)]);
def('arch.fence_wire', 'Cerca de arame', 'arch', 'cerca arame tela perimetro', [box(-1.2, 0, 0, 0.08, 2.2, 0.08, K.metalD), box(1.2, 0, 0, 0.08, 2.2, 0.08, K.metalD), box(0, 0.15, 0, 2.4, 1.9, 0.02, K.metalL, { glass: true }), box(0, 2.1, 0, 2.4, 0.05, 0.06, K.metalD)]);
def('arch.gate_metal', 'Portão metálico', 'arch', 'portao grade acesso entrada', [box(-1.5, 0, 0, 0.15, 2.4, 0.15, K.metalD), box(1.5, 0, 0, 0.15, 2.4, 0.15, K.metalD), box(0, 0.2, 0, 2.9, 0.08, 0.06, K.metal), box(0, 1.1, 0, 2.9, 0.08, 0.06, K.metal), box(0, 2.0, 0, 2.9, 0.08, 0.06, K.metal), ...[-1.1, -0.55, 0, 0.55, 1.1].map((x) => box(x, 0.2, 0, 0.05, 1.9, 0.05, K.metal))]);
def('arch.gate_wood', 'Portão de madeira', 'arch', 'portao madeira rural', [box(-0.8, 0, 0, 0.12, 1.6, 0.12, K.woodD), box(0.8, 0, 0, 0.12, 1.6, 0.12, K.woodD), box(0, 0.3, 0, 1.5, 0.12, 0.05, K.wood), box(0, 0.8, 0, 1.5, 0.12, 0.05, K.wood), box(0, 1.25, 0, 1.5, 0.12, 0.05, K.wood), prism(0, 0, 0, 1.2, 0.01, 0.01, K.wood, { w: 0.05, h: 0.05, d: 0.05 })]);
def('arch.guardrail', 'Guarda-corpo', 'arch', 'guarda corpo parapeito grade passarela', [box(-0.95, 0, 0, 0.05, 1.05, 0.05, K.metal), box(0.95, 0, 0, 0.05, 1.05, 0.05, K.metal), box(0, 1.0, 0, 2, 0.05, 0.05, K.metal), box(0, 0.5, 0, 2, 0.03, 0.03, K.metal)], { collider: 'box' });
def('arch.floor_grate', 'Grade de piso', 'arch', 'grade piso metal passarela grelha', [box(0, 0, 0, 1, 0.05, 1, K.metalD), box(0, 0.05, 0, 1, 0.01, 0.06, K.metal)], { collider: 'none' });
def('arch.bollard', 'Marco de concreto', 'arch', 'poste marco bloqueio', [cyl(0, 0, 0, 0.12, 0.9, K.concrete), cyl(0, 0.9, 0, 0.12, 0.02, K.yellow)]);
def('arch.wall_block', 'Bloco de parede', 'arch', 'parede bloco avulso divisoria', [box(0, 0, 0, 2, 3, 0.2, K.paint)]);
def('arch.beam_column', 'Pórtico', 'arch', 'portico arco estrutura entrada', [box(-1.4, 0, 0, 0.3, 2.8, 0.3, K.concrete), box(1.4, 0, 0, 0.3, 2.8, 0.3, K.concrete), box(0, 2.8, 0, 3.1, 0.35, 0.35, K.concrete)]);

// ------------------------------------------------------------ Escritório
def('office.desk', 'Mesa de escritório', 'office', 'mesa escritorio trabalho', [box(0, 0.7, 0, 1.6, 0.05, 0.8, K.wood), box(-0.72, 0, -0.32, 0.06, 0.7, 0.06, K.metalD), box(0.72, 0, -0.32, 0.06, 0.7, 0.06, K.metalD), box(-0.72, 0, 0.32, 0.06, 0.7, 0.06, K.metalD), box(0.72, 0, 0.32, 0.06, 0.7, 0.06, K.metalD), box(0.5, 0.2, 0, 0.5, 0.5, 0.7, K.woodD)]);
def('office.desk_l', 'Mesa em L', 'office', 'mesa canto escritorio', [box(0, 0.7, 0, 1.8, 0.05, 0.7, K.wood), box(0.55, 0.7, 0.9, 0.7, 0.05, 1.1, K.wood), box(-0.8, 0, 0, 0.06, 0.7, 0.6, K.metalD), box(0.9, 0, 1.4, 0.06, 0.7, 0.6, K.metalD)]);
def('office.chair', 'Cadeira de escritório', 'office', 'cadeira assento escritorio', [cyl(0, 0, 0, 0.27, 0.05, K.black), cyl(0, 0.05, 0, 0.04, 0.4, K.metalD), box(0, 0.45, 0, 0.5, 0.08, 0.5, K.fabric), box(0, 0.53, -0.22, 0.48, 0.5, 0.07, K.fabric)]);
def('office.monitor', 'Monitor', 'office', 'monitor tela computador', [box(0, 0, 0, 0.22, 0.03, 0.18, K.black), box(0, 0.03, 0, 0.05, 0.12, 0.05, K.black), box(0, 0.15, 0, 0.55, 0.33, 0.04, K.black), box(0, 0.17, 0.021, 0.5, 0.29, 0.01, K.glass)], { y0: 0.75 });
def('office.computer', 'Computador completo', 'office', 'computador pc torre monitor teclado', [box(0.45, 0, 0, 0.2, 0.45, 0.4, K.metalD), box(-0.1, 0, 0, 0.55, 0.45, 0.04, K.black), box(-0.1, 0.0, 0.25, 0.4, 0.02, 0.15, K.black)], { y0: 0.75 });
def('office.locker', 'Armário de escritório', 'office', 'armario guarda roupa metal locker', [box(0, 0, 0, 0.9, 1.9, 0.45, K.blue), box(0, 0.02, 0.226, 0.4, 1.8, 0.01, K.metalD), box(0.22, 0.02, 0.226, 0.01, 1.8, 0.01, K.black)]);
def('office.filing', 'Arquivo de gavetas', 'office', 'arquivo gaveteiro pasta gavetas', [box(0, 0, 0, 0.46, 1.3, 0.62, K.metal), ...[0.1, 0.4, 0.7, 1.0].map((y) => box(0, y, 0.31, 0.38, 0.2, 0.01, K.metalD))]);
def('office.bookshelf', 'Estante', 'office', 'estante livros prateleira', [box(0, 0, 0, 1.0, 2.0, 0.35, K.woodD), ...[0.45, 0.9, 1.35, 1.8].map((y) => box(0, y, 0.02, 0.92, 0.04, 0.3, K.wood)), box(-0.3, 0.5, 0.05, 0.3, 0.35, 0.25, K.red), box(0.2, 0.95, 0.05, 0.4, 0.3, 0.25, K.green), box(-0.1, 1.4, 0.05, 0.5, 0.3, 0.25, K.blue)]);
def('office.counter', 'Balcão', 'office', 'balcao recepcao atendimento', [box(0, 0, 0, 2.4, 1.05, 0.7, K.wood), box(0, 1.05, 0.05, 2.5, 0.06, 0.8, K.woodD)]);
def('office.sofa', 'Sofá', 'office', 'sofa sala espera estar', [box(0, 0, 0, 1.9, 0.4, 0.85, K.fabric), box(0, 0.4, -0.33, 1.9, 0.45, 0.2, K.fabric), box(-0.9, 0.4, 0.05, 0.12, 0.3, 0.7, K.fabric), box(0.9, 0.4, 0.05, 0.12, 0.3, 0.7, K.fabric)]);
def('office.printer', 'Impressora', 'office', 'impressora copiadora', [box(0, 0, 0, 0.5, 0.35, 0.45, K.white), box(0, 0.35, 0, 0.45, 0.05, 0.4, K.metalL)], { y0: 0.75 });
def('office.whiteboard', 'Quadro branco', 'office', 'quadro lousa parede briefing', [box(0, 0, 0, 1.6, 1.1, 0.04, K.white), box(0, -0.02, 0.03, 1.66, 0.04, 0.03, K.metal)], { y0: 0.9, collider: 'none' });
def('office.table_round', 'Mesa redonda', 'office', 'mesa redonda reuniao', [cyl(0, 0.72, 0, 0.6, 0.05, K.wood), cyl(0, 0, 0, 0.05, 0.72, K.metalD), cyl(0, 0, 0, 0.3, 0.04, K.metalD)]);
def('office.stool', 'Banqueta', 'office', 'banco banqueta assento', [cyl(0, 0.45, 0, 0.18, 0.05, K.fabric), cyl(0, 0, 0, 0.03, 0.45, K.metalD), cyl(0, 0, 0, 0.18, 0.03, K.metalD)]);
def('office.bin', 'Lixeira', 'office', 'lixeira lixo', [cyl(0, 0, 0, 0.17, 0.45, K.metalD)]);

// ------------------------------------------------------------ Industrial
def('ind.generator', 'Gerador grande', 'industrial', 'gerador energia motor', [box(0, 0.1, 0, 2.2, 1.2, 1.0, K.olive), box(-0.6, 1.3, 0, 0.3, 0.4, 0.3, K.metalD), box(0.7, 0.25, 0.52, 0.6, 0.5, 0.04, K.black), box(0, 0, 0, 2.3, 0.1, 1.1, K.metalD)]);
def('ind.machine', 'Máquina industrial', 'industrial', 'maquina prensa equipamento', [box(0, 0, 0, 2, 1.0, 1.2, K.metal), box(-0.4, 1.0, 0, 1, 0.8, 1.0, K.metalD), box(0.7, 1.0, 0.2, 0.4, 0.5, 0.4, K.red), cyl(0.7, 1.5, 0.2, 0.08, 0.3, K.metalL)]);
def('ind.transformer', 'Transformador', 'industrial', 'transformador alta tensao energia', [box(0, 0, 0, 1.4, 1.5, 1.2, K.metalD), ...[-0.4, 0, 0.4].map((x) => cyl(x, 1.5, 0, 0.1, 0.5, K.white)), box(0, 0, 0.61, 1.0, 0.9, 0.03, K.yellow)]);
def('ind.pipe_h', 'Tubulação horizontal', 'industrial', 'cano tubo tubulacao encanamento', [cyl(0, 0.15, 0, 0.15, 3, K.rust, { rz: 90 }), cyl(-1.5, 0.15, 0, 0.19, 0.12, K.metalD, { rz: 90 }), cyl(1.5, 0.15, 0, 0.19, 0.12, K.metalD, { rz: 90 })], { collider: 'box' });
def('ind.pipe_v', 'Tubulação vertical', 'industrial', 'cano tubo coluna vertical', [cyl(0, 0, 0, 0.15, 3, K.rust), cyl(0, 0, 0, 0.2, 0.1, K.metalD), cyl(0, 2.9, 0, 0.2, 0.1, K.metalD)]);
def('ind.valve', 'Válvula', 'industrial', 'valvula registro roda', [cyl(0, 0, 0, 0.08, 0.3, K.metalD), cyl(0, 0.3, 0, 0.18, 0.04, K.red)]);
def('ind.duct', 'Duto de ventilação', 'industrial', 'duto ar ventilacao', [box(0, 0, 0, 3, 0.5, 0.5, K.metalL), box(-1.5, -0.03, 0, 0.05, 0.56, 0.56, K.metalD), box(1.5, -0.03, 0, 0.05, 0.56, 0.56, K.metalD)], { y0: 2.3 });
def('ind.fan', 'Ventilador industrial', 'industrial', 'ventilador exaustor ar', [cyl(0, 0, 0, 0.6, 0.35, K.metalD, { rx: 90 }), cyl(0, 0.0, 0, 0.45, 0.37, K.black, { rx: 90 })], { y0: 1.6 });
def('ind.barrel', 'Barril', 'industrial', 'barril tambor oleo', [cyl(0, 0, 0, 0.3, 0.9, K.blue), cyl(0, 0.3, 0, 0.31, 0.04, K.metalD), cyl(0, 0.6, 0, 0.31, 0.04, K.metalD)]);
def('ind.crate', 'Caixa de madeira', 'industrial', 'caixa caixote madeira carga', [box(0, 0, 0, 0.8, 0.8, 0.8, K.wood), box(0, 0.38, 0.401, 0.8, 0.04, 0.01, K.woodD), box(0, 0, 0.401, 0.8, 0.04, 0.01, K.woodD)]);
def('ind.crate_small', 'Caixa pequena', 'industrial', 'caixa pequena papelao', [box(0, 0, 0, 0.5, 0.4, 0.4, K.woodL)]);
def('ind.pallet', 'Pallet', 'industrial', 'pallet palete estrado', [box(0, 0.08, 0, 1.2, 0.04, 1.0, K.woodL), ...[-0.5, 0, 0.5].map((x) => box(x, 0, 0, 0.12, 0.08, 1.0, K.wood)), box(0, 0.0, 0, 1.2, 0.01, 1.0, K.wood)]);
def('ind.container', 'Contêiner', 'industrial', 'container conteiner carga navio', [box(0, 0, 0, 6, 2.6, 2.4, K.rust), ...[-2.5, -1.2, 0.1, 1.4, 2.7].map((x) => box(x, 0, 0, 0.06, 2.6, 2.44, K.redD))]);
def('ind.tank', 'Tanque cilíndrico', 'industrial', 'tanque reservatorio silo', [cyl(0, 0, 0, 1.1, 3, K.metal), cyl(0, 3, 0, 0.9, 0.2, K.metalD), box(0.9, 0, 0, 0.1, 3, 0.1, K.metalD)]);
def('ind.panel', 'Painel elétrico', 'industrial', 'painel eletrico quadro disjuntor', [box(0, 0, 0, 0.8, 1.8, 0.3, K.metalD), box(0, 0.4, 0.151, 0.6, 0.6, 0.01, K.black), box(0.2, 1.3, 0.151, 0.12, 0.12, 0.01, K.red)]);
def('ind.forklift', 'Empilhadeira', 'industrial', 'empilhadeira veiculo carga', [box(0, 0.2, -0.3, 1.1, 0.7, 1.5, K.yellow), box(0, 0.9, -0.5, 1.0, 1.0, 0.1, K.metalD), box(0, 0.0, 1.0, 0.9, 0.08, 1.2, K.metalD), box(0, 0.0, 0.45, 0.1, 2.0, 0.1, K.metalD)]);
def('ind.shelf', 'Prateleira industrial', 'industrial', 'prateleira estoque deposito rack', [...[-0.95, 0.95].flatMap((x) => [-0.28, 0.28].map((z) => box(x, 0, z, 0.06, 2.2, 0.06, K.blue))), ...[0.1, 0.8, 1.5, 2.15].map((y) => box(0, y, 0, 2, 0.05, 0.6, K.metal)), box(-0.5, 0.15, 0, 0.5, 0.45, 0.4, K.wood), box(0.4, 0.85, 0, 0.7, 0.4, 0.45, K.woodL)]);
def('ind.workbench', 'Bancada', 'industrial', 'bancada oficina trabalho', [box(0, 0.85, 0, 1.8, 0.06, 0.7, K.woodD), box(-0.8, 0, 0, 0.08, 0.85, 0.6, K.metalD), box(0.8, 0, 0, 0.08, 0.85, 0.6, K.metalD), box(0, 0.35, -0.3, 1.7, 0.04, 0.05, K.metalD)]);
def('ind.cable_reel', 'Carretel de cabo', 'industrial', 'carretel cabo bobina', [cyl(0, 0, 0, 0.5, 0.08, K.wood), cyl(0, 0.08, 0, 0.3, 0.45, K.black), cyl(0, 0.53, 0, 0.5, 0.08, K.wood)]);

// ------------------------------------------------------------ Militar
def('mil.sandbags', 'Barricada de sacos', 'military', 'barricada sacos areia cobertura', [box(0, 0, 0, 2.4, 0.4, 0.8, K.cloth), box(0, 0.4, 0, 2.2, 0.35, 0.65, K.cloth), box(0, 0.75, 0, 1.6, 0.3, 0.5, K.cloth)]);
def('mil.guardhouse', 'Guarita', 'military', 'guarita posto vigia', [box(0, 0, 0, 2.5, 2.4, 2.5, K.olive), box(0, 1.1, 1.26, 1.4, 0.8, 0.02, K.glass, { glass: true }), prism(0, 2.4, 0, 2.9, 0.5, 2.9, K.metalD)]);
def('mil.searchlight', 'Holofote', 'military', 'holofote farol luz torre', [box(0, 0, 0, 0.12, 1.8, 0.12, K.metalD), cyl(0, 1.8, 0.1, 0.35, 0.5, K.metal, { rx: 90 }), cyl(0, 1.8, 0.36, 0.3, 0.02, K.yellow, { rx: 90 })]);
def('mil.jeep', 'Jipe militar', 'military', 'jipe veiculo carro militar', [box(0, 0.35, 0, 1.8, 0.8, 3.8, K.olive), box(0, 1.1, -0.3, 1.7, 0.7, 1.5, K.olive), box(0, 1.1, -0.3, 1.5, 0.5, 1.52, K.glass, { glass: true }), ...[-0.85, 0.85].flatMap((x) => [-1.2, 1.2].map((z) => cyl(x, 0.0, z, 0.35, 0.3, K.black, { rz: 90 })))]);
def('mil.truck', 'Caminhão militar', 'military', 'caminhao veiculo transporte carga', [box(0, 0.5, 2, 2.4, 1.6, 2, K.olive), box(0, 0.7, -1.2, 2.5, 2.4, 4.8, K.green), ...[-1.1, 1.1].flatMap((x) => [-2.5, 0.2, 2.5].map((z) => cyl(x, 0.0, z, 0.5, 0.35, K.black, { rz: 90 })))]);
def('mil.radio', 'Rádio de campo', 'military', 'radio comunicacao transmissor', [box(0, 0, 0, 0.45, 0.3, 0.3, K.olive), box(0.15, 0.3, 0, 0.02, 0.8, 0.02, K.black), box(-0.1, 0.05, 0.151, 0.2, 0.15, 0.01, K.black)], { y0: 0.75 });
def('mil.comm_rack', 'Rack de comunicação', 'military', 'rack comunicacao servidor equipamento', [box(0, 0, 0, 0.6, 1.8, 0.7, K.metalD), ...[0.3, 0.7, 1.1, 1.45].map((y) => box(0, y, 0.351, 0.5, 0.2, 0.01, K.black))]);
def('mil.watchtower', 'Torre de vigia', 'military', 'torre vigia observacao', [...[-1.3, 1.3].flatMap((x) => [-1.3, 1.3].map((z) => box(x, 0, z, 0.2, 5.5, 0.2, K.woodD))), box(0, 5.4, 0, 3.2, 0.2, 3.2, K.wood), box(0, 5.6, 1.5, 3.2, 0.9, 0.08, K.wood), box(0, 5.6, -1.5, 3.2, 0.9, 0.08, K.wood), prism(0, 6.5, 0, 3.8, 1, 3.8, K.metalD)], { collider: 'box' });
def('mil.wreck', 'Destroços de aeronave', 'military', 'aviao fuselagem acidente destrocos', [cyl(0, 1.0, 0, 1.3, 9, K.metalL, { rx: 90, ry: 6 }), box(0, 1.2, 0.5, 11, 0.15, 2.2, K.metal, { rz: -4 }), box(0, 2.0, -4.4, 0.15, 2.0, 1.6, K.metal), box(0, 1.8, -4.3, 3.8, 0.12, 1.2, K.metal)]);
def('mil.tent', 'Tenda militar', 'military', 'tenda acampamento lona', [prism(0, 0, 0, 3.2, 2.2, 4, K.olive), box(0, 0, 0, 3.0, 0.05, 3.8, K.greenD)]);
def('mil.ammo_crate', 'Caixa de munição', 'military', 'municao caixa militar suprimento', [box(0, 0, 0, 0.6, 0.35, 0.3, K.olive), box(0, 0.35, 0, 0.62, 0.03, 0.32, K.greenD)]);
def('mil.concertina', 'Arame farpado', 'military', 'arame farpado concertina barreira', [cyl(0, 0.4, 0, 0.4, 2.4, K.metalD, { rz: 90 })], { collider: 'box' });
def('mil.barrier_arm', 'Cancela', 'military', 'cancela barreira acesso controle', [box(-1.9, 0, 0, 0.3, 1.1, 0.3, K.metalD), box(0.1, 1.0, 0, 3.8, 0.1, 0.1, K.red)]);
def('mil.floodlight', 'Poste de luz', 'military', 'poste luz iluminacao pole', [box(0, 0, 0, 0.14, 5, 0.14, K.metalD), box(0, 5, 0.2, 0.6, 0.15, 0.5, K.metal)]);

// ------------------------------------------------------------ Hospitalar
def('med.bed', 'Cama hospitalar', 'medical', 'cama leito hospital', [box(0, 0.3, 0, 0.95, 0.12, 2.1, K.metalL), box(0, 0.42, 0, 0.9, 0.15, 2.0, K.white), box(0, 0.57, -0.85, 0.85, 0.12, 0.3, K.white), box(0, 0.3, -1.04, 1, 0.9, 0.05, K.metal), box(0, 0.3, 1.04, 1, 0.6, 0.05, K.metal), ...[-0.4, 0.4].flatMap((x) => [-0.9, 0.9].map((z) => cyl(x, 0, z, 0.04, 0.3, K.metalD)))]);
def('med.gurney', 'Maca', 'medical', 'maca transporte paciente', [box(0, 0.65, 0, 0.7, 0.1, 1.9, K.white), box(0, 0.75, 0, 0.66, 0.08, 1.85, K.blue), box(0, 0.1, 0, 0.06, 0.55, 1.4, K.metalD), ...[-0.3, 0.3].flatMap((x) => [-0.7, 0.7].map((z) => cyl(x, 0, z, 0.07, 0.1, K.black)))]);
def('med.cabinet', 'Armário médico', 'medical', 'armario medico remedios vidro', [box(0, 0, 0, 0.9, 1.8, 0.4, K.white), box(0, 0.9, 0.201, 0.8, 0.8, 0.01, K.glass, { glass: true }), box(0, 0.0, 0.201, 0.8, 0.8, 0.01, K.metalL)]);
def('med.iv_stand', 'Suporte de soro', 'medical', 'soro suporte iv', [cyl(0, 0, 0, 0.02, 1.8, K.metalL), cyl(0, 0, 0, 0.25, 0.03, K.metalD), box(0, 1.6, 0, 0.5, 0.02, 0.02, K.metalL), box(0, 1.35, 0.05, 0.1, 0.25, 0.05, K.glass, { glass: true })]);
def('med.surgical_table', 'Mesa cirúrgica', 'medical', 'mesa cirurgica operacao cirurgia', [box(0, 0.85, 0, 0.7, 0.08, 1.9, K.metalL), cyl(0, 0, 0, 0.25, 0.1, K.metalD), cyl(0, 0.1, 0, 0.08, 0.75, K.metal), cyl(0, 2.2, -0.2, 0.4, 0.1, K.white), cyl(0, 1.2, -0.2, 0.02, 1.0, K.metalL)]);
def('med.divider', 'Divisória hospitalar', 'medical', 'biombo divisoria cortina', [box(0, 0, 0, 1.6, 1.8, 0.05, K.glass, { glass: true }), box(-0.78, 0, 0, 0.05, 1.8, 0.07, K.metalD), box(0.78, 0, 0, 0.05, 1.8, 0.07, K.metalD)], { collider: 'box' });
def('med.vitals', 'Monitor clínico', 'medical', 'monitor sinais vitais clinico', [cyl(0, 0, 0, 0.02, 1.3, K.metalD), cyl(0, 0, 0, 0.25, 0.03, K.metalD), box(0, 1.2, 0, 0.45, 0.3, 0.12, K.black), box(0, 1.23, 0.065, 0.38, 0.22, 0.01, K.glass)]);
def('med.wheelchair', 'Cadeira de rodas', 'medical', 'cadeira rodas cadeirante', [box(0, 0.45, 0, 0.45, 0.06, 0.45, K.black), box(0, 0.5, -0.22, 0.45, 0.45, 0.05, K.black), ...[-0.3, 0.3].map((x) => cyl(x, 0, -0.1, 0.3, 0.04, K.metalD, { rz: 90 }))]);
def('med.sink', 'Lavatório', 'medical', 'pia lavatorio banheiro', [box(0, 0.8, 0, 0.6, 0.1, 0.45, K.white), box(0, 0, -0.15, 0.15, 0.8, 0.15, K.white), cyl(0, 0.9, -0.15, 0.025, 0.2, K.metalL)]);
def('med.trolley', 'Carrinho de instrumentos', 'medical', 'carrinho instrumentos curativo', [box(0, 0.8, 0, 0.7, 0.04, 0.45, K.metalL), box(0, 0.3, 0, 0.7, 0.04, 0.45, K.metalL), ...[-0.32, 0.32].flatMap((x) => [-0.2, 0.2].map((z) => box(x, 0, z, 0.03, 0.8, 0.03, K.metalD)))]);

// ------------------------------------------------------------ Religioso
def('rel.altar', 'Altar', 'religious', 'altar igreja capela mesa sagrada', [box(0, 0, 0, 2.0, 0.95, 0.9, K.stone), box(0, 0.95, 0, 2.2, 0.1, 1.0, K.white), box(0, 1.05, -0.1, 1.2, 0.01, 0.4, K.red)]);
def('rel.cross', 'Cruz grande', 'religious', 'cruz crucifixo cristianismo', [box(0, 0, 0, 0.16, 2.6, 0.12, K.woodD), box(0, 1.7, 0, 0.9, 0.16, 0.12, K.woodD)]);
def('rel.pew', 'Banco de igreja', 'religious', 'banco igreja capela assento', [box(0, 0.4, 0, 2.4, 0.06, 0.45, K.wood), box(0, 0.45, -0.25, 2.4, 0.55, 0.06, K.wood), box(-1.15, 0, 0, 0.08, 0.45, 0.5, K.woodD), box(1.15, 0, 0, 0.08, 0.45, 0.5, K.woodD)]);
def('rel.pulpit', 'Púlpito', 'religious', 'pulpito sermao', [box(0, 0, 0, 0.9, 1.1, 0.8, K.woodD), box(0, 1.1, 0.0, 1.0, 0.1, 0.9, K.wood), box(0, 1.2, 0.2, 0.7, 0.35, 0.05, K.wood, { rx: -25 })]);
def('rel.reliquary', 'Relicário', 'religious', 'relicario cofre sagrado reliquia', [box(0, 0, 0, 0.5, 0.8, 0.4, K.stone), box(0, 0.8, 0, 0.55, 0.25, 0.45, K.gold), prism(0, 1.05, 0, 0.55, 0.2, 0.45, K.gold)]);
def('rel.statue', 'Estátua', 'religious', 'estatua santo escultura', [box(0, 0, 0, 0.6, 0.6, 0.6, K.stone), cyl(0, 0.6, 0, 0.18, 1.0, K.white), sph(0, 1.6, 0, 0.14, K.white), box(0, 1.1, 0, 0.55, 0.12, 0.12, K.white)]);
def('rel.coffin', 'Caixão', 'religious', 'caixao funeral morte', [box(0, 0, 0, 0.7, 0.55, 2.0, K.woodD), prism(0, 0.55, 0, 0.7, 0.12, 2.0, K.wood, { rx: 0 })]);
def('rel.candelabra', 'Candelabro', 'religious', 'candelabro vela castical', [cyl(0, 0, 0, 0.18, 0.05, K.gold), cyl(0, 0.05, 0, 0.03, 1.4, K.gold), ...[-0.2, 0, 0.2].map((x) => cyl(x, 1.45, 0, 0.025, 0.2, K.white)), box(0, 1.4, 0, 0.5, 0.03, 0.03, K.gold)]);
def('rel.font', 'Pia batismal', 'religious', 'pia batismal agua igreja', [cyl(0, 0, 0, 0.18, 0.8, K.stone), cyl(0, 0.8, 0, 0.35, 0.2, K.stone), cyl(0, 0.97, 0, 0.3, 0.02, K.water)]);
def('rel.confessional', 'Confessionário', 'religious', 'confessionario cabine igreja', [box(0, 0, 0, 1.2, 2.2, 1.2, K.woodD), prism(0, 2.2, 0, 1.3, 0.35, 1.3, K.wood), box(0, 0.9, 0.601, 0.4, 0.9, 0.01, K.black)]);
def('rel.icon', 'Ícone na parede', 'religious', 'icone quadro santo parede', [box(0, 0, 0, 0.5, 0.7, 0.05, K.gold), box(0, 0.05, 0.03, 0.4, 0.6, 0.01, K.redD)], { y0: 1.5, collider: 'none' });

// ------------------------------------------------------------ Contenção paranormal
def('cont.cell', 'Cela de contenção', 'containment', 'cela jaula prisao contencao', [box(0, 0, 0, 3, 0.1, 3, K.metalD), ...[-1.5, 1.5].flatMap((x) => [-1.5, 1.5].map((z) => box(x, 0, z, 0.1, 2.6, 0.1, K.metalD))), box(0, 2.5, 0, 3.1, 0.1, 3.1, K.metalD), ...[-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2].flatMap((x) => [box(x, 0.1, 1.5, 0.04, 2.4, 0.04, K.metal), box(x, 0.1, -1.5, 0.04, 2.4, 0.04, K.metal)])], { collider: 'none' });
def('cont.chamber', 'Câmara de vidro', 'containment', 'camara vidro contencao tubo', [cyl(0, 0, 0, 1.5, 0.2, K.metalD), cyl(0, 0.2, 0, 1.4, 2.8, K.glass, { glass: true }), cyl(0, 3.0, 0, 1.5, 0.2, K.metalD)]);
def('cont.safe', 'Cofre', 'containment', 'cofre seguranca', [box(0, 0, 0, 0.9, 1.1, 0.8, K.metalD), cyl(0.15, 0.55, 0.41, 0.1, 0.03, K.metalL, { rx: 90 }), box(-0.3, 0.3, 0.405, 0.15, 0.4, 0.01, K.black)]);
def('cont.vault_door', 'Porta blindada', 'containment', 'porta blindada cofre bunker', [box(0, 0, 0, 1.6, 2.5, 0.4, K.metalD), cyl(0.2, 1.2, 0.2, 0.3, 0.1, K.metalL, { rx: 90 }), ...[0.3, 1.0, 1.8].map((y) => box(-0.7, y, 0.21, 0.15, 0.2, 0.1, K.metal))]);
def('cont.vessel', 'Recipiente selado', 'containment', 'recipiente contencao tubo selado', [cyl(0, 0, 0, 0.5, 1.8, K.lead), cyl(0, 1.8, 0, 0.42, 0.1, K.metalD), box(0.4, 0.7, 0, 0.12, 0.2, 0.12, K.yellow)]);
def('cont.lead_coffin', 'Caixão de chumbo', 'containment', 'caixao chumbo selado radiacao', [box(0, 0, 0, 0.9, 0.7, 2.2, K.lead), box(0, 0.7, 0, 0.95, 0.06, 2.25, K.metalD), ...[-0.7, 0, 0.7].map((z) => box(0, 0.3, z, 0.96, 0.08, 0.1, K.metalD))]);
def('cont.platform', 'Plataforma de observação', 'containment', 'plataforma observacao passarela mirante', [box(0, 0, 0, 4, 1.0, 3, K.concrete), box(0, 1.0, -1.45, 4, 1.0, 0.08, K.glass, { glass: true }), box(0, 1.0, 1.45, 4, 0.9, 0.05, K.metal)]);
def('cont.restraint_table', 'Mesa de contenção', 'containment', 'mesa contencao algemas amarras', [box(0, 0.85, 0, 1.0, 0.1, 2.2, K.metalD), ...[-0.5, 0.5].flatMap((x) => [-0.8, 0, 0.8].map((z) => box(x * 0.9, 0.95, z, 0.1, 0.05, 0.08, K.rust))), box(0, 0, 0, 0.3, 0.85, 1.4, K.metal)]);
def('cont.warning_light', 'Luz de alerta', 'containment', 'luz alerta sirene emergencia', [cyl(0, 0, 0, 0.1, 0.05, K.metalD), cyl(0, 0.05, 0, 0.08, 0.12, K.red)], { y0: 2.4, collider: 'none' });
def('cont.glass_panel', 'Painel de vidro', 'containment', 'vidro painel observacao janela', [box(0, 0, 0, 2, 2.4, 0.06, K.glass, { glass: true }), box(0, 0, 0, 2.06, 0.06, 0.1, K.metalD), box(0, 2.34, 0, 2.06, 0.06, 0.1, K.metalD)]);

// ------------------------------------------------------------ Natureza
def('nat.pine', 'Pinheiro', 'nature', 'arvore pinheiro conifera floresta', [cyl(0, 0, 0, 0.18, 2.2, K.bark), cone(0, 1.6, 0, 1.4, 3.2, K.greenD), cone(0, 3.2, 0, 1.1, 2.8, K.green), cone(0, 4.8, 0, 0.75, 2.4, K.greenD)]);
def('nat.oak', 'Carvalho', 'nature', 'arvore carvalho folhosa floresta', [cyl(0, 0, 0, 0.35, 3, K.bark), sph(0, 2.6, 0, 2.2, K.leaf), sph(-1.2, 3.0, 0.5, 1.4, K.green), sph(1.1, 3.1, -0.4, 1.5, K.leaf)]);
def('nat.birch', 'Bétula', 'nature', 'arvore betula branca floresta', [cyl(0, 0, 0, 0.14, 5, K.white), sph(0, 3.8, 0, 1.6, K.green)]);
def('nat.dead_tree', 'Árvore morta', 'nature', 'arvore morta seca galhos', [cyl(0, 0, 0, 0.2, 4.5, K.bark), cyl(0.4, 2.8, 0, 0.07, 1.6, K.bark, { rz: -45 }), cyl(-0.4, 3.3, 0, 0.06, 1.3, K.bark, { rz: 50 })]);
def('nat.bush', 'Arbusto', 'nature', 'arbusto moita vegetacao', [sph(0, 0, 0, 0.7, K.leaf), sph(0.45, 0, 0.2, 0.5, K.green)]);
def('nat.rock_s', 'Pedra pequena', 'nature', 'pedra rocha pequena', [sph(0, 0, 0, 0.3, K.stone), sph(0.25, 0, 0.1, 0.18, K.concrete)]);
def('nat.rock_l', 'Rocha grande', 'nature', 'pedra rocha grande rochedo', [sph(0, 0, 0, 1.3, K.stone), sph(0.9, 0, 0.5, 0.8, K.concrete), prism(-0.6, 0, -0.6, 1.2, 0.9, 1.0, K.stone)]);
def('nat.boulder', 'Matacão', 'nature', 'pedra matacao grande bloqueio', [sph(0, 0, 0, 2, K.stone), sph(1.6, 0, -0.6, 1.2, K.concrete)]);
def('nat.log', 'Tronco caído', 'nature', 'tronco caido madeira floresta', [cyl(0, 0.3, 0, 0.3, 4, K.bark, { rz: 90 }), cyl(2, 0.3, 0, 0.26, 0.02, K.woodL, { rz: 90 })], { collider: 'box' });
def('nat.stump', 'Toco', 'nature', 'toco tronco cortado', [cyl(0, 0, 0, 0.3, 0.5, K.bark), cyl(0, 0.5, 0, 0.27, 0.02, K.woodL)]);
def('nat.fern', 'Samambaia', 'nature', 'samambaia vegetacao rasteira planta', [cone(0, 0, 0, 0.45, 0.6, K.green), cone(0.25, 0, 0.1, 0.3, 0.45, K.leaf)], { collider: 'none' });
def('nat.grass', 'Capim', 'nature', 'capim grama vegetacao rasteira', [cone(0, 0, 0, 0.3, 0.5, K.grass), cone(0.2, 0, 0.1, 0.2, 0.4, K.grass)], { collider: 'none' });
def('nat.mushroom', 'Cogumelos', 'nature', 'cogumelo fungo pequeno', [cyl(0, 0, 0, 0.03, 0.12, K.white), sph(0, 0.1, 0, 0.1, K.rust)], { collider: 'none' });
def('nat.debris', 'Entulho', 'nature', 'entulho escombros detritos', [box(0, 0, 0, 0.9, 0.3, 0.6, K.concrete, { ry: 20 }), box(0.4, 0, 0.3, 0.5, 0.2, 0.4, K.stone, { ry: -30 }), box(-0.3, 0.2, 0, 0.4, 0.15, 0.2, K.rust, { ry: 50 })]);
def('nat.hedge', 'Cerca viva', 'nature', 'cerca viva sebe arbusto', [box(0, 0, 0, 2.5, 1.2, 0.7, K.leaf)]);

// ------------------------------------------------------------ Escala humana (manequins)
const person = (c: string, h: number, w: number): Part[] => [
  box(-w * 0.2, 0, 0, w * 0.2, h * 0.47, w * 0.18, c), box(w * 0.2, 0, 0, w * 0.2, h * 0.47, w * 0.18, c),
  box(0, h * 0.47, 0, w * 0.55, h * 0.3, w * 0.28, c), box(-w * 0.38, h * 0.5, 0, w * 0.14, h * 0.27, w * 0.16, c), box(w * 0.38, h * 0.5, 0, w * 0.14, h * 0.27, w * 0.16, c),
  sph(0, h - w * 0.4, 0, w * 0.2, c),
];
def('scale.man', 'Manequim adulto 1,75 m', 'scale', 'manequim humano escala silhueta referencia', person('#9d8068', 1.75, 0.55));
def('scale.woman', 'Manequim adulta 1,65 m', 'scale', 'manequim humana escala silhueta mulher', person('#9d8068', 1.65, 0.48));
def('scale.child', 'Manequim criança 1,2 m', 'scale', 'manequim crianca escala silhueta', person('#9d8068', 1.2, 0.38));
def('scale.cube1', 'Cubo de 1 m', 'scale', 'cubo escala metro referencia medida', [box(0, 0, 0, 1, 1, 1, K.woodL)]);

// ------------------------------------------------------------ Gameplay
const star = (c: string) => [cyl(0, 0, 0, 0.18, 0.04, K.metalD), box(0, 0.04, 0, 0.06, 0.9, 0.06, c), prism(0, 0.9, 0, 0.5, 0.3, 0.02, c)];
def('gp.enemy', 'Inimigo (proxy)', 'gameplay', 'inimigo criatura proxy ameaca', [...person('#8f3b2c', 1.8, 0.6)], { gameplay: 'enemy', collider: 'none', params: [radiusParam(1.0), { key: 'range', label: 'Alcance de detecção (m)', type: 'number', def: 8, min: 1, max: 40, step: 0.5 }, { key: 'type', label: 'Tipo', type: 'text', def: 'Padrão' }] });
def('gp.enemy_big', 'Inimigo grande (proxy)', 'gameplay', 'inimigo grande boss brutamontes', [...person('#6a2a20', 2.6, 1.0)], { gameplay: 'enemy', collider: 'none', params: [radiusParam(1.6), { key: 'range', label: 'Alcance de detecção (m)', type: 'number', def: 10, min: 1, max: 40, step: 0.5 }, { key: 'type', label: 'Tipo', type: 'text', def: 'Grande' }] });
def('gp.ammo', 'Munição', 'gameplay', 'municao recurso suprimento balas', [box(0, 0, 0, 0.3, 0.15, 0.2, K.yellow), box(0, 0.15, 0, 0.28, 0.02, 0.18, K.redD)], { gameplay: 'pickup', collider: 'none', params: [{ key: 'label', label: 'Item', type: 'text', def: 'Munição' }] });
def('gp.health', 'Item de cura', 'gameplay', 'cura vida kit medico recurso', [box(0, 0, 0, 0.3, 0.12, 0.22, K.white), box(0, 0.12, 0, 0.1, 0.01, 0.03, K.red), box(0, 0.12, 0, 0.03, 0.01, 0.1, K.red)], { gameplay: 'pickup', collider: 'none', params: [{ key: 'label', label: 'Item', type: 'text', def: 'Kit de cura' }] });
def('gp.note', 'Documento', 'gameplay', 'documento nota arquivo coletavel lore', [box(0, 0, 0, 0.25, 0.01, 0.32, K.cloth, { ry: 10 }), box(0.02, 0.01, 0, 0.2, 0.005, 0.26, K.white, { ry: -6 })], { gameplay: 'pickup', collider: 'none', params: [{ key: 'label', label: 'Título', type: 'text', def: 'Documento' }] });
def('gp.checkpoint', 'Checkpoint', 'gameplay', 'checkpoint salvar progresso', [cyl(0, 0, 0, 0.35, 0.05, K.metalD), cyl(0, 0.05, 0, 0.05, 1.0, K.metal), cyl(0, 1.05, 0, 0.14, 0.2, K.yellow)], { gameplay: 'checkpoint', collider: 'none', params: [radiusParam(1.2)] });
def('gp.key', 'Chave', 'gameplay', 'chave key porta item', [cyl(0, 0.0, 0, 0.07, 0.015, K.gold), box(0, 0.0, 0.15, 0.025, 0.012, 0.22, K.gold), box(0.03, 0.0, 0.24, 0.05, 0.012, 0.03, K.gold)], { gameplay: 'key', collider: 'none', y0: 0.9, params: [codeParam, labelParam] });
def('gp.card', 'Cartão de acesso', 'gameplay', 'cartao acesso id item', [box(0, 0, 0, 0.1, 0.012, 0.16, K.blue), box(0, 0.012, -0.04, 0.1, 0.004, 0.025, K.black)], { gameplay: 'card', collider: 'none', y0: 0.9, params: [codeParam, labelParam] });
def('gp.fuse', 'Fusível', 'gameplay', 'fusivel item energia', [cyl(0, 0, 0, 0.03, 0.14, K.glass, { glass: true }), cyl(0, 0, 0, 0.032, 0.02, K.gold), cyl(0, 0.12, 0, 0.032, 0.02, K.gold)], { gameplay: 'fuse', collider: 'none', y0: 0.9, params: [codeParam, labelParam] });
def('gp.switch', 'Interruptor', 'gameplay', 'interruptor alavanca botao liga', [box(0, 0, 0, 0.25, 0.4, 0.06, K.metalD), box(0, 0.12, 0.05, 0.04, 0.2, 0.04, K.red, { rx: -30 })], { gameplay: 'switch', collider: 'none', y0: 1.2, params: [labelParam] });
def('gp.generator', 'Gerador (lógico)', 'gameplay', 'gerador energia ligar fusivel', [box(0, 0.1, 0, 1.6, 1.0, 0.9, K.olive), box(0, 0, 0, 1.7, 0.1, 1.0, K.metalD), box(0.5, 1.1, 0, 0.2, 0.35, 0.2, K.metalD)], { gameplay: 'generator', collider: 'box', params: [labelParam] });
def('gp.trigger', 'Gatilho (zona)', 'gameplay', 'gatilho zona area evento trigger', [cyl(0, 0, 0, 0.5, 0.04, K.yellow, { glass: true })], { gameplay: 'trigger', collider: 'none', params: [radiusParam(2), labelParam] });
def('gp.objective', 'Objetivo', 'gameplay', 'objetivo meta missao alvo', star(K.gold), { gameplay: 'objective', collider: 'none', params: [{ key: 'label', label: 'Objetivo', type: 'text', def: 'Objetivo', }, radiusParam(1.0)] });
def('gp.exit', 'Saída', 'gameplay', 'saida fim fase exit', [box(-0.55, 0, 0, 0.12, 2.3, 0.2, K.green), box(0.55, 0, 0, 0.12, 2.3, 0.2, K.green), box(0, 2.3, 0, 1.22, 0.12, 0.2, K.green), box(0, 0, 0, 1.0, 0.05, 0.3, K.greenD)], { gameplay: 'exit', collider: 'none', params: [labelParam, radiusParam(1.2)] });
def('gp.elevator', 'Elevador', 'gameplay', 'elevador conexao pavimentos lift', [box(0, 0, 0, 1.8, 0.1, 1.8, K.metalD), box(-0.85, 0.1, 0, 0.08, 2.2, 1.7, K.metal), box(0.85, 0.1, 0, 0.08, 2.2, 1.7, K.metal), box(0, 0.1, -0.85, 1.7, 2.2, 0.08, K.metal)], { gameplay: 'elevator', collider: 'none', params: [{ key: 'link', label: 'Elevador de destino (ID)', type: 'text', def: '' }, labelParam] });
def('gp.block', 'Bloqueio', 'gameplay', 'bloqueio barricada entulho obstaculo', [box(0, 0, 0, 2, 1.8, 0.5, K.woodD), box(0, 0.2, 0.26, 1.8, 0.15, 0.05, K.wood, { rz: 12 }), box(0, 1.0, 0.26, 1.8, 0.15, 0.05, K.wood, { rz: -9 })], { gameplay: 'block', collider: 'box', params: [labelParam] });
def('gp.shortcut', 'Atalho (barricada)', 'gameplay', 'atalho passagem destrancavel barricada', [box(0, 0, 0, 1.2, 2.1, 0.12, K.rust), box(0, 1.0, 0.07, 1.0, 0.1, 0.03, K.metalD)], { gameplay: 'shortcut', collider: 'box', params: [labelParam] });

export const PROP_DEFS: readonly PropDef[] = DEFS;
export const PROP_BY_ID: Record<string, PropDef> = Object.fromEntries(DEFS.map((d) => [d.id, d]));
export const getDef = (id: string): PropDef | undefined => PROP_BY_ID[id];

export function searchProps(q: string, cat?: PropCategory | 'all'): PropDef[] {
  const terms = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  return DEFS.filter((d) => {
    if (cat && cat !== 'all' && d.category !== cat) return false;
    if (!terms.length) return true;
    const hay = `${d.name} ${d.id} ${d.tags.join(' ')} ${CATEGORY_LABEL[d.category]}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return terms.every((t) => hay.includes(t));
  });
}

const GP_LABEL: Record<GameplayKind, string> = {
  key: 'Chave', card: 'Cartão', fuse: 'Fusível', switch: 'Interruptor', generator: 'Gerador', trigger: 'Gatilho', checkpoint: 'Checkpoint',
  objective: 'Objetivo', exit: 'Saída', elevator: 'Elevador', block: 'Bloqueio', shortcut: 'Atalho', pickup: 'Coletável', enemy: 'Inimigo',
};
export const gameplayLabel = (k: GameplayKind) => GP_LABEL[k];

/** Quais objetos de gameplay podem ser exigidos por uma porta/gerador/bloqueio. */
export const REQUIRABLE: GameplayKind[] = ['key', 'card', 'fuse', 'switch', 'generator', 'trigger', 'objective', 'block', 'shortcut', 'checkpoint'];
/** Quais gameplay props podem ter condições próprias. */
export const HAS_REQUIRES: GameplayKind[] = ['generator', 'block', 'shortcut', 'switch', 'exit', 'objective'];

// ---------------------------------------------------------------- miniaturas (desenhadas, não simuladas)
const thumbCache = new Map<string, string>();
export function propThumbnail(d: PropDef, size = 64): string {
  const key = `${d.id}:${size}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const [w, h] = d.size;
  const sc = (size - 10) / Math.max(w, h);
  const ox = size / 2, oy = size - 5;
  const order = d.parts.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z || a.p.y - b.p.y);
  for (const { p } of order) {
    g.globalAlpha = p.glass ? 0.55 : 1;
    g.fillStyle = p.c;
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.lineWidth = 1;
    const b = partBounds(p);
    const x0 = ox + b.min[0] * sc, x1 = ox + b.max[0] * sc;
    const y0 = oy - b.max[1] * sc, y1 = oy - b.min[1] * sc;
    if (p.s === 'sph') { g.beginPath(); g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else if (p.s === 'cone' || p.s === 'prism') { g.beginPath(); g.moveTo(x0, y1); g.lineTo((x0 + x1) / 2, y0); g.lineTo(x1, y1); g.closePath(); g.fill(); g.stroke(); }
    else { g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1); }
  }
  g.globalAlpha = 1;
  const url = cv.toDataURL('image/png');
  thumbCache.set(key, url);
  return url;
}
