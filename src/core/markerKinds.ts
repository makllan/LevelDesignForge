import type { MarkerKind } from './types';

export interface MarkerInfo { kind: MarkerKind; label: string; color: string; glyph: string; shape: 'circle' | 'diamond' | 'square' | 'tri'; radius: number; help: string }

/** Cores terrosas — leitura por forma + letra, não só por matiz. */
export const MARKER_INFO: Record<MarkerKind, MarkerInfo> = {
  start: { kind: 'start', label: 'Início', color: '#7fa05a', glyph: 'I', shape: 'circle', radius: 0.5, help: 'Onde o jogador começa no playtest.' },
  main: { kind: 'main', label: 'Objetivo principal', color: '#c9a14a', glyph: 'P', shape: 'diamond', radius: 1.5, help: 'Meta que faz a campanha avançar.' },
  side: { kind: 'side', label: 'Objetivo secundário', color: '#a8935c', glyph: 'S', shape: 'diamond', radius: 1.2, help: 'Meta opcional.' },
  landmark: { kind: 'landmark', label: 'Landmark', color: '#c98a4b', glyph: 'L', shape: 'tri', radius: 1.5, help: 'Referência visual para orientação.' },
  poi: { kind: 'poi', label: 'Ponto de interesse', color: '#b09a78', glyph: 'i', shape: 'circle', radius: 1.2, help: 'Algo que merece atenção.' },
  combat: { kind: 'combat', label: 'Combate', color: '#b5503a', glyph: 'C', shape: 'square', radius: 4, help: 'Área de encontro com ameaça.' },
  enemy: { kind: 'enemy', label: 'Inimigo', color: '#a0402e', glyph: 'E', shape: 'tri', radius: 1, help: 'Posição e alcance de um inimigo (proxy).' },
  ambush: { kind: 'ambush', label: 'Emboscada', color: '#8f3b2c', glyph: 'A', shape: 'tri', radius: 3, help: 'Ameaça que surge depois que o jogador passa.' },
  resource: { kind: 'resource', label: 'Recurso', color: '#6f9a6a', glyph: 'R', shape: 'square', radius: 0.8, help: 'Munição, cura ou suprimento.' },
  puzzle: { kind: 'puzzle', label: 'Puzzle', color: '#8d7bb0', glyph: 'Q', shape: 'square', radius: 1.5, help: 'Desafio de raciocínio.' },
  safe: { kind: 'safe', label: 'Área segura', color: '#5f9a8a', glyph: 'Z', shape: 'circle', radius: 3, help: 'Respiro sem ameaça.' },
  reveal: { kind: 'reveal', label: 'Revelação narrativa', color: '#c07a9a', glyph: 'N', shape: 'diamond', radius: 1.5, help: 'Momento em que a história se revela.' },
  event: { kind: 'event', label: 'Evento ambiental', color: '#b0884f', glyph: 'V', shape: 'diamond', radius: 2, help: 'Algo acontece no cenário.' },
  vantage: { kind: 'vantage', label: 'Ponto de observação', color: '#7a9db0', glyph: 'O', shape: 'circle', radius: 1, help: 'Posição privilegiada para ver o espaço.' },
  pinch: { kind: 'pinch', label: 'Pinch point', color: '#c47040', glyph: 'X', shape: 'square', radius: 1.5, help: 'Gargalo obrigatório.' },
  shortcut: { kind: 'shortcut', label: 'Atalho', color: '#8aa86a', glyph: 'T', shape: 'diamond', radius: 1.2, help: 'Rota curta de retorno.' },
  backtrack: { kind: 'backtrack', label: 'Backtracking', color: '#9a8a6a', glyph: 'B', shape: 'circle', radius: 1.5, help: 'Trecho que o jogador revisita.' },
  oneway: { kind: 'oneway', label: 'Sentido único', color: '#c06a50', glyph: '>', shape: 'tri', radius: 1, help: 'Passagem sem volta.' },
  sightline: { kind: 'sightline', label: 'Linha de visão', color: '#8ab0b0', glyph: 'M', shape: 'tri', radius: 6, help: 'Direção que deve ficar visível.' },
  barrier: { kind: 'barrier', label: 'Barreira', color: '#7a7a72', glyph: '#', shape: 'square', radius: 1, help: 'Impede o avanço até uma condição.' },
  recovery: { kind: 'recovery', label: 'Recuperação após falha', color: '#6a9a7a', glyph: 'F', shape: 'circle', radius: 2, help: 'Onde o jogador volta após falhar.' },
  atmosphere: { kind: 'atmosphere', label: 'Transição de atmosfera', color: '#7a6a9a', glyph: 'W', shape: 'diamond', radius: 2.5, help: 'Mudança de luz, som ou clima.' },
  audio: { kind: 'audio', label: 'Zona de áudio', color: '#9a7a5a', glyph: 'U', shape: 'circle', radius: 5, help: 'Região com som local.' },
};
export const MARKER_ORDER: MarkerKind[] = Object.keys(MARKER_INFO) as MarkerKind[];
