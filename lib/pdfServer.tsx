import "server-only";
import JSZip from "jszip";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "@/components/InvoicePDF";
import { hsnSummaryCsv, monthTag, registerCsv, stateSummaryCsv } from "./export";
import type { ArchiveSnapshot, InvoiceData } from "./types";

export const mergedPdf = (invoices: InvoiceData[]) => renderToBuffer(<InvoiceDocument invoices={invoices} />);

async function addInvoicePdfs(zip: JSZip, invoices: InvoiceData[]) {
  for (const inv of invoices) zip.file(inv.fileName, await renderToBuffer(<InvoiceDocument invoices={[inv]} />));
}

export async function invoicesZip(s: ArchiveSnapshot) {
  const zip = new JSZip();
  await addInvoicePdfs(zip, s.invoices);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Everything the CA needs for the month, in one ZIP. */
export async function caPackage(s: ArchiveSnapshot) {
  const tag = monthTag(s);
  const zip = new JSZip();
  const root = zip.folder(`KarCare-GST-${tag}`)!;
  if (s.invoices.length) root.file(`All-Invoices-${tag}.pdf`, await mergedPdf(s.invoices));
  await addInvoicePdfs(root.folder("Invoices")!, s.invoices);
  root.file(`Invoice-Register-${tag}.csv`, registerCsv(s.invoices));
  root.file(`State-wise-Summary-${tag}.csv`, stateSummaryCsv(s.invoices));
  root.file(`HSN-Summary-${tag}.csv`, hsnSummaryCsv(s.invoices));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
