import { useUI, type ToolId } from '../editor/ui';
import { Icon } from './Icon';

interface T { id: ToolId; label: string; icon: string; tip: string; key?: string; place?: Record<string, unknown> }
const GROUPS: { cap: string; tools: T[] }[] = [
  { cap: 'Editar', tools: [{ id: 'select', label: 'Selecionar', icon: 'select', tip: 'Selecionar, mover e redimensionar (Q)', key: 'Q' }] },
  { cap: 'Espaço', tools: [
    { id: 'room', label: 'Sala', icon: 'room', tip: 'Arraste para desenhar uma sala retangular' },
    { id: 'polyroom', label: 'Irregular', icon: 'polyroom', tip: 'Clique os vértices; Enter ou duplo clique fecha' },
    { id: 'corridor', label: 'Corredor', icon: 'corridor', tip: 'Arraste de um ponto a outro; largura no painel' },
    { id: 'wall', label: 'Parede', icon: 'wall', tip: 'Parede isolada' },
  ] },
  { cap: 'Aberturas', tools: [
    { id: 'door', label: 'Porta', icon: 'door', tip: 'Passe sobre uma parede e clique' },
    { id: 'window', label: 'Janela', icon: 'window', tip: 'Abertura com peitoril' },
    { id: 'arch', label: 'Arco', icon: 'arch', tip: 'Passagem sem folha — também une dois ambientes' },
    { id: 'hole', label: 'Vão', icon: 'hole', tip: 'Buraco no piso (poço, pé-direito duplo)' },
  ] },
  { cap: 'Vertical', tools: [
    { id: 'stair', label: 'Escada', icon: 'stair', tip: 'Escada ou rampa que liga pavimentos', place: { stairKind: 'stair' } },
  ] },
  { cap: 'Nível', tools: [
    { id: 'start', label: 'Início', icon: 'start', tip: 'Ponto onde o jogador começa o playtest' },
    { id: 'note', label: 'Nota', icon: 'note', tip: 'Anotação de texto na planta' },
    { id: 'measure', label: 'Medir', icon: 'measure', tip: 'Distância entre dois pontos' },
  ] },
];

export function ToolBar() {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  return (
    <nav className="toolbar" aria-label="Ferramentas">
      {GROUPS.map((g, i) => (
        <div key={g.cap}>
          {i > 0 && <div className="tool-sep" />}
          <div className="tool-cap">{g.cap}</div>
          {g.tools.map((t) => (
            <button key={t.id + t.label} className={`tool ${tool === t.id ? 'on' : ''}`} title={t.tip} aria-pressed={tool === t.id} onClick={() => setTool(t.id, t.place as never)}>
              <Icon name={t.icon} size={20} /><span>{t.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
