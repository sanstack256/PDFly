"use client";

import React from "react";
import Link from "next/link";
import { Download, CheckCircle, ArrowRight, RefreshCw, FileText } from "lucide-react";
import { getDownloadUrl } from "@/lib/api";

interface DownloadViewProps {
  filename: string;
  downloadUrl: string;
  fileSize?: number;
  originalSize?: number;
  savingsPercent?: number;
  onReset: () => void;
  toolTitle: string;
}

export default function DownloadView({
  filename,
  downloadUrl,
  fileSize,
  originalSize,
  savingsPercent,
  onReset,
  toolTitle,
}: DownloadViewProps) {
  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  // Convert downloadUrl to point to active backend
  const proxyDownloadUrl = getDownloadUrl(downloadUrl);

  return (
    <div className="w-full max-w-xl mx-auto text-center py-12 px-6 bg-white rounded-3xl border border-gray-100 shadow-xl">
      <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-sm">
        <CheckCircle className="w-10 h-10" />
      </div>

      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2">
        Your document is ready!
      </h2>
      <p className="text-sm text-gray-500 mb-8">
        Successfully processed with <span className="font-semibold text-gray-800">{toolTitle}</span>
      </p>

      {/* File summary pill */}
      <div className="flex items-center justify-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-8 max-w-md mx-auto">
        <div className="w-10 h-10 rounded-xl bg-red-100/60 text-red-600 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="text-left overflow-hidden">
          <p className="text-sm font-bold text-gray-900 truncate" title={filename}>
            {filename}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {fileSize && <span>{formatSize(fileSize)}</span>}
            {savingsPercent !== undefined && savingsPercent > 0 && (
              <span className="font-bold text-emerald-600 bg-emerald-100/60 px-2 py-0.5 rounded-full text-[10px]">
                -{savingsPercent}% smaller
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Big Download Button */}
      <div className="mb-6">
        <a
          href={proxyDownloadUrl}
          download={filename}
          className="inline-flex items-center justify-center gap-2 w-full max-w-md py-4 px-8 bg-red-600 hover:bg-red-700 text-white font-extrabold text-lg rounded-2xl shadow-lg hover:shadow-red-500/25 transition-all group"
        >
          <Download className="w-6 h-6 group-hover:translate-y-0.5 transition-transform" />
          <span>Download {filename.endsWith(".zip") ? "ZIP Archive" : "File"}</span>
        </a>
      </div>

      {/* Secondary Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors w-full sm:w-auto justify-center"
        >
          <RefreshCw className="w-4 h-4" />
          Process another file
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-800 transition-colors w-full sm:w-auto justify-center"
        >
          <span>All PDF tools</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

