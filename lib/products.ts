// Produtos: validação, gravação e importação de planilha. Regras no servidor.
import { and, eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db, schema } from './db';
import { parseBRL, parseIntBR } from './money';

export type ProductInput = {
  brandId: string;
  name: string;
  sku: string;
  priceCents: number;
  stockTotal: number;
  minQty: number;
  stepQty: number;
  description: string | null;
  imageUrl?: string | null;
  blockOverStock: boolean;
};

export type FieldErrors = Partial<Record<keyof ProductInput, string>>;

/** Aceita valores como vêm do formulário ("R$ 32,50", "12.000") ou da planilha. */
export function parseProductInput(raw: Record<string, unknown>): { ok: true; value: ProductInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

  const brandId = str(raw.brandId);
  const name = str(raw.name);
  const sku = str(raw.sku).toUpperCase();
  const priceCents = raw.priceCents !== undefined ? parseIntBR(raw.priceCents) : parseBRL(raw.price);
  const stockTotal = parseIntBR(raw.stockTotal ?? raw.stock);
  const minRaw = raw.minQty ?? raw.min;
  const stepRaw = raw.stepQty ?? raw.step;
  const minQty = minRaw === undefined || minRaw === '' || minRaw === null ? 10 : parseIntBR(minRaw);
  const stepQty = stepRaw === undefined || stepRaw === '' || stepRaw === null ? 10 : parseIntBR(stepRaw);
  const description = str(raw.description) || null;

  if (!brandId) errors.brandId = 'Escolha a marca.';
  if (!name) errors.name = 'Informe o nome.';
  if (!sku) errors.sku = 'Informe o SKU.';
  if (priceCents === null) errors.priceCents = 'Preço inválido. Use o formato 32,50.';
  if (stockTotal === null) errors.stockTotal = 'Estoque deve ser um número inteiro.';
  if (minQty === null || minQty < 1) errors.minQty = 'Pedido mínimo deve ser 1 ou mais.';
  if (stepQty === null || stepQty < 1) errors.stepQty = 'Múltiplo deve ser 1 ou mais.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      brandId,
      name,
      sku,
      priceCents: priceCents!,
      stockTotal: stockTotal!,
      minQty: minQty!,
      stepQty: stepQty!,
      description,
      imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl || null : undefined,
      blockOverStock: raw.blockOverStock === undefined ? true : raw.blockOverStock === true || raw.blockOverStock === 'true',
    },
  };
}

export async function skuTaken(brandId: string, sku: string, exceptId?: string) {
  const [row] = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(and(eq(schema.products.brandId, brandId), eq(schema.products.sku, sku)));
  return !!row && row.id !== exceptId;
}

export type ProductRow = {
  id: string;
  brandId: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  stockTotal: number;
  minQty: number;
  stepQty: number;
  blockOverStock: boolean;
  reserved: number;
  available: number;
};

export async function listProducts(brandId: string): Promise<ProductRow[]> {
  const p = schema.products;
  const s = schema.productStock;
  return db
    .select({
      id: p.id,
      brandId: p.brandId,
      name: p.name,
      sku: p.sku,
      description: p.description,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      stockTotal: p.stockTotal,
      minQty: p.minQty,
      stepQty: p.stepQty,
      blockOverStock: p.blockOverStock,
      reserved: s.reserved,
      available: s.available,
    })
    .from(p)
    .innerJoin(s, eq(s.productId, p.id))
    .where(and(eq(p.brandId, brandId), eq(p.active, true)))
    .orderBy(p.createdAt, p.name);
}

/** Classificação do estoque (docs/03: baixo = disponível > 0 e < 10% do total). */
export function stockKind(available: number, stockTotal: number): 'in' | 'low' | 'out' {
  if (available <= 0) return 'out';
  return available / stockTotal < 0.1 ? 'low' : 'in';
}

export function stockBelowReservedMessage(reserved: number) {
  return `O estoque não pode ser menor que o já pedido (${reserved.toLocaleString('pt-BR')} un.).`;
}

// ---------- Importação de planilha ----------

export type ImportReport = {
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
  totalRows: number;
};

