import { useEffect, useRef, useState } from 'react';
import { useUI } from '../editor/ui';
import { Icon } from './Icon';
import { importFile, openStored, removeStored, storedProjects } from '../storage/session';
import { confirmDialog } from './fields';
import { TEMPLATES, loadTemplate } from '../templates';

type Rec = Awaited<ReturnType<typeof storedProjects>>[number];

export function ProjectsDialog() {
  const dialog = useUI((s) => s.dialog);
  const [list, setList] = useState<Rec[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => { storedProjects().then(setList).catch(() => setList([])); };
  useEffect(() => { if (dialog === 'projects') refresh(); }, [dialog]);
  if (dialog !== 'projects') return null;
  const close = () => useUI.setState({ dialog: null });
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <div className="dialog wide" style={{ width: 760, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <header><span>Projetos e modelos</span><button className="btn icon sm" onClick={close} aria-label="Fechar"><Icon name="close" /></button></header>
        <div className="body" style={{ overflowY: 'auto' }}>
          <div className="sec" style={{ padding: '0 0 12px', border: 'none' }}>
            <h4 style={{ margin: '0 0 8px', fontFamily: 'var(--f-cond)', letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 11, color: 'var(--text-3)' }}>Começar de um modelo</h4>
            <div className="lib-card-grid">
              {TEMPLATES.map((t) => (
                <button key={t.id} className="tpl" onClick={async () => { if (await loadTemplate(t.id)) close(); }}>
                  <h5>{t.name}</h5><p>{t.description}</p><div className="meta">{t.meta}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="hr" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 8px' }}>
            <h4 style={{ margin: 0, fontFamily: 'var(--f-cond)', letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 11, color: 'var(--text-3)' }}>Salvos neste computador</h4>
            <div>
              <input ref={file} type="file" accept=".json,.ordoforge.json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && (await importFile(f))) close(); }} />
              <button className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" size={13} />Importar arquivo…</button>
            </div>
          </div>
          {list === null && <div className="empty">Carregando…</div>}
          {list?.length === 0 && <div className="empty"><h3>Nada salvo ainda</h3>Use Ctrl+S para guardar o projeto aberto.</div>}
          {list?.map((p) => (
            <div key={p.id} className="li" style={{ gap: 10, padding: '6px 4px' }}>
              {p.thumbnail ? <img src={p.thumbnail} alt="" style={{ width: 64, height: 40, objectFit: 'cover', border: '1px solid var(--line)' }} /> : <div style={{ width: 64, height: 40, border: '1px solid var(--line)', background: 'var(--panel-2)' }} />}
              <div className="grow"><div style={{ fontFamily: 'var(--f-cond)', fontSize: 15 }}>{p.name}</div><div style={{ color: 'var(--text-3)', fontSize: 11 }}>{new Date(p.updatedAt).toLocaleString('pt-BR')}</div></div>
              <button className="btn sm" onClick={async () => { if (await openStored(p.id)) close(); }}>Abrir</button>
              <button className="btn sm danger icon" title="Excluir do computador" onClick={async () => { if (await confirmDialog(`Excluir “${p.name}” deste computador?`, 'Não dá para desfazer. Exporte o arquivo antes se quiser guardar uma cópia.', 'Excluir')) { await removeStored(p.id); refresh(); } }}><Icon name="trash" size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
