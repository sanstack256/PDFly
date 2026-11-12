"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ToolConfig } from "@/lib/tools";
import FileUploadZone from "@/components/FileUploadZone";
import DownloadView from "@/components/DownloadView";
import ThumbnailSelector from "@/components/ThumbnailSelector";
import SignatureModal from "@/components/SignatureModal";
import PagePlacementCanvas, { RedactBox } from "@/components/PagePlacementCanvas";
import ToolIcon from "@/components/ToolIcon";
import { getApiUrl } from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Settings,
  PenTool,
  Lock,
  Unlock,
  ShieldAlert,
  Sparkles,
  Type,
  Image as ImageIcon,
  Upload,
  Eye,
  Check,
  Trash2,
  BookOpen,
  Globe,
  Search,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

interface ToolRunnerProps {
  tool: ToolConfig;
}

function parsePageRanges(input: string, maxPages?: number): number[] {
  if (!input.trim()) return [];
  const pagesSet = new Set<number>();
  const parts = input.split(/[,;\s]+/);
  for (const part of parts) {
    if (!part) continue;
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const minP = Math.max(1, Math.min(start, end));
        const maxP = maxPages && maxPages > 0 ? Math.min(maxPages, Math.max(start, end)) : Math.max(start, end);
        for (let p = minP; p <= maxP; p++) {
          pagesSet.add(p);
        }
      }
    } else {
      const p = parseInt(part, 10);
      if (!isNaN(p) && p >= 1 && (!maxPages || maxPages <= 0 || p <= maxPages)) {
        pagesSet.add(p);
      }
    }
  }
  return Array.from(pagesSet).sort((a, b) => a - b);
}

function formatPageRanges(pages: number[]): string {
  if (!pages || pages.length === 0) return "";
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = start;

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(", ");
}

