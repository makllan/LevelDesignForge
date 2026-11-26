/** Modelos de projeto. Cada um é uma função que preenche uma Scene via as mesmas ações do editor. */
import { emptyProject } from '../core/defaults';
import type { Project } from '../core/types';
import { adoptProject } from '../storage/session';
import { useScene } from '../editor/store';
import { confirmDialog } from '../ui/fields';
import { useUI } from '../editor/ui';
import { buildBunker } from './bunker';
import { buildForest } from './forest';
import { buildFacility } from './facility';

export interface TemplateInfo { id: string; name: string; description: string; meta: string; build: () => Project }

export const TEMPLATES: TemplateInfo[] = [
  { id: 'bunker', name: 'Núcleo do bunker', description: 'Cenário de validação: cadeia de chave, fusível, gerador e cartão; atalho barricado; descida ao subsolo.', meta: '2 pavimentos · 8 ambientes · 7 portas', build: buildBunker },
  { id: 'forest', name: 'O silêncio da floresta', description: 'Terreno procedural, trilha, mais de 600 árvores instanciadas e uma cabana trancada.', meta: 'Paisagem · terreno 140 m', build: buildForest },
  { id: 'facility', name: 'Instalação subterrânea', description: 'Superfície e dois subsolos ligados por escadas; cartão, alavanca, chave e elevador.', meta: '3 pavimentos · escadas', build: buildFacility },
  { id: 'blank', name: 'Projeto vazio', description: 'Um pavimento, nenhum ambiente. Comece do zero.', meta: '1 pavimento', build: () => emptyProject('Projeto sem título') },
];

export function registerTemplate(t: TemplateInfo) { if (!TEMPLATES.some((x) => x.id === t.id)) TEMPLATES.push(t); }

export async function loadTemplate(id: string): Promise<boolean> {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return false;
  if (useScene.getState().dirty && !(await confirmDialog('Há alterações não salvas.', 'Abrir um modelo substitui o projeto atual.', 'Descartar e abrir'))) return false;
  adoptProject(t.build(), { markClean: false });
  useUI.getState().toast(`Modelo “${t.name}” aberto.`, 'ok');
  return true;
}
