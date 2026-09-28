import type { Metadata } from "next";
import { Suspense } from "react";
import { NavTabs } from "@/components/NavTabs";
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
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-4">
            <div className="flex items-center gap-2 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                KC
              </span>
              <span className="text-sm font-semibold text-slate-900">
                KarCare <span className="font-normal text-slate-400">· GST Invoices</span>
              </span>
            </div>
            <Suspense>
              <NavTabs />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
