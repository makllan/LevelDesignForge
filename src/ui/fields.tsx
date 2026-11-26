import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { round } from '../core/math';

export function Row({ label, children, cols }: { label?: ReactNode; children: ReactNode; cols?: 'two' | 'three' }) {
  return <div className={`row ${cols ?? ''}`}><label>{label}</label>{children}</div>;
}

interface NumProps {
  value: number;
  onCommit: (v: number) => void;
  onScrub?: (v: number) => void;
  onScrubEnd?: () => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  title?: string;
}

/** Campo numérico: Enter/blur confirma; ↑↓ ajustam; arrastar o rótulo (scrub) é feito por <NumRow>. */
export function NumInput({ value, onCommit, step = 0.1, min, max, unit, decimals = 3, disabled, title }: NumProps) {
  const [txt, setTxt] = useState(fmt(value, decimals));
  const focus = useRef(false);
  useEffect(() => { if (!focus.current) setTxt(fmt(value, decimals)); }, [value, decimals]);
  const commit = (raw: string) => {
    const v = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(v)) { setTxt(fmt(value, decimals)); return; }
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (Math.abs(c - value) > 1e-9) onCommit(round(c, 5));
    setTxt(fmt(c, decimals));
  };
  return (
    <span className="num">
      <input
        className="in" value={txt} disabled={disabled} title={title} inputMode="decimal"
        onFocus={(e) => { focus.current = true; e.target.select(); }}
        onBlur={(e) => { focus.current = false; commit(e.target.value); }}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'Escape') { setTxt(fmt(value, decimals)); (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const k = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * step * (e.key === 'ArrowUp' ? 1 : -1);
            const cur = parseFloat(txt.replace(',', '.'));
            const base = Number.isFinite(cur) ? cur : value;
            const nv = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, round(base + k, 5)));
            setTxt(fmt(nv, decimals)); onCommit(nv);
          }
        }}
      />
      {unit && <span className="u">{unit}</span>}
    </span>
  );
}
const fmt = (v: number, d: number) => (Number.isFinite(v) ? String(round(v, d)).replace('.', ',') : '');

export function NumRow(p: NumProps & { label: ReactNode }) {
  const { label, onScrub, onScrubEnd, value, step = 0.1, min, max } = p;
  const drag = useRef<{ x: number; v: number } | null>(null);
  return (
    <div className="row">
      <label
        className={onScrub ? 'scrub' : ''}
        title={onScrub ? 'Arraste para ajustar' : undefined}
        onPointerDown={(e) => { if (!onScrub) return; drag.current = { x: e.clientX, v: value }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          if (!drag.current || !onScrub) return;
          const k = (e.shiftKey ? 5 : 1) * step * 0.25;
          const nv = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, round(drag.current.v + (e.clientX - drag.current.x) * k, 4)));
          onScrub(nv);
        }}
        onPointerUp={() => { if (drag.current) { drag.current = null; onScrubEnd?.(); } }}
      >{label}</label>
      <NumInput {...p} />
    </div>
  );
}

export function TextRow({ label, value, onCommit, placeholder, multiline }: { label: ReactNode; value: string; onCommit: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  const f = useRef(false);
  useEffect(() => { if (!f.current) setV(value); }, [value]);
  const common = {
    className: 'in txt', value: v, placeholder,
    onFocus: () => { f.current = true; }, onBlur: () => { f.current = false; if (v !== value) onCommit(v); },
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
  };
  return <Row label={label}>{multiline ? <textarea {...common} /> : <input {...common} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}</Row>;
}

export function SelectRow<T extends string>({ label, value, options, onChange }: { label: ReactNode; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <Row label={label}>
      <select className="in" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </Row>
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Row label={label}>
      <label className="toggle" title={hint}><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /><span style={{ fontSize: 12 }}>{value ? 'Sim' : 'Não'}</span></label>
    </Row>
  );
}

export function ColorRow({ label, value, onChange }: { label: ReactNode; value: string; onChange: (v: string) => void }) {
  return <Row label={label}><input className="color" type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#888888'} onChange={(e) => onChange(e.target.value)} /></Row>;
}

export function Section({ title, count, children, right }: { title: ReactNode; count?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return <div className="sec"><h4><span>{title}</span>{right ?? (count !== undefined && <span className="count">{count}</span>)}</h4>{children}</div>;
}

// ---------------------------------------------------------------- diálogos imperativos
type Dlg =
  | { kind: 'text'; label: string; def: string; resolve: (v: string | null) => void }
  | { kind: 'number'; label: string; def: number; resolve: (v: number | null) => void }
  | { kind: 'confirm'; label: string; detail?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void };

export const useDialog = create<{ cur: Dlg | null; set: (d: Dlg | null) => void }>((set) => ({ cur: null, set: (d) => set({ cur: d }) }));

export const askText = (label: string, def = '') => new Promise<string | null>((resolve) => useDialog.getState().set({ kind: 'text', label, def, resolve }));
export const askNumber = (label: string, def = 1) => new Promise<number | null>((resolve) => useDialog.getState().set({ kind: 'number', label, def, resolve }));
export const confirmDialog = (label: string, detail?: string, ok = 'Confirmar', danger = true) => new Promise<boolean>((resolve) => useDialog.getState().set({ kind: 'confirm', label, detail, ok, danger, resolve }));

export function DialogHost() {
  const d = useDialog((s) => s.cur);
  const [v, setV] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (d) { setV(d.kind === 'text' ? d.def : d.kind === 'number' ? String(d.def).replace('.', ',') : ''); setTimeout(() => ref.current?.select(), 20); } }, [d]);
  if (!d) return null;
  const close = (result: string | number | boolean | null) => {
    useDialog.getState().set(null);
    if (d.kind === 'text') d.resolve(result as string | null);
    else if (d.kind === 'number') d.resolve(result as number | null);
    else d.resolve(!!result);
  };
  const ok = () => {
    if (d.kind === 'text') close(v.trim() || null);
    else if (d.kind === 'number') { const n = parseFloat(v.replace(',', '.')); close(Number.isFinite(n) ? n : null); }
    else close(true);
  };
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(d.kind === 'confirm' ? false : null); }}>
      <div className="dialog" style={{ width: 400 }} onKeyDown={(e) => { if (e.key === 'Escape') close(d.kind === 'confirm' ? false : null); if (e.key === 'Enter') ok(); }}>
        <header><span>{d.kind === 'confirm' ? 'Confirmar' : 'Informe'}</span></header>
        <div className="body">
          <div style={{ marginBottom: 10 }}>{d.label}</div>
          {d.kind === 'confirm' ? (d.detail && <div className="note">{d.detail}</div>) : <input ref={ref} className="in txt" value={v} onChange={(e) => setV(e.target.value)} autoFocus />}
        </div>
        <footer>
          <button className="btn" onClick={() => close(d.kind === 'confirm' ? false : null)}>Cancelar</button>
          <button className={`btn ${d.kind === 'confirm' && d.danger ? 'danger' : 'primary'}`} onClick={ok} autoFocus={d.kind === 'confirm'}>{d.kind === 'confirm' ? d.ok : 'OK'}</button>
        </footer>
      </div>
    </div>
  );
}
