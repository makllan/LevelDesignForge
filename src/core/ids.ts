/** Identificadores estáveis: prefixo legível + 8 caracteres aleatórios. Nunca reutilizados. */
export const nid = (prefix: string): string => {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return `${prefix}_${s.slice(0, 8)}`;
};
