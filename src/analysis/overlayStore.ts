import { create } from 'zustand';
import type { DrawExtra } from '../blueprint/draw';

/** Resultados de análise que a planta desenha por cima (calculados sob demanda — nunca simulados). */
export const useOverlay = create<{ extra: DrawExtra; set: (p: Partial<DrawExtra>) => void; clear: () => void }>((set) => ({
  extra: {},
  set: (p) => set((s) => ({ extra: { ...s.extra, ...p } })),
  clear: () => set({ extra: {} }),
}));
