"use client";

import React, { useRef, useState } from "react";
import { ShieldAlert, Trash2 } from "lucide-react";

export interface RedactBox {
  id: string;
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PagePlacementCanvasProps {
  pageThumbnail: string;
  pageNumber: number;
  mode: "redact" | "sign";
  signatureImage?: string | null;
  signaturePos?: { x: number; y: number; width: number; height: number; page: number } | null;
  onSignaturePosChange?: (pos: { x: number; y: number; width: number; height: number; page: number }) => void;
  redactions?: RedactBox[];
  onRedactionsChange?: (boxes: RedactBox[]) => void;
}

export default function PagePlacementCanvas({
  pageThumbnail,
  pageNumber,
  mode,
  signatureImage,
  signaturePos,
  onSignaturePosChange,
  redactions = [],
  onRedactionsChange,
}: PagePlacementCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawingBox, setDrawingBox] = useState<{ startX: number; startY: number; currX: number; currY: number } | null>(null);

  // Standard PDF page coordinates are usually 612 x 792 points
  const PDF_WIDTH = 612;
  const PDF_HEIGHT = 792;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "sign" && signatureImage && onSignaturePosChange) {
      // Scale click pos to PDF points
      const scaleX = PDF_WIDTH / rect.width;
      const scaleY = PDF_HEIGHT / rect.height;
      onSignaturePosChange({
        page: pageNumber,
        x: Math.round(x * scaleX),
        y: Math.round(y * scaleY),
        width: 140,
        height: 60,
      });
    } else if (mode === "redact") {
      setDrawingBox({ startX: x, startY: y, currX: x, currY: y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawingBox || !containerRef.current || mode !== "redact") return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    setDrawingBox({ ...drawingBox, currX: x, currY: y });
  };

  const handleMouseUp = () => {
    if (!drawingBox || !containerRef.current || mode !== "redact" || !onRedactionsChange) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = PDF_WIDTH / rect.width;
    const scaleY = PDF_HEIGHT / rect.height;

    const x0 = Math.min(drawingBox.startX, drawingBox.currX) * scaleX;
    const y0 = Math.min(drawingBox.startY, drawingBox.currY) * scaleY;
    const x1 = Math.max(drawingBox.startX, drawingBox.currX) * scaleX;
    const y1 = Math.max(drawingBox.startY, drawingBox.currY) * scaleY;

    if (x1 - x0 > 5 && y1 - y0 > 5) {
      const newBox: RedactBox = {
        id: Math.random().toString(),
        page: pageNumber,
        x0: Math.round(x0),
        y0: Math.round(y0),
        x1: Math.round(x1),
        y1: Math.round(y1),
      };
      onRedactionsChange([...redactions, newBox]);
    }
    setDrawingBox(null);
  };

  const removeRedaction = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRedactionsChange) {
      onRedactionsChange(redactions.filter((r) => r.id !== id));
    }
  };

  const pageRedactions = redactions.filter((r) => r.page === pageNumber);

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-700">
          Page {pageNumber} Canvas ({mode === "redact" ? "Drag to blackout area" : "Click to place signature"})
        </span>
        {mode === "redact" && pageRedactions.length > 0 && (
          <span className="text-xs text-rose-600 font-semibold flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            {pageRedactions.length} {pageRedactions.length === 1 ? "redaction" : "redactions"}
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="relative w-full aspect-[3/4] bg-white rounded-2xl border-2 border-gray-300 shadow-md overflow-hidden cursor-crosshair select-none"
      >
        <img
          src={pageThumbnail}
          alt={`Page ${pageNumber}`}
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* Render Saved Redaction Boxes on this page */}
        {containerRef.current &&
          pageRedactions.map((box) => {
            const rect = containerRef.current!.getBoundingClientRect();
            const left = (box.x0 / PDF_WIDTH) * rect.width;
            const top = (box.y0 / PDF_HEIGHT) * rect.height;
            const width = ((box.x1 - box.x0) / PDF_WIDTH) * rect.width;
            const height = ((box.y1 - box.y0) / PDF_HEIGHT) * rect.height;

            return (
              <div
                key={box.id}
                style={{ left, top, width, height }}
                className="absolute bg-black/90 border border-red-500 flex items-center justify-end p-0.5 group"
              >
                <button
                  type="button"
                  onClick={(e) => removeRedaction(box.id, e)}
                  className="w-4 h-4 rounded bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove Redaction"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}

        {/* Current drawing box */}
        {drawingBox && (
          <div
            style={{
              left: Math.min(drawingBox.startX, drawingBox.currX),
              top: Math.min(drawingBox.startY, drawingBox.currY),
              width: Math.abs(drawingBox.currX - drawingBox.startX),
              height: Math.abs(drawingBox.currY - drawingBox.startY),
            }}
            className="absolute bg-black/60 border-2 border-red-500 pointer-events-none"
          />
        )}

        {/* Signature placed stamp */}
        {mode === "sign" &&
          signaturePos &&
          signaturePos.page === pageNumber &&
          signatureImage &&
          containerRef.current && (
            <div
              style={{
                left: (signaturePos.x / PDF_WIDTH) * containerRef.current.clientWidth,
                top: (signaturePos.y / PDF_HEIGHT) * containerRef.current.clientHeight,
                width: (signaturePos.width / PDF_WIDTH) * containerRef.current.clientWidth,
                height: (signaturePos.height / PDF_HEIGHT) * containerRef.current.clientHeight,
              }}
              className="absolute border-2 border-indigo-500 bg-indigo-50/20 rounded pointer-events-none flex items-center justify-center"
            >
              <img
                src={signatureImage}
                alt="Signature"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
      </div>
    </div>
  );
}
