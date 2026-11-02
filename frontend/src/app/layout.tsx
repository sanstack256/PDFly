import type { Metadata } from "next";
import "./compiled.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "PDFly - Complete Online PDF Workstation",
  description:
    "Merge, split, compress, convert, edit, sign, and protect PDF files. Genuine document conversions and PDF processing engines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
