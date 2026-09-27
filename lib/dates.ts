// Datas no fuso de Brasília (única agência, fuso fixo na v1).
export const TZ = 'America/Sao_Paulo';

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;
}

/** "Quinta, 02/10" */
export function weekdayDate(d: Date) {
  const p = parts(d);
  const wd = p.weekday.replace('-feira', '');
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${p.day}/${p.month}`;
}

/** "14h" ou "15h20" */
export function hourLabel(d: Date) {
  const p = parts(d);
  return `${Number(p.hour)}h${p.minute === '00' ? '' : p.minute}`;
}

/** "14h às 15h" */
export function timeRange(start: Date, end: Date) {
  return `${hourLabel(start)} às ${hourLabel(end)}`;
}
