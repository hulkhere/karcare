import { FORFEIT_SAC, SHIPPING_SAC } from "./constants";
import { formatDateNumericIST, MONTH_NAMES } from "./dates";
import { fromPaise, toPaise } from "./gst";
import type { InvoiceData } from "./types";

const p = toPaise;
const tax = (i: InvoiceData) => i.igst + i.cgst + i.sgst;

export interface Totals {
  count: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  tax: number;
  total: number;
}

export function totals(invoices: InvoiceData[]): Totals {
  const s = (f: (i: InvoiceData) => number) => fromPaise(invoices.reduce((a, i) => a + p(f(i)), 0));
  return {
    count: invoices.length,
    taxable: s((i) => i.taxable),
    igst: s((i) => i.igst),
    cgst: s((i) => i.cgst),
    sgst: s((i) => i.sgst),
    tax: s(tax),
    total: s((i) => i.total),
  };
}

/** State-wise (place of supply) totals — GSTR-1 B2C. */
export function stateRows(invoices: InvoiceData[]) {
  const groups = new Map<string, InvoiceData[]>();
  for (const i of invoices) {
    const k = `${i.placeOfSupply.code ?? ""}|${i.placeOfSupply.state}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return [...groups]
    .map(([k, list]) => {
      const [code, state] = k.split("|");
      return { state, code, ...totals(list) };
    })
    .sort((a, b) => b.total - a.total);
}

export const codeDescription = (code: string) =>
  code === SHIPPING_SAC
    ? "Shipping charges"
    : code === FORFEIT_SAC
      ? "Retained COD advance (cancelled / RTO)"
      : code === "7009"
        ? "Rear-view mirrors for vehicles"
        : "Motor vehicle parts & accessories";

/** HSN/SAC-wise totals — GSTR-1 Table 12. Line tax is pro-rated from its invoice's tax. */
export function hsnRows(invoices: InvoiceData[]) {
  const by = new Map<string, { qty: number; taxable: number; igst: number; cgst: number; sgst: number }>();
  for (const inv of invoices) {
    const invTaxable = p(inv.taxable);
    for (const l of inv.lines) {
      const h = by.get(l.code) ?? { qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      const share = invTaxable ? p(l.taxable) / invTaxable : 0;
      h.qty += l.quantity;
      h.taxable += p(l.taxable);
      h.igst += Math.round(p(inv.igst) * share);
      h.cgst += Math.round(p(inv.cgst) * share);
      h.sgst += Math.round(p(inv.sgst) * share);
      by.set(l.code, h);
    }
  }
  return [...by].sort().map(([code, h]) => ({
    code,
    description: codeDescription(code),
    qty: h.qty,
    taxable: fromPaise(h.taxable),
    igst: fromPaise(h.igst),
    cgst: fromPaise(h.cgst),
    sgst: fromPaise(h.sgst),
    tax: fromPaise(h.igst + h.cgst + h.sgst),
  }));
}

/** Per product (sale invoices only): units, invoice value and GST. */
export function productRows(invoices: InvoiceData[]) {
  const by = new Map<string, { invoices: Set<string>; qty: number; value: number; taxable: number; tax: number }>();
  for (const inv of invoices.filter((i) => i.kind === "sale")) {
    const invTaxable = p(inv.taxable);
    const invTax = p(tax(inv));
    for (const l of inv.lines.filter((x) => x.code !== SHIPPING_SAC)) {
      const r = by.get(l.description) ?? { invoices: new Set(), qty: 0, value: 0, taxable: 0, tax: 0 };
      const lineTax = invTaxable ? Math.round((invTax * p(l.taxable)) / invTaxable) : 0;
      r.invoices.add(inv.number);
      r.qty += l.quantity;
      r.taxable += p(l.taxable);
      r.tax += lineTax;
      r.value += p(l.taxable) + lineTax;
      by.set(l.description, r);
    }
  }
  return [...by]
    .map(([product, r]) => ({
      product,
      invoices: r.invoices.size,
      qty: r.qty,
      value: fromPaise(r.value),
      taxable: fromPaise(r.taxable),
      tax: fromPaise(r.tax),
    }))
    .sort((a, b) => b.value - a.value);
}

function csv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = typeof v === "number" ? v.toFixed(2) : v;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"; // BOM for Excel
}

export function registerCsv(invoices: InvoiceData[]) {
  const rows: (string | number)[][] = [
    ["Invoice No", "Invoice Date", "Type", "Order", "Order Date", "Customer", "Place of Supply", "State Code", "Payment",
     "Taxable Value", "IGST", "CGST", "SGST", "Total Tax", "Invoice Value"],
  ];
  for (const i of invoices) {
    rows.push([
      i.number, formatDateNumericIST(i.date), i.kind === "sale" ? "Sale" : "Advance retained", i.orderName,
      formatDateNumericIST(i.orderDate), i.buyerName, i.placeOfSupply.state, i.placeOfSupply.code ?? "", i.paymentType,
      i.taxable, i.igst, i.cgst, i.sgst, tax(i), i.total,
    ]);
  }
  const t = totals(invoices);
  rows.push(["TOTAL", "", "", "", "", "", "", "", "", t.taxable, t.igst, t.cgst, t.sgst, t.tax, t.total]);
  return csv(rows);
}

export function stateSummaryCsv(invoices: InvoiceData[]) {
  const rows: (string | number)[][] = [
    ["Place of Supply", "State Code", "Rate %", "Invoices", "Taxable Value", "IGST", "CGST", "SGST", "Invoice Value"],
  ];
  for (const r of stateRows(invoices)) rows.push([r.state, r.code, "18", String(r.count), r.taxable, r.igst, r.cgst, r.sgst, r.total]);
  const t = totals(invoices);
  rows.push(["TOTAL", "", "", String(t.count), t.taxable, t.igst, t.cgst, t.sgst, t.total]);
  return csv(rows);
}

export function hsnSummaryCsv(invoices: InvoiceData[]) {
  const rows: (string | number)[][] = [["HSN/SAC", "Description", "UQC", "Quantity", "Rate %", "Taxable Value", "IGST", "CGST", "SGST"]];
  for (const h of hsnRows(invoices)) {
    rows.push([h.code, h.description, h.code.startsWith("99") ? "OTH" : "NOS", String(h.qty), "18", h.taxable, h.igst, h.cgst, h.sgst]);
  }
  return csv(rows);
}

/** "Aug-2026" */
export const monthTag = (s: { month: number; year: number }) => `${MONTH_NAMES[s.month - 1].slice(0, 3)}-${s.year}`;
