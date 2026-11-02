"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TOOLS, CATEGORIES } from "@/lib/tools";
import ToolIcon from "@/components/ToolIcon";
import { ChevronDown, Search, Menu, X, Sparkles, ShieldCheck } from "lucide-react";

export default function Navbar() {
  const [isMegaOpen, setIsMegaOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const searchResults = searchQuery.trim()
    ? TOOLS.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.shortDesc.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const organizeTools = TOOLS.filter((t) => t.category === "organize");
  const optimizeTools = TOOLS.filter((t) => t.category === "optimize");
  const toPdfTools = TOOLS.filter((t) => t.category === "to-pdf");
  const fromPdfTools = TOOLS.filter((t) => t.category === "from-pdf");
  const editTools = TOOLS.filter((t) => t.category === "edit");
  const securityTools = TOOLS.filter((t) => t.category === "security");

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-500 flex items-center justify-center text-white font-extrabold text-xl shadow-md group-hover:scale-105 transition-transform">
              P
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-2xl tracking-tight text-gray-900 group-hover:text-red-600 transition-colors">
                PDF<span className="text-red-600">ly</span>
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            <Link
              href="/tools/merge-pdf"
              className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:text-red-600 hover:bg-red-50/50 transition-all"
            >
              Merge PDF
            </Link>
            <Link
              href="/tools/split-pdf"
              className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:text-red-600 hover:bg-red-50/50 transition-all"
            >
              Split PDF
            </Link>
            <Link
              href="/tools/compress-pdf"
              className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:text-red-600 hover:bg-red-50/50 transition-all"
            >
              Compress PDF
            </Link>
            <Link
              href="/tools/pdf-to-word"
              className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:text-red-600 hover:bg-red-50/50 transition-all"
            >
              PDF to Word
            </Link>

            {/* All PDF Tools Mega Menu Toggle */}
            <div
              className="relative"
              onMouseEnter={() => setIsMegaOpen(true)}
              onMouseLeave={() => setIsMegaOpen(false)}
            >
              <button
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                  isMegaOpen
                    ? "bg-red-50 text-red-600"
                    : "text-gray-900 hover:text-red-600 hover:bg-red-50/50"
                }`}
              >
                <span>ALL PDF TOOLS</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isMegaOpen ? "rotate-180 text-red-600" : "text-gray-400"
                  }`}
                />
              </button>

              {/* Mega Menu Dropdown */}
              {isMegaOpen && (
                <div className="absolute left-[-150px] top-full pt-2 w-[980px] transition-all">
                  <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 grid grid-cols-4 gap-6">
                    {/* Col 1: Organize */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        Organize PDF
                      </h4>
                      <ul className="space-y-1">
                        {organizeTools.map((t) => (
                          <li key={t.id}>
                            <Link
                              href={t.href}
                              onClick={() => setIsMegaOpen(false)}
                              className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <ToolIcon name={t.icon} className="w-4 h-4 text-gray-400" />
                              <span>{t.title}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Col 2: Optimize & Edit */}
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Optimize PDF
                        </h4>
                        <ul className="space-y-1">
                          {optimizeTools.map((t) => (
                            <li key={t.id}>
                              <Link
                                href={t.href}
                                onClick={() => setIsMegaOpen(false)}
                                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                              >
                                <ToolIcon name={t.icon} className="w-4 h-4 text-gray-400" />
                                <span>{t.title}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                          Edit PDF
                        </h4>
                        <ul className="space-y-1">
                          {editTools.map((t) => (
                            <li key={t.id}>
                              <Link
                                href={t.href}
                                onClick={() => setIsMegaOpen(false)}
                                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                              >
                                <ToolIcon name={t.icon} className="w-4 h-4 text-gray-400" />
                                <span>{t.title}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Col 3: Convert */}
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          Convert to PDF
                        </h4>
                        <ul className="space-y-1">
                          {toPdfTools.map((t) => (
                            <li key={t.id}>
                              <Link
                                href={t.href}
                                onClick={() => setIsMegaOpen(false)}
                                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                              >
                                <ToolIcon name={t.icon} className="w-4 h-4 text-gray-400" />
                                <span>{t.title}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Convert from PDF
                        </h4>
                        <ul className="space-y-1">
                          {fromPdfTools.map((t) => (
                            <li key={t.id}>
                              <Link
                                href={t.href}
                                onClick={() => setIsMegaOpen(false)}
                                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                              >
                                <ToolIcon name={t.icon} className="w-4 h-4 text-gray-400" />
                                <span>{t.title}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Col 4: Security & Quality banner */}
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                          PDF Security
                        </h4>
                        <ul className="space-y-1">
                          {securityTools.map((t) => (
                            <li key={t.id}>
                              <Link
                                href={t.href}
                                onClick={() => setIsMegaOpen(false)}
                                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                              >
                                <ToolIcon name={t.icon} className="w-4 h-4 text-gray-400" />
                                <span>{t.title}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-600">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900 mb-1">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          100% Private & Secure
                        </div>
                        Files are processed in an isolated sandbox with automated cleanup.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Right side: Search & Actions */}
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-gray-100 focus:bg-white border border-transparent focus:border-red-400 rounded-full text-xs text-gray-800 placeholder-gray-400 outline-none w-44 focus:w-60 transition-all"
            />
            {/* Search dropdown */}
            {searchQuery && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-50">
                {searchResults.length > 0 ? (
                  searchResults.slice(0, 6).map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setSearchQuery("")}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-red-50 text-xs font-medium text-gray-800 hover:text-red-600"
                    >
                      <ToolIcon name={item.icon} className="w-4 h-4 text-gray-500" />
                      <div>
                        <div>{item.title}</div>
                        <div className="text-[10px] text-gray-400">{item.shortDesc}</div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-3 text-xs text-gray-400 text-center">No tools found</div>
                )}
              </div>
            )}
          </div>

          <Link
            href="/tools/merge-pdf"
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Get Started
          </Link>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-gray-600 hover:text-red-600"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-4 max-h-[85vh] overflow-y-auto">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-3 py-2 bg-gray-100 rounded-lg text-sm outline-none"
            />
          </div>
          <div className="space-y-4">
            {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
              <div key={cat.id}>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  {cat.name}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {TOOLS.filter((t) => t.category === cat.id).map((t) => (
                    <Link
                      key={t.id}
                      href={t.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-xs font-semibold text-gray-800 hover:bg-red-50 hover:text-red-600"
                    >
                      <ToolIcon name={t.icon} className="w-4 h-4 text-red-500" />
                      <span className="truncate">{t.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
