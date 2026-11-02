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
  Minimize2,
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
  RotateCcw,
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
  Sliders,
  Scissors,
  Crop,
  RefreshCw,
  BringToFront,
  SendToBack,
  PanelRightClose,
  PanelRightOpen,
  MousePointer,
  HelpCircle,
} from "lucide-react";
import { getApiUrl, getDownloadUrl } from "@/lib/api";

export interface EditorTextElement {
  id: string;
  type: "text";
  page: number;
  text: string;
  placeholder?: string;
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
  fixedHeight?: boolean;
  isExisting?: boolean;
  originalText?: string;
  originalBbox?: number[];
  isOcr?: boolean;
}

export interface EditorImageCrop {
  x: number; // 0 to 1
  y: number;
  width: number;
  height: number;
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
  originalRatio: number; // width / height
  lockAspectRatio: boolean;
  rotation: number;
  opacity: number;
  crop?: EditorImageCrop;
  zIndex: number;
  isExisting?: boolean;
  originalBbox?: number[];
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
  isExisting?: boolean;
  originalBbox?: number[];
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
  sizeName: string;
  rotation: number;
  backgroundColor?: string;
  border?: PageBorderConfig;
  thumbnail?: string; // base document rendered image if available
}

interface WordEditorProps {
  initialFile?: File | null;
  initialBlankSize?: string;
}

