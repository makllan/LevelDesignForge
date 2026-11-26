/**
 * i18n — a chave é o próprio texto em português (pt-BR). Para traduzir, registre um dicionário:
 *   registerLocale('en', { 'Salvar': 'Save' }); setLocale('en');
 * Textos sem tradução caem para o original. Variáveis: t('Sala {n}', { n: 3 }).
 */
const locales: Record<string, Record<string, string>> = { 'pt-BR': {} };
let current = 'pt-BR';

export function registerLocale(code: string, dict: Record<string, string>) { locales[code] = { ...(locales[code] ?? {}), ...dict }; }
export function setLocale(code: string) { if (locales[code]) current = code; }
export function getLocale() { return current; }

export function t(text: string, vars?: Record<string, string | number>): string {
  let out = locales[current]?.[text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
