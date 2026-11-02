"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Save,
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Minus,
  Plus,
  Trash2,
  Copy,
  RotateCw,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Loader2,
  FileText,
  Palette,
  Check,
  AlertCircle,
  Eye,
  Sliders,
  Scissors,
} from "lucide-react";

export interface EditorTextElement {
  id: string;
  type: "text";
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string;
  highlight?: string;
  align: "left" | "center" | "right" | "justify";
  lineHeight: number;
  letterSpacing: number;
  listType?: "bullet" | "numbered" | "none";
  zIndex: number;
}

export interface EditorImageElement {
  id: string;
  type: "image";
  page: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
}

export interface EditorShapeElement {
  id: string;
  type: "shape";
  shapeType: "rect" | "circle" | "line";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  zIndex: number;
}

export type EditorElement = EditorTextElement | EditorImageElement | EditorShapeElement;

export interface PageBorderConfig {
  enabled: boolean;
  thickness: number;
  color: string;
  style: "solid" | "dashed" | "dotted";
  margin: number;
}

export interface EditorPage {
  id: string;
  pageNumber: number;
  sourceIndex: number | null; // null if newly added blank page
  width: number;
  height: number;
  rotation: number;
  backgroundColor?: string;
  border?: PageBorderConfig;
  thumbnail?: string;
}

interface WordEditorProps {
  initialFile?: File | null;
  initialBlankSize?: string;
}

const PAGE_SIZE_PRESETS: Record<string, [number, number]> = {
  A4: [595.32, 841.92],
  A3: [841.92, 1190.55],
  A5: [419.53, 595.32],
  Letter: [612.0, 792.0],
  Legal: [612.0, 1008.0],
};