export const PAGE_SIZE_PRESETS: Record<string, [number, number]> = {
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
  const replaceImageRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Document states
  const [docFile, setDocFile] = useState<File | null>(initialFile || null);
  const [docName, setDocName] = useState(initialFile ? initialFile.name : "Document1.pdf");
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [deletedOriginalBboxes, setDeletedOriginalBboxes] = useState<{ page: number; bbox: number[] }[]>([]);

  // History for Undo / Redo
  const [history, setHistory] = useState<{ pages: EditorPage[]; elements: EditorElement[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // UI & Layout States
  const [zoom, setZoom] = useState(1.0); // 1.0 = 100%
  const [activeTab, setActiveTab] = useState<"file" | "home" | "insert" | "arrange" | "page">("home");
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [copiedElements, setCopiedElements] = useState<EditorElement[]>([]);
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [insertPagePos, setInsertPagePos] = useState<"before" | "after">("after");
  const [newPageSize, setNewPageSize] = useState("A4");
  const [isCropMode, setIsCropMode] = useState(false);
  const [pageInputVal, setPageInputVal] = useState("1");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Export & Progress Modal
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStatusText, setExportStatusText] = useState<string | null>(null);

  // Dragging & Interaction states on Canvas
  const [dragState, setDragState] = useState<{
    type: "move" | "resize" | "rotate" | "marquee";
    elementId?: string;
    handle?: string; // nw, n, ne, e, se, s, sw, w
    startX: number;
    startY: number;
    initialElements?: EditorElement[];
    initialBox?: { x: number; y: number; width: number; height: number; rotation?: number };
    marqueeBox?: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Drag and drop for page thumbnail reordering
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dropTargetPageIndex, setDropTargetPageIndex] = useState<number | null>(null);

  // Show a temporary toast notification
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  }, []);

  // Push state to undo/redo history
  const pushHistory = useCallback(
    (newPages: EditorPage[], newElements: EditorElement[]) => {
      setHistory((prev) => {
        const upToCurrent = prev.slice(0, historyIndex + 1);
        return [
          ...upToCurrent,
          {
            pages: JSON.parse(JSON.stringify(newPages)),
            elements: JSON.parse(JSON.stringify(newElements)),
          },
        ];
      });
      setHistoryIndex((prev) => prev + 1);
      setHasUnsavedChanges(true);
      setSaveStatus("unsaved");
    },
    [historyIndex]
  );

  // Autosave to LocalStorage (debounced 1s)
  useEffect(() => {
    if (!hasUnsavedChanges || pages.length === 0) return;
    setSaveStatus("saving");
    const timer = setTimeout(() => {
      try {
        const sessionData = {
          docName,
          pages,
          elements,
          timestamp: Date.now(),
        };
        localStorage.setItem("pdfly_editor_session", JSON.stringify(sessionData));
        setSaveStatus("saved");
      } catch (err) {
        setSaveStatus("unsaved");
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [pages, elements, docName, hasUnsavedChanges]);

  // Keep page counter input in sync
  useEffect(() => {
    setPageInputVal(String(currentPageIndex + 1));
  }, [currentPageIndex]);

  // Initial load
  useEffect(() => {
    if (docFile) {
      loadExistingPdf(docFile);
    } else {
      createInitialBlank(initialBlankSize);
    }
  }, []);

  const createInitialBlank = (sizeName: string = "A4") => {
    const [w, h] = PAGE_SIZE_PRESETS[sizeName] || PAGE_SIZE_PRESETS["A4"];
    const initialPages: EditorPage[] = [
      {
        id: `p-${Date.now()}`,
        pageNumber: 1,
        sourceIndex: null,
        width: w,
        height: h,
        sizeName,
        rotation: 0,
        backgroundColor: "#ffffff",
        border: { enabled: false, thickness: 2, color: "#000000", style: "solid", margin: 20 },
      },
    ];
    setPages(initialPages);
    setElements([]); // Clean empty document: NO prefilled text, NO random jfk! (Item 2 & 50)
    setSelectedIds([]);
    setEditingTextId(null);
    setHistory([{ pages: initialPages, elements: [] }]);
    setHistoryIndex(0);
    setHasUnsavedChanges(false);
    setSaveStatus("saved");
  };

  const loadExistingPdf = async (file: File) => {
    setIsExporting(true);
    setExportStatusText("Extracting PDF text, layout, and images...");
    setExportProgress(25);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("max_pages", "60");

      const res = await fetch(getApiUrl("/api/edit/extract-content"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Could not extract document content.");
      const data = await res.json();
      setExportProgress(80);

      const loadedPages: EditorPage[] = (data.pages || []).map((p: any) => {
        let detectedSize = "Custom";
        for (const [sName, [sw, sh]] of Object.entries(PAGE_SIZE_PRESETS)) {
          if (Math.abs(p.width - sw) < 10 && Math.abs(p.height - sh) < 10) {
            detectedSize = sName;
            break;
          }
        }
        return {
          ...p,
          sizeName: detectedSize,
        };
      });

      const loadedElements: EditorElement[] = [
        ...(data.text_elements || []),
        ...(data.image_elements || []),
      ];

      if (loadedPages.length === 0) {
        createInitialBlank("A4");
      } else {
        setPages(loadedPages);
        setElements(loadedElements);
        setSelectedIds([]);
        setEditingTextId(null);
        setDeletedOriginalBboxes([]);
        setHistory([{ pages: loadedPages, elements: loadedElements }]);
        setHistoryIndex(0);
        setHasUnsavedChanges(false);
        setSaveStatus("saved");
      }

      if (data.has_scanned_ocr) {
        showToast("Scanned document detected: Text recognized via OCR and made editable!");
      } else {
        showToast(`Extracted ${loadedElements.length} editable elements across ${loadedPages.length} page(s).`);
      }
    } catch (err: any) {
      showToast("Could not extract PDF content; creating blank canvas.");
      createInitialBlank("A4");
    } finally {
      setIsExporting(false);
      setExportStatusText(null);
      setExportProgress(0);
    }
  };

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const snapshot = history[nextIdx];
      setPages(JSON.parse(JSON.stringify(snapshot.pages)));
      setElements(JSON.parse(JSON.stringify(snapshot.elements)));
      setHistoryIndex(nextIdx);
      setSelectedIds([]);
      setEditingTextId(null);
      showToast("Undone");
    }
  }, [historyIndex, history, showToast]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const snapshot = history[nextIdx];
      setPages(JSON.parse(JSON.stringify(snapshot.pages)));
      setElements(JSON.parse(JSON.stringify(snapshot.elements)));
      setHistoryIndex(nextIdx);
      setSelectedIds([]);
      setEditingTextId(null);
      showToast("Redone");
    }
  }, [historyIndex, history, showToast]);

  const currentPage = pages[currentPageIndex] || pages[0];

  // ---------------- Page Operations ----------------

  const insertPageAtPosition = (pos: "before" | "after", size: string) => {
    const [w, h] = PAGE_SIZE_PRESETS[size] || PAGE_SIZE_PRESETS["A4"];
    const targetIdx = pos === "before" ? currentPageIndex : currentPageIndex + 1;
    const newPage: EditorPage = {
      id: `p-${Date.now()}`,
      pageNumber: targetIdx + 1,
      sourceIndex: null,
      width: w,
      height: h,
      sizeName: size,
      rotation: 0,
      backgroundColor: "#ffffff",
      border: { enabled: false, thickness: 2, color: "#000000", style: "solid", margin: 20 },
    };

    const nextPages = [...pages];
    nextPages.splice(targetIdx, 0, newPage);

    // Re-index pages
    nextPages.forEach((p, idx) => {
      p.pageNumber = idx + 1;
    });

    // Shift elements accordingly
    const nextElements = elements.map((el) => {
      if (el.page > targetIdx) {
        return { ...el, page: el.page + 1 };
      }
      return el;
    });

    setPages(nextPages);
    setElements(nextElements);
    setCurrentPageIndex(targetIdx);
    pushHistory(nextPages, nextElements);
    setShowAddPageModal(false);
    showToast(`New ${size} page inserted ${pos}.`);
  };

  const duplicateCurrentPage = () => {
    if (!currentPage) return;
    const newPageNum = currentPageIndex + 2;
    const duplicatedPage: EditorPage = {
      ...JSON.parse(JSON.stringify(currentPage)),
      id: `p-${Date.now()}`,
      pageNumber: newPageNum,
    };

    // Duplicate all elements on current page
    const pageElements = elements
      .filter((e) => e.page === currentPageIndex + 1)
      .map((e) => ({
        ...JSON.parse(JSON.stringify(e)),
        id: `elem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        page: newPageNum,
      }));

    const nextPages = [...pages];
    nextPages.splice(currentPageIndex + 1, 0, duplicatedPage);
    nextPages.forEach((p, idx) => {
      p.pageNumber = idx + 1;
    });

    // Shift later elements
    const shiftedElements = elements.map((el) => {
      if (el.page > currentPageIndex + 1) {
        return { ...el, page: el.page + 1 };
      }
      return el;
    });

    const nextElements = [...shiftedElements, ...pageElements];
    setPages(nextPages);
    setElements(nextElements);
    setCurrentPageIndex(currentPageIndex + 1);
    pushHistory(nextPages, nextElements);
    showToast("Page duplicated. Press Ctrl+Z to undo.");
  };

  const deleteCurrentPage = () => {
    if (pages.length <= 1) {
      alert("A document must have at least one page. Cannot delete the only remaining page.");
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete Page ${currentPageIndex + 1}?`);
    if (!confirmed) return;

    const pageNumToDelete = currentPageIndex + 1;
    const nextPages = pages.filter((_, idx) => idx !== currentPageIndex);
    nextPages.forEach((p, idx) => {
      p.pageNumber = idx + 1;
    });

    const nextElements = elements
      .filter((e) => e.page !== pageNumToDelete)
      .map((e) => (e.page > pageNumToDelete ? { ...e, page: e.page - 1 } : e));

    const nextIndex = Math.max(0, currentPageIndex - 1);
    setPages(nextPages);
    setElements(nextElements);
    setCurrentPageIndex(nextIndex);
    pushHistory(nextPages, nextElements);
    showToast("Page deleted. Press Ctrl+Z to undo.");
  };

  const rotateCurrentPage = () => {
    if (!currentPage) return;
    const nextPages = pages.map((p, idx) =>
      idx === currentPageIndex ? { ...p, rotation: (p.rotation + 90) % 360 } : p
    );
    setPages(nextPages);
    pushHistory(nextPages, elements);
    showToast(`Rotated Page ${currentPageIndex + 1} 90°`);
  };

  const togglePageOrientation = () => {
    if (!currentPage) return;
    const nextPages = pages.map((p, idx) => {
      if (idx === currentPageIndex) {
        return {
          ...p,
          width: p.height,
          height: p.width,
        };
      }
      return p;
    });
    setPages(nextPages);
    pushHistory(nextPages, elements);
    showToast(`Swapped page orientation`);
  };

  const changePageSize = (sizeName: string) => {
    if (!currentPage) return;
    const [w, h] = PAGE_SIZE_PRESETS[sizeName] || PAGE_SIZE_PRESETS["A4"];
    const isLandscape = currentPage.width > currentPage.height;
    const finalW = isLandscape ? Math.max(w, h) : Math.min(w, h);
    const finalH = isLandscape ? Math.min(w, h) : Math.max(w, h);

    const nextPages = pages.map((p, idx) =>
      idx === currentPageIndex
        ? {
            ...p,
            width: finalW,
            height: finalH,
            sizeName,
          }
        : p
    );
    setPages(nextPages);
    pushHistory(nextPages, elements);
    showToast(`Changed size to ${sizeName}`);
  };

  const handlePageDrop = (targetIndex: number) => {
    if (draggedPageIndex === null || draggedPageIndex === targetIndex) {
      setDraggedPageIndex(null);
      setDropTargetPageIndex(null);
      return;
    }

    const nextPages = [...pages];
    const [moved] = nextPages.splice(draggedPageIndex, 1);
    nextPages.splice(targetIndex, 0, moved);

    // Update element page assignments
    const oldPNum = draggedPageIndex + 1;
    const newPNum = targetIndex + 1;

    const nextElements = elements.map((el) => {
      if (el.page === oldPNum) {
        return { ...el, page: newPNum };
      }
      if (oldPNum < newPNum) {
        if (el.page > oldPNum && el.page <= newPNum) {
          return { ...el, page: el.page - 1 };
        }
      } else {
        if (el.page >= newPNum && el.page < oldPNum) {
          return { ...el, page: el.page + 1 };
        }
      }
      return el;
    });

    nextPages.forEach((p, idx) => {
      p.pageNumber = idx + 1;
    });

    setPages(nextPages);
    setElements(nextElements);
    setCurrentPageIndex(targetIndex);
    pushHistory(nextPages, nextElements);
    setDraggedPageIndex(null);
    setDropTargetPageIndex(null);
    showToast(`Page reordered to #${targetIndex + 1}`);
  };

  // ---------------- Elements Manipulation ----------------

  const addTextElement = () => {
    const newId = `text-${Date.now()}`;
    // Empty text by default with placeholder (Item 1, 2)
    const newText: EditorTextElement = {
      id: newId,
      type: "text",
      page: currentPageIndex + 1,
      text: "",
      placeholder: "Type text here...",
      x: 60,
      y: 100,
      width: 260,
      height: 48,
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
      fixedHeight: false,
    };
    const nextElements = [...elements, newText];
    setElements(nextElements);
    setSelectedIds([newId]);
    // Automatically enter editing mode with visible cursor (Item 3, 4, 5)
    setEditingTextId(newId);
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
          const maxW = 240;
          const ratio = img.width > 0 ? img.height / img.width : 1;
          const finalW = Math.min(maxW, img.width || maxW);
          const finalH = Math.round(finalW * ratio);

          const newImg: EditorImageElement = {
            id: `img-${Date.now()}`,
            type: "image",
            page: currentPageIndex + 1,
            src: dataUrl,
            x: 80,
            y: 120,
            width: finalW,
            height: finalH,
            originalRatio: ratio > 0 ? 1 / ratio : 1,
            lockAspectRatio: true,
            rotation: 0,
            opacity: 1.0,
            zIndex: elements.length + 1,
          };
          const nextElements = [...elements, newImg];
          setElements(nextElements);
          setSelectedIds([newImg.id]);
          pushHistory(pages, nextElements);
          showToast("Image inserted");
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
    if (imageUploadRef.current) imageUploadRef.current.value = "";
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && selectedElement?.type === "image") {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        updateSelectedElement({ src: dataUrl });
        showToast("Image replaced");
      };
      reader.readAsDataURL(file);
    }
    if (replaceImageRef.current) replaceImageRef.current.value = "";
  };

  const addShape = (shapeType: "rect" | "circle" | "line") => {
    const newShape: EditorShapeElement = {
      id: `shape-${Date.now()}`,
      type: "shape",
      shapeType,
      page: currentPageIndex + 1,
      x: 100,
      y: 140,
      width: shapeType === "line" ? 220 : 120,
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
    const toDelete = elements.filter((el) => selectedIds.includes(el.id));
    const newDeletedBboxes = toDelete
      .filter((el: any) => el.isExisting && el.originalBbox)
      .map((el: any) => ({ page: el.page, bbox: el.originalBbox }));
    if (newDeletedBboxes.length > 0) {
      setDeletedOriginalBboxes((prev) => [...prev, ...newDeletedBboxes]);
    }
    const nextElements = elements.filter((el) => !selectedIds.includes(el.id));
    setElements(nextElements);
    setSelectedIds([]);
    setEditingTextId(null);
    pushHistory(pages, nextElements);
    showToast("Deleted");
  };

  const copySelected = () => {
    const selected = elements.filter((el) => selectedIds.includes(el.id));
    if (selected.length > 0) {
      setCopiedElements(JSON.parse(JSON.stringify(selected)));
      showToast(`Copied ${selected.length} item${selected.length > 1 ? "s" : ""}`);
    }
  };

  const pasteCopied = () => {
    if (copiedElements.length === 0) return;
    const pasted = copiedElements.map((el) => ({
      ...el,
      id: `elem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      page: currentPageIndex + 1,
      x: el.x + 20,
      y: el.y + 20,
      zIndex: elements.length + 1,
    }));
    const nextElements = [...elements, ...pasted];
    setElements(nextElements);
    setSelectedIds(pasted.map((p) => p.id));
    pushHistory(pages, nextElements);
    showToast("Pasted");
  };

  const cutSelected = () => {
    copySelected();
    deleteSelected();
    showToast("Cut to clipboard");
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
    setCurrentPageIndex(targetPageNum - 1);
    showToast(`Moved element to Page ${targetPageNum}`);
  };

  // Layering
  const changeLayer = (action: "forward" | "backward" | "front" | "back") => {
    if (selectedIds.length === 0) return;
    const currentZIndexes = elements.map((e) => e.zIndex);
    const maxZ = Math.max(...currentZIndexes, 1);
    const minZ = Math.min(...currentZIndexes, 1);

    const nextElements = elements.map((el) => {
      if (selectedIds.includes(el.id)) {
        if (action === "front") return { ...el, zIndex: maxZ + 1 };
        if (action === "back") return { ...el, zIndex: Math.max(1, minZ - 1) };
        if (action === "forward") return { ...el, zIndex: el.zIndex + 1 };
        if (action === "backward") return { ...el, zIndex: Math.max(1, el.zIndex - 1) };
      }
      return el;
    });
    setElements(nextElements);
    pushHistory(pages, nextElements);
  };

  // Alignment
  const alignElements = (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (selectedIds.length === 0 || !currentPage) return;

    if (selectedIds.length > 1) {
      // Relative to selection bounds
      const selected = elements.filter((e) => selectedIds.includes(e.id));
      const minX = Math.min(...selected.map((e) => e.x));
      const maxX = Math.max(...selected.map((e) => e.x + e.width));
      const minY = Math.min(...selected.map((e) => e.y));
      const maxY = Math.max(...selected.map((e) => e.y + e.height));
      const selW = maxX - minX;
      const selH = maxY - minY;

      const nextElements = elements.map((el) => {
        if (selectedIds.includes(el.id)) {
          let nx = el.x;
          let ny = el.y;
          if (alignment === "left") nx = minX;
          if (alignment === "center") nx = minX + (selW - el.width) / 2;
          if (alignment === "right") nx = maxX - el.width;
          if (alignment === "top") ny = minY;
          if (alignment === "middle") ny = minY + (selH - el.height) / 2;
          if (alignment === "bottom") ny = maxY - el.height;
          return { ...el, x: nx, y: ny };
        }
        return el;
      });
      setElements(nextElements);
      pushHistory(pages, nextElements);
    } else {
      // Relative to page
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
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Zoom preset helper
  const handleZoomPreset = (val: string) => {
    if (val === "fit-page" && canvasContainerRef.current && currentPage) {
      const containerH = canvasContainerRef.current.clientHeight - 80;
      const fitZ = Math.max(0.3, Math.min(2.0, containerH / currentPage.height));
      setZoom(Number(fitZ.toFixed(2)));
    } else if (val === "fit-width" && canvasContainerRef.current && currentPage) {
      const containerW = canvasContainerRef.current.clientWidth - 120;
      const fitZ = Math.max(0.3, Math.min(2.0, containerW / currentPage.width));
      setZoom(Number(fitZ.toFixed(2)));
    } else {
      setZoom(Number(val));
    }
  };

  // ---------------- Canvas Mouse Interaction Engine ----------------

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editingTextId) {
      // Close active text editor
      setEditingTextId(null);
    }
    // Clicking on canvas background initiates marquee selection
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / zoom;
    const clickY = (e.clientY - rect.top) / zoom;

    setSelectedIds([]);
    setDragState({
      type: "marquee",
      startX: clickX,
      startY: clickY,
      marqueeBox: { x: clickX, y: clickY, width: 0, height: 0 },
    });
  };

  const handleElementMouseDown = (e: React.MouseEvent, el: EditorElement) => {
    e.stopPropagation();

    if (e.shiftKey) {
      setSelectedIds((prev) =>
        prev.includes(el.id) ? prev.filter((id) => id !== el.id) : [...prev, el.id]
      );
      return;
    }

    if (!selectedIds.includes(el.id)) {
      setSelectedIds([el.id]);
    }

    if (editingTextId === el.id) {
      return; // typing inside active text box
    }

    // Start moving element
    const initialElements = elements.filter((elem) =>
      selectedIds.includes(elem.id) || elem.id === el.id
    );

    setDragState({
      type: "move",
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      initialElements: JSON.parse(JSON.stringify(initialElements)),
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, el: EditorElement, handle: string) => {
    e.stopPropagation();
    setDragState({
      type: "resize",
      elementId: el.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialBox: {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: (el as any).rotation || 0,
      },
    });
  };

  const handleRotateMouseDown = (e: React.MouseEvent, el: EditorImageElement) => {
    e.stopPropagation();
    setDragState({
      type: "rotate",
      elementId: el.id,
      startX: e.clientX,
      startY: e.clientY,
      initialBox: {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation || 0,
      },
    });
  };

  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState) return;

      if (dragState.type === "move" && dragState.initialElements) {
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;

        setElements((prev) =>
          prev.map((el) => {
            const initial = dragState.initialElements?.find((item) => item.id === el.id);
            if (initial && currentPage) {
              const nx = Math.round(initial.x + dx);
              const ny = Math.round(initial.y + dy);
              return { ...el, x: nx, y: ny };
            }
            return el;
          })
        );
      } else if (dragState.type === "resize" && dragState.initialBox && dragState.elementId) {
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        const init = dragState.initialBox;
        const h = dragState.handle || "se";

        setElements((prev) =>
          prev.map((el) => {
            if (el.id !== dragState.elementId) return el;

            let nx = init.x;
            let ny = init.y;
            let nw = init.width;
            let nh = init.height;

            if (h.includes("e")) nw = Math.max(30, init.width + dx);
            if (h.includes("s")) nh = Math.max(20, init.height + dy);
            if (h.includes("w")) {
              const proposedW = init.width - dx;
              if (proposedW >= 30) {
                nw = proposedW;
                nx = init.x + dx;
              }
            }
            if (h.includes("n")) {
              const proposedH = init.height - dy;
              if (proposedH >= 20) {
                nh = proposedH;
                ny = init.y + dy;
              }
            }

            // Maintain aspect ratio for image corner handles
            if (el.type === "image" && el.lockAspectRatio && ["nw", "ne", "se", "sw"].includes(h)) {
              const ratio = el.originalRatio || init.width / init.height;
              nh = Math.max(20, nw / ratio);
            }

            return {
              ...el,
              x: Math.round(nx),
              y: Math.round(ny),
              width: Math.round(nw),
              height: Math.round(nh),
              fixedHeight: el.type === "text" ? true : undefined,
            } as EditorElement;
          })
        );
      } else if (dragState.type === "rotate" && dragState.initialBox && dragState.elementId) {
        const pageEl = document.getElementById(`page-canvas-${currentPageIndex}`);
        if (!pageEl) return;
        const pageRect = pageEl.getBoundingClientRect();
        const init = dragState.initialBox;

        const centerX = pageRect.left + (init.x + init.width / 2) * zoom;
        const centerY = pageRect.top + (init.y + init.height / 2) * zoom;

        const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        let deg = Math.round((rad * 180) / Math.PI) + 90; // offset so top handle is 0°
        if (deg < 0) deg += 360;
        deg = deg % 360;

        setElements((prev) =>
          prev.map((el) => (el.id === dragState.elementId ? { ...el, rotation: deg } : el))
        );
      } else if (dragState.type === "marquee") {
        const pageEl = document.getElementById(`page-canvas-${currentPageIndex}`);
        if (!pageEl) return;
        const pageRect = pageEl.getBoundingClientRect();
        const curX = (e.clientX - pageRect.left) / zoom;
        const curY = (e.clientY - pageRect.top) / zoom;

        const x = Math.min(dragState.startX, curX);
        const y = Math.min(dragState.startY, curY);
        const w = Math.abs(curX - dragState.startX);
        const h = Math.abs(curY - dragState.startY);

        setDragState((prev) => (prev ? { ...prev, marqueeBox: { x, y, width: w, height: h } } : null));

        // Highlight intersecting elements
        const pageElems = elements.filter((elem) => elem.page === currentPageIndex + 1);
        const intersectingIds = pageElems
          .filter((elem) => {
            return (
              elem.x < x + w &&
              elem.x + elem.width > x &&
              elem.y < y + h &&
              elem.y + elem.height > y
            );
          })
          .map((elem) => elem.id);

        setSelectedIds(intersectingIds);
      }
    },
    [dragState, zoom, currentPageIndex, elements, currentPage]
  );

  const handleGlobalMouseUp = useCallback(() => {
    if (dragState) {
      pushHistory(pages, elements);
      setDragState(null);
    }
  }, [dragState, pages, elements, pushHistory]);

  useEffect(() => {
    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  // ---------------- Keyboard Shortcuts ----------------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      // Text formatting shortcuts (Ctrl+B, Ctrl+I, Ctrl+U) (Item 10)
      if (cmdKey && selectedElement?.type === "text") {
        const textEl = selectedElement as EditorTextElement;
        if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          updateSelectedElement({ bold: !textEl.bold });
          return;
        } else if (e.key.toLowerCase() === "i") {
          e.preventDefault();
          updateSelectedElement({ italic: !textEl.italic });
          return;
        } else if (e.key.toLowerCase() === "u") {
          e.preventDefault();
          updateSelectedElement({ underline: !textEl.underline });
          return;
        }
      }

      if (isInput) {
        if (e.key === "Escape") {
          setEditingTextId(null);
        }
        return;
      }

      if (e.key === "Enter" && selectedIds.length === 1) {
        const single = elements.find((el) => el.id === selectedIds[0]);
        if (single?.type === "text") {
          e.preventDefault();
          setEditingTextId(single.id);
          return;
        }
      }

      if (cmdKey && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        cmdKey &&
        (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))
      ) {
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
        handleSaveSession();
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
  }, [
    historyIndex,
    history,
    elements,
    selectedIds,
    copiedElements,
    currentPageIndex,
    handleUndo,
    handleRedo,
  ]);

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

  // ---------------- Export & Session Handlers ----------------

  const handleSaveSession = () => {
    try {
      const sessionData = {
        docName,
        pages,
        elements,
        timestamp: Date.now(),
      };
      localStorage.setItem("pdfly_editor_session", JSON.stringify(sessionData));
      setSaveStatus("saved");
      setHasUnsavedChanges(false);
      showToast("Session saved locally (Ctrl+S)");
    } catch (err) {
      alert("Could not save session to local storage.");
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    setExportProgress(10);
    setExportStatusText("Encoding document elements and vector fonts...");

    try {
      // Filter out empty placeholder text so no placeholder text is ever rendered (Item 1)
      const validTextElements = elements
        .filter((e) => e.type === "text")
        .map((e) => e as EditorTextElement)
        .filter((e) => e.text && e.text.trim().length > 0);

      const editorState = {
        pages: pages.map((p) => ({
          sourceIndex: p.sourceIndex,
          isNew: p.sourceIndex === null,
          rotation: p.rotation,
          width: p.width,
          height: p.height,
          size: p.sizeName,
          backgroundColor: p.backgroundColor,
          border: p.border,
        })),
        textElements: validTextElements,
        images: elements.filter((e) => e.type === "image"),
        shapes: elements.filter((e) => e.type === "shape"),
        deletedOriginalBboxes: deletedOriginalBboxes,
      };

      setExportProgress(45);
      setExportStatusText("Sending genuine document commands to PDFly backend...");

      const formData = new FormData();
      if (docFile) {
        formData.append("file", docFile);
      }
      formData.append("editor_state", JSON.stringify(editorState));

      const res = await fetch(getApiUrl("/api/edit/export-pdf"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Failed to export PDF.");
      }

      setExportProgress(85);
      setExportStatusText("Generating vector output and verifying stream...");

      const data = await res.json();
      setHasUnsavedChanges(false);
      setSaveStatus("saved");
      setExportProgress(100);

      if (data.download_url) {
        const link = document.createElement("a");
        link.href = getDownloadUrl(data.download_url);
        link.download = docName.endsWith(".pdf") ? docName : `${docName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("PDF downloaded successfully!");
      }
    } catch (err: any) {
      alert(`Export error: ${err.message || "Failed to export PDF"}`);
    } finally {
      setIsExporting(false);
      setExportStatusText(null);
      setExportProgress(0);
    }
  };

  const selectedElement = elements.find((e) => selectedIds.includes(e.id));
  const currentText = selectedElement?.type === "text" ? (selectedElement as EditorTextElement) : null;
  const currentImage = selectedElement?.type === "image" ? (selectedElement as EditorImageElement) : null;
  const currentShape = selectedElement?.type === "shape" ? (selectedElement as EditorShapeElement) : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 overflow-hidden font-sans select-none text-gray-800">
      {/* Hidden file inputs */}
      <input
        ref={imageUploadRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={replaceImageRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleReplaceImage}
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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900/90 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 backdrop-blur-md animate-fade-in border border-gray-700">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Export / Download Progress Modal (Item 48) */}
      {isExporting && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-gray-100 text-center space-y-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-900">Processing Document</h4>
              <p className="text-xs text-gray-500 mt-1">{exportStatusText || "Please wait..."}</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-red-600 h-full transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 1. COMPACT EDITOR HEADER (Items 31 & 32: NO Marketing Navbar, NO Duplicate Logo) */}
      <header className="h-12 bg-white border-b border-gray-200 px-3 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          {/* Single brand icon + Back home */}
          <Link
            href="/"
            className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-gray-100 transition-colors group"
            title="Return to PDFly Home"
          >
            <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-white font-black text-xs shadow-xs group-hover:scale-105 transition-transform">
              P
            </div>
            <span className="font-extrabold text-sm tracking-tight text-gray-900 hidden sm:inline">
              PDF<span className="text-red-600">ly</span> Editor
            </span>
          </Link>

          <div className="h-4 w-px bg-gray-200" />

          {/* Document name & Autosave Status (Item 46) */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={docName}
              onChange={(e) => {
                setDocName(e.target.value);
                setHasUnsavedChanges(true);
              }}
              className="text-xs font-bold text-gray-800 bg-transparent hover:bg-gray-100 px-2 py-1 rounded outline-none focus:bg-white focus:ring-1 focus:ring-red-500 w-44 truncate"
              title="Click to rename document"
            />
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <Check className="w-3 h-3" />
                <span className="hidden md:inline">Saved</span>
              </span>
            )}
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="hidden md:inline">Saving...</span>
              </span>
            )}
            {saveStatus === "unsaved" && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="hidden md:inline">Unsaved</span>
              </span>
            )}
          </div>
        </div>

        {/* Center / Right Quick Actions */}
        <div className="flex items-center gap-2">
          {/* Prominent Undo / Redo (Item 35) */}
          <div className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 rounded text-gray-600 hover:bg-white hover:text-gray-900 disabled:opacity-25 transition-all"
              title="Undo (Ctrl/Cmd+Z)"
              aria-label="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 rounded text-gray-600 hover:bg-white hover:text-gray-900 disabled:opacity-25 transition-all"
              title="Redo (Ctrl/Cmd+Y)"
              aria-label="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-gray-200" />

          {/* Zoom controls with presets dropdown (Item 36) */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-0.5 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(1))))}
              className="p-1 text-gray-500 hover:text-gray-800"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <select
              value={zoom}
              onChange={(e) => handleZoomPreset(e.target.value)}
              className="bg-transparent font-bold text-[11px] text-gray-700 outline-none cursor-pointer"
            >
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1.0">100%</option>
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
              <option value="2.0">200%</option>
              <option value="fit-page">Fit Page</option>
              <option value="fit-width">Fit Width</option>
            </select>
            <button
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.1).toFixed(1))))}
              className="p-1 text-gray-500 hover:text-gray-800"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>

          {/* Fullscreen toggle (Item 38) */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
            title="Toggle Fullscreen"
            aria-label="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <div className="h-4 w-px bg-gray-200" />

          {/* Meaningful Save Session vs Download PDF (Item 47) */}
          <button
            onClick={handleSaveSession}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            title="Save editing session locally (Ctrl/Cmd+S)"
          >
            <Save className="w-3.5 h-3.5 text-gray-500" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-all"
            title="Export genuine PDF with all changes"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>Download PDF</span>
          </button>
        </div>
      </header>

      {/* 2. SECONDARY RIBBON TOOLBAR (Items 33, 34, 39, 40: Logically Grouped, Contextual Formatting) */}
      <nav className="h-11 bg-white border-b border-gray-200 px-3 flex items-center justify-between overflow-x-auto no-scrollbar shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-max">
          {/* File Operations */}
          <button
            onClick={() => {
              if (hasUnsavedChanges) {
                const proceed = window.confirm("Discard unsaved changes and open a new file?");
                if (!proceed) return;
              }
              fileInputRef.current?.click();
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title="Open an existing PDF document"
          >
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            <span>Open PDF</span>
          </button>
          <button
            onClick={() => {
              if (hasUnsavedChanges) {
                const proceed = window.confirm("Discard unsaved changes and start a clean document?");
                if (!proceed) return;
              }
              setDocFile(null);
              setDocName("Untitled.pdf");
              createInitialBlank("A4");
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title="New blank document"
          >
            <Plus className="w-3.5 h-3.5 text-gray-500" />
            <span>New Blank</span>
          </button>

          <div className="h-4 w-px bg-gray-200 mx-1" />

          {/* Insert Elements */}
          <div className="flex items-center gap-1">
            <button
              onClick={addTextElement}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-md text-xs font-bold transition-colors"
              title="Add a new text box"
            >
              <Type className="w-3.5 h-3.5 text-red-600" />
              <span>Add Text</span>
            </button>
            <button
              onClick={() => imageUploadRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-700 rounded-md transition-colors"
              title="Insert JPG or PNG image"
            >
              <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
              <span>Insert Image</span>
            </button>
            <button
              onClick={() => addShape("rect")}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
              title="Insert rectangle shape"
            >
              <Square className="w-3.5 h-3.5 text-blue-600" />
              <span>Rectangle</span>
            </button>
            <button
              onClick={() => addShape("circle")}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
              title="Insert circle shape"
            >
              <Circle className="w-3.5 h-3.5 text-blue-600" />
              <span>Circle</span>
            </button>
          </div>

          <div className="h-4 w-px bg-gray-200 mx-1" />

          {/* Contextual Quick Formatting Toolbar (Item 34) */}
          {currentText && (
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
              <select
                value={currentText.fontFamily}
                onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
                className="bg-transparent text-[11px] font-semibold text-gray-700 px-1 outline-none"
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times-Roman">Times New Roman</option>
                <option value="Courier">Courier</option>
                <option value="Georgia">Georgia</option>
              </select>

              <div className="h-3 w-px bg-gray-300" />

              <input
                type="number"
                min="8"
                max="96"
                value={currentText.fontSize}
                onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                className="w-10 text-[11px] font-bold text-center bg-white rounded border border-gray-200 py-0.5"
                title="Font size (px)"
              />

              <div className="h-3 w-px bg-gray-300" />

              <button
                onClick={() => updateSelectedElement({ bold: !currentText.bold })}
                className={`p-1 rounded ${currentText.bold ? "bg-red-500 text-white font-bold" : "text-gray-600 hover:bg-gray-200"}`}
                title="Bold (Ctrl/Cmd+B)"
              >
                <Bold className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateSelectedElement({ italic: !currentText.italic })}
                className={`p-1 rounded ${currentText.italic ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}
                title="Italic (Ctrl/Cmd+I)"
              >
                <Italic className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateSelectedElement({ underline: !currentText.underline })}
                className={`p-1 rounded ${currentText.underline ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}
                title="Underline (Ctrl/Cmd+U)"
              >
                <Underline className="w-3 h-3" />
              </button>

              <div className="h-3 w-px bg-gray-300" />

              <input
                type="color"
                value={currentText.color}
                onChange={(e) => updateSelectedElement({ color: e.target.value })}
                className="w-5 h-5 rounded cursor-pointer border border-gray-300 p-0"
                title="Text Color"
              />

              <div className="h-3 w-px bg-gray-300" />

              <button
                onClick={() => updateSelectedElement({ align: "left" })}
                className={`p-1 rounded ${currentText.align === "left" ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}
                title="Align Left"
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateSelectedElement({ align: "center" })}
                className={`p-1 rounded ${currentText.align === "center" ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}
                title="Align Center"
              >
                <AlignCenter className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateSelectedElement({ align: "right" })}
                className={`p-1 rounded ${currentText.align === "right" ? "bg-red-500 text-white" : "text-gray-600 hover:bg-gray-200"}`}
                title="Align Right"
              >
                <AlignRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {currentImage && (
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => replaceImageRef.current?.click()}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-700 hover:bg-gray-200 font-semibold text-[11px]"
                title="Replace image while keeping size & position"
              >
                <RefreshCw className="w-3 h-3 text-gray-500" />
                <span>Replace</span>
              </button>
              <button
                onClick={() =>
                  updateSelectedElement({ rotation: ((currentImage.rotation || 0) + 90) % 360 })
                }
                className="flex items-center gap-1 px-2 py-0.5 rounded text-gray-700 hover:bg-gray-200 font-semibold text-[11px]"
                title="Rotate 90°"
              >
                <RotateCw className="w-3 h-3 text-gray-500" />
                <span>Rotate 90°</span>
              </button>
              <button
                onClick={() => setIsCropMode(!isCropMode)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[11px] ${
                  isCropMode ? "bg-red-500 text-white" : "text-gray-700 hover:bg-gray-200"
                }`}
                title="Toggle Crop Mode"
              >
                <Crop className="w-3 h-3" />
                <span>Crop</span>
              </button>
            </div>
          )}

          {/* Layering & Alignment */}
          {selectedIds.length > 0 && (
            <>
              <div className="h-4 w-px bg-gray-200 mx-1" />
              <div className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                <button
                  onClick={() => changeLayer("forward")}
                  className="p-1 rounded text-gray-600 hover:bg-white hover:text-gray-900"
                  title="Bring Forward"
                >
                  <BringToFront className="w-3 h-3" />
                </button>
                <button
                  onClick={() => changeLayer("backward")}
                  className="p-1 rounded text-gray-600 hover:bg-white hover:text-gray-900"
                  title="Send Backward"
                >
                  <SendToBack className="w-3 h-3" />
                </button>
                <button
                  onClick={() => alignElements("center")}
                  className="p-1 rounded text-gray-600 hover:bg-white hover:text-gray-900"
                  title="Align Center to Page"
                >
                  <AlignCenter className="w-3 h-3" />
                </button>
                <button
                  onClick={() => alignElements("middle")}
                  className="p-1 rounded text-gray-600 hover:bg-white hover:text-gray-900"
                  title="Align Middle to Page"
                >
                  <Minus className="w-3 h-3 rotate-90" />
                </button>
                <button
                  onClick={deleteSelected}
                  className="p-1 rounded text-rose-500 hover:bg-rose-50"
                  title="Delete Selected (Del)"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right side: Properties panel toggle */}
        <button
          onClick={() => setIsPropertiesOpen(!isPropertiesOpen)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
            isPropertiesOpen ? "bg-gray-100 text-gray-800" : "text-gray-600 hover:bg-gray-100"
          }`}
          title="Toggle Properties Panel"
        >
          {isPropertiesOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">Properties</span>
        </button>
      </nav>

      {/* 3. MAIN WORKSPACE (Sidebar + Canvas + Contextual Properties) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT SIDEBAR: Page Thumbnails & Operations (Items 21–27) */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0 select-none">
          {/* Header */}
          <div className="p-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
              Pages ({pages.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setInsertPagePos("after");
                  setShowAddPageModal(true);
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-0.5 rounded transition-colors"
                title="Insert Blank Page"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Page action shortcuts */}
          <div className="px-2 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-around text-gray-500 text-xs">
            <button
              onClick={rotateCurrentPage}
              className="p-1.5 rounded hover:bg-gray-200 hover:text-gray-800"
              title="Rotate Page 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={togglePageOrientation}
              className="p-1.5 rounded hover:bg-gray-200 hover:text-gray-800"
              title="Toggle Orientation (Portrait / Landscape)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={duplicateCurrentPage}
              className="p-1.5 rounded hover:bg-gray-200 hover:text-gray-800"
              title="Duplicate Page"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={deleteCurrentPage}
              className="p-1.5 rounded hover:bg-rose-50 hover:text-rose-600"
              title="Delete Page"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Thumbnails strip with Live Page Rendering (Item 21, 22, 23, 24) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {pages.map((p, idx) => {
              const isSelected = idx === currentPageIndex;
              const isDropTarget = dropTargetPageIndex === idx;
              const pageElements = elements.filter((el) => el.page === idx + 1);
              const thumbAspect = p.width > 0 ? p.height / p.width : 1.414;

              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDraggedPageIndex(idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTargetPageIndex(idx);
                  }}
                  onDragLeave={() => setDropTargetPageIndex(null)}
                  onDrop={() => handlePageDrop(idx)}
                  onClick={() => setCurrentPageIndex(idx)}
                  className={`group relative rounded-xl transition-all cursor-pointer border p-1.5 ${
                    isDropTarget ? "border-t-4 border-t-red-600 bg-red-50/50" : ""
                  } ${
                    isSelected
                      ? "ring-2 ring-red-500 bg-red-50/40 border-red-300 shadow-xs"
                      : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100/60"
                  }`}
                >
                  {/* Thumbnail header */}
                  <div className="flex items-center justify-between mb-1 px-1 text-[10px] font-bold text-gray-500">
                    <span className="flex items-center gap-1">
                      <span>Page {idx + 1}</span>
                      {p.sizeName && <span className="text-gray-400 font-normal">({p.sizeName})</span>}
                    </span>
                    {p.rotation > 0 && <span className="text-red-500">{p.rotation}°</span>}
                  </div>

                  {/* Thumbnail Preview Box: Renders Live Page Content! (Item 21) */}
                  <div
                    style={{
                      width: "100%",
                      paddingBottom: `${Math.min(150, Math.round(thumbAspect * 100))}%`,
                      backgroundColor: p.backgroundColor || "#ffffff",
                    }}
                    className="relative rounded border border-gray-300 shadow-2xs overflow-hidden"
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        transform: `rotate(${p.rotation}deg)`,
                      }}
                      className="w-full h-full relative"
                    >
                      {/* Base document image if present */}
                      {p.thumbnail && (
                        <img
                          src={p.thumbnail}
                          alt={`Page ${idx + 1}`}
                          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                        />
                      )}

                      {/* Border preview */}
                      {p.border?.enabled && (
                        <div
                          style={{
                            position: "absolute",
                            top: `${(p.border.margin / p.height) * 100}%`,
                            left: `${(p.border.margin / p.width) * 100}%`,
                            right: `${(p.border.margin / p.width) * 100}%`,
                            bottom: `${(p.border.margin / p.height) * 100}%`,
                            borderWidth: 1,
                            borderColor: p.border.color,
                            borderStyle: p.border.style,
                          }}
                        />
                      )}

                      {/* Placed Elements Live Preview (Item 21) */}
                      {pageElements.map((el) => {
                        const leftPct = (el.x / p.width) * 100;
                        const topPct = (el.y / p.height) * 100;
                        const widthPct = (el.width / p.width) * 100;
                        const heightPct = (el.height / p.height) * 100;

                        if (el.type === "text" && el.text) {
                          return (
                            <div
                              key={el.id}
                              style={{
                                position: "absolute",
                                left: `${leftPct}%`,
                                top: `${topPct}%`,
                                width: `${widthPct}%`,
                                color: el.color,
                                fontSize: "4px",
                                lineHeight: "1.1",
                                fontWeight: el.bold ? "bold" : "normal",
                                overflow: "hidden",
                                pointerEvents: "none",
                              }}
                              className="truncate"
                            >
                              {el.text}
                            </div>
                          );
                        } else if (el.type === "image") {
                          return (
                            <img
                              key={el.id}
                              src={el.src}
                              alt="thumb img"
                              style={{
                                position: "absolute",
                                left: `${leftPct}%`,
                                top: `${topPct}%`,
                                width: `${widthPct}%`,
                                height: `${heightPct}%`,
                                objectFit: "contain",
                                pointerEvents: "none",
                              }}
                            />
                          );
                        } else if (el.type === "shape") {
                          return (
                            <div
                              key={el.id}
                              style={{
                                position: "absolute",
                                left: `${leftPct}%`,
                                top: `${topPct}%`,
                                width: `${widthPct}%`,
                                height: `${heightPct}%`,
                                borderColor: el.strokeColor,
                                borderWidth: 1,
                                backgroundColor: el.fillColor || "transparent",
                                borderRadius: el.shapeType === "circle" ? "50%" : 0,
                                pointerEvents: "none",
                              }}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Page Navigation footer (Item 30) */}
          <div className="p-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-xs">
            <button
              disabled={currentPageIndex <= 0}
              onClick={() => setCurrentPageIndex((idx) => Math.max(0, idx - 1))}
              className="p-1 rounded text-gray-500 hover:text-gray-900 disabled:opacity-25"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 font-bold text-gray-700">
              <input
                type="number"
                min="1"
                max={pages.length}
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const parsed = parseInt(pageInputVal, 10);
                    if (parsed >= 1 && parsed <= pages.length) {
                      setCurrentPageIndex(parsed - 1);
                    } else {
                      setPageInputVal(String(currentPageIndex + 1));
                    }
                  }
                }}
                className="w-10 text-center py-0.5 bg-white border border-gray-300 rounded text-xs outline-none focus:border-red-500"
                title="Enter page number and press Enter"
              />
              <span className="text-gray-400">/ {pages.length}</span>
            </div>
            <button
              disabled={currentPageIndex >= pages.length - 1}
              onClick={() => setCurrentPageIndex((idx) => Math.min(pages.length - 1, idx + 1))}
              className="p-1 rounded text-gray-500 hover:text-gray-900 disabled:opacity-25"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* MAIN CANVAS EDITING AREA (Items 37, 50) */}
        <main
          ref={canvasContainerRef}
          onClick={handleCanvasMouseDown}
          className="flex-1 bg-gray-200/80 overflow-auto p-12 flex items-center justify-center relative cursor-default"
        >
          {currentPage && (
            <div
              id={`page-canvas-${currentPageIndex}`}
              style={{
                width: currentPage.width * zoom,
                height: currentPage.height * zoom,
                backgroundColor: currentPage.backgroundColor || "#ffffff",
              }}
              onClick={(e) => e.stopPropagation()}
              className="relative shadow-2xl transition-all duration-75 origin-center select-none"
            >
              {/* Base Page rendered thumbnail if PDF opened */}
              {currentPage.thumbnail && (
                <img
                  src={currentPage.thumbnail}
                  alt={`Base Page ${currentPageIndex + 1}`}
                  style={{ transform: `rotate(${currentPage.rotation}deg)` }}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              )}

              {/* Page Border (Item 44) */}
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

              {/* Empty document helpful state watermark (Item 50) */}
              {elements.filter((e) => e.page === currentPageIndex + 1).length === 0 &&
                !currentPage.thumbnail && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 pointer-events-none p-8 text-center">
                    <MousePointer className="w-10 h-10 mb-2 stroke-1 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-400">
                      Clean Blank Canvas
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                      Select <span className="font-bold text-red-500">Add Text</span> or{" "}
                      <span className="font-bold text-amber-600">Insert Image</span> from the toolbar to begin.
                    </p>
                  </div>
                )}

              {/* Marquee Selection Box (Item 19) */}
              {dragState?.type === "marquee" && dragState.marqueeBox && (
                <div
                  style={{
                    position: "absolute",
                    left: dragState.marqueeBox.x * zoom,
                    top: dragState.marqueeBox.y * zoom,
                    width: dragState.marqueeBox.width * zoom,
                    height: dragState.marqueeBox.height * zoom,
                    border: "1px dashed #ef4444",
                    backgroundColor: "rgba(239, 68, 68, 0.08)",
                    pointerEvents: "none",
                    zIndex: 9999,
                  }}
                />
              )}

              {/* Render Elements on this Page */}
              {elements
                .filter((el) => el.page === currentPageIndex + 1)
                .map((el) => {
                  const isSelected = selectedIds.includes(el.id);
                  const isEditing = editingTextId === el.id;

                  return (
                    <div
                      key={el.id}
                      onMouseDown={(e) => handleElementMouseDown(e, el)}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Single click selects, click on already selected text box enters edit mode (Item 3)
                        if (el.type === "text" && isSelected && !isEditing) {
                          setEditingTextId(el.id);
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
                        transform:
                          el.type === "image" && el.rotation
                            ? `rotate(${el.rotation}deg)`
                            : undefined,
                        opacity: el.type === "image" ? el.opacity : 1,
                      }}
                      className={`group select-none ${
                        isEditing
                          ? "cursor-text ring-1 ring-red-400 bg-white/95"
                          : isSelected
                          ? "cursor-move ring-2 ring-red-500 shadow-sm"
                          : "hover:ring-1 hover:ring-red-300"
                      }`}
                    >
                      {/* TEXT ELEMENT (Items 1–10) */}
                      {el.type === "text" && (
                        <div
                          style={{
                            fontSize: `${el.fontSize * zoom}px`,
                            fontFamily: el.fontFamily,
                            fontWeight: el.bold ? "bold" : "normal",
                            fontStyle: el.italic ? "italic" : "normal",
                            textDecoration:
                              `${el.underline ? "underline" : ""} ${el.strike ? "line-through" : ""}`.trim() ||
                              "none",
                            color: el.color,
                            backgroundColor: el.highlight || "transparent",
                            textAlign: el.align,
                            lineHeight: el.lineHeight,
                            letterSpacing: `${el.letterSpacing}px`,
                          }}
                          className="w-full h-full p-1 overflow-hidden break-words whitespace-pre-wrap flex flex-col"
                        >
                          {isEditing ? (
                            <textarea
                              ref={textareaRef}
                              autoFocus
                              value={el.text}
                              placeholder={el.placeholder || "Type text here..."}
                              onChange={(e) => {
                                const val = e.target.value;
                                // Auto adjust text box height unless user explicitly sized it (Item 8)
                                let newH = el.height;
                                if (!el.fixedHeight && textareaRef.current) {
                                  newH = Math.max(36, Math.round(textareaRef.current.scrollHeight / zoom));
                                }
                                updateSelectedElement({ text: val, height: newH });
                              }}
                              onBlur={() => setEditingTextId(null)}
                              style={{
                                fontSize: "inherit",
                                fontFamily: "inherit",
                                fontWeight: "inherit",
                                fontStyle: "inherit",
                                textAlign: "inherit",
                                lineHeight: "inherit",
                                color: "inherit",
                                caretColor: el.color || "#000000",
                              }}
                              className="w-full h-full bg-transparent border-none p-0 outline-none resize-none"
                            />
                          ) : el.text ? (
                            <div>
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
                          ) : (
                            <span className="text-gray-400 italic pointer-events-none">
                              {el.placeholder || "Type text here..."}
                            </span>
                          )}
                        </div>
                      )}

                      {/* IMAGE ELEMENT (Items 11–16) */}
                      {el.type === "image" && (
                        <div className="w-full h-full relative overflow-hidden">
                          <img
                            src={el.src}
                            alt="Placed document visual"
                            style={{
                              objectFit: "fill",
                              clipPath: el.crop
                                ? `inset(${el.crop.y * 100}% ${(1 - el.crop.x - el.crop.width) * 100}% ${(1 - el.crop.y - el.crop.height) * 100}% ${el.crop.x * 100}%)`
                                : undefined,
                            }}
                            className="w-full h-full pointer-events-none"
                          />
                        </div>
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

                      {/* 8 RESIZE HANDLES & ROTATION STALK (Items 9, 11, 14) */}
                      {isSelected && !isEditing && (
                        <>
                          {/* Corner handles */}
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "nw")}
                            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-red-600 rounded-xs cursor-nw-resize shadow-xs"
                          />
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "ne")}
                            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-red-600 rounded-xs cursor-ne-resize shadow-xs"
                          />
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "se")}
                            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-red-600 rounded-xs cursor-se-resize shadow-xs"
                          />
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "sw")}
                            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-red-600 rounded-xs cursor-sw-resize shadow-xs"
                          />

                          {/* Edge handles */}
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "n")}
                            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-red-600 rounded-xs cursor-n-resize shadow-xs"
                          />
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "s")}
                            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-red-600 rounded-xs cursor-s-resize shadow-xs"
                          />
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "w")}
                            className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-red-600 rounded-xs cursor-w-resize shadow-xs"
                          />
                          <div
                            onMouseDown={(e) => handleResizeMouseDown(e, el, "e")}
                            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-red-600 rounded-xs cursor-e-resize shadow-xs"
                          />

                          {/* Rotation stalk for Image elements (Item 14) */}
                          {el.type === "image" && (
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center">
                              <div
                                onMouseDown={(e) => handleRotateMouseDown(e, el as EditorImageElement)}
                                className="w-3.5 h-3.5 bg-white border-2 border-red-600 rounded-full cursor-grab active:cursor-grabbing shadow-sm hover:scale-125 transition-transform"
                                title="Drag to rotate image"
                              />
                              <div className="w-0.5 h-3 bg-red-500" />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </main>

        {/* RIGHT CONTEXTUAL PROPERTIES PANEL (Items 41–45) */}
        {isPropertiesOpen && (
          <aside className="w-72 bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto p-4 z-20 shadow-xs">
            {/* Context Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
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
                  className="p-1 rounded text-gray-400 hover:text-rose-600"
                  title="Delete element (Del)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 1. TEXT PROPERTIES (Items 6–10) */}
            {currentText && (
              <div className="space-y-4 text-xs">
                {/* Font Family */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Font Family</label>
                  <select
                    value={currentText.fontFamily}
                    onChange={(e) => updateSelectedElement({ fontFamily: e.target.value })}
                    className="w-full font-semibold p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500 text-xs"
                  >
                    <option value="Helvetica">Helvetica (Arial)</option>
                    <option value="Times-Roman">Times New Roman</option>
                    <option value="Courier">Courier (Monospace)</option>
                    <option value="Georgia">Georgia</option>
                  </select>
                </div>

                {/* Font Size */}
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
                      className="flex-1 accent-red-600"
                    />
                    <input
                      type="number"
                      value={currentText.fontSize}
                      onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                      className="w-12 text-xs font-bold p-1 bg-gray-50 border border-gray-200 rounded text-center"
                    />
                  </div>
                </div>

                {/* Styles: Bold, Italic, Underline, Strike */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Style</label>
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => updateSelectedElement({ bold: !currentText.bold })}
                      className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                        currentText.bold ? "bg-white text-gray-900 shadow-xs font-bold" : "text-gray-500"
                      }`}
                      title="Bold (Ctrl+B)"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateSelectedElement({ italic: !currentText.italic })}
                      className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                        currentText.italic ? "bg-white text-gray-900 shadow-xs italic" : "text-gray-500"
                      }`}
                      title="Italic (Ctrl+I)"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateSelectedElement({ underline: !currentText.underline })}
                      className={`flex-1 p-1.5 rounded flex items-center justify-center transition-all ${
                        currentText.underline ? "bg-white text-gray-900 shadow-xs underline" : "text-gray-500"
                      }`}
                      title="Underline (Ctrl+U)"
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

                {/* Text Color & Highlight */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">Color</label>
                    <div className="flex items-center gap-1.5 p-1 bg-gray-50 border border-gray-200 rounded-lg">
                      <input
                        type="color"
                        value={currentText.color}
                        onChange={(e) => updateSelectedElement({ color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                      />
                      <span className="text-[11px] font-mono text-gray-600 truncate">
                        {currentText.color}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">Highlight</label>
                    <div className="flex items-center gap-1.5 p-1 bg-gray-50 border border-gray-200 rounded-lg">
                      <input
                        type="color"
                        value={currentText.highlight || "#ffffff"}
                        onChange={(e) => updateSelectedElement({ highlight: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                      />
                      <button
                        onClick={() => updateSelectedElement({ highlight: undefined })}
                        className="text-[10px] text-gray-400 hover:text-gray-700"
                        title="Clear highlight"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>

                {/* Alignment */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Alignment</label>
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                    {(["left", "center", "right", "justify"] as const).map((al) => (
                      <button
                        key={al}
                        onClick={() => updateSelectedElement({ align: al })}
                        className={`flex-1 p-1.5 rounded flex items-center justify-center capitalize transition-all ${
                          currentText.align === al ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                        }`}
                        title={`Align ${al}`}
                      >
                        {al === "left" && <AlignLeft className="w-3.5 h-3.5" />}
                        {al === "center" && <AlignCenter className="w-3.5 h-3.5" />}
                        {al === "right" && <AlignRight className="w-3.5 h-3.5" />}
                        {al === "justify" && <AlignJustify className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lists & Spacing */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Lists</label>
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => updateSelectedElement({ listType: "none" })}
                      className={`flex-1 p-1 text-[11px] font-semibold rounded ${
                        !currentText.listType || currentText.listType === "none"
                          ? "bg-white text-gray-900 shadow-xs"
                          : "text-gray-500"
                      }`}
                    >
                      None
                    </button>
                    <button
                      onClick={() => updateSelectedElement({ listType: "bullet" })}
                      className={`flex-1 p-1 flex items-center justify-center rounded ${
                        currentText.listType === "bullet" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                      }`}
                      title="Bulleted list"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateSelectedElement({ listType: "numbered" })}
                      className={`flex-1 p-1 flex items-center justify-center rounded ${
                        currentText.listType === "numbered" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500"
                      }`}
                      title="Numbered list"
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Move to Page (Item 20) */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Move to Page</label>
                  <select
                    value={currentText.page}
                    onChange={(e) => moveElementToPage(Number(e.target.value))}
                    className="w-full font-semibold p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none text-xs"
                  >
                    {pages.map((_, pIdx) => (
                      <option key={pIdx} value={pIdx + 1}>
                        Page {pIdx + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* 2. IMAGE PROPERTIES (Items 11–20) */}
            {currentImage && (
              <div className="space-y-4 text-xs">
                {/* Dimensions & Aspect Ratio Lock (Item 13) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-gray-500">Dimensions (px)</label>
                    <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentImage.lockAspectRatio}
                        onChange={(e) => updateSelectedElement({ lockAspectRatio: e.target.checked })}
                        className="rounded text-red-600"
                      />
                      Lock Aspect Ratio
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-gray-400">Width</span>
                      <input
                        type="number"
                        value={currentImage.width}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          const h = currentImage.lockAspectRatio
                            ? Math.round(w / (currentImage.originalRatio || 1))
                            : currentImage.height;
                          updateSelectedElement({ width: w, height: h });
                        }}
                        className="w-full p-1.5 font-bold bg-gray-50 border border-gray-200 rounded text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400">Height</span>
                      <input
                        type="number"
                        value={currentImage.height}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          const w = currentImage.lockAspectRatio
                            ? Math.round(h * (currentImage.originalRatio || 1))
                            : currentImage.width;
                          updateSelectedElement({ width: w, height: h });
                        }}
                        className="w-full p-1.5 font-bold bg-gray-50 border border-gray-200 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Rotation Numerical Control (Item 14) */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Rotation ({currentImage.rotation || 0}°)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={currentImage.rotation || 0}
                      onChange={(e) => updateSelectedElement({ rotation: Number(e.target.value) })}
                      className="flex-1 accent-red-600"
                    />
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={currentImage.rotation || 0}
                      onChange={(e) => updateSelectedElement({ rotation: Number(e.target.value) })}
                      className="w-12 text-xs font-bold p-1 bg-gray-50 border border-gray-200 rounded text-center"
                    />
                  </div>
                </div>

                {/* Opacity */}
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
                    className="w-full accent-red-600"
                  />
                </div>

                {/* Replace & Crop Actions (Items 15 & 16) */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => replaceImageRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 text-xs transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Replace</span>
                  </button>
                  <button
                    onClick={() => setIsCropMode(!isCropMode)}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-lg font-bold text-xs transition-colors ${
                      isCropMode ? "bg-red-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>{isCropMode ? "Done Crop" : "Crop"}</span>
                  </button>
                </div>

                {/* Move to Page (Item 20) */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Move to Page</label>
                  <select
                    value={currentImage.page}
                    onChange={(e) => moveElementToPage(Number(e.target.value))}
                    className="w-full font-semibold p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none text-xs"
                  >
                    {pages.map((_, pIdx) => (
                      <option key={pIdx} value={pIdx + 1}>
                        Page {pIdx + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* 3. SHAPE PROPERTIES */}
            {currentShape && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Stroke Color</label>
                  <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                    <input
                      type="color"
                      value={currentShape.strokeColor}
                      onChange={(e) => updateSelectedElement({ strokeColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                    <span className="font-mono text-gray-700">{currentShape.strokeColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Fill Color</label>
                  <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                    <input
                      type="color"
                      value={currentShape.fillColor || "#ffffff"}
                      onChange={(e) => updateSelectedElement({ fillColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                    <button
                      onClick={() => updateSelectedElement({ fillColor: undefined })}
                      className="text-[10px] text-gray-400 hover:text-gray-700"
                    >
                      Transparent
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Stroke Width ({currentShape.strokeWidth}px)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    value={currentShape.strokeWidth}
                    onChange={(e) => updateSelectedElement({ strokeWidth: Number(e.target.value) })}
                    className="w-full accent-red-600"
                  />
                </div>
              </div>
            )}

            {/* 4. PAGE PROPERTIES (Items 43 & 44) */}
            {!selectedElement && currentPage && (
              <div className="space-y-5 text-xs">
                {/* Page Size & Orientation (Items 28 & 29) */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Page Dimensions</label>
                  <select
                    value={currentPage.sizeName || "A4"}
                    onChange={(e) => changePageSize(e.target.value)}
                    className="w-full font-semibold p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none text-xs"
                  >
                    <option value="A4">A4 (595 × 842 pt)</option>
                    <option value="A3">A3 (842 × 1191 pt)</option>
                    <option value="A5">A5 (420 × 595 pt)</option>
                    <option value="Letter">Letter (612 × 792 pt)</option>
                    <option value="Legal">Legal (612 × 1008 pt)</option>
                  </select>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={togglePageOrientation}
                      className="flex-1 py-1.5 px-2 bg-gray-100 hover:bg-gray-200 font-bold text-gray-700 rounded-lg text-center"
                    >
                      {currentPage.width > currentPage.height ? "Landscape ↔" : "Portrait ↕"}
                    </button>
                  </div>
                </div>

                {/* Page Background Swatches & Picker (Item 43) */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1.5">
                    Background Color
                  </label>
                  <div className="flex items-center gap-1.5 mb-2">
                    {[
                      { name: "White", color: "#ffffff" },
                      { name: "Off-White", color: "#fafaf9" },
                      { name: "Warm", color: "#fef3c7" },
                      { name: "Soft Blue", color: "#eff6ff" },
                      { name: "Light Gray", color: "#f3f4f6" },
                    ].map((sw) => (
                      <button
                        key={sw.color}
                        onClick={() => {
                          const next = pages.map((p, idx) =>
                            idx === currentPageIndex ? { ...p, backgroundColor: sw.color } : p
                          );
                          setPages(next);
                          pushHistory(next, elements);
                        }}
                        style={{ backgroundColor: sw.color }}
                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                          currentPage.backgroundColor === sw.color ? "border-red-600 scale-105" : "border-gray-200"
                        }`}
                        title={sw.name}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 p-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                    <input
                      type="color"
                      value={currentPage.backgroundColor || "#ffffff"}
                      onChange={(e) => {
                        const val = e.target.value;
                        const next = pages.map((p, idx) =>
                          idx === currentPageIndex ? { ...p, backgroundColor: val } : p
                        );
                        setPages(next);
                        pushHistory(next, elements);
                      }}
                      className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                    />
                    <span className="font-mono text-gray-700">
                      {currentPage.backgroundColor || "#ffffff"}
                    </span>
                  </div>
                </div>

                {/* Page Borders: thickness, color, style, margin (Item 44) */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-gray-700">Page Borders</label>
                    <input
                      type="checkbox"
                      checked={currentPage.border?.enabled || false}
                      onChange={(e) => {
                        const en = e.target.checked;
                        const cur = currentPage.border || {
                          thickness: 2,
                          color: "#000000",
                          style: "solid",
                          margin: 20,
                        };
                        const next = pages.map((p, idx) =>
                          idx === currentPageIndex ? { ...p, border: { ...cur, enabled: en } } : p
                        );
                        setPages(next);
                        pushHistory(next, elements);
                      }}
                      className="rounded text-red-600 cursor-pointer"
                    />
                  </div>

                  {currentPage.border?.enabled && (
                    <div className="space-y-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">
                          Thickness ({currentPage.border.thickness}pt)
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="12"
                          value={currentPage.border.thickness}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const next = pages.map((p, idx) =>
                              idx === currentPageIndex
                                ? { ...p, border: { ...(p.border as PageBorderConfig), thickness: val } }
                                : p
                            );
                            setPages(next);
                            pushHistory(next, elements);
                          }}
                          className="w-full accent-red-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Style</label>
                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-gray-200">
                          {(["solid", "dashed", "dotted"] as const).map((st) => (
                            <button
                              key={st}
                              onClick={() => {
                                const next = pages.map((p, idx) =>
                                  idx === currentPageIndex
                                    ? { ...p, border: { ...(p.border as PageBorderConfig), style: st } }
                                    : p
                                );
                                setPages(next);
                                pushHistory(next, elements);
                              }}
                              className={`flex-1 py-1 text-[10px] font-bold rounded capitalize ${
                                currentPage.border?.style === st ? "bg-red-500 text-white" : "text-gray-500"
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Color</label>
                          <input
                            type="color"
                            value={currentPage.border.color}
                            onChange={(e) => {
                              const val = e.target.value;
                              const next = pages.map((p, idx) =>
                                idx === currentPageIndex
                                  ? { ...p, border: { ...(p.border as PageBorderConfig), color: val } }
                                  : p
                              );
                              setPages(next);
                              pushHistory(next, elements);
                            }}
                            className="w-full h-7 rounded border border-gray-200 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">
                            Margin ({currentPage.border.margin}pt)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="80"
                            value={currentPage.border.margin}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const next = pages.map((p, idx) =>
                                idx === currentPageIndex
                                  ? { ...p, border: { ...(p.border as PageBorderConfig), margin: val } }
                                  : p
                              );
                              setPages(next);
                              pushHistory(next, elements);
                            }}
                            className="w-full h-7 p-1 text-center font-bold bg-white border border-gray-200 rounded text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Insert Page Modal (Item 27 & 28) */}
      {showAddPageModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-sm w-full border border-gray-200 space-y-4">
            <h4 className="text-sm font-bold text-gray-900">Insert Blank Page</h4>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Insert Position</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setInsertPagePos("before")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border ${
                    insertPagePos === "before" ? "border-red-500 bg-red-50 text-red-600" : "border-gray-200"
                  }`}
                >
                  Before Page {currentPageIndex + 1}
                </button>
                <button
                  onClick={() => setInsertPagePos("after")}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border ${
                    insertPagePos === "after" ? "border-red-500 bg-red-50 text-red-600" : "border-gray-200"
                  }`}
                >
                  After Page {currentPageIndex + 1}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Page Standard Size</label>
              <select
                value={newPageSize}
                onChange={(e) => setNewPageSize(e.target.value)}
                className="w-full text-xs font-bold p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              >
                <option value="A4">A4 (Standard Document)</option>
                <option value="Letter">Letter (US Standard)</option>
                <option value="Legal">Legal</option>
                <option value="A3">A3 (Poster / Ledger)</option>
                <option value="A5">A5 (Booklet)</option>
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddPageModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => insertPageAtPosition(insertPagePos, newPageSize)}
                className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs"
              >
                Insert Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
