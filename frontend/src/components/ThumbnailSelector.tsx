"use client";

import React, { useState, useEffect } from "react";
import { RotateCw, Check, Trash2, ArrowLeft, ArrowRight, Loader2, FileText } from "lucide-react";
import { getApiUrl } from "@/lib/api";

export interface PageItem {
  page_number: number;
  rotation: number;
  thumbnail_data: string;
  selected?: boolean;
}

interface ThumbnailSelectorProps {
  file: File;
  mode?: "select" | "reorder" | "rotate" | "view";
  selectedPages?: number[];
  onSelectedPagesChange?: (pages: number[]) => void;
  pageOrder?: number[];
  onPageOrderChange?: (order: number[]) => void;
  rotations?: Record<number, number>;
  onRotationsChange?: (rotations: Record<number, number>) => void;
  onPageClick?: (pageNumber: number) => void;
  badgeText?: string;
  onPageCountLoaded?: (count: number) => void;
}

export default function ThumbnailSelector({
  file,
  mode = "view",
  selectedPages = [],
  onSelectedPagesChange,
  pageOrder,
  onPageOrderChange,
  rotations = {},
  onRotationsChange,
  onPageClick,
  badgeText,
  onPageCountLoaded,
}: ThumbnailSelectorProps) {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function loadThumbnails() {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("max_pages", "60");
      formData.append("dpi", "60");

      try {
        const res = await fetch(getApiUrl("/api/preview/thumbnails"), {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data.thumbnails && data.thumbnails.length > 0) {
            setPages(data.thumbnails);
            if (onPageCountLoaded) onPageCountLoaded(data.thumbnails.length);
            if (onPageOrderChange && (!pageOrder || pageOrder.length === 0)) {
              onPageOrderChange(data.thumbnails.map((t: PageItem) => t.page_number));
            }
            setLoading(false);
            return;
          }
        }

        // Fallback: Query page info
        const infoRes = await fetch(getApiUrl("/api/preview/info"), {
          method: "POST",
          body: formData,
        });
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          const pCount = infoData.page_count || 1;
          const fallbackPages: PageItem[] = Array.from({ length: pCount }, (_, i) => ({
            page_number: i + 1,
            rotation: 0,
            thumbnail_data: "",
          }));
          if (!isCancelled) {
            setPages(fallbackPages);
            if (onPageCountLoaded) onPageCountLoaded(pCount);
            if (onPageOrderChange && (!pageOrder || pageOrder.length === 0)) {
              onPageOrderChange(fallbackPages.map((t) => t.page_number));
            }
          }
        } else {
          // Default minimum 1 page
          if (!isCancelled) {
            setPages([{ page_number: 1, rotation: 0, thumbnail_data: "" }]);
            if (onPageCountLoaded) onPageCountLoaded(1);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          // If error, generate at least 1 page so user can still interact
          setPages([{ page_number: 1, rotation: 0, thumbnail_data: "" }]);
          if (onPageCountLoaded) onPageCountLoaded(1);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    if (file) {
      loadThumbnails();
    }

    return () => {
      isCancelled = true;
    };
  }, [file]);

  const togglePageSelection = (pNum: number) => {
    if (!onSelectedPagesChange) return;
    if (selectedPages.includes(pNum)) {
      onSelectedPagesChange(selectedPages.filter((p) => p !== pNum));
    } else {
      onSelectedPagesChange([...selectedPages, pNum].sort((a, b) => a - b));
    }
  };

  const handleRotate = (pNum: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRotationsChange) return;
    const currentRot = rotations[pNum] || 0;
    onRotationsChange({
      ...rotations,
      [pNum]: (currentRot + 90) % 360,
    });
  };

  const movePage = (idx: number, dir: "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pageOrder || !onPageOrderChange) return;
    const targetIdx = dir === "left" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= pageOrder.length) return;
    const newOrder = [...pageOrder];
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    onPageOrderChange(newOrder);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-gray-100">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-gray-500">Generating page previews...</p>
      </div>
    );
  }

  // Display according to pageOrder if provided
  const orderedPages = pageOrder
    ? pageOrder
        .map((pNum) => pages.find((p) => p.page_number === pNum))
        .filter(Boolean) as PageItem[]
    : pages;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
          Document Pages ({pages.length})
        </span>
        {mode === "select" && onSelectedPagesChange && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectedPagesChange(pages.map((p) => p.page_number))}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Select All
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={() => onSelectedPagesChange([])}
              className="text-xs font-semibold text-gray-500 hover:underline"
            >
              Deselect All
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {orderedPages.map((page, idx) => {
          const isSelected = selectedPages.includes(page.page_number);
          const currentRotation = (rotations[page.page_number] || 0) + (page.rotation || 0);

          return (
            <div
              key={`${page.page_number}-${idx}`}
              onClick={() => {
                if (mode === "select") togglePageSelection(page.page_number);
                if (onPageClick) onPageClick(page.page_number);
              }}
              className={`group relative rounded-2xl p-2.5 bg-white border-2 transition-all cursor-pointer shadow-xs hover:shadow-md ${
                isSelected
                  ? "border-red-500 ring-2 ring-red-100 bg-red-50/20"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {/* Header Badges */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                  #{page.page_number}
                </span>

                {mode === "select" && (
                  <div className="flex items-center gap-1.5">
                    {isSelected && badgeText && (
                      <span className="px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-extrabold rounded tracking-wider uppercase flex items-center gap-0.5 shadow-2xs">
                        <Trash2 className="w-2.5 h-2.5" />
                        {badgeText}
                      </span>
                    )}
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                        isSelected
                          ? "bg-red-600 text-white shadow-2xs"
                          : "border border-gray-300 bg-white group-hover:border-red-400"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                )}

                {(mode === "rotate" || mode === "reorder") && onRotationsChange && (
                  <button
                    type="button"
                    onClick={(e) => handleRotate(page.page_number, e)}
                    className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors"
                    title="Rotate 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Page Image / Thumbnail */}
              <div className="aspect-[3/4] w-full bg-gray-50 rounded-lg overflow-hidden flex flex-col items-center justify-center border border-gray-100 relative">
                {page.thumbnail_data ? (
                  <img
                    src={page.thumbnail_data}
                    alt={`Page ${page.page_number}`}
                    style={{ transform: `rotate(${currentRotation}deg)` }}
                    className="max-h-full max-w-full object-contain transition-transform"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                    <FileText className="w-8 h-8 mb-1.5 text-gray-300 stroke-1" />
                    <span className="text-xs font-bold text-gray-600">Page {page.page_number}</span>
                    <span className="text-[10px] text-gray-400">PDF Document</span>
                  </div>
                )}

                {/* Selected Overlay Indicator */}
                {isSelected && (
                  <div className="absolute inset-0 bg-red-500/10 pointer-events-none border-2 border-red-500 rounded-lg" />
                )}
              </div>

              {/* Reorder arrows */}
              {mode === "reorder" && (
                <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => movePage(idx, "left", e)}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-gray-400 font-medium">Pos {idx + 1}</span>
                  <button
                    type="button"
                    disabled={idx === orderedPages.length - 1}
                    onClick={(e) => movePage(idx, "right", e)}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
