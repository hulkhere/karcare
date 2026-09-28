import { formatDateNumericIST, MONTH_NAMES } from "./dates";
import { fromPaise, toPaise } from "./gst";
import type { ArchiveSnapshot, InvoiceData } from "./types";

function csv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = typeof v === "number" ? v.toFixed(2) : v;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens UTF-8 correctly
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const int = (n: number) => String(n);

export function registerCsv(invoices: InvoiceData[]) {
  const rows: (string | number)[][] = [
    ["Invoice No", "Invoice Date", "Order", "Customer", "Place of Supply", "State Code", "Payment",
     "Taxable Value", "IGST", "CGST", "SGST", "Total Tax", "Invoice Value"],
  ];
  for (const i of invoices) {
    rows.push([
      i.number, formatDateNumericIST(i.date), i.orderName, i.buyerName, i.placeOfSupply.state,
      i.placeOfSupply.code ?? "", i.paymentType, i.taxable, i.igst, i.cgst, i.sgst, i.igst + i.cgst + i.sgst, i.total,
    ]);
  }
  const t = totals(invoices);
  rows.push(["TOTAL", "", "", "", "", "", "", t.taxable, t.igst, t.cgst, t.sgst, t.igst + t.cgst + t.sgst, t.total]);
  return csv(rows);
}

function totals(invoices: InvoiceData[]) {
  const s = (f: (i: InvoiceData) => number) => fromPaise(invoices.reduce((a, i) => a + toPaise(f(i)), 0));
  return { taxable: s((i) => i.taxable), igst: s((i) => i.igst), cgst: s((i) => i.cgst), sgst: s((i) => i.sgst), total: s((i) => i.total) };
}

/** State-wise B2C summary (GSTR-1 Table 7), all at 18%. */
export function stateSummaryCsv(invoices: InvoiceData[]) {
  const groups = new Map<string, InvoiceData[]>();
  for (const i of invoices) {
    const k = `${i.placeOfSupply.code ?? ""}|${i.placeOfSupply.state}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const rows: (string | number)[][] = [
    ["Place of Supply", "State Code", "Rate %", "Invoices", "Taxable Value", "IGST", "CGST", "SGST", "Invoice Value"],
  ];
  for (const [k, list] of [...groups].sort()) {
    const [code, state] = k.split("|");
    const t = totals(list);
    rows.push([state, code, int(18), int(list.length), t.taxable, t.igst, t.cgst, t.sgst, t.total]);
  }
  const t = totals(invoices);
  rows.push(["TOTAL", "", "", int(invoices.length), t.taxable, t.igst, t.cgst, t.sgst, t.total]);
  return csv(rows);
}

/** HSN/SAC-wise summary (GSTR-1 Table 12). Tax per line is pro-rated from the invoice's tax. */
export function hsnSummaryCsv(invoices: InvoiceData[]) {
  const by = new Map<string, { qty: number; taxable: number; igst: number; cgst: number; sgst: number }>();
  for (const inv of invoices) {
    const invTaxable = toPaise(inv.taxable);
    for (const l of inv.lines) {
      const h = by.get(l.code) ?? { qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      const share = invTaxable ? toPaise(l.taxable) / invTaxable : 0;
      h.qty += l.quantity;
      h.taxable += toPaise(l.taxable);
      h.igst += Math.round(toPaise(inv.igst) * share);
      h.cgst += Math.round(toPaise(inv.cgst) * share);
      h.sgst += Math.round(toPaise(inv.sgst) * share);
      by.set(l.code, h);
    }
  }
  const rows: (string | number)[][] = [["HSN/SAC", "Description", "UQC", "Quantity", "Rate %", "Taxable Value", "IGST", "CGST", "SGST"]];
  for (const [code, h] of [...by].sort()) {
    rows.push([
      code, code === "9965" ? "Shipping charges" : "Motor vehicle parts & accessories", code === "9965" ? "OTH" : "NOS",
      int(h.qty), int(18), fromPaise(h.taxable), fromPaise(h.igst), fromPaise(h.cgst), fromPaise(h.sgst),
    ]);
  }
  return csv(rows);
}

/** "Aug-2026" */
export const monthTag = (s: Pick<ArchiveSnapshot, "month" | "year">) => `${MONTH_NAMES[s.month - 1].slice(0, 3)}-${s.year}`;
