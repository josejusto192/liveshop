// Exportações de pedidos (docs/03: uma linha por item; PDF para a marca agrupado por empresa).
import ExcelJS from 'exceljs';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { TZ } from './dates';
import { formatInt } from './money';
import { ADMIN_STATUS_LABEL, offsetLabel, type AdminOrderLine, type OrderFilters } from './admin-orders';
import type { BrandPdfData } from './pdf';
import { readUpload } from './uploads';

const HEADERS = ['Live', 'Marca', 'Código do pedido', 'Empresa', 'CNPJ', 'E-mail', 'WhatsApp', 'Produto', 'SKU', 'Quantidade', 'Preço/un.', 'Subtotal', 'Minuto da live', 'Data/hora', 'Status'];

export function dateTimeCell(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(',', '');
}

/** Centavos em "1234,50" (sem milhar, para a planilha entender o número). */
function decimalBR(cents: number) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function csvCell(v: string | number) {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Separador ";" e BOM UTF-8: é como o Excel em português abre CSV sem bagunçar acentos e decimais.
export function ordersCsv(lines: AdminOrderLine[]): string {
  const out = [HEADERS.join(';')];
  for (const l of lines) {
    out.push(
      [
        l.liveName, l.brandName, l.code, l.company, l.cnpj ?? '', l.email, l.whatsapp, l.product, l.sku,
        l.qty, decimalBR(l.unitPriceCents), decimalBR(l.subtotalCents), offsetLabel(l.offsetS), dateTimeCell(l.createdAt), ADMIN_STATUS_LABEL[l.status],
      ]
        .map(csvCell)
        .join(';'),
    );
  }
  return '﻿' + out.join('\r\n') + '\r\n';
}

export async function ordersXlsx(lines: AdminOrderLine[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pedidos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { width: 28 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 20 }, { width: 32 }, { width: 18 },
    { width: 30 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 16 },
  ];
  const head = ws.addRow(HEADERS);
  head.font = { bold: true };
  for (const l of lines) {
    const r = ws.addRow([
      l.liveName, l.brandName, l.code, l.company, l.cnpj ?? '', l.email, l.whatsapp, l.product, l.sku,
      l.qty, l.unitPriceCents / 100, l.subtotalCents / 100, offsetLabel(l.offsetS), dateTimeCell(l.createdAt), ADMIN_STATUS_LABEL[l.status],
    ]);
    r.getCell(10).numFmt = '#,##0';
    r.getCell(11).numFmt = '"R$" #,##0.00';
    r.getCell(12).numFmt = '"R$" #,##0.00';
  }
  if (lines.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lines.length + 1, column: HEADERS.length } };
    const units = lines.reduce((a, l) => a + l.qty, 0);
    const cents = lines.reduce((a, l) => a + l.subtotalCents, 0);
    ws.addRow([]);
    const total = ws.addRow(['Total', '', '', '', '', '', '', '', '', units, '', cents / 100]);
    total.font = { bold: true };
    total.getCell(10).numFmt = '#,##0';
    total.getCell(12).numFmt = '"R$" #,##0.00';
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Dados do PDF: uma seção por marca, empresas em ordem alfabética, itens na ordem da live. */
export function brandPdfSections(lines: AdminOrderLine[]): BrandPdfData['brands'] {
  const brands = new Map<string, { name: string; companies: Map<string, BrandPdfData['brands'][number]['companies'][number]> }>();
  for (const l of lines) {
    let b = brands.get(l.brandId);
    if (!b) brands.set(l.brandId, (b = { name: l.brandName, companies: new Map() }));
    let c = b.companies.get(l.companyId);
    if (!c) b.companies.set(l.companyId, (c = { name: l.company, cnpj: l.cnpj, email: l.email, whatsapp: l.whatsapp, orderCodes: [], lines: [] }));
    if (!c.orderCodes.includes(l.code)) c.orderCodes.push(l.code);
    c.lines.push({ liveName: l.liveName, product: l.product, sku: l.sku, qty: l.qty, unitPriceCents: l.unitPriceCents, offsetS: l.offsetS });
  }
  return [...brands.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((b) => ({
      name: b.name,
      companies: [...b.companies.values()]
        .sort((a, c) => a.name.localeCompare(c.name, 'pt-BR'))
        .map((c) => ({ ...c, lines: c.lines.sort((x, y) => x.offsetS - y.offsetS) })),
    }));
}

/** Descrição dos filtros em texto (cabeçalho do PDF e nome dos arquivos). */
export async function describeFilters(f: OrderFilters) {
  const [names] = await db.execute<{ live: string | null; product: string | null; brand: string | null; company: string | null }>(sql`
    select
      (select name from lives where id = ${f.liveId}) as live,
      (select name from products where id = ${f.productId}) as product,
      (select name from brands where id = ${f.brandId}) as brand,
      (select name from companies where id = ${f.companyId}) as company`);
  const tab = { draft: 'Rascunho', invoiced: 'Faturados', canceled: 'Cancelados' }[f.tab];
  const parts = [tab];
  if (names?.live) parts.push(`Live: ${names.live}`);
  if (names?.brand) parts.push(`Marca: ${names.brand}`);
  if (names?.product) parts.push(`Produto: ${names.product}`);
  if (names?.company) parts.push(`Empresa: ${names.company}`);
  if (f.minFrom !== null || f.minTo !== null) parts.push(`Minuto ${String(f.minFrom ?? 0).padStart(2, '0')}:00 a ${f.minTo !== null ? `${String(f.minTo).padStart(2, '0')}:59` : 'fim'}`);
  if (f.q) parts.push(`Busca "${f.q}"`);
  if (f.from || f.to) parts.push(`Período ${f.from ?? '…'} a ${f.to ?? '…'}`);
  if (f.ids) parts.push(`${formatInt(f.ids.length)} selecionados`);
  return { text: parts.join(' · '), live: names?.live ?? null };
}

/** Nome de arquivo sem acentos: "pedidos-lancamento-colecao-verao-2026-09-27". */
export function exportFileName(base: string | null, ext: string, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const slug = (base ?? 'todas-as-lives')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `pedidos-${slug}-${day}.${ext}`;
}

/** Logo da agência para o PDF (só PNG/JPG enviados pelo painel; WebP o gerador de PDF não lê). */
export async function pdfLogo(logoUrl: string | null) {
  const m = logoUrl?.match(/^\/api\/uploads\/([0-9a-f-]{36}\.(png|jpg))$/);
  if (!m) return null;
  const data = await readUpload(m[1]);
  return data ? { data, format: m[2] as 'png' | 'jpg' } : null;
}
