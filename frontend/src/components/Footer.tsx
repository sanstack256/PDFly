import React from "react";
import Link from "next/link";
import { ShieldCheck, Zap, Heart, CheckCircle2 } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 pt-16 pb-12 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Col 1: Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-500 flex items-center justify-center text-white font-extrabold text-lg shadow-md">
                P
              </div>
              <span className="font-extrabold text-2xl tracking-tight text-white">
                PDF<span className="text-red-500">ly</span>
              </span>
            </Link>
            <p className="text-sm text-gray-400 max-w-sm mb-6 leading-relaxed">
              PDFly is your complete, all-in-one PDF workstation. Merge, split, compress, convert, edit, sign, and secure your documents with 100% genuine processing power.
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                TLS Encrypted
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                Instant Processing
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                No Simulators
              </span>
            </div>
          </div>

          {/* Col 2: Organize & Optimize */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Organize & Optimize
            </h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/tools/merge-pdf" className="hover:text-red-400 transition-colors">Merge PDF</Link></li>
              <li><Link href="/tools/split-pdf" className="hover:text-red-400 transition-colors">Split PDF</Link></li>
              <li><Link href="/tools/remove-pages" className="hover:text-red-400 transition-colors">Remove Pages</Link></li>
              <li><Link href="/tools/compress-pdf" className="hover:text-red-400 transition-colors">Compress PDF</Link></li>
              <li><Link href="/tools/repair-pdf" className="hover:text-red-400 transition-colors">Repair PDF</Link></li>
              <li><Link href="/tools/ocr-pdf" className="hover:text-red-400 transition-colors">OCR PDF</Link></li>
            </ul>
          </div>

          {/* Col 3: Convert */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Convert Documents
            </h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/tools/word-to-pdf" className="hover:text-red-400 transition-colors">Word to PDF</Link></li>
              <li><Link href="/tools/powerpoint-to-pdf" className="hover:text-red-400 transition-colors">PowerPoint to PDF</Link></li>
              <li><Link href="/tools/excel-to-pdf" className="hover:text-red-400 transition-colors">Excel to PDF</Link></li>
              <li><Link href="/tools/pdf-to-word" className="hover:text-red-400 transition-colors">PDF to Word</Link></li>
              <li><Link href="/tools/pdf-to-jpg" className="hover:text-red-400 transition-colors">PDF to JPG</Link></li>
              <li><Link href="/tools/pdf-to-pdfa" className="hover:text-red-400 transition-colors">PDF to PDF/A</Link></li>
            </ul>
          </div>

          {/* Col 4: Edit & Security */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Edit & Security
            </h4>
            <ul className="space-y-2 text-xs">
              <li><Link href="/tools/edit-pdf" className="hover:text-red-400 transition-colors">Edit PDF</Link></li>
              <li><Link href="/tools/protect-pdf" className="hover:text-red-400 transition-colors">Protect PDF</Link></li>
              <li><Link href="/tools/unlock-pdf" className="hover:text-red-400 transition-colors">Unlock PDF</Link></li>
              <li><Link href="/tools/sign-pdf" className="hover:text-red-400 transition-colors">Sign PDF</Link></li>
              <li><Link href="/tools/redact-pdf" className="hover:text-red-400 transition-colors">Redact PDF</Link></li>
              <li><Link href="/tools/add-watermark" className="hover:text-red-400 transition-colors">Watermark PDF</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-400 gap-4">
          <div>
            &copy; {new Date().getFullYear()} PDFly. The complete, open document workstation.
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            Engineered with <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> for genuine document fidelity.
          </div>
        </div>
      </div>
    </footer>
  );
}
