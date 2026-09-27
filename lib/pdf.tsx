// PDFs gerados no servidor: resumo do pedido (comprador) e PDF para a marca (agrupado por empresa).
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatBRL, formatInt } from './money';

const ink = '#111214';
const muted = '#6B6F76';
const line = '#E4E6EA';

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: ink, fontFamily: 'Helvetica' },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  logo: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#D6F35B', marginRight: 8 },
  brandName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  sub: { fontSize: 10, color: muted, marginBottom: 2 },
  box: { marginTop: 18, padding: 12, borderRadius: 8, backgroundColor: '#F4F5F6', flexDirection: 'row', justifyContent: 'space-between' },
  boxLabel: { fontSize: 9, color: muted },
  boxValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: line, paddingVertical: 6, marginTop: 16, color: muted, fontSize: 9 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F1F2F4', paddingVertical: 7 },
  cName: { flexGrow: 1, flexBasis: 0 },
  cSku: { width: 70 },
  cQty: { width: 60, textAlign: 'right' },
  cUnit: { width: 70, textAlign: 'right' },
  cSub: { width: 80, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 18, fontSize: 9, color: muted, lineHeight: 1.5 },
  companyHead: { marginTop: 22, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: ink },
  companyName: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  companyMeta: { fontSize: 8.5, color: muted, marginTop: 2 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 8, color: muted, flexDirection: 'row', justifyContent: 'space-between' },
});

export type SummaryData = {
  platformName: string;
  liveName: string;
  brandName: string;
  liveDate: string;
  companyName: string;
  orderCode: string;
  statusLabel: string;
  items: { name: string; sku: string; qty: number; unitPriceCents: number }[];
};

function SummaryDoc({ d }: { d: SummaryData }) {
  const units = d.items.reduce((a, i) => a + i.qty, 0);
  const total = d.items.reduce((a, i) => a + i.qty * i.unitPriceCents, 0);
  return (
    <Document title={`Resumo ${d.orderCode}`} author={d.platformName}>
      <Page size="A4" style={s.page}>
        <View style={s.brandRow}>
          <View style={s.logo} />
          <Text style={s.brandName}>{d.platformName}</Text>
        </View>
        <Text style={s.h1}>Resumo do pedido {d.orderCode}</Text>
        <Text style={s.sub}>{d.liveName} · {d.brandName} · {d.liveDate}</Text>
        <Text style={s.sub}>{d.companyName} · {d.statusLabel}</Text>
        <View style={s.box}>
          <View>
            <Text style={s.boxLabel}>Valor estimado · {d.items.length} {d.items.length === 1 ? 'produto' : 'produtos'}</Text>
            <Text style={s.boxValue}>{formatBRL(total)}</Text>
          </View>
          <View>
            <Text style={s.boxLabel}>Unidades</Text>
            <Text style={s.boxValue}>{formatInt(units)} un.</Text>
          </View>
        </View>
        <View style={s.th}>
          <Text style={s.cName}>Produto</Text>
          <Text style={s.cSku}>SKU</Text>
          <Text style={s.cQty}>Quantidade</Text>
          <Text style={s.cUnit}>Preço/un.</Text>
          <Text style={s.cSub}>Subtotal</Text>
        </View>
        {d.items.map((i, k) => (
          <View key={k} style={s.tr} wrap={false}>
            <Text style={s.cName}>{i.name}</Text>
            <Text style={s.cSku}>{i.sku}</Text>
            <Text style={s.cQty}>{formatInt(i.qty)} un.</Text>
            <Text style={s.cUnit}>{formatBRL(i.unitPriceCents)}</Text>
            <Text style={s.cSub}>{formatBRL(i.qty * i.unitPriceCents)}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text>Total estimado: {formatBRL(total)}</Text>
        </View>
        <Text style={s.note}>Valores de atacado por unidade, sem frete e impostos. Frete e impostos vêm na fatura. Pagamento e entrega são combinados com a marca.</Text>
        <View style={s.footer} fixed>
          <Text>{d.platformName} · {d.orderCode}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderSummaryPdf(d: SummaryData) {
  return renderToBuffer(<SummaryDoc d={d} />);
}

export type BrandPdfData = {
  platformName: string;
  brandName: string;
  title: string;
  filters: string;
  generatedAt: string;
  companies: {
    name: string;
    cnpj: string | null;
    email: string;
    whatsapp: string;
    orderCodes: string[];
    lines: { liveName: string; product: string; sku: string; qty: number; unitPriceCents: number }[];
  }[];
};

function BrandDoc({ d }: { d: BrandPdfData }) {
  const grandUnits = d.companies.reduce((a, c) => a + c.lines.reduce((x, l) => x + l.qty, 0), 0);
  const grand = d.companies.reduce((a, c) => a + c.lines.reduce((x, l) => x + l.qty * l.unitPriceCents, 0), 0);
  return (
    <Document title={d.title} author={d.platformName}>
      <Page size="A4" style={s.page}>
        <View style={s.brandRow}>
          <View style={s.logo} />
          <Text style={s.brandName}>{d.platformName}</Text>
        </View>
        <Text style={s.h1}>Pedidos para {d.brandName}</Text>
        <Text style={s.sub}>{d.title}</Text>
        <Text style={s.sub}>{d.filters} · gerado em {d.generatedAt}</Text>
        <View style={s.box}>
          <View>
            <Text style={s.boxLabel}>Total geral · {d.companies.length} {d.companies.length === 1 ? 'empresa' : 'empresas'}</Text>
            <Text style={s.boxValue}>{formatBRL(grand)}</Text>
          </View>
          <View>
            <Text style={s.boxLabel}>Unidades</Text>
            <Text style={s.boxValue}>{formatInt(grandUnits)} un.</Text>
          </View>
        </View>
        {d.companies.map((c, k) => {
          const units = c.lines.reduce((a, l) => a + l.qty, 0);
          const total = c.lines.reduce((a, l) => a + l.qty * l.unitPriceCents, 0);
          return (
            <View key={k} wrap>
              <View style={s.companyHead} wrap={false}>
                <Text style={s.companyName}>{c.name}</Text>
                <Text style={s.companyMeta}>
                  {[c.cnpj ? `CNPJ ${c.cnpj}` : null, c.email, c.whatsapp, c.orderCodes.join(', ')].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {c.lines.map((l, j) => (
                <View key={j} style={s.tr} wrap={false}>
                  <Text style={s.cName}>{l.product}</Text>
                  <Text style={s.cSku}>{l.sku}</Text>
                  <Text style={s.cQty}>{formatInt(l.qty)} un.</Text>
                  <Text style={s.cUnit}>{formatBRL(l.unitPriceCents)}</Text>
                  <Text style={s.cSub}>{formatBRL(l.qty * l.unitPriceCents)}</Text>
                </View>
              ))}
              <View style={s.totalRow} wrap={false}>
                <Text>
                  Total {c.name}: {formatInt(units)} un. · {formatBRL(total)}
                </Text>
              </View>
            </View>
          );
        })}
        <View style={[s.totalRow, { marginTop: 22, fontSize: 12 }]} wrap={false}>
          <Text>
            Total geral: {formatInt(grandUnits)} un. · {formatBRL(grand)}
          </Text>
        </View>
        <Text style={s.note}>Valores de atacado por unidade, sem frete e impostos.</Text>
        <View style={s.footer} fixed>
          <Text>{d.platformName} · {d.brandName}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderBrandPdf(d: BrandPdfData) {
  return renderToBuffer(<BrandDoc d={d} />);
}
