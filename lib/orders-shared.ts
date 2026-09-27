// Pedidos: tipos, rótulos e formatação usados no servidor e no navegador (sem acesso ao banco).
export type OrderStatus = 'draft' | 'invoicing' | 'invoiced' | 'delivered' | 'canceled';
export const ORDER_STATUSES: OrderStatus[] = ['draft', 'invoicing', 'invoiced', 'delivered', 'canceled'];

// Abas da tela: Rascunho (ainda não faturado), Faturados e Cancelados.
export type OrderTab = 'draft' | 'invoiced' | 'canceled';
export const TAB_STATUSES: Record<OrderTab, OrderStatus[]> = {
  draft: ['draft', 'invoicing'],
  invoiced: ['invoiced', 'delivered'],
  canceled: ['canceled'],
};

export const ADMIN_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Rascunho',
  invoicing: 'Em faturamento',
  invoiced: 'Faturado',
  delivered: 'Entregue',
  canceled: 'Cancelado',
};

export type OrderFilters = {
  tab: OrderTab;
  liveId: string | null;
  productId: string | null;
  brandId: string | null;
  companyId: string | null;
  minFrom: number | null;
  minTo: number | null;
  q: string;
  from: string | null; // yyyy-mm-dd (data do registro, Brasília)
  to: string | null;
  ids: string[] | null; // itens selecionados ("Baixar selecionados")
};

/** Query string com os filtros (sem os vazios), para links e exportações. */
export function filtersToQuery(f: Partial<OrderFilters>): string {
  const p = new URLSearchParams();
  if (f.tab && f.tab !== 'draft') p.set('status', f.tab);
  if (f.liveId) p.set('liveId', f.liveId);
  if (f.productId) p.set('productId', f.productId);
  if (f.brandId) p.set('brandId', f.brandId);
  if (f.companyId) p.set('companyId', f.companyId);
  if (f.minFrom !== null && f.minFrom !== undefined) p.set('minFrom', String(f.minFrom));
  if (f.minTo !== null && f.minTo !== undefined) p.set('minTo', String(f.minTo));
  if (f.q) p.set('q', f.q);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.ids?.length) p.set('ids', f.ids.join(','));
  return p.toString();
}

/** Minuto da live "34:05" (ou "1:02:10" depois da primeira hora). */
export function offsetLabel(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Cores dos status (AdminPedidos e Minha conta).
export const STATUS_PILL: Record<OrderStatus, string> = {
  draft: 'bg-line-2 text-ink',
  invoicing: 'bg-warn-bg text-warn',
  invoiced: 'bg-ok-bg text-ok',
  delivered: 'bg-ink text-accent',
  canceled: 'bg-danger-bg text-danger',
};
