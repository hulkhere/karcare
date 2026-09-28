"use client";

import { hsnSummaryCsv, monthTag, registerCsv, stateSummaryCsv } from "@/lib/export";
import type { InvoiceData } from "@/lib/types";

export interface CaFiles {
  packageZip: Blob;
  mergedPdf: Blob;
  registerCsv: Blob;
  names: { packageZip: string; mergedPdf: string; registerCsv: string };
}

/** Builds every file for the CA in the browser (no server time limits). */
export async function buildCaPackage(
  invoices: InvoiceData[],
  month: number,
  year: number,
  onProgress: (msg: string) => void,
): Promise<CaFiles> {
  const [{ pdf }, { InvoiceDocument }, { default: JSZip }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./InvoicePDF"),
    import("jszip"),
  ]);
  const tag = monthTag({ month, year });
  const csv = (s: string) => new Blob([s], { type: "text/csv;charset=utf-8" });

  onProgress("Creating combined PDF…");
  const mergedPdf = invoices.length ? await pdf(<InvoiceDocument invoices={invoices} />).toBlob() : new Blob([]);

  const zip = new JSZip();
  const root = zip.folder(`KarCare-GST-${tag}`)!;
  if (invoices.length) root.file(`All-Invoices-${tag}.pdf`, mergedPdf);
  const folder = root.folder("Invoices")!;
  for (let i = 0; i < invoices.length; i++) {
    if (i % 10 === 0) onProgress(`Creating invoice PDFs… ${i} / ${invoices.length}`);
    folder.file(invoices[i].fileName, await pdf(<InvoiceDocument invoices={[invoices[i]]} />).toBlob());
  }
  const register = registerCsv(invoices);
  root.file(`Invoice-Register-${tag}.csv`, register);
  root.file(`State-wise-Summary-${tag}.csv`, stateSummaryCsv(invoices));
  root.file(`HSN-Summary-${tag}.csv`, hsnSummaryCsv(invoices));

  onProgress("Zipping…");
  const packageZip = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return {
    packageZip,
    mergedPdf,
    registerCsv: csv(register),
    names: {
      packageZip: `KarCare-GST-${tag}.zip`,
      mergedPdf: `KarCare-Invoices-${tag}.pdf`,
      registerCsv: `Invoice-Register-${tag}.csv`,
    },
  };
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
