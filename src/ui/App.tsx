import { useEffect, useRef, type ReactNode } from 'react';
import { useUI, type RightTab } from '../editor/ui';
import { useScene } from '../editor/store';
import { TopBar } from './TopBar';
import { ToolBar } from './ToolBar';
import { StatusBar } from './StatusBar';
import { Library } from './Library';
import { Inspector } from './Inspector';
import { PlanView, planRef } from './PlanView';
import { View3D } from './View3D';
import { ContextMenu } from './ContextMenu';
import { Toasts, CommandPalette, HelpDialog, Onboarding } from './Overlays';
import { ProjectsDialog } from './ProjectsDialog';
import { SmartRoomsDialog } from './SmartRooms';
import { SketchSection } from './ProductionPanels';
import { ExportDialog } from './ExportDialog';
import { DialogHost, Section, TextRow, NumRow } from './fields';
import { handleKey, registerCommands } from '../editor/commands';
import { startAutosave, startup } from '../storage/session';
import { PANELS } from './panels';
import { Playtest } from '../playtest/Playtest';

function Splitter({ dir, onDelta }: { dir: 'v' | 'h'; onDelta: (d: number) => void }) {
  const drag = useRef<number | null>(null);
  return (
    <div className={dir === 'v' ? 'splitter-v' : 'splitter-h'} role="separator" aria-orientation={dir === 'v' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => { drag.current = dir === 'v' ? e.clientX : e.clientY; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (drag.current === null) return; const p = dir === 'v' ? e.clientX : e.clientY; onDelta(p - drag.current); drag.current = p; }}
      onPointerUp={() => { drag.current = null; }} />
  );
}

function ProjectPanel() {
  const p = useScene((s) => s.project);
  const patchMeta = useScene((s) => s.patchMeta);
  const ch = p.settings.character;
  const setCh = (k: keyof typeof ch, v: number | boolean) => useScene.getState().patchProject((d) => { (d.settings.character as unknown as Record<string, number | boolean>)[k] = v; });
  return (
    <>
      <Section title="Projeto">
        <TextRow label="Nome" value={p.name} onCommit={(v) => patchMeta({ name: v })} />
        <TextRow label="Descrição" multiline value={p.description} onCommit={(v) => patchMeta({ description: v })} />
        <TextRow label="Notas" multiline value={p.notes} onCommit={(v) => patchMeta({ notes: v })} />
        <div className="kv"><span>Atualizado</span><b>{new Date(p.updatedAt).toLocaleString('pt-BR')}</b></div>
        <div className="kv"><span>Esquema</span><b>v{p.schema}</b></div>
      </Section>
      <SketchSection />
      <Section title="Escala do personagem">
        <NumRow label="Altura" value={ch.height} unit="m" step={0.05} min={1} max={2.6} onCommit={(v) => setCh('height', v)} />
        <NumRow label="Altura dos olhos" value={ch.eyeHeight} unit="m" step={0.05} min={0.8} max={2.4} onCommit={(v) => setCh('eyeHeight', v)} />
        <NumRow label="Raio" value={ch.radius} unit="m" step={0.025} min={0.15} max={0.8} onCommit={(v) => setCh('radius', v)} />
        <NumRow label="Caminhada" value={ch.walkSpeed} unit="m/s" step={0.1} min={0.5} max={8} onCommit={(v) => setCh('walkSpeed', v)} />
        <NumRow label="Corrida" value={ch.runSpeed} unit="m/s" step={0.1} min={1} max={14} onCommit={(v) => setCh('runSpeed', v)} />
        <NumRow label="Degrau máx." value={ch.stepHeight} unit="m" step={0.05} min={0.05} max={0.8} onCommit={(v) => setCh('stepHeight', v)} />
        <NumRow label="Rampa máx." value={ch.maxSlopeDeg} unit="°" step={1} min={5} max={80} onCommit={(v) => setCh('maxSlopeDeg', v)} />
        <NumRow label="Campo de visão" value={ch.fov} unit="°" step={1} min={40} max={110} onCommit={(v) => setCh('fov', v)} />
        <div className="note">A planta mostra o espaço que o personagem ocupa. Ajuste aqui para testar passagens apertadas.</div>
      </Section>
    </>
  );
}

const BASE_TABS: { id: RightTab; label: string; body: () => ReactNode }[] = [
  { id: 'props', label: 'Propriedades', body: () => <Inspector /> },
  ...PANELS,
  { id: 'project', label: 'Projeto', body: () => <ProjectPanel /> },
];

export function App() {
  const ui = useUI();
  const ready = useRef(false);

  useEffect(() => {
    if (!ready.current) { ready.current = true; void startup().then(() => { if (useUI.getState().onboarding === 0) useUI.setState({ onboarding: 1 }); }); }
    registerCommands([]);
    const unsub = startAutosave();
    const onKey = (e: KeyboardEvent) => { handleKey(e, (ev) => planRef.ctl?.key(ev) ?? false); };
    window.addEventListener('keydown', onKey);
    const onUnload = (e: BeforeUnloadEvent) => { if (useScene.getState().dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => { unsub(); window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); };
  }, []);

  const tab = BASE_TABS.find((x) => x.id === ui.rightTab) ?? BASE_TABS[0];
  const edit = ui.mode === 'edit';
  const p = ui.panels;
  const setPanels = (patch: Partial<typeof p>) => useUI.setState((s) => ({ panels: { ...s.panels, ...patch } }));

  return (
    <div id="app">
      <TopBar />
      <div className="workspace">
        {edit && p.left && <ToolBar />}
        <div className="center">
          <div className="viewports">
            {edit && ui.view !== '3d' && <PlanView />}
            <View3D visible={edit && ui.view !== 'plan'} />
            {!edit && <Playtest />}
          </div>
          {edit && p.bottom && <><Splitter dir="h" onDelta={(d) => setPanels({ bottomH: Math.max(90, Math.min(520, p.bottomH - d)) })} /><Library /></>}
        </div>
        {edit && p.right && (
          <>
            <Splitter dir="v" onDelta={(d) => setPanels({ rightW: Math.max(260, Math.min(640, p.rightW - d)) })} />
            <aside className="right" style={{ width: p.rightW }}>
              <div className="tabs" role="tablist">
                {BASE_TABS.map((x) => <button key={x.id} role="tab" aria-selected={x.id === tab.id} className={`tab ${x.id === tab.id ? 'on' : ''}`} onClick={() => useUI.setState({ rightTab: x.id })}>{x.label}</button>)}
              </div>
              <div className="panel-body">{tab.body()}</div>
            </aside>
          </>
        )}
      </div>
      <StatusBar />
      <ContextMenu />
      <Toasts />
      <CommandPalette />
      <HelpDialog />
      <ProjectsDialog />
      <SmartRoomsDialog />
      <ExportDialog />
      <DialogHost />
      {edit && <Onboarding />}
    </div>
  );
}
