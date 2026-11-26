import { useEffect, useMemo, useRef, useState } from 'react';
import { useUI, setOnboarding } from '../editor/ui';
import { allCommands, runCommand } from '../editor/commands';
import { Icon } from './Icon';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return <div className="toasts" aria-live="polite">{toasts.map((x) => <div key={x.id} className={`toast ${x.kind}`} onClick={() => useUI.getState().dismissToast(x.id)}>{x.text}</div>)}</div>;
}

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const terms = norm(q).split(/\s+/).filter(Boolean);
    return allCommands().filter((c) => (!c.enabled || c.enabled()) && terms.every((t) => norm(`${c.label} ${c.group}`).includes(t))).slice(0, 60);
  }, [q, open]);
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => ref.current?.focus(), 10); } }, [open]);
  useEffect(() => setIdx(0), [q]);
  if (!open) return null;
  const close = () => useUI.setState({ paletteOpen: false });
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog palette" onKeyDown={(e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(list.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && list[idx]) { close(); setTimeout(() => runCommand(list[idx].id), 0); }
      }}>
        <input ref={ref} placeholder="Digite um comando… (sala, porta, salvar, playtest)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="results">
          {list.map((c, i) => (
            <button key={c.id} className={`pal-item ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => { close(); setTimeout(() => runCommand(c.id), 0); }}>
              <span className="grp">{c.group}</span><span className="grow">{c.label}</span>{c.shortcut && <kbd>{c.shortcut}</kbd>}
            </button>
          ))}
          {!list.length && <div className="empty">Nenhum comando encontrado.</div>}
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+S', 'Salvar'], ['Ctrl+Z / Ctrl+Shift+Z', 'Desfazer / refazer'], ['Ctrl+C / Ctrl+V / Ctrl+D', 'Copiar / colar / duplicar'],
  ['Delete', 'Excluir seleção'], ['Ctrl+A', 'Selecionar tudo no pavimento'], ['Ctrl+G', 'Agrupar'], ['Q', 'Selecionar'], ['W / E / R', 'Mover / girar / escalar (gizmo 3D)'],
  ['F', 'Focar seleção'], ['Home', 'Enquadrar tudo'], ['H / Alt+H', 'Ocultar / mostrar tudo'], ['I', 'Isolar seleção'], ['F5', 'Iniciar / sair do playtest'],
  ['Esc', 'Cancelar ferramenta, limpar seleção ou sair do playtest'], ['Ctrl+K', 'Paleta de comandos'], ['Espaço + arrastar', 'Mover a planta'], ['Roda', 'Zoom'],
  ['Shift', 'Trava ortogonal ao desenhar / soma à seleção'], ['Alt', 'Desliga o snap enquanto arrasta'], ['Enter / duplo clique', 'Fechar sala irregular ou caminho'],
  [', e .', 'Girar objeto antes de posicioná-lo'], ['Botão direito (3D)', 'Orbitar; botão do meio: mover'], ['WASD + botão direito', 'Câmera livre (modo Livre)'],
  ['E / clique', 'Interagir no playtest'], ['Shift', 'Correr no playtest'], ['V', 'Alternar 1ª/3ª pessoa no playtest'], ['R', 'Reiniciar o playtest'], ['T', 'Teletransportar para o ponto de debug'],
];
export function HelpDialog() {
  const open = useUI((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useUI.setState({ helpOpen: false });
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <div className="dialog wide" tabIndex={-1}>
        <header><span>Atalhos e gestos</span><button className="btn icon sm" onClick={close}><Icon name="close" /></button></header>
        <div className="body" style={{ columns: 2, columnGap: 28 }}>
          {SHORTCUTS.map(([k, d]) => <div key={k + d} className="kv" style={{ breakInside: 'avoid' }}><span>{d}</span><b style={{ fontSize: 11 }}>{k}</b></div>)}
        </div>
      </div>
    </div>
  );
}

const STEPS: { title: string; body: string }[] = [
  { title: '1 · Desenhe uma sala', body: 'Escolha a ferramenta **Sala** à esquerda e arraste na planta. Paredes, piso e teto surgem juntos, e o 3D acompanha na hora.' },
  { title: '2 · Abra uma porta', body: 'Escolha **Porta** e passe o cursor sobre uma parede. O vão é real na geometria. Clique para inserir; use o painel direito para trancá-la ou exigir uma chave.' },
  { title: '3 · Posicione um objeto', body: 'Na biblioteca embaixo, arraste uma **mesa** para a planta ou para o 3D. Móveis encostam sozinhos na parede mais próxima.' },
  { title: '4 · Marque o início e teste', body: 'Use **Início** para pôr o jogador no mapa e aperte **F5**. Caminhe com WASD, interaja com E e volte ao editor com Esc.' },
];
export function Onboarding() {
  const step = useUI((s) => s.onboarding);
  if (step <= 0 || step > STEPS.length) return null;
  const st = STEPS[step - 1];
  const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p));
  return (
    <div className="onboard">
      <header><span>Primeiros passos</span><button className="btn icon sm" title="Dispensar" onClick={() => setOnboarding(99)}><Icon name="close" size={14} /></button></header>
      <div className="body"><div style={{ fontFamily: 'var(--f-cond)', fontSize: 17, color: 'var(--paper)', marginBottom: 4 }}>{st.title}</div>{bold(st.body)}</div>
      <footer>
        <div className="steps">{STEPS.map((_, i) => <i key={i} className={i < step ? 'on' : ''} />)}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {step > 1 && <button className="btn sm" onClick={() => setOnboarding(step - 1)}>Voltar</button>}
          <button className="btn sm primary" onClick={() => setOnboarding(step >= STEPS.length ? 99 : step + 1)}>{step >= STEPS.length ? 'Concluir' : 'Próximo'}</button>
        </div>
      </footer>
    </div>
  );
}
