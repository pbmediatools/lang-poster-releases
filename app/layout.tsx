import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lang Property Poster",
  description: "Auto-generate property social posts for Lang Town & Country",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
