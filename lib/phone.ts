// Link wa.me a partir do WhatsApp cadastrado ("(11) 98812-4410" → 5511988124410).
export function waLink(whatsapp: string, text?: string) {
  const d = whatsapp.replace(/\D/g, '');
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function initialsOf(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? w[0]?.[1] ?? '')).toUpperCase();
}