export default function WordEditor({ initialFile, initialBlankSize = "A4" }: WordEditorProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);

  // Document states
  const [docFile, setDocFile] = useState<File | null>(initialFile || null);
  const [docName, setDocName] = useState(initialFile ? initialFile.name : "Document1.pdf");
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // History for Undo / Redo
  const [history, setHistory] = useState<{ pages: EditorPage[]; elements: EditorElement[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // UI States
  const [zoom, setZoom] = useState(1.0); // 1.0 = 100%
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [copiedElements, setCopiedElements] = useState<EditorElement[]>([]);
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [newPageSize, setNewPageSize] = useState("A4");

  // Push state to undo/redo history
  const pushHistory = useCallback((newPages: EditorPage[], newElements: EditorElement[]) => {
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyIndex + 1);
      return [...upToCurrent, { pages: JSON.parse(JSON.stringify(newPages)), elements: JSON.parse(JSON.stringify(newElements)) }];
    });
    setHistoryIndex((prev) => prev + 1);
    setHasUnsavedChanges(true);
  }, [historyIndex]);

  // Load initial document or create blank page
  useEffect(() => {
    if (docFile) {
      loadExistingPdf(docFile);
    } else {
      createInitialBlank(initialBlankSize);
    }
  }, []);

  const createInitialBlank = (sizeName: string) => {
    const [w, h] = PAGE_SIZE_PRESETS[sizeName] || PAGE_SIZE_PRESETS["A4"];
    const initialPages: EditorPage[] = [
      {
        id: "p1",
        pageNumber: 1,
        sourceIndex: null,
        width: w,
        height: h,
        rotation: 0,
        backgroundColor: "#ffffff",
        border: { enabled: false, thickness: 2, color: "#000000", style: "solid", margin: 20 },
      },
    ];
    setPages(initialPages);
    setElements([]);
    setHistory([{ pages: initialPages, elements: [] }]);
    setHistoryIndex(0);
    setHasUnsavedChanges(false);
  };

  const loadExistingPdf = async (file: File) => {
    setIsExporting(true);
    setExportMessage("Loading document pages...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("max_pages", "60");
      formData.append("dpi", "72");

      const [infoRes, thumbRes] = await Promise.all([
        fetch("/api/backend/preview/info", { method: "POST", body: formData }),
        fetch("/api/backend/preview/thumbnails", { method: "POST", body: formData }),
      ]);

      const infoData = await infoRes.json();
      const thumbData = await thumbRes.json();

      const thumbsMap = (thumbData.thumbnails || []).reduce((acc: any, t: any) => {
        acc[t.page_number] = t.thumbnail_data;
        return acc;
      }, {});

      const loadedPages: EditorPage[] = (infoData.pages || []).map((p: any) => ({
        id: `page-${p.page_number}`,
        pageNumber: p.page_number,
        sourceIndex: p.page_number,
        width: p.width,
        height: p.height,
        rotation: p.rotation,
        backgroundColor: "#ffffff",
        border: { enabled: false, thickness: 2, color: "#000000", style: "solid", margin: 20 },
        thumbnail: thumbsMap[p.page_number],
      }));

      if (loadedPages.length === 0) {
        createInitialBlank("A4");
      } else {
        setPages(loadedPages);
        setElements([]);
        setHistory([{ pages: loadedPages, elements: [] }]);
        setHistoryIndex(0);
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      createInitialBlank("A4");
    } finally {
      setIsExporting(false);
      setExportMessage(null);
    }
  };

  // Undo / Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const snapshot = history[nextIdx];
      setPages(JSON.parse(JSON.stringify(snapshot.pages)));
      setElements(JSON.parse(JSON.stringify(snapshot.elements)));
      setHistoryIndex(nextIdx);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const snapshot = history[nextIdx];
      setPages(JSON.parse(JSON.stringify(snapshot.pages)));
      setElements(JSON.parse(JSON.stringify(snapshot.elements)));
      setHistoryIndex(nextIdx);
    }
  };

  const currentPage = pages[currentPageIndex] || pages[0];

  // ---------------- Page Management ----------------

  const addBlankPage = (size: string) => {
    const [w, h] = PAGE_SIZE_PRESETS[size] || PAGE_SIZE_PRESETS["A4"];
    const newPage: EditorPage = {
      id: `p-${Date.now()}`,
      pageNumber: pages.length + 1,
      sourceIndex: null,
      width: w,
      height: h,
      rotation: 0,
      backgroundColor: "#ffffff",
      border: { enabled: false, thickness: 2, color: "#000000", style: "solid", margin: 20 },
    };
    const nextPages = [...pages, newPage];
    setPages(nextPages);
    setCurrentPageIndex(nextPages.length - 1);
    pushHistory(nextPages, elements);
    setShowAddPageModal(false);
  };

  const duplicateCurrentPage = () => {
    if (!currentPage) return;
    const duplicatedPage: EditorPage = {
      ...JSON.parse(JSON.stringify(currentPage)),
      id: `p-${Date.now()}`,
      pageNumber: pages.length + 1,
    };
    // Duplicate elements on this page
    const pageElements = elements
      .filter((e) => e.page === currentPageIndex + 1)
      .map((e) => ({
        ...JSON.parse(JSON.stringify(e)),
        id: `elem-${Date.now()}-${Math.random()}`,
        page: pages.length + 1,
      }));

    const nextPages = [...pages, duplicatedPage];
    const nextElements = [...elements, ...pageElements];
    setPages(nextPages);
    setElements(nextElements);
    setCurrentPageIndex(nextPages.length - 1);
    pushHistory(nextPages, nextElements);
  };

  const deleteCurrentPage = () => {
    if (pages.length <= 1) {
      alert("A document must have at least one page.");
      return;
    }
    const pageNumToDelete = currentPageIndex + 1;
    const nextPages = pages.filter((_, idx) => idx !== currentPageIndex);
    // Shift elements on later pages
    const nextElements = elements
      .filter((e) => e.page !== pageNumToDelete)
      .map((e) => (e.page > pageNumToDelete ? { ...e, page: e.page - 1 } : e));

    setPages(nextPages);
    setElements(nextElements);
    setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
    pushHistory(nextPages, nextElements);
  };

  const rotateCurrentPage = () => {
    if (!currentPage) return;
    const nextPages = pages.map((p, idx) =>
      idx === currentPageIndex ? { ...p, rotation: (p.rotation + 90) % 360 } : p
    );
    setPages(nextPages);
    pushHistory(nextPages, elements);
  };

  const movePage = (direction: "up" | "down") => {
    const targetIdx = direction === "up" ? currentPageIndex - 1 : currentPageIndex + 1;
    if (targetIdx < 0 || targetIdx >= pages.length) return;
    const nextPages = [...pages];
    const temp = nextPages[currentPageIndex];
    nextPages[currentPageIndex] = nextPages[targetIdx];
    nextPages[targetIdx] = temp;

    // Swap elements page numbers
    const currNum = currentPageIndex + 1;
    const targetNum = targetIdx + 1;
    const nextElements = elements.map((e) => {
      if (e.page === currNum) return { ...e, page: targetNum };
      if (e.page === targetNum) return { ...e, page: currNum };
      return e;
    });

    setPages(nextPages);
    setElements(nextElements);
    setCurrentPageIndex(targetIdx);
    pushHistory(nextPages, nextElements);
  };

  // ---------------- Elements Manipulation ----------------

  const addTextElement = () => {
    const newText: EditorTextElement = {
      id: `text-${Date.now()}`,
      type: "text",
      page: currentPageIndex + 1,
      text: "Double-click to type text",
      x: 72,
      y: 120,
      width: 280,
      height: 60,
      fontSize: 16,
      fontFamily: "Helvetica",
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      color: "#000000",
      align: "left",
      lineHeight: 1.4,
      letterSpacing: 0,
      listType: "none",
      zIndex: elements.length + 1,
    };
    const nextElements = [...elements, newText];
    setElements(nextElements);
    setSelectedIds([newText.id]);
    pushHistory(pages, nextElements);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          // Constrain default placed dimensions to page bounds
          const maxW = 250;
          const ratio = img.width > 0 ? img.height / img.width : 1;
          const finalW = Math.min(maxW, img.width || maxW);
          const finalH = Math.round(finalW * ratio);

          const newImg: EditorImageElement = {
            id: `img-${Date.now()}`,
            type: "image",
            page: currentPageIndex + 1,
            src: dataUrl,
            x: 100,
            y: 150,
            width: finalW,
            height: finalH,
            rotation: 0,
            opacity: 1.0,
            zIndex: elements.length + 1,
          };
          const nextElements = [...elements, newImg];
          setElements(nextElements);
          setSelectedIds([newImg.id]);
          pushHistory(pages, nextElements);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
    if (imageUploadRef.current) imageUploadRef.current.value = "";
  };

  const addShape = (shapeType: "rect" | "circle" | "line") => {
    const newShape: EditorShapeElement = {
      id: `shape-${Date.now()}`,
      type: "shape",
      shapeType,
      page: currentPageIndex + 1,
      x: 100,
      y: 150,
      width: shapeType === "line" ? 200 : 120,
      height: shapeType === "line" ? 2 : 120,
      strokeColor: "#2563eb",
      fillColor: shapeType === "line" ? undefined : "transparent",
      strokeWidth: 2,
      zIndex: elements.length + 1,
    };
    const nextElements = [...elements, newShape];
    setElements(nextElements);
    setSelectedIds([newShape.id]);
    pushHistory(pages, nextElements);
  };

  const updateSelectedElement = (updates: Partial<EditorElement>) => {
    if (selectedIds.length === 0) return;
    const nextElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        return { ...el, ...updates } as EditorElement;
      }
      return el;
    });
    setElements(nextElements);
    pushHistory(pages, nextElements);
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const nextElements = elements.filter((el) => !selectedIds.includes(el.id));
    setElements(nextElements);
    setSelectedIds([]);
    pushHistory(pages, nextElements);
  };

  const copySelected = () => {
    const selected = elements.filter((el) => selectedIds.includes(el.id));
    if (selected.length > 0) {
      setCopiedElements(JSON.parse(JSON.stringify(selected)));
    }
  };

  const pasteCopied = () => {
    if (copiedElements.length === 0) return;
    const pasted = copiedElements.map((el) => ({
      ...el,
      id: `elem-${Date.now()}-${Math.random()}`,
      page: currentPageIndex + 1,
      x: el.x + 20,
      y: el.y + 20,
    }));
    const nextElements = [...elements, ...pasted];
    setElements(nextElements);
    setSelectedIds(pasted.map((p) => p.id));
    pushHistory(pages, nextElements);
  };

  const cutSelected = () => {
    copySelected();
    deleteSelected();
  };

  const selectAll = () => {
    const pageElemIds = elements.filter((e) => e.page === currentPageIndex + 1).map((e) => e.id);
    setSelectedIds(pageElemIds);
  };

  // Move element to a specified page
  const moveElementToPage = (targetPageNum: number) => {
    if (selectedIds.length === 0 || targetPageNum < 1 || targetPageNum > pages.length) return;
    const nextElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        return { ...el, page: targetPageNum };
      }
      return el;
    });
    setElements(nextElements);
    pushHistory(pages, nextElements);
    // Switch view to target page
    setCurrentPageIndex(targetPageNum - 1);
  };

  // Layering
  const changeLayer = (direction: "forward" | "backward") => {
    if (selectedIds.length === 0) return;
    const nextElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        const delta = direction === "forward" ? 1 : -1;
        return { ...el, zIndex: Math.max(1, el.zIndex + delta) };
      }
      return el;
    });
    setElements(nextElements);
    pushHistory(pages, nextElements);
  };

  // Alignment to page
  const alignElementToPage = (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (selectedIds.length === 0 || !currentPage) return;
    const nextElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        let x = el.x;
        let y = el.y;
        if (alignment === "left") x = 40;
        if (alignment === "center") x = (currentPage.width - el.width) / 2;
        if (alignment === "right") x = currentPage.width - el.width - 40;
        if (alignment === "top") y = 40;
        if (alignment === "middle") y = (currentPage.height - el.height) / 2;
        if (alignment === "bottom") y = currentPage.height - el.height - 40;
        return { ...el, x, y };
      }
      return el;
    });
    setElements(nextElements);
    pushHistory(pages, nextElements);
  };

  // ---------------- Keyboard Shortcuts ----------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing inside contentEditable or input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        if (e.key === "Escape") {
          setEditingTextId(null);
        }
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      if (cmdKey && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (cmdKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        handleRedo();
      } else if (cmdKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
      } else if (cmdKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteCopied();
      } else if (cmdKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        cutSelected();
      } else if (cmdKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleExportPdf(false); // save changes
      } else if (cmdKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyIndex, history, elements, selectedIds, copiedElements, currentPageIndex]);

  // Unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ---------------- Export & Download ----------------

  const handleExportPdf = async (shouldDownload: boolean = true) => {
    setIsExporting(true);
    setExportMessage(shouldDownload ? "Exporting genuine vector PDF..." : "Saving document state...");

    try {
      const editorState = {
        pages: pages.map((p) => ({
          sourceIndex: p.sourceIndex,
          isNew: p.sourceIndex === null,
          rotation: p.rotation,
          width: p.width,
          height: p.height,
          backgroundColor: p.backgroundColor,
          border: p.border,
        })),
        textElements: elements.filter((e) => e.type === "text"),
        images: elements.filter((e) => e.type === "image"),
        shapes: elements.filter((e) => e.type === "shape"),
      };

      const formData = new FormData();
      if (docFile) {
        formData.append("file", docFile);
      }
      formData.append("editor_state", JSON.stringify(editorState));

      const res = await fetch("/api/backend/edit/export-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Failed to export document.");
      }

      const data = await res.json();
      setHasUnsavedChanges(false);

      if (shouldDownload && data.download_url) {
        const link = document.createElement("a");
        link.href = `/api/backend${data.download_url.replace("/api", "")}`;
        link.download = docName.endsWith(".pdf") ? docName : `${docName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      alert(`Export error: ${err.message || "Failed to save PDF"}`);
    } finally {
      setIsExporting(false);
      setExportMessage(null);
    }
  };

  const selectedElement = elements.find((e) => selectedIds.includes(e.id));
  const currentText = selectedElement?.type === "text" ? (selectedElement as EditorTextElement) : null;
  const currentImage = selectedElement?.type === "image" ? (selectedElement as EditorImageElement) : null;
  const currentShape = selectedElement?.type === "shape" ? (selectedElement as EditorShapeElement) : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 overflow-hidden font-sans select-none">
      {/* Hidden file inputs */}
      <input
        ref={imageUploadRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            setDocFile(e.target.files[0]);
            setDocName(e.target.files[0].name);
            loadExistingPdf(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* 1. TOP TOOLBAR (Word Ribbon Style) */}
      <header className="h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-40 shrink-0">
        <div className="flex items-center gap-3">
          {/* Brand & Document Name */}
          <Link href="/" className="flex items-center gap-1.5 group mr-2">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white font-black text-sm">
              P
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={docName}
              onChange={(e) => {
                setDocName(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="text-sm font-bold text-gray-800 bg-transparent hover:bg-gray-100 px-2 py-1 rounded-md outline-none focus:bg-white focus:ring-1 focus:ring-red-500 w-48 truncate"
              title="Click to rename"
            />
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500" title="Unsaved changes" />
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              title="Open a PDF to edit"
            >
              <FileText className="w-3.5 h-3.5 text-gray-500" />
              <span>Open PDF</span>
            </button>
          </div>

          <div className="h-5 w-[1px] bg-gray-200 mx-1" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <div className="h-5 w-[1px] bg-gray-200 mx-1" />

          {/* Quick Insert Ribbon Items */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={addTextElement}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Type className="w-4 h-4 text-red-600" />
              <span>Add Text</span>
            </button>
            <button
              onClick={() => imageUploadRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
            >
              <ImageIcon className="w-4 h-4 text-amber-600" />
              <span>Insert Image</span>
            </button>
            <button
              onClick={() => addShape("rect")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              <Square className="w-4 h-4 text-blue-600" />
              <span>Add Shape</span>
            </button>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-4">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
              className="p-1 text-gray-500 hover:text-gray-800"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-semibold text-gray-700 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(1))))}
              className="p-1 text-gray-500 hover:text-gray-800"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoom(1.0)}
              className="px-1 text-[11px] font-bold text-gray-400 hover:text-gray-700 border-l border-gray-200 ml-1"
              title="Reset Zoom (100%)"
            >
              Reset
            </button>
          </div>

          {/* Page navigator */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <button
              disabled={currentPageIndex <= 0}
              onClick={() => setCurrentPageIndex((idx) => Math.max(0, idx - 1))}
              className="p-1 rounded text-gray-400 hover:text-gray-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>
              Page {currentPageIndex + 1} of {pages.length}
            </span>
            <button
              disabled={currentPageIndex >= pages.length - 1}
              onClick={() => setCurrentPageIndex((idx) => Math.min(pages.length - 1, idx + 1))}
              className="p-1 rounded text-gray-400 hover:text-gray-800 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Save & Download Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportPdf(false)}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
              title="Save State (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
            <button
              onClick={() => handleExportPdf(true)}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. BODY CONTENT (Sidebar + Canvas + Properties Panel) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR: Page Thumbnails & Operations */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              Pages ({pages.length})
            </span>
            <button
              onClick={() => setShowAddPageModal(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded"
              title="Add New Blank Page"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {/* Page actions toolbar */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-gray-500">
            <button
              onClick={rotateCurrentPage}
              className="p-1 rounded hover:bg-gray-200 hover:text-gray-800"
              title="Rotate Page 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={duplicateCurrentPage}
              className="p-1 rounded hover:bg-gray-200 hover:text-gray-800"
              title="Duplicate Page"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => movePage("up")}
              disabled={currentPageIndex === 0}
              className="p-1 rounded hover:bg-gray-200 hover:text-gray-800 disabled:opacity-30"
              title="Move Page Up"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => movePage("down")}
              disabled={currentPageIndex === pages.length - 1}
              className="p-1 rounded hover:bg-gray-200 hover:text-gray-800 disabled:opacity-30"
              title="Move Page Down"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={deleteCurrentPage}
              className="p-1 rounded hover:bg-red-50 hover:text-red-600"
              title="Delete Page"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Thumbnails strip */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {pages.map((p, idx) => (
              <div
                key={p.id}
                onClick={() => setCurrentPageIndex(idx)}
                className={`group cursor-pointer rounded-xl border-2 p-1.5 transition-all ${
                  idx === currentPageIndex
                    ? "border-red-500 bg-red-50/20 shadow-xs ring-1 ring-red-100"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[10px] font-bold text-gray-500 px-1">
                  <span>Page {idx + 1}</span>
                  {p.rotation > 0 && <span>{p.rotation}°</span>}
                </div>
                <div className="w-full aspect-[3/4] bg-white rounded border border-gray-200 overflow-hidden flex items-center justify-center relative">
                  {p.thumbnail ? (
                    <img
                      src={p.thumbnail}
                      alt={`Page ${idx + 1}`}
                      style={{ transform: `rotate(${p.rotation}deg)` }}
                      className="max-h-full max-w-full object-contain pointer-events-none"
                    />
                  ) : (
                    <div className="text-[10px] text-gray-400 font-semibold">Blank Page</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* MAIN CANVAS EDITING AREA */}
        <main
          onClick={() => {
            setSelectedIds([]);
            setEditingTextId(null);
          }}
          className="flex-1 bg-gray-200/70 overflow-auto p-8 flex items-center justify-center relative"
        >
          {currentPage && (
            <div
              style={{
                width: currentPage.width * zoom,
                height: currentPage.height * zoom,
                transform: `rotate(${currentPage.rotation}deg)`,
                backgroundColor: currentPage.backgroundColor || "#ffffff",
              }}
              onClick={(e) => e.stopPropagation()}
              className="relative shadow-2xl transition-transform duration-150 origin-center overflow-hidden"
            >
              {/* Render Underlying Page Thumbnail or Background */}
              {currentPage.thumbnail && (
                <img
                  src={currentPage.thumbnail}
                  alt={`Base Page ${currentPageIndex + 1}`}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              )}

              {/* Render Page Border if enabled */}
              {currentPage.border?.enabled && (
                <div
                  style={{
                    position: "absolute",
                    top: currentPage.border.margin * zoom,
                    left: currentPage.border.margin * zoom,
                    right: currentPage.border.margin * zoom,
                    bottom: currentPage.border.margin * zoom,
                    borderWidth: currentPage.border.thickness * zoom,
                    borderColor: currentPage.border.color,
                    borderStyle: currentPage.border.style,
                    pointerEvents: "none",
                  }}
                />
              )}

              {/* Render Placed Document Elements for Current Page */}
              {elements
                .filter((el) => el.page === currentPageIndex + 1)
                .map((el) => {
                  const isSelected = selectedIds.includes(el.id);

                  return (
                    <div
                      key={el.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.shiftKey) {
                          setSelectedIds((prev) =>
                            prev.includes(el.id) ? prev.filter((id) => id !== el.id) : [...prev, el.id]
                          );
                        } else {
                          setSelectedIds([el.id]);
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (el.type === "text") {
                          setEditingTextId(el.id);
                        }
                      }}
                      style={{
                        position: "absolute",
                        left: el.x * zoom,
                        top: el.y * zoom,
                        width: el.width * zoom,
                        height: el.height * zoom,
                        zIndex: el.zIndex,
                        transform: el.type === "image" ? `rotate(${el.rotation}deg)` : undefined,
                        opacity: el.type === "image" ? el.opacity : 1,
                      }}
                      className={`group cursor-move transition-shadow ${
                        isSelected
                          ? "ring-2 ring-red-500 ring-offset-1 ring-offset-transparent"
                          : "hover:ring-1 hover:ring-red-300"
                      }`}
                    >
                      {/* TEXT ELEMENT */}
                      {el.type === "text" && (
                        <div
                          style={{
                            fontSize: `${el.fontSize * zoom}px`,
                            fontFamily: el.fontFamily,
                            fontWeight: el.bold ? "bold" : "normal",
                            fontStyle: el.italic ? "italic" : "normal",
                            textDecoration: `${el.underline ? "underline" : ""} ${el.strike ? "line-through" : ""}`.trim() || "none",
                            color: el.color,
                            backgroundColor: el.highlight || "transparent",
                            textAlign: el.align,
                            lineHeight: el.lineHeight,
                            letterSpacing: `${el.letterSpacing}px`,
                          }}
                          className="w-full h-full p-1 overflow-hidden break-words select-text"
                        >
                          {editingTextId === el.id ? (
                            <textarea
                              autoFocus
                              value={el.text}
                              onChange={(e) => updateSelectedElement({ text: e.target.value })}
                              onBlur={() => setEditingTextId(null)}
                              className="w-full h-full bg-white/90 border border-red-400 p-1 text-inherit font-inherit outline-none resize-none"
                            />
                          ) : (
                            <div className="whitespace-pre-wrap">
                              {el.listType === "bullet" && (
                                <ul className="list-disc list-inside">
                                  {el.text.split("\n").map((line, lIdx) => (
                                    <li key={lIdx}>{line.replace(/^[•\-\*]\s*/, "")}</li>
                                  ))}
                                </ul>
                              )}
                              {el.listType === "numbered" && (
                                <ol className="list-decimal list-inside">
                                  {el.text.split("\n").map((line, lIdx) => (
                                    <li key={lIdx}>{line.replace(/^\d+[\.\)]\s*/, "")}</li>
                                  ))}
                                </ol>
                              )}
                              {(!el.listType || el.listType === "none") && el.text}
                            </div>
                          )}
                        </div>
                      )}

                      {/* IMAGE ELEMENT */}
                      {el.type === "image" && (
                        <img
                          src={el.src}
                          alt="Placed Element"
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      )}

                      {/* SHAPE ELEMENT */}
                      {el.type === "shape" && (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            borderColor: el.strokeColor,
                            borderWidth: el.strokeWidth * zoom,
                            borderStyle: "solid",
                            borderRadius: el.shapeType === "circle" ? "50%" : 0,
                            backgroundColor: el.fillColor || "transparent",
                          }}
                        />
                      )}

                      {/* Selection handles */}
                      {isSelected && (
                        <>
                          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white border border-red-600 rounded-full" />
                          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white border border-red-600 rounded-full" />
                          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white border border-red-600 rounded-full" />
                          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border border-red-600 rounded-full" />
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </main>

        {/* RIGHT CONTEXTUAL PROPERTIES PANEL */}
        <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto p-4">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-red-600" />
              {currentText
                ? "Text Properties"
                : currentImage
                ? "Image Properties"
                : currentShape
                ? "Shape Properties"
                : "Page Properties"}
            </span>
            {selectedElement && (
              <button
                onClick={deleteSelected}
                className="p-1 rounded text-gray-400 hover:text-red-600"
                title="Delete Selected Element"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 1. TEXT PROPERTIES PANEL */}
          {currentText && (
            <div className="space-y-4">
              {/* Font Family & Size */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Font Family</label>
                <select
                  value={currentText.fontFamily}
                  onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
                  className="w-full text-xs font-semibold p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500"
                >
                  <option value="Helvetica">Helvetica (Arial)</option>
                  <option value="Times-Roman">Times New Roman</option>
                  <option value="Courier">Courier (Monospace)</option>
                  <option value="Georgia">Georgia</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">
                  Font Size ({currentText.fontSize}px)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="8"
                    max="72"
                    value={currentText.fontSize}
                    onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    value={currentText.fontSize}
                    onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                    className="w-14 text-xs font-bold p-1 bg-gray-50 border border-gray-200 rounded text-center"
                  />
                </div>
              </div>

              {/* Text Styles (Bold, Italic, Underline, Strikethrough) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Style</label>
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => updateSelectedElement({ bold: !currentText.bold })}
                    className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                      currentText.bold ? "bg-white text-gray-900 shadow-xs font-bold" : "text-gray-500"
                    }`}
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateSelectedElement({ italic: !currentText.italic })}
                    className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                      currentText.italic ? "bg-white text-gray-900 shadow-xs italic" : "text-gray-500"
                    }`}
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateSelectedElement({ underline: !currentText.underline })}
                    className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                      currentText.underline ? "bg-white text-gray-900 shadow-xs underline" : "text-gray-500"
                    }`}
                    title="Underline"
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateSelectedElement({ strike: !currentText.strike })}
                    className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                      currentText.strike ? "bg-white text-gray-900 shadow-xs line-through" : "text-gray-500"
                    }`}
                    title="Strikethrough"
                  >
                    <Strikethrough className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Colors: Text Color & Highlight */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Text Color</label>
                  <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 p-1 rounded-lg">
                    <input
                      type="color"
                      value={currentText.color}
                      onChange={(e) => updateSelectedElement({ color: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border-0"
                    />
                    <span className="text-[10px] font-mono text-gray-600">{currentText.color}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Highlight</label>
                  <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 p-1 rounded-lg">
                    <input
                      type="color"
                      value={currentText.highlight || "#ffffff"}
                      onChange={(e) => updateSelectedElement({ highlight: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border-0"
                    />
                    <button
                      onClick={() => updateSelectedElement({ highlight: undefined })}
                      className="text-[10px] text-gray-400 hover:text-red-500"
                      title="Clear highlight"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Text Alignment */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Alignment</label>
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                  {(["left", "center", "right", "justify"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => updateSelectedElement({ align: a })}
                      className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                        currentText.align === a ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                      }`}
                    >
                      {a === "left" && <AlignLeft className="w-3.5 h-3.5" />}
                      {a === "center" && <AlignCenter className="w-3.5 h-3.5" />}
                      {a === "right" && <AlignRight className="w-3.5 h-3.5" />}
                      {a === "justify" && <AlignJustify className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* List Formatting */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Lists</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      updateSelectedElement({
                        listType: currentText.listType === "bullet" ? "none" : "bullet",
                      })
                    }
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      currentText.listType === "bullet"
                        ? "border-red-500 bg-red-50 text-red-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    Bullet List
                  </button>
                  <button
                    onClick={() =>
                      updateSelectedElement({
                        listType: currentText.listType === "numbered" ? "none" : "numbered",
                      })
                    }
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      currentText.listType === "numbered"
                        ? "border-red-500 bg-red-50 text-red-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    Numbered
                  </button>
                </div>
              </div>

              {/* Move to another page */}
              <div className="pt-3 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Move to Page</label>
                <select
                  value={currentText.page}
                  onChange={(e) => moveElementToPage(Number(e.target.value))}
                  className="w-full text-xs font-semibold p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none"
                >
                  {pages.map((_, pIdx) => (
                    <option key={pIdx + 1} value={pIdx + 1}>
                      Page {pIdx + 1}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 2. IMAGE PROPERTIES PANEL */}
          {currentImage && (
            <div className="space-y-4">
              {/* Dimensions */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Width (px)</label>
                  <input
                    type="number"
                    value={Math.round(currentImage.width)}
                    onChange={(e) => updateSelectedElement({ width: Number(e.target.value) })}
                    className="w-full text-xs font-bold p-1.5 bg-gray-50 border border-gray-200 rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Height (px)</label>
                  <input
                    type="number"
                    value={Math.round(currentImage.height)}
                    onChange={(e) => updateSelectedElement({ height: Number(e.target.value) })}
                    className="w-full text-xs font-bold p-1.5 bg-gray-50 border border-gray-200 rounded"
                  />
                </div>
              </div>

              {/* Rotation & Opacity */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">
                  Rotation ({currentImage.rotation}°)
                </label>
                <div className="flex items-center gap-1.5">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => updateSelectedElement({ rotation: deg })}
                      className={`flex-1 py-1 text-xs font-bold rounded ${
                        currentImage.rotation === deg ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">
                  Opacity ({Math.round(currentImage.opacity * 100)}%)
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={currentImage.opacity}
                  onChange={(e) => updateSelectedElement({ opacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>

              {/* Alignment to Page */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Align to Page</label>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => alignElementToPage("left")}
                    className="p-1.5 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 rounded text-center"
                  >
                    Left
                  </button>
                  <button
                    onClick={() => alignElementToPage("center")}
                    className="p-1.5 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 rounded text-center"
                  >
                    Center
                  </button>
                  <button
                    onClick={() => alignElementToPage("right")}
                    className="p-1.5 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 rounded text-center"
                  >
                    Right
                  </button>
                  <button
                    onClick={() => alignElementToPage("top")}
                    className="p-1.5 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 rounded text-center"
                  >
                    Top
                  </button>
                  <button
                    onClick={() => alignElementToPage("middle")}
                    className="p-1.5 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 rounded text-center"
                  >
                    Middle
                  </button>
                  <button
                    onClick={() => alignElementToPage("bottom")}
                    className="p-1.5 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 rounded text-center"
                  >
                    Bottom
                  </button>
                </div>
              </div>

              {/* Layering */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Layer Order</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeLayer("forward")}
                    className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-xs font-semibold rounded"
                  >
                    Bring Forward
                  </button>
                  <button
                    onClick={() => changeLayer("backward")}
                    className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 text-xs font-semibold rounded"
                  >
                    Send Backward
                  </button>
                </div>
              </div>

              {/* Move Image to another page */}
              <div className="pt-3 border-t border-gray-100">
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Move to Page</label>
                <select
                  value={currentImage.page}
                  onChange={(e) => moveElementToPage(Number(e.target.value))}
                  className="w-full text-xs font-semibold p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none"
                >
                  {pages.map((_, pIdx) => (
                    <option key={pIdx + 1} value={pIdx + 1}>
                      Page {pIdx + 1}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 3. PAGE PROPERTIES PANEL (When no element is selected) */}
          {!selectedElement && currentPage && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                <div className="font-bold text-gray-800 mb-1">Page {currentPageIndex + 1} Dimensions</div>
                <div className="text-gray-500">
                  {Math.round(currentPage.width)} × {Math.round(currentPage.height)} points
                </div>
              </div>

              {/* Background Color */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1">Page Background</label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-1.5 rounded-lg">
                  <input
                    type="color"
                    value={currentPage.backgroundColor || "#ffffff"}
                    onChange={(e) => {
                      const nextPages = pages.map((p, idx) =>
                        idx === currentPageIndex ? { ...p, backgroundColor: e.target.value } : p
                      );
                      setPages(nextPages);
                      pushHistory(nextPages, elements);
                    }}
                    className="w-7 h-7 rounded cursor-pointer border-0"
                  />
                  <span className="text-xs font-mono text-gray-600">
                    {currentPage.backgroundColor || "#ffffff"}
                  </span>
                  <button
                    onClick={() => {
                      const nextPages = pages.map((p, idx) =>
                        idx === currentPageIndex ? { ...p, backgroundColor: "#ffffff" } : p
                      );
                      setPages(nextPages);
                      pushHistory(nextPages, elements);
                    }}
                    className="text-[10px] text-gray-400 hover:text-gray-700 ml-auto"
                  >
                    Default
                  </button>
                </div>
              </div>

              {/* Page Borders */}
              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-gray-700">Page Borders</label>
                  <input
                    type="checkbox"
                    checked={currentPage.border?.enabled || false}
                    onChange={(e) => {
                      const nextPages = pages.map((p, idx) =>
                        idx === currentPageIndex
                          ? {
                              ...p,
                              border: {
                                ...(p.border || { thickness: 2, color: "#000000", style: "solid", margin: 20 }),
                                enabled: e.target.checked,
                              },
                            }
                          : p
                      );
                      setPages(nextPages);
                      pushHistory(nextPages, elements);
                    }}
                    className="rounded text-red-600 focus:ring-0"
                  />
                </div>

                {currentPage.border?.enabled && (
                  <div className="space-y-3 pl-1">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">
                        Border Thickness ({currentPage.border.thickness}px)
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={currentPage.border.thickness}
                        onChange={(e) => {
                          const nextPages = pages.map((p, idx) =>
                            idx === currentPageIndex
                              ? { ...p, border: { ...p.border!, thickness: Number(e.target.value) } }
                              : p
                          );
                          setPages(nextPages);
                          pushHistory(nextPages, elements);
                        }}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Border Style</label>
                      <select
                        value={currentPage.border.style}
                        onChange={(e) => {
                          const nextPages = pages.map((p, idx) =>
                            idx === currentPageIndex
                              ? { ...p, border: { ...p.border!, style: e.target.value as any } }
                              : p
                          );
                          setPages(nextPages);
                          pushHistory(nextPages, elements);
                        }}
                        className="w-full text-xs p-1.5 bg-gray-50 border border-gray-200 rounded"
                      >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Color</label>
                        <input
                          type="color"
                          value={currentPage.border.color}
                          onChange={(e) => {
                            const nextPages = pages.map((p, idx) =>
                              idx === currentPageIndex
                                ? { ...p, border: { ...p.border!, color: e.target.value } }
                                : p
                            );
                            setPages(nextPages);
                            pushHistory(nextPages, elements);
                          }}
                          className="w-full h-8 rounded border border-gray-200 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Margin (pt)</label>
                        <input
                          type="number"
                          value={currentPage.border.margin}
                          onChange={(e) => {
                            const nextPages = pages.map((p, idx) =>
                              idx === currentPageIndex
                                ? { ...p, border: { ...p.border!, margin: Number(e.target.value) } }
                                : p
                            );
                            setPages(nextPages);
                            pushHistory(nextPages, elements);
                          }}
                          className="w-full text-xs font-bold p-1.5 bg-gray-50 border border-gray-200 rounded text-center"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ADD PAGE MODAL */}
      {showAddPageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Add Blank Page</h3>
            <div className="space-y-3 mb-6">
              <label className="block text-xs font-semibold text-gray-600">Standard Page Size</label>
              <select
                value={newPageSize}
                onChange={(e) => setNewPageSize(e.target.value)}
                className="w-full text-xs font-bold p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              >
                <option value="A4">A4 (Standard 210 × 297 mm)</option>
                <option value="Letter">US Letter (8.5 × 11 in)</option>
                <option value="A3">A3 (Large 297 × 420 mm)</option>
                <option value="A5">A5 (Compact 148 × 210 mm)</option>
                <option value="Legal">US Legal (8.5 × 14 in)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddPageModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => addBlankPage(newPageSize)}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Add Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
