"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, File, X, ArrowUp, ArrowDown, Plus } from "lucide-react";

interface FileUploadZoneProps {
  acceptedTypes: string;
  allowMultiple: boolean;
  files: File[];
  onFilesChange: (files: File[]) => void;
  title?: string;
}

export default function FileUploadZone({
  acceptedTypes,
  allowMultiple,
  files,
  onFilesChange,
  title,
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const incoming = Array.from(e.dataTransfer.files);
      if (allowMultiple) {
        onFilesChange([...files, ...incoming]);
      } else {
        onFilesChange([incoming[0]]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      if (allowMultiple) {
        onFilesChange([...files, ...incoming]);
      } else {
        onFilesChange([incoming[0]]);
      }
    }
    // reset input
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  const moveFile = (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= files.length) return;
    const newFiles = [...files];
    const temp = newFiles[idx];
    newFiles[idx] = newFiles[targetIdx];
    newFiles[targetIdx] = temp;
    onFilesChange(newFiles);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes}
        multiple={allowMultiple}
        onChange={handleFileSelect}
        className="hidden"
      />

      {files.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-3xl border-2 border-dashed p-12 text-center transition-all ${
            isDragOver
              ? "border-red-500 bg-red-50/50 scale-[1.01]"
              : "border-gray-300 bg-white hover:border-red-400 hover:bg-gray-50/50 shadow-xs hover:shadow-md"
          }`}
        >
          <div className="mx-auto w-20 h-20 rounded-full bg-red-50 flex items-center justify-center text-red-600 mb-6 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {title || (allowMultiple ? "Select or drop your files here" : "Select or drop your PDF here")}
          </h3>
          <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
            {allowMultiple
              ? `Upload multiple documents. Accepted formats: ${acceptedTypes}`
              : `Fast & secure document processing. Accepted: ${acceptedTypes}`}
          </p>
          <button
            type="button"
            className="px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg hover:shadow-red-500/25 transition-all text-sm uppercase tracking-wider"
          >
            {allowMultiple ? "Select Files" : "Select File"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-700">
              Selected {files.length} {files.length === 1 ? "file" : "files"}
            </h4>
            {allowMultiple && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add more files
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {files.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="relative flex items-center justify-between p-3.5 bg-white rounded-xl border border-gray-200 shadow-xs hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-red-100/60 text-red-600 flex items-center justify-center shrink-0">
                    <File className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-gray-800 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-gray-400">{formatSize(file.size)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {allowMultiple && (
                    <>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => moveFile(idx, "up")}
                          className="p-1 text-gray-400 hover:text-gray-700"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {idx < files.length - 1 && (
                        <button
                          type="button"
                          onClick={() => moveFile(idx, "down")}
                          className="p-1 text-gray-400 hover:text-gray-700"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Remove File"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
