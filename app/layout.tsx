import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "KarCare Invoices",
  description: "GST invoice generator for KarCare Shopify orders",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <span className="font-semibold">
              KarCare <span className="font-normal text-slate-500">GST Invoices</span>
            </span>
            <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/summary" className="text-sm text-slate-600 hover:text-slate-900">
              GST Summary
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
