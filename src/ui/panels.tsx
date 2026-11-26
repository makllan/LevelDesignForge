/** Abas adicionais do painel direito. Cada fase registra as suas aqui. */
import type { ReactNode } from 'react';
import type { RightTab } from '../editor/ui';
import { CompanionPanel, ProgressPanel } from './AnalysisPanel';
import { LandscapePanel } from './LandscapePanel';
import { PacingPanel, AtmospherePanel, ReplayPanel, VariantsPanel } from './ProductionPanels';

export const PANELS: { id: RightTab; label: string; body: () => ReactNode }[] = [
  { id: 'companion', label: 'Análise', body: () => <CompanionPanel /> },
  { id: 'progress', label: 'Progressão', body: () => <ProgressPanel /> },
  { id: 'land', label: 'Paisagem', body: () => <LandscapePanel /> },
  { id: 'pacing', label: 'Ritmo', body: () => <PacingPanel /> },
  { id: 'atmo', label: 'Atmosfera', body: () => <AtmospherePanel /> },
  { id: 'replay', label: 'Replay', body: () => <ReplayPanel /> },
  { id: 'variants', label: 'Variantes', body: () => <VariantsPanel /> },
];
