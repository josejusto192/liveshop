import { beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { importProducts, readSheet } from '@/lib/products';
import { resetDb } from './helpers';

async function brand() {
  const [b] = await db.insert(schema.brands).values({ name: 'Marca Exemplo' }).returning();
  return b;
}

async function xlsx(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Produtos');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('importação de planilha de produtos', () => {
  beforeEach(resetDb);

  it('importa 200 produtos de .xlsx em menos de 10 s e relata as linhas com erro', async () => {
    const b = await brand();
    const rows: (string | number)[][] = [['Nome', 'SKU', 'Preço atacado', 'Estoque (un.)', 'Pedido mínimo', 'Múltiplo', 'Descrição']];
    for (let i = 1; i <= 200; i++) rows.push([`Produto ${i}`, `SKU-${i}`, i === 10 ? 'grátis' : 19.9 + i, i === 20 ? -5 : 1000 + i, 10, 10, `Descrição ${i}`]);
    rows.push(['Produto repetido', 'SKU-1', '5,00', 10, '', '', '']);

    const t0 = performance.now();
    const parsed = await readSheet({ name: 'produtos.xlsx', data: await xlsx(rows) });
    const report = await importProducts(b.id, parsed);
    const ms = performance.now() - t0;

    expect(ms).toBeLessThan(10_000);
    expect(report.totalRows).toBe(201);
    expect(report.created).toBe(198);
    expect(report.errors).toEqual([
      { line: 11, message: 'Preço inválido. Use o formato 32,50.' },
      { line: 21, message: 'Estoque deve ser um número inteiro.' },
      { line: 202, message: 'SKU SKU-1 repetido (já está na linha 2).' },
    ]);
    const [p] = await db.select().from(schema.products).where(eq(schema.products.sku, 'SKU-3'));
    expect(p).toMatchObject({ name: 'Produto 3', priceCents: 2290, stockTotal: 1003, minQty: 10, stepQty: 10 });
  });

  it('lê CSV com ; e preço no formato brasileiro, e atualiza SKU existente', async () => {
    const b = await brand();
    await db.insert(schema.products).values({ brandId: b.id, name: 'Garrafa antiga', sku: 'GT-1L-IN', priceCents: 3000, stockTotal: 100 });
    const csv = 'nome;sku;preço;estoque\n"Garrafa térmica 1 L";GT-1L-IN;R$ 32,50;12.000\nCaneta;cn-az-050;0,89;120000\n';
    const report = await importProducts(b.id, await readSheet({ name: 'p.csv', data: Buffer.from(csv) }));
    expect(report).toMatchObject({ created: 1, updated: 1, errors: [] });
    const all = await db.select().from(schema.products).orderBy(schema.products.sku);
    expect(all.map((p) => [p.sku, p.name, p.priceCents, p.stockTotal])).toEqual([
      ['CN-AZ-050', 'Caneta', 89, 120000],
      ['GT-1L-IN', 'Garrafa térmica 1 L', 3250, 12000],
    ]);
  });

  it('recusa planilha sem as colunas obrigatórias', async () => {
    const b = await brand();
    const report = await importProducts(b.id, [['nome', 'preço'], ['X', '1,00']]);
    expect(report.errors).toEqual([
      { line: 1, message: 'Coluna obrigatória não encontrada: SKU.' },
      { line: 1, message: 'Coluna obrigatória não encontrada: estoque.' },
    ]);
  });
});
