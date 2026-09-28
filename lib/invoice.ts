import { INVOICE_PREFIX } from "./constants";
import { financialYear } from "./dates";

export function invoiceNumber(invoiceDateIso: string, seq: number) {
  return `${INVOICE_PREFIX}/${financialYear(invoiceDateIso)}/${String(seq).padStart(3, "0")}`;
}

/** KC/26-27/001 → KC-26-27-001.pdf */
export function invoiceFileName(number: string) {
  return `${number.replace(/\//g, "-")}.pdf`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push((h ? "and " : "") + twoDigits(rest));
  return parts.join(" ");
}

/** Indian numbering system (Lakh, Crore). */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/** 699 → "Rupees Six Hundred and Ninety Nine Only" */
export function amountInWords(paise: number) {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  let words = `Rupees ${integerToWords(rupees)}`;
  if (p) words += ` and ${twoDigits(p)} Paise`;
  return `${words} Only`;
}

export function formatINR(rupees: number) {
  return rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
