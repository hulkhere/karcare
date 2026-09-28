import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { GST_RATE, SELLER } from "@/lib/constants";
import { formatDateNumericIST } from "@/lib/dates";
import { HALF_RATE } from "@/lib/gst";
import { formatINR } from "@/lib/invoice";
import type { InvoiceData } from "@/lib/types";

// Built-in Helvetica has no ₹ glyph, so amounts use "Rs.".
const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  draft: { textAlign: "center", color: "#b91c1c", fontFamily: "Helvetica-Bold", marginTop: -8, marginBottom: 10 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 14, letterSpacing: 1 },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold" },
  sellerName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  muted: { color: "#555" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#999", marginVertical: 10 },
  label: { fontSize: 8, color: "#555", textTransform: "uppercase", marginBottom: 3 },
  table: { borderWidth: 1, borderColor: "#999", marginTop: 12 },
  th: { flexDirection: "row", backgroundColor: "#eee", borderBottomWidth: 1, borderBottomColor: "#999" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc" },
  cell: { padding: 4 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  totals: { marginTop: 12, marginLeft: "auto", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { borderTopWidth: 1, borderTopColor: "#111", marginTop: 4, paddingTop: 4 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 36 },
});

const cols = { n: "5%", desc: "43%", code: "10%", qty: "7%", rate: "15%", taxable: "20%" };
const rs = (n: number) => `Rs. ${formatINR(n)}`;

function InvoicePage({ inv, draft }: { inv: InvoiceData; draft?: boolean }) {
  const pos = `${inv.placeOfSupply.state}${inv.placeOfSupply.code ? ` (${inv.placeOfSupply.code})` : ""}`;
  const taxRows = inv.intraState
    ? [
        { name: "CGST", rate: HALF_RATE, amount: inv.cgst },
        { name: "SGST", rate: HALF_RATE, amount: inv.sgst },
      ]
    : [{ name: "IGST", rate: GST_RATE, amount: inv.igst }];

  return (
    <Page size="A4" style={s.page}>
      <Text style={s.title}>TAX INVOICE</Text>
      {draft ? (
        <Text style={s.draft}>DRAFT — month not closed yet; invoice number is provisional</Text>
      ) : null}

      <View style={s.between}>
        <View style={{ width: "60%" }}>
          <Text style={s.sellerName}>{SELLER.tradeName}</Text>
          <Text>{SELLER.address}</Text>
          <Text>
            {SELLER.city}, {SELLER.district}, {SELLER.state} - {SELLER.pin}
          </Text>
          <Text>Phone: {SELLER.phone}</Text>
          <Text style={s.bold}>GSTIN: {SELLER.gstin}</Text>
          <Text>
            State: {SELLER.state} ({SELLER.stateCode})
          </Text>
        </View>
        <View style={{ width: "38%" }}>
          {[
            ["Invoice No.", inv.number],
            ["Invoice Date", formatDateNumericIST(inv.date)],
            ["Order", inv.orderName],
            ["Payment", inv.paymentType === "COD" ? "Cash on Delivery" : inv.paymentType],
          ].map(([k, v]) => (
            <View key={k} style={s.between}>
              <Text style={s.muted}>{k}</Text>
              <Text style={s.bold}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.rule} />

      <Text style={s.label}>Bill To</Text>
      <Text style={s.bold}>{inv.buyerName}</Text>
      <Text>State: {pos}</Text>

      <View style={s.table}>
        <View style={s.th}>
          <Text style={[s.cell, s.bold, { width: cols.n }]}>#</Text>
          <Text style={[s.cell, s.bold, { width: cols.desc }]}>Description</Text>
          <Text style={[s.cell, s.bold, s.center, { width: cols.code }]}>HSN/SAC</Text>
          <Text style={[s.cell, s.bold, s.center, { width: cols.qty }]}>Qty</Text>
          <Text style={[s.cell, s.bold, s.right, { width: cols.rate }]}>Rate (incl. GST)</Text>
          <Text style={[s.cell, s.bold, s.right, { width: cols.taxable }]}>Taxable Value</Text>
        </View>
        {inv.lines.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.cell, { width: cols.n }]}>{i + 1}</Text>
            <View style={[s.cell, { width: cols.desc }]}>
              <Text>{l.description}</Text>
              {l.variant && l.variant !== "Default Title" ? <Text style={s.muted}>({l.variant})</Text> : null}
            </View>
            <Text style={[s.cell, s.center, { width: cols.code }]}>{l.code}</Text>
            <Text style={[s.cell, s.center, { width: cols.qty }]}>{l.quantity}</Text>
            <Text style={[s.cell, s.right, { width: cols.rate }]}>{formatINR(l.rate)}</Text>
            <Text style={[s.cell, s.right, { width: cols.taxable }]}>{formatINR(l.taxable)}</Text>
          </View>
        ))}
      </View>

      <View style={[s.table, { width: 230 }]}>
        <View style={s.th}>
          <Text style={[s.cell, s.bold, { width: "40%" }]}>Tax</Text>
          <Text style={[s.cell, s.bold, s.center, { width: "25%" }]}>Rate</Text>
          <Text style={[s.cell, s.bold, s.right, { width: "35%" }]}>Amount</Text>
        </View>
        {taxRows.map((t) => (
          <View key={t.name} style={s.tr}>
            <Text style={[s.cell, { width: "40%" }]}>{t.name}</Text>
            <Text style={[s.cell, s.center, { width: "25%" }]}>{t.rate}%</Text>
            <Text style={[s.cell, s.right, { width: "35%" }]}>{formatINR(t.amount)}</Text>
          </View>
        ))}
      </View>

      <View style={s.totals}>
        <View style={s.totalRow}>
          <Text>Taxable Value:</Text>
          <Text>{rs(inv.taxable)}</Text>
        </View>
        {taxRows.map((t) => (
          <View key={t.name} style={s.totalRow}>
            <Text>
              {t.name} ({t.rate}%):
            </Text>
            <Text>{rs(t.amount)}</Text>
          </View>
        ))}
        <View style={[s.totalRow, s.grand]}>
          <Text style={s.bold}>Total (Incl. GST):</Text>
          <Text style={s.bold}>{rs(inv.total)}</Text>
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Text>
          <Text style={s.bold}>Amount in Words: </Text>
          {inv.amountInWords}
        </Text>
      </View>

      <View style={s.footer}>
        <View style={[s.rule, { marginTop: 0 }]} />
        <View style={s.between}>
          <View>
            <Text style={s.muted}>This is a computer-generated invoice.</Text>
            <Text>Place of Supply: {pos}</Text>
            <Text>Reverse Charge: No</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.bold}>For {SELLER.tradeName}</Text>
            <Text style={{ marginTop: 28 }}>Authorised Signatory</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

export function InvoiceDocument({ invoices, draft }: { invoices: InvoiceData[]; draft?: boolean }) {
  return (
    <Document title={invoices.length === 1 ? invoices[0].number : "KarCare Invoices"} author={SELLER.tradeName}>
      {invoices.map((inv) => (
        <InvoicePage key={inv.number} inv={inv} draft={draft} />
      ))}
    </Document>
  );
}