// Cabeçalhos aceitos (sem acento, minúsculo) → campo.
const HEADER_MAP: Record<string, string> = {
  nome: 'name', produto: 'name', name: 'name',
  sku: 'sku', codigo: 'sku',
  preco: 'price', 'preco atacado': 'price', 'preco/un': 'price', 'preco un': 'price', price: 'price',
  estoque: 'stock', 'estoque (un.)': 'stock', 'estoque un': 'stock', stock: 'stock',
  minimo: 'min', 'pedido minimo': 'min', min: 'min',
  multiplo: 'step', multiplos: 'step', step: 'step',
  descricao: 'description', 'descricao curta': 'description', description: 'description',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function cellValue(v: ExcelJS.CellValue): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'object' && 'result' in v) return cellValue(v.result as ExcelJS.CellValue);
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  return String(v);
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export async function readSheet(file: { name: string; data: Buffer }): Promise<(string | number)[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(file.data.toString('utf8').replace(/^﻿/, ''));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.data as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: (string | number)[][] = [];
  ws.eachRow({ includeEmpty: true }, (r) => {
    const values = (r.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
    rows.push(values);
  });
  return rows;
}

/**
 * Importa produtos para uma marca. Linhas com SKU existente atualizam o produto.
 * Uma linha com erro não impede as outras; o relatório diz qual linha e por quê.
 */
export async function importProducts(brandId: string, rows: (string | number)[][]): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, errors: [], totalRows: 0 };
  if (!rows.length) {
    report.errors.push({ line: 1, message: 'Planilha vazia.' });
    return report;
  }
  const header = rows[0].map((h) => HEADER_MAP[norm(String(h))] ?? null);
  for (const req of ['name', 'sku', 'price', 'stock']) {
    if (!header.includes(req)) {
      const label = { name: 'nome', sku: 'SKU', price: 'preço', stock: 'estoque' }[req];
      report.errors.push({ line: 1, message: `Coluna obrigatória não encontrada: ${label}.` });
    }
  }
  if (report.errors.length) return report;

  // Estoque não pode ficar abaixo do que já foi pedido.
  const reservedBySku = new Map(
    (
      await db
        .select({ sku: schema.products.sku, reserved: schema.productStock.reserved })
        .from(schema.products)
        .innerJoin(schema.productStock, eq(schema.productStock.productId, schema.products.id))
        .where(eq(schema.products.brandId, brandId))
    ).map((r) => [r.sku, r.reserved]),
  );

  const valid: { line: number; value: ProductInput }[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i];
    if (!cells.some((c) => String(c).trim() !== '')) continue;
    report.totalRows++;
    const raw: Record<string, unknown> = { brandId };
    header.forEach((field, idx) => {
      if (field) raw[field] = cells[idx] ?? '';
    });
    const parsed = parseProductInput(raw);
    if (!parsed.ok) {
      report.errors.push({ line, message: Object.values(parsed.errors).join(' ') });
      continue;
    }
    const prev = seen.get(parsed.value.sku);
    if (prev) {
      report.errors.push({ line, message: `SKU ${parsed.value.sku} repetido (já está na linha ${prev}).` });
      continue;
    }
    seen.set(parsed.value.sku, line);
    const reserved = reservedBySku.get(parsed.value.sku) ?? 0;
    if (parsed.value.stockTotal < reserved) {
      report.errors.push({ line, message: stockBelowReservedMessage(reserved) });
      continue;
    }
    valid.push({ line, value: parsed.value });
  }

  if (!valid.length) return report;

  // Uma transação com inserts em lote; `xmax = 0` diz se a linha foi criada (e não atualizada).
  await db.transaction(async (tx) => {
    const p = schema.products;
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500);
      const res = await tx
        .insert(p)
        .values(chunk.map(({ value: v }) => ({ ...v, imageUrl: v.imageUrl ?? null })))
        .onConflictDoUpdate({
          target: [p.brandId, p.sku],
          set: {
            name: sql`excluded.name`,
            priceCents: sql`excluded.price_cents`,
            stockTotal: sql`excluded.stock_total`,
            minQty: sql`excluded.min_qty`,
            stepQty: sql`excluded.step_qty`,
            description: sql`coalesce(excluded.description, ${p.description})`,
            active: true,
          },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      for (const r of res) r.inserted ? report.created++ : report.updated++;
    }
  });
  return report;
}
