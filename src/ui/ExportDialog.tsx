import { useState } from 'react';
import { useUI } from '../editor/ui';
import { getProject } from '../editor/store';
import { Icon } from './Icon';
import { downloadBlob, downloadText, exportProjectFile, fileNameFor } from '../storage/db';
import { dimensionReportCsv, planSvg, progressionJson, propsListCsv, floorList } from '../export/exporters';
import { rendererRef } from './View3D';

const slug = (n: string) => fileNameFor(n).replace('.ordoforge.json', '');

async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('SVG inválido')); img.src = url; });
  const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale;
  const g = c.getContext('2d')!; g.scale(scale, scale); g.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG falhou'))), 'image/png'));
}

async function exportGlb(name: string) {
  const r = rendererRef.r;
  if (!r) throw new Error('Abra a vista 3D para exportar o modelo.');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const ex = new GLTFExporter();
  const buf = await new Promise<ArrayBuffer>((res, rej) => ex.parse(r.root, (o) => res(o as ArrayBuffer), rej, { binary: true, onlyVisible: true }));
  downloadBlob(`${name}.glb`, new Blob([buf], { type: 'model/gltf-binary' }));
}

export function ExportDialog() {
  const dialog = useUI((s) => s.dialog);
  const floorId = useUI((s) => s.floorId);
  const [busy, setBusy] = useState<string | null>(null);
  if (dialog !== 'export') return null;
  const close = () => useUI.setState({ dialog: null });
  const p = getProject();
  const name = slug(p.name);
  const floors = floorList(p.scene);
  const fid = floors.some((f) => f.id === floorId) ? floorId : floors[0]?.id;
  const run = async (key: string, fn: () => void | Promise<void>) => {
    setBusy(key);
    try { await fn(); useUI.getState().toast('Arquivo gerado.', 'ok'); } catch (e) { useUI.getState().toast(`Falha: ${(e as Error).message}`, 'error'); }
    setBusy(null);
  };
  const items: { key: string; title: string; desc: string; go: () => void | Promise<void> }[] = [
    { key: 'json', title: 'Projeto (.ordoforge.json)', desc: 'Tudo: cena, variantes, playtests. Reabre exatamente como está.', go: () => exportProjectFile(p) },
    { key: 'svg', title: 'Planta em SVG', desc: `Vetorial, escala 1:1 (1 m = 40 px), pavimento atual: ${p.scene.floors[fid]?.name ?? ''}.`, go: () => downloadText(`${name}-planta.svg`, planSvg(p.scene, fid), 'image/svg+xml') },
    { key: 'png', title: 'Planta em PNG', desc: 'Imagem 2× do mesmo desenho, para documentos e chats.', go: async () => downloadBlob(`${name}-planta.png`, await svgToPng(planSvg(p.scene, fid))) },
    { key: 'dim', title: 'Relatório de dimensões (CSV)', desc: 'Ambientes, portas, janelas e escadas com medidas e áreas.', go: () => downloadText(`${name}-dimensoes.csv`, dimensionReportCsv(p.scene), 'text/csv') },
    { key: 'props', title: 'Lista de objetos (CSV)', desc: 'Cada objeto com posição, giro, categoria e requisitos, mais um resumo por tipo.', go: () => downloadText(`${name}-objetos.csv`, propsListCsv(p.scene), 'text/csv') },
    { key: 'prog', title: 'Progressão e marcadores (JSON)', desc: 'Ordem de destrava, distâncias, itens inalcançáveis, marcadores e curva de ritmo.', go: () => downloadText(`${name}-progressao.json`, progressionJson(p.scene, p.settings.character)) },
    { key: 'glb', title: 'Modelo 3D (GLB)', desc: 'Geometria atual do editor 3D, para abrir no Blender ou em motores de jogo.', go: () => exportGlb(name) },
  ];
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <div className="dialog" style={{ width: 600 }}>
        <header><span>Exportar</span><button className="btn icon sm" onClick={close} aria-label="Fechar"><Icon name="close" /></button></header>
        <div className="body">
          {items.map((it) => (
            <div key={it.key} className="li" style={{ gap: 12, padding: '8px 6px' }}>
              <div className="grow"><div style={{ fontFamily: 'var(--f-cond)', fontSize: 15 }}>{it.title}</div><div style={{ color: 'var(--text-3)', fontSize: 12 }}>{it.desc}</div></div>
              <button className="btn sm" disabled={busy !== null} onClick={() => run(it.key, it.go)}><Icon name="download" size={13} />{busy === it.key ? 'Gerando…' : 'Baixar'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