export default function ToolRunner({ tool }: ToolRunnerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    filename: string;
    download_url: string;
    file_size?: number;
    original_size?: number;
    savings_percent?: number;
  } | null>(null);

  // Tool specific configurations
  // 1. Organize
  const [splitMode, setSplitMode] = useState<"ranges" | "all">("ranges");
  const [splitRanges, setSplitRanges] = useState("");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [manualRemoveInput, setManualRemoveInput] = useState("");
  const [detectedPageCount, setDetectedPageCount] = useState(1);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [rotateAngle, setRotateAngle] = useState(90);
  const [pageNumberPosition, setPageNumberPosition] = useState("bottom-right");
  const [pageNumberFormat, setPageNumberFormat] = useState("page_of_total");
  const [pageNumberFontSize, setPageNumberFontSize] = useState(11);
  const [pageNumberMargin, setPageNumberMargin] = useState(36);
  const [pageNumberColor, setPageNumberColor] = useState("#333333");
  const [pageNumberStartPage, setPageNumberStartPage] = useState(1);
  const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [watermarkFontSize, setWatermarkFontSize] = useState(48);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.35);
  const [watermarkRotation, setWatermarkRotation] = useState(45);
  const [watermarkColor, setWatermarkColor] = useState("#888888");
  const [watermarkImageFile, setWatermarkImageFile] = useState<File | null>(null);
  const [watermarkImagePreview, setWatermarkImagePreview] = useState<string | null>(null);

  // 2. Optimize
  const [compressionLevel, setCompressionLevel] = useState<"recommended" | "extreme" | "less">("recommended");
  const [ocrLanguage, setOcrLanguage] = useState("eng");

  // 3. Convert
  const [pageSize, setPageSize] = useState("A4");
  const [pageOrientation, setPageOrientation] = useState("auto");
  const [pdfaVersion, setPdfaVersion] = useState("2");

  // 4. Security & Edit
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [signaturePos, setSignaturePos] = useState<{ x: number; y: number; width: number; height: number; page: number } | null>(null);
  const [activePlacementPage, setActivePlacementPage] = useState<number>(1);
  const [redactions, setRedactions] = useState<RedactBox[]>([]);
  const [editText, setEditText] = useState("");
  const [editColor, setEditColor] = useState("#0000FF");

  // 5. Docu: Documentation to PDF
  const [docuMode, setDocuMode] = useState<"url" | "upload">("url");
  const [docuUrl, setDocuUrl] = useState("https://docs.python.org/3/tutorial/");
  const [docuTitle, setDocuTitle] = useState("");
  const [docuMaxPages, setDocuMaxPages] = useState(20);
  const [docuMaxDepth, setDocuMaxDepth] = useState(2);
  const [docuDiscoveredPages, setDocuDiscoveredPages] = useState<Array<{ url: string; title: string; section?: string; depth: number; path?: string }>>([]);
  const [docuSelectedUrls, setDocuSelectedUrls] = useState<string[]>([]);
  const [docuDiscovering, setDocuDiscovering] = useState(false);
  const [docuDiscoveryDone, setDocuDiscoveryDone] = useState(false);

  const handleReset = () => {
    setFiles([]);
    setResult(null);
    setError(null);
    setSelectedPages([]);
    setManualRemoveInput("");
    setDetectedPageCount(1);
    setWatermarkType("text");
    setWatermarkImageFile(null);
    setWatermarkImagePreview(null);
    setPageOrder([]);
    setRotations({});
    setRedactions([]);
    setSignatureDataUrl(null);
    setSignaturePos(null);
    setPassword("");
    setConfirmPassword("");
    setDocuMode("url");
    setDocuUrl("https://docs.python.org/3/tutorial/");
    setDocuTitle("");
    setDocuMaxPages(20);
    setDocuMaxDepth(2);
    setDocuDiscoveredPages([]);
    setDocuSelectedUrls([]);
    setDocuDiscovering(false);
    setDocuDiscoveryDone(false);
  };

  const handleDiscoverDocPages = async () => {
    if (!docuUrl.trim()) return;
    setDocuDiscovering(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("url", docuUrl.trim());
      fd.append("max_pages", String(docuMaxPages));
      fd.append("max_depth", String(docuMaxDepth));
      const res = await fetch(getApiUrl("/api/convert/docu-discover"), {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to discover documentation pages.");
      }
      const data = await res.json();
      const pages = data.pages || [];
      setDocuDiscoveredPages(pages);
      setDocuSelectedUrls(pages.map((p: any) => p.url));
      if (data.site_title && !docuTitle) {
        setDocuTitle(`${data.site_title} Manual`);
      }
      setDocuDiscoveryDone(true);
    } catch (err: any) {
      setError(err.message || "Failed to discover documentation pages.");
    } finally {
      setDocuDiscovering(false);
    }
  };

  const handleProcess = async () => {
    if (files.length === 0 && (tool.id !== "docu-to-pdf" || docuMode !== "url")) return;
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();

      // Tool-specific parameter assembly
      switch (tool.id) {
        case "merge-pdf":
          if (files.length < 2) {
            throw new Error("Please upload at least 2 PDF files to merge.");
          }
          files.forEach((f) => formData.append("files", f));
          break;

        case "split-pdf":
          formData.append("file", files[0]);
          formData.append("split_mode", splitMode);
          if (splitMode === "ranges" && splitRanges.trim()) {
            formData.append("ranges", splitRanges);
          }
          break;

        case "remove-pages":
          formData.append("file", files[0]);
          if (selectedPages.length === 0) {
            throw new Error("Please select at least one page to remove.");
          }
          formData.append("pages", selectedPages.join(","));
          break;

        case "extract-pages":
          formData.append("file", files[0]);
          if (selectedPages.length === 0) {
            throw new Error("Please select at least one page to extract.");
          }
          formData.append("pages", selectedPages.join(","));
          formData.append("as_zip", "false");
          break;

        case "organize-pages":
          formData.append("file", files[0]);
          formData.append("page_order", JSON.stringify(pageOrder));
          formData.append("rotations", JSON.stringify(rotations));
          break;

        case "rotate-pdf":
          formData.append("file", files[0]);
          formData.append("angle", String(rotateAngle));
          if (selectedPages.length > 0) {
            formData.append("pages", selectedPages.join(","));
          }
          break;

        case "page-numbers":
          formData.append("file", files[0]);
          formData.append("position", pageNumberPosition);
          formData.append("format_type", pageNumberFormat);
          formData.append("font_size", String(pageNumberFontSize));
          formData.append("margin", String(pageNumberMargin));
          formData.append("color", pageNumberColor);
          formData.append("start_page", String(pageNumberStartPage));
          break;

        case "add-watermark":
          formData.append("file", files[0]);
          formData.append("watermark_type", watermarkType);
          if (watermarkType === "image") {
            if (!watermarkImageFile) {
              throw new Error("Please upload an image or logo for the watermark.");
            }
            formData.append("watermark_image", watermarkImageFile);
          } else {
            formData.append("text", watermarkText || "CONFIDENTIAL");
            formData.append("font_size", String(watermarkFontSize));
            formData.append("color", watermarkColor);
          }
          formData.append("opacity", String(watermarkOpacity));
          formData.append("rotation", String(watermarkRotation));
          break;

        case "compress-pdf":
          formData.append("file", files[0]);
          formData.append("compression_level", compressionLevel);
          break;

        case "repair-pdf":
          formData.append("file", files[0]);
          break;

        case "ocr-pdf":
          formData.append("file", files[0]);
          formData.append("language", ocrLanguage);
          break;

        case "jpg-to-pdf":
          files.forEach((f) => formData.append("files", f));
          formData.append("page_size", pageSize);
          formData.append("orientation", pageOrientation);
          break;

        case "word-to-pdf":
        case "powerpoint-to-pdf":
        case "excel-to-pdf":
        case "html-to-pdf":
          formData.append("file", files[0]);
          break;

        case "docu-to-pdf":
          if (docuMode === "url") {
            if (!docuUrl.trim()) throw new Error("Please enter a documentation website URL.");
            formData.append("url", docuUrl.trim());
            if (docuTitle.trim()) formData.append("document_title", docuTitle.trim());
            formData.append("max_pages", String(docuMaxPages));
            formData.append("max_depth", String(docuMaxDepth));
            if (docuSelectedUrls.length > 0) {
              formData.append("selected_urls", JSON.stringify(docuSelectedUrls));
            }
          } else {
            if (files.length === 0) throw new Error("Please upload at least one HTML or documentation file.");
            files.forEach((f) => formData.append("file", f));
            if (docuTitle.trim()) formData.append("document_title", docuTitle.trim());
          }
          break;
        case "pdf-to-jpg":
        case "pdf-to-word":
        case "pdf-to-powerpoint":
        case "pdf-to-excel":
          formData.append("file", files[0]);
          break;

        case "pdf-to-pdfa":
          formData.append("file", files[0]);
          formData.append("version", pdfaVersion);
          break;

        case "protect-pdf":
          if (!password) throw new Error("Password cannot be empty.");
          if (password !== confirmPassword) throw new Error("Passwords do not match.");
          formData.append("file", files[0]);
          formData.append("password", password);
          break;

        case "unlock-pdf":
          if (!password) throw new Error("Please enter document password.");
          formData.append("file", files[0]);
          formData.append("password", password);
          break;

        case "sign-pdf":
          if (!signatureDataUrl) throw new Error("Please draw or type your signature.");
          formData.append("file", files[0]);
          formData.append("page", String(signaturePos ? signaturePos.page : 1));
          formData.append("x", String(signaturePos ? signaturePos.x : 100));
          formData.append("y", String(signaturePos ? signaturePos.y : 100));
          formData.append("width", String(signaturePos ? signaturePos.width : 140));
          formData.append("height", String(signaturePos ? signaturePos.height : 60));
          formData.append("signature_data_url", signatureDataUrl);
          break;

        case "redact-pdf":
          if (redactions.length === 0) {
            throw new Error("Please drag and blackout at least one area on a page.");
          }
          formData.append("file", files[0]);
          formData.append("redactions", JSON.stringify(redactions));
          break;

        case "edit-pdf":
          formData.append("file", files[0]);
          const edits = [];
          if (editText.trim()) {
            edits.push({
              type: "text",
              page: activePlacementPage,
              text: editText,
              x: 100,
              y: 150,
              fontSize: 16,
              color: editColor,
            });
          }
          if (selectedPages.length > 0) {
            selectedPages.forEach((p) => {
              edits.push({
                type: "rotate",
                page: p,
                angle: 90,
              });
            });
          }
          formData.append("edits", JSON.stringify(edits));
          break;

        default:
          formData.append("file", files[0]);
      }

      // Dispatch API request to backend
      const endpointUrl = getApiUrl(tool.endpoint);
      const res = await fetch(endpointUrl, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Processing failed with status ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during processing.");
    } finally {
      setLoading(false);
    }
  };

  const isPdf = files.length > 0 && files[0].name.toLowerCase().endsWith(".pdf");

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Top back button & breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to all tools
        </Link>
      </div>

      {/* Hero Title Section */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-100 text-red-600 mb-4 shadow-xs">
          <ToolIcon name={tool.icon} className="w-7 h-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-3">
          {tool.title}
        </h1>
        <p className="text-base text-gray-500 leading-relaxed">{tool.description}</p>
      </div>

      {/* Main Card View */}
      {result ? (
        <DownloadView
          filename={result.filename}
          downloadUrl={result.download_url}
          fileSize={result.file_size}
          originalSize={result.original_size}
          savingsPercent={result.savings_percent}
          onReset={handleReset}
          toolTitle={tool.title}
        />
      ) : (
        <div className="space-y-8">
          {/* Docu Mode Switcher */}
          {tool.id === "docu-to-pdf" && (
            <div className="flex items-center p-1.5 bg-gray-100 rounded-2xl max-w-md mx-auto mb-2">
              <button
                type="button"
                onClick={() => setDocuMode("url")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  docuMode === "url"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Documentation URL
              </button>
              <button
                type="button"
                onClick={() => setDocuMode("upload")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  docuMode === "upload"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload HTML / Files
              </button>
            </div>
          )}

          {/* If Docu & URL mode: render Docu URL Card */}
          {tool.id === "docu-to-pdf" && docuMode === "url" ? (
            <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                  Documentation Website or Article URL
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <input
                      type="url"
                      placeholder="https://docs.python.org/3/tutorial/"
                      value={docuUrl}
                      onChange={(e) => setDocuUrl(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscoverDocPages}
                    disabled={docuDiscovering || !docuUrl.trim()}
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-xs"
                  >
                    {docuDiscovering ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Discovering Pages...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Discover Pages</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Preset Chips */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-gray-500 font-semibold">Try sample:</span>
                {[
                  { label: "Python Tutorial", url: "https://docs.python.org/3/tutorial/" },
                  { label: "FastAPI User Guide", url: "https://fastapi.tiangolo.com/tutorial/" },
                  { label: "Docker Quickstart", url: "https://docs.docker.com/get-started/" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setDocuUrl(preset.url);
                      setDocuTitle(`${preset.label} Manual`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Configuration Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Custom Book Title</label>
                  <input
                    type="text"
                    placeholder="e.g. FastAPI Developer Guide"
                    value={docuTitle}
                    onChange={(e) => setDocuTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-medium outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700">Max Pages ({docuMaxPages})</label>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={docuMaxPages}
                    onChange={(e) => setDocuMaxPages(Number(e.target.value))}
                    className="w-full accent-indigo-600 mt-1"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700">Crawl Depth ({docuMaxDepth})</label>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="1"
                    value={docuMaxDepth}
                    onChange={(e) => setDocuMaxDepth(Number(e.target.value))}
                    className="w-full accent-indigo-600 mt-1"
                  />
                </div>
              </div>

              {/* Discovered Pages List */}
              {docuDiscoveredPages.length > 0 && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Discovered {docuDiscoveredPages.length} Pages (Selected: {docuSelectedUrls.length})
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDocuSelectedUrls(docuDiscoveredPages.map((p) => p.url))}
                        className="text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setDocuSelectedUrls([])}
                        className="text-xs font-semibold text-gray-500 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 p-2 bg-gray-50 rounded-2xl border border-gray-200">
                    {docuDiscoveredPages.map((p) => {
                      const isChecked = docuSelectedUrls.includes(p.url);
                      return (
                        <div
                          key={p.url}
                          onClick={() => {
                            if (isChecked) {
                              setDocuSelectedUrls(docuSelectedUrls.filter((u) => u !== p.url));
                            } else {
                              setDocuSelectedUrls([...docuSelectedUrls, p.url]);
                            }
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            isChecked
                              ? "bg-white border-indigo-300 shadow-2xs text-gray-900"
                              : "bg-gray-100/50 border-transparent text-gray-500"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              className="rounded text-indigo-600 pointer-events-none"
                            />
                            <span className="font-bold truncate">{p.title}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono shrink-0 ml-2">
                            {p.path}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* File Upload Zone */
            <FileUploadZone
              acceptedTypes={tool.acceptedFileTypes}
              allowMultiple={tool.allowMultiple}
              files={files}
              onFilesChange={setFiles}
              title={`Select ${tool.allowMultiple ? "files" : "file"} for ${tool.title}`}
            />
          )}

          {/* Interactive Configuration Panels (shown once file is selected or if docu url mode) */}
          {(files.length > 0 || (tool.id === "docu-to-pdf" && docuMode === "url")) && (
            <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-xs">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                <Settings className="w-5 h-5 text-red-600" />
                <h3 className="text-lg font-bold text-gray-900">{tool.title} Options</h3>
              </div>

              {/* 1. Organize Options */}
              {tool.id === "split-pdf" && isPdf && (
                <div className="space-y-6">
                  <div className="flex rounded-xl bg-gray-100 p-1 max-w-md">
                    <button
                      type="button"
                      onClick={() => setSplitMode("ranges")}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        splitMode === "ranges" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                      }`}
                    >
                      Split by Page Range
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitMode("all")}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        splitMode === "all" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                      }`}
                    >
                      Extract All Pages (ZIP)
                    </button>
                  </div>
                  {splitMode === "ranges" && (
                    <div className="max-w-md">
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Page Ranges (e.g. "1-3, 5" or "1-2; 3-5" for multiple files)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1-3, 5"
                        value={splitRanges}
                        onChange={(e) => setSplitRanges(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:border-red-500 outline-none"
                      />
                    </div>
                  )}
                  <ThumbnailSelector file={files[0]} mode="view" />
                </div>
              )}

              {tool.id === "remove-pages" && isPdf && (
                <div className="space-y-6">
                  {/* Manual input and selection summary */}
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                          Pages to remove:
                        </label>
                        <p className="text-xs text-gray-500">
                          Type page numbers or click the thumbnail cards below.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            const all = Array.from({ length: detectedPageCount }, (_, i) => i + 1);
                            setSelectedPages(all);
                            setManualRemoveInput(formatPageRanges(all));
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors shadow-2xs"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const odd = Array.from({ length: detectedPageCount }, (_, i) => i + 1).filter((p) => p % 2 !== 0);
                            setSelectedPages(odd);
                            setManualRemoveInput(formatPageRanges(odd));
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors shadow-2xs"
                        >
                          Odd Pages
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const even = Array.from({ length: detectedPageCount }, (_, i) => i + 1).filter((p) => p % 2 === 0);
                            setSelectedPages(even);
                            setManualRemoveInput(formatPageRanges(even));
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors shadow-2xs"
                        >
                          Even Pages
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPages([]);
                            setManualRemoveInput("");
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-gray-300 rounded-lg text-red-600 hover:bg-red-50 transition-colors shadow-2xs"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. 1, 3, 5-8"
                        value={manualRemoveInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualRemoveInput(val);
                          const parsed = parsePageRanges(val, detectedPageCount);
                          setSelectedPages(parsed);
                        }}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-medium focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none placeholder:text-gray-400"
                      />
                    </div>

                    <div className="flex items-center justify-between mt-3 text-xs">
                      <span className="font-semibold text-gray-700">
                        Total Document Pages: <span className="font-bold text-gray-900">{detectedPageCount}</span>
                      </span>
                      <span className={`font-bold ${selectedPages.length > 0 ? "text-red-600" : "text-gray-400"}`}>
                        {selectedPages.length > 0
                          ? `${selectedPages.length} ${selectedPages.length === 1 ? "page" : "pages"} marked for removal`
                          : "No pages selected"}
                      </span>
                    </div>
                  </div>

                  {/* Thumbnail Cards Grid */}
                  <ThumbnailSelector
                    file={files[0]}
                    mode="select"
                    selectedPages={selectedPages}
                    onSelectedPagesChange={(newPages) => {
                      setSelectedPages(newPages);
                      setManualRemoveInput(formatPageRanges(newPages));
                    }}
                    badgeText="REMOVE"
                    onPageCountLoaded={(cnt) => setDetectedPageCount(cnt)}
                  />
                </div>
              )}

              {tool.id === "extract-pages" && isPdf && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Click the pages you want to extract ({selectedPages.length} selected).
                  </p>
                  <ThumbnailSelector
                    file={files[0]}
                    mode="select"
                    selectedPages={selectedPages}
                    onSelectedPagesChange={setSelectedPages}
                  />
                </div>
              )}

              {tool.id === "organize-pages" && isPdf && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Drag and drop page cards to reorder your document, use arrow buttons, or rotate individual sheets.
                  </p>
                  <ThumbnailSelector
                    file={files[0]}
                    mode="reorder"
                    pageOrder={pageOrder}
                    onPageOrderChange={setPageOrder}
                    rotations={rotations}
                    onRotationsChange={setRotations}
                    onPageCountLoaded={(cnt) => {
                      if (pageOrder.length === 0) {
                        setPageOrder(Array.from({ length: cnt }, (_, i) => i + 1));
                      }
                    }}
                  />
                </div>
              )}

              {tool.id === "rotate-pdf" && isPdf && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-700">Rotation Angle:</span>
                    {[90, 180, 270].map((angle) => (
                      <button
                        key={angle}
                        type="button"
                        onClick={() => setRotateAngle(angle)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          rotateAngle === angle
                            ? "bg-red-600 text-white shadow-xs"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        +{angle}° Clockwise
                      </button>
                    ))}
                  </div>
                  <ThumbnailSelector
                    file={files[0]}
                    mode="rotate"
                    selectedPages={selectedPages}
                    onSelectedPagesChange={setSelectedPages}
                  />
                </div>
              )}

              {tool.id === "page-numbers" && isPdf && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Controls Column */}
                    <div className="lg:col-span-7 space-y-6">
                      {/* Visual Position Matrix */}
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                          Page Number Position
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                          Select the exact location on the page where numbers should appear.
                        </p>
                        <div className="grid grid-cols-3 gap-2.5 max-w-md">
                          {[
                            { id: "top-left", label: "Top Left" },
                            { id: "top-center", label: "Top Center" },
                            { id: "top-right", label: "Top Right" },
                            { id: "bottom-left", label: "Bottom Left" },
                            { id: "bottom-center", label: "Bottom Center" },
                            { id: "bottom-right", label: "Bottom Right" },
                          ].map((pos) => {
                            const isCurrent = pageNumberPosition === pos.id;
                            return (
                              <button
                                key={pos.id}
                                type="button"
                                onClick={() => setPageNumberPosition(pos.id)}
                                className={`flex items-center justify-center py-2.5 px-3 rounded-xl border-2 text-xs font-bold transition-all ${
                                  isCurrent
                                    ? "border-red-600 bg-red-50/50 text-red-700 ring-2 ring-red-100 shadow-2xs"
                                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                                }`}
                              >
                                {pos.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Format and Start Page */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">Numbering Format</label>
                          <select
                            value={pageNumberFormat}
                            onChange={(e) => setPageNumberFormat(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium outline-none focus:border-red-500 bg-white"
                          >
                            <option value="page_of_total">Page 1 of 10</option>
                            <option value="page_only">1</option>
                            <option value="dash">- 1 -</option>
                            <option value="page_num">Page 1</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">First Page Number</label>
                          <input
                            type="number"
                            min="1"
                            value={pageNumberStartPage}
                            onChange={(e) => setPageNumberStartPage(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium outline-none focus:border-red-500 bg-white"
                          />
                        </div>
                      </div>

                      {/* Margin, Font Size & Color */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">Margin</label>
                          <div className="flex items-center gap-1">
                            {[
                              { label: "Small", val: 18 },
                              { label: "Normal", val: 36 },
                              { label: "Wide", val: 54 },
                            ].map((m) => (
                              <button
                                key={m.label}
                                type="button"
                                onClick={() => setPageNumberMargin(m.val)}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                  pageNumberMargin === m.val
                                    ? "bg-red-600 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-gray-700">Font Size ({pageNumberFontSize}pt)</label>
                          </div>
                          <input
                            type="range"
                            min="8"
                            max="20"
                            step="1"
                            value={pageNumberFontSize}
                            onChange={(e) => setPageNumberFontSize(Number(e.target.value))}
                            className="w-full accent-red-600 mt-2"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">Color</label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="color"
                              value={pageNumberColor}
                              onChange={(e) => setPageNumberColor(e.target.value)}
                              className="w-8 h-8 rounded-lg cursor-pointer border border-gray-300 p-0.5"
                            />
                            <div className="flex items-center gap-1">
                              {["#333333", "#000000", "#DC2626", "#1D4ED8"].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setPageNumberColor(c)}
                                  style={{ backgroundColor: c }}
                                  className={`w-5 h-5 rounded-full border ${
                                    pageNumberColor === c ? "ring-2 ring-red-500 ring-offset-1" : "border-gray-200"
                                  }`}
                                  title={c}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Live Visual Preview Column */}
                    <div className="lg:col-span-5 bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center">
                      <div className="flex items-center justify-between w-full mb-3">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-red-500" />
                          Live Placement Preview
                        </span>
                        <span className="text-[10px] text-gray-400">Position: {pageNumberPosition}</span>
                      </div>

                      {/* Simulated Document Sheet */}
                      <div className="relative w-full max-w-[220px] aspect-[1/1.414] bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col justify-between p-4 select-none">
                        {/* Simulated text lines */}
                        <div className="space-y-2 opacity-25 pointer-events-none mt-2">
                          <div className="h-2 bg-gray-400 rounded w-1/2" />
                          <div className="h-1 bg-gray-300 rounded w-full" />
                          <div className="h-1 bg-gray-300 rounded w-5/6" />
                          <div className="h-1 bg-gray-300 rounded w-4/5" />
                          <div className="h-1 bg-gray-300 rounded w-full" />
                          <div className="h-1 bg-gray-300 rounded w-3/4" />
                        </div>

                        {/* Stamped Numbering Preview Badge */}
                        <div
                          style={{ color: pageNumberColor }}
                          className={`absolute font-bold text-[10px] tracking-tight pointer-events-none transition-all ${
                            pageNumberPosition === "top-left"
                              ? "top-3 left-4 text-left"
                              : pageNumberPosition === "top-center"
                              ? "top-3 inset-x-0 text-center"
                              : pageNumberPosition === "top-right"
                              ? "top-3 right-4 text-right"
                              : pageNumberPosition === "bottom-left"
                              ? "bottom-3 left-4 text-left"
                              : pageNumberPosition === "bottom-center"
                              ? "bottom-3 inset-x-0 text-center"
                              : "bottom-3 right-4 text-right"
                          }`}
                        >
                          <span className="bg-red-50/80 px-1.5 py-0.5 rounded border border-red-200 text-red-700">
                            {pageNumberFormat === "page_of_total"
                              ? `Page ${pageNumberStartPage} of 10`
                              : pageNumberFormat === "page_only"
                              ? `${pageNumberStartPage}`
                              : pageNumberFormat === "dash"
                              ? `- ${pageNumberStartPage} -`
                              : `Page ${pageNumberStartPage}`}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-500 text-center mt-3 font-medium">
                        Stamped at <strong className="text-gray-800">{pageNumberPosition}</strong> with {pageNumberMargin}pt margin
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {tool.id === "add-watermark" && isPdf && (
                <div className="space-y-6">
                  {/* Mode switcher: Text vs Image */}
                  <div className="flex items-center p-1 bg-gray-100 rounded-xl max-w-sm">
                    <button
                      type="button"
                      onClick={() => setWatermarkType("text")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                        watermarkType === "text"
                          ? "bg-white text-gray-900 shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <Type className="w-3.5 h-3.5" />
                      Text Watermark
                    </button>
                    <button
                      type="button"
                      onClick={() => setWatermarkType("image")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                        watermarkType === "image"
                          ? "bg-white text-gray-900 shadow-xs"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Image / Logo
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Controls Column (left 7 cols) */}
                    <div className="lg:col-span-7 space-y-5">
                      {watermarkType === "text" ? (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-bold text-gray-700">Watermark Text</label>
                              <div className="flex items-center gap-1">
                                {["CONFIDENTIAL", "DRAFT", "DO NOT COPY", "SAMPLE"].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setWatermarkText(preset)}
                                    className="text-[10px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded transition-colors"
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <input
                              type="text"
                              value={watermarkText}
                              onChange={(e) => setWatermarkText(e.target.value)}
                              placeholder="Type watermark text..."
                              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-bold text-gray-700">Font Size ({watermarkFontSize}px)</label>
                              </div>
                              <input
                                type="range"
                                min="16"
                                max="96"
                                step="2"
                                value={watermarkFontSize}
                                onChange={(e) => setWatermarkFontSize(Number(e.target.value))}
                                className="w-full accent-red-600"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Watermark Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={watermarkColor}
                                  onChange={(e) => setWatermarkColor(e.target.value)}
                                  className="w-8 h-8 rounded-lg cursor-pointer border border-gray-300 p-0.5"
                                />
                                <div className="flex items-center gap-1">
                                  {["#888888", "#DC2626", "#1D4ED8", "#059669", "#111827"].map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => setWatermarkColor(c)}
                                      style={{ backgroundColor: c }}
                                      className={`w-5 h-5 rounded-full border ${
                                        watermarkColor === c ? "ring-2 ring-red-400 ring-offset-1" : "border-gray-200"
                                      }`}
                                      title={c}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                              Upload Logo / Stamp Image (PNG, JPG, SVG)
                            </label>
                            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-2xl hover:border-red-500 cursor-pointer bg-gray-50/50 hover:bg-red-50/20 transition-all">
                              <Upload className="w-6 h-6 text-gray-400 mb-2" />
                              <span className="text-xs font-bold text-gray-700">
                                {watermarkImageFile ? watermarkImageFile.name : "Click to select logo / stamp image"}
                              </span>
                              <span className="text-[10px] text-gray-400 mt-1">
                                Transparent PNG recommended for best results
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    setWatermarkImageFile(f);
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      setWatermarkImagePreview(reader.result as string);
                                    };
                                    reader.readAsDataURL(f);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Common sliders for both text and image */}
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-gray-700">
                              Rotation Angle ({watermarkRotation}°)
                            </label>
                            <div className="flex items-center gap-1">
                              {[0, 45, 90].map((deg) => (
                                <button
                                  key={deg}
                                  type="button"
                                  onClick={() => setWatermarkRotation(deg)}
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
                                    watermarkRotation === deg
                                      ? "bg-red-600 text-white"
                                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                  }`}
                                >
                                  {deg}°
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="15"
                            value={watermarkRotation}
                            onChange={(e) => setWatermarkRotation(Number(e.target.value))}
                            className="w-full accent-red-600"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-gray-700">
                              Opacity ({Math.round(watermarkOpacity * 100)}%)
                            </label>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={watermarkOpacity}
                            onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                            className="w-full accent-red-600"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Live Preview Column (right 5 cols) */}
                    <div className="lg:col-span-5 bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center">
                      <div className="flex items-center justify-between w-full mb-3">
                        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-red-500" />
                          Live Document Preview
                        </span>
                        <span className="text-[10px] text-gray-400">Updates in real time</span>
                      </div>

                      {/* Simulated PDF Page */}
                      <div className="relative w-full max-w-[240px] aspect-[1/1.414] bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex items-center justify-center p-4 select-none">
                        {/* Page simulated contents */}
                        <div className="absolute inset-x-4 top-4 space-y-2 opacity-25 pointer-events-none">
                          <div className="h-2.5 bg-gray-400 rounded w-2/3" />
                          <div className="h-1.5 bg-gray-300 rounded w-full" />
                          <div className="h-1.5 bg-gray-300 rounded w-5/6" />
                          <div className="h-1.5 bg-gray-300 rounded w-4/5" />
                          <div className="h-1.5 bg-gray-300 rounded w-full" />
                          <div className="h-1.5 bg-gray-300 rounded w-3/4" />
                          <div className="h-1.5 bg-gray-300 rounded w-5/6" />
                        </div>
                        <div className="absolute inset-x-4 bottom-4 space-y-1.5 opacity-20 pointer-events-none">
                          <div className="h-1.5 bg-gray-300 rounded w-full" />
                          <div className="h-1.5 bg-gray-300 rounded w-4/5" />
                          <div className="h-1.5 bg-gray-300 rounded w-2/3" />
                        </div>

                        {/* Stamped Watermark Layer */}
                        <div
                          style={{
                            transform: `rotate(${watermarkRotation}deg)`,
                            opacity: watermarkOpacity,
                            color: watermarkColor,
                            fontSize: `${Math.round(watermarkFontSize * 0.42)}px`,
                            transition: "transform 0.1s ease-out, opacity 0.1s ease-out",
                          }}
                          className="font-black text-center whitespace-nowrap z-10 pointer-events-none tracking-widest max-w-[260px] truncate"
                        >
                          {watermarkType === "text" ? (
                            watermarkText || "WATERMARK"
                          ) : watermarkImagePreview ? (
                            <img
                              src={watermarkImagePreview}
                              alt="Watermark preview"
                              className="max-h-24 max-w-32 object-contain"
                            />
                          ) : (
                            <div className="border border-dashed border-gray-400 rounded p-2 text-[10px] text-gray-500">
                              Upload Logo
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-500 text-center mt-3">
                        {watermarkType === "text"
                          ? `Text "${watermarkText || "WATERMARK"}" stamped at ${watermarkRotation}° (${Math.round(watermarkOpacity * 100)}% opacity)`
                          : `Image logo stamped at ${watermarkRotation}° (${Math.round(watermarkOpacity * 100)}% opacity)`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Optimize Options */}
              {tool.id === "compress-pdf" && isPdf && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      id: "extreme",
                      title: "Extreme Compression",
                      desc: "Maximum file reduction, optimized for web transfer.",
                    },
                    {
                      id: "recommended",
                      title: "Recommended Compression",
                      desc: "Balanced high quality and excellent size reduction.",
                    },
                    {
                      id: "less",
                      title: "Less Compression",
                      desc: "High visual fidelity with lossless stream optimization.",
                    },
                  ].map((lvl) => (
                    <div
                      key={lvl.id}
                      onClick={() => setCompressionLevel(lvl.id as any)}
                      className={`cursor-pointer p-4 rounded-2xl border-2 transition-all ${
                        compressionLevel === lvl.id
                          ? "border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-100"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <h4 className="text-sm font-bold text-gray-900 mb-1">{lvl.title}</h4>
                      <p className="text-xs text-gray-500">{lvl.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              {tool.id === "ocr-pdf" && isPdf && (
                <div className="max-w-xs">
                  <label className="block text-xs font-bold text-gray-700 mb-1">Document Language</label>
                  <select
                    value={ocrLanguage}
                    onChange={(e) => setOcrLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                  >
                    <option value="eng">English</option>
                    <option value="osd">Auto Detect Script</option>
                  </select>
                </div>
              )}

              {/* 3. Convert Options */}
              {tool.id === "docu-to-pdf" && docuMode === "upload" && (
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Custom Manual Title</label>
                    <input
                      type="text"
                      placeholder="e.g. My Documentation Manual"
                      value={docuTitle}
                      onChange={(e) => setDocuTitle(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {tool.id === "jpg-to-pdf" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Page Size</label>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                    >
                      <option value="A4">A4 (Standard)</option>
                      <option value="Letter">US Letter</option>
                      <option value="Fit">Fit to Image</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Orientation</label>
                    <select
                      value={pageOrientation}
                      onChange={(e) => setPageOrientation(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                    >
                      <option value="auto">Auto Orient</option>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 4. Security: Protect & Unlock */}
              {tool.id === "protect-pdf" && isPdf && (
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Set Document Password</label>
                    <input
                      type="password"
                      placeholder="Enter strong password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      placeholder="Repeat password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-rose-500" />
                    Secured with standard AES-256 encryption.
                  </p>
                </div>
              )}

              {tool.id === "unlock-pdf" && isPdf && (
                <div className="max-w-md space-y-3">
                  <label className="block text-xs font-bold text-gray-700">Enter Document Password</label>
                  <input
                    type="password"
                    placeholder="Enter current PDF password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                  />
                  <p className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Unlock className="w-3.5 h-3.5 text-rose-500" />
                    Security and password restrictions will be permanently removed.
                  </p>
                </div>
              )}

              {/* 5. Sign PDF Canvas */}
              {tool.id === "sign-pdf" && isPdf && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsSignatureModalOpen(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                    >
                      <PenTool className="w-4 h-4" />
                      {signatureDataUrl ? "Change Signature" : "Create Signature"}
                    </button>
                    {signatureDataUrl && (
                      <span className="text-xs text-emerald-600 font-semibold">
                        Signature ready. Click on the document page below to position it.
                      </span>
                    )}
                  </div>

                  <ThumbnailSelector
                    file={files[0]}
                    mode="view"
                    onPageClick={(pNum) => setActivePlacementPage(pNum)}
                  />

                  {signatureDataUrl && (
                    <PagePlacementCanvas
                      pageThumbnail={files[0] ? URL.createObjectURL(files[0]) : ""}
                      pageNumber={activePlacementPage}
                      mode="sign"
                      signatureImage={signatureDataUrl}
                      signaturePos={signaturePos}
                      onSignaturePosChange={setSignaturePos}
                    />
                  )}
                </div>
              )}

              {/* 6. Redact PDF Canvas */}
              {tool.id === "redact-pdf" && isPdf && (
                <div className="space-y-6">
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      Redaction permanently removes text characters, vector paths, and image pixels underneath.
                      Select a page below, then drag your mouse to create blackout boxes.
                    </span>
                  </div>

                  <ThumbnailSelector
                    file={files[0]}
                    mode="view"
                    onPageClick={(pNum) => setActivePlacementPage(pNum)}
                  />

                  <PagePlacementCanvas
                    pageThumbnail={files[0] ? URL.createObjectURL(files[0]) : ""}
                    pageNumber={activePlacementPage}
                    mode="redact"
                    redactions={redactions}
                    onRedactionsChange={setRedactions}
                  />
                </div>
              )}

              {/* 7. Edit PDF */}
              {tool.id === "edit-pdf" && isPdf && (
                <div className="space-y-6">
                  <div className="max-w-md space-y-3">
                    <label className="block text-xs font-bold text-gray-700">Add Text to Page {activePlacementPage}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter text to insert..."
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-sm outline-none focus:border-red-500"
                      />
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="w-10 h-10 p-1 rounded-xl border border-gray-300 cursor-pointer"
                        title="Text Color"
                      />
                    </div>
                  </div>

                  <ThumbnailSelector
                    file={files[0]}
                    mode="select"
                    selectedPages={selectedPages}
                    onSelectedPagesChange={setSelectedPages}
                    onPageClick={(pNum) => setActivePlacementPage(pNum)}
                  />
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Trigger Button */}
              <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={loading}
                  className={`flex items-center gap-2 px-8 py-4 disabled:opacity-50 text-white font-extrabold text-base rounded-2xl shadow-lg transition-all group ${
                    tool.id === "docu-to-pdf"
                      ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/25"
                      : "bg-red-600 hover:bg-red-700 shadow-red-500/25"
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>
                        {tool.id === "docu-to-pdf"
                          ? "Generating Documentation Manual with Docu..."
                          : "Processing document with PDFly..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>{tool.id === "docu-to-pdf" ? "Generate PDF Manual" : tool.title}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Signature Modal */}
      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSaveSignature={(dataUrl) => {
          setSignatureDataUrl(dataUrl);
          if (!signaturePos) {
            setSignaturePos({ page: 1, x: 100, y: 100, width: 140, height: 60 });
          }
        }}
      />
    </div>
  );
}

