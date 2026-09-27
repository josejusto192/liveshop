// Formatação pt-BR (docs/07-design-system.md).
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const int = new Intl.NumberFormat('pt-BR');

/** 8990 → "R$ 89,90" (com espaço normal, não o NBSP do Intl). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, ' ');
}

/** 1000 → "1.000" */
export function formatInt(n: number): string {
  return int.format(n);
}

/** "R$ 1.234,56" | "1234,56" | "1234.56" | 12.5 → centavos. null se inválido. */
export function parseBRL(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
  if (typeof input !== 'string') return null;
  let s = input.replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** "12.000" | "12000" | 12000 → 12000. null se não for inteiro >= 0. */
export function parseIntBR(input: unknown): number | null {
  if (typeof input === 'number') return Number.isInteger(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;
  const s = input.replace(/\s|\./g, '');
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}
