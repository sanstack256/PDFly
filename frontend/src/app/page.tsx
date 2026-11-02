"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TOOLS, CATEGORIES, ToolConfig } from "@/lib/tools";
import ToolIcon from "@/components/ToolIcon";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lock,
  ArrowRight,
  Cpu,
} from "lucide-react";

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredTools =
    activeCategory === "all"
      ? TOOLS
      : TOOLS.filter((t) => t.category === activeCategory);

  return (
    <div className="min-h-screen bg-gray-50/60">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white border-b border-gray-100 py-16 sm:py-24">
        <div className="absolute inset-0 bg-radial-[circle_at_top,_var(--tw-gradient-stops)] from-red-50/70 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 border border-red-100 text-red-600 text-xs font-bold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>The Complete Open PDF Workstation</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-gray-950 tracking-tight mb-6 max-w-4xl mx-auto leading-[1.15]">
            Every tool you need to work with PDFs in{" "}
            <span className="text-red-600">one place</span>
          </h1>

          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
            Merge, split, compress, convert, edit, sign, and secure your documents with 100% genuine processing power. No simulated conversions. Always reliable.
          </p>

          {/* Quick trust metrics */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-gray-500">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-red-600" />
              <span>MuPDF & LibreOffice Engines</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Client-Isolated Sandboxes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>Real Tesseract OCR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-rose-600" />
              <span>AES-256 PDF Security</span>
            </div>
          </div>
        </div>
      </section>

      {/* Category Pills Bar */}
      <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 py-3 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto no-scrollbar">
          <div className="flex items-center justify-start sm:justify-center gap-2 min-w-max">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeCategory === cat.id
                    ? "bg-red-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Tool Cards Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredTools.map((tool) => (
            <Link
              key={tool.id}
              href={tool.href}
              className="group relative flex flex-col justify-between p-6 bg-white rounded-3xl border border-gray-200/80 hover:border-red-300 shadow-2xs hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${tool.color} group-hover:scale-110 transition-transform`}
                  >
                    <ToolIcon name={tool.icon} className="w-6 h-6" />
                  </div>
                  {tool.badge && (
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-100">
                      {tool.badge}
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-gray-900 group-hover:text-red-600 transition-colors mb-2">
                  {tool.title}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed font-normal">
                  {tool.shortDesc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-bold text-gray-400 group-hover:text-red-600 transition-colors">
                <span>Launch Tool</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Feature Guarantee Callout */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="bg-gradient-to-br from-gray-900 via-gray-950 to-black rounded-3xl p-8 sm:p-12 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-bold mb-4">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Industrial Grade PDF Standards</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
              Real engines, zero fake extensions
            </h2>
            <p className="text-sm text-gray-300 leading-relaxed mb-6 font-normal">
              Every document converted or processed through PDFly is backed by certified engines: MuPDF for high-speed vector stream rendering, LibreOffice headless for genuine Office document transformations, Ghostscript for ISO-compliant PDF/A, and Tesseract for real optical character recognition.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/tools/merge-pdf"
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition-all"
              >
                Start Merging PDFs
              </Link>
              <Link
                href="/tools/compress-pdf"
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all"
              >
                Compress Large PDFs
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
