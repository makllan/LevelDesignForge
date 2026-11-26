/** Ponte mínima para comandos externos (paleta/menus) falarem com o playtest em execução. */
export interface PlaytestHook { restart(): void }
let hook: PlaytestHook | null = null;
export const setPlaytestHook = (h: PlaytestHook | null) => { hook = h; };
export const getPlaytestHook = () => hook;
