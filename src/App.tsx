import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Trash2, RotateCw, RotateCcw, Save, ZoomIn, 
  ZoomOut, Type, Square, Circle as CircleIcon, ArrowUpRight, 
  Palette, Layers, Lock, Unlock, PenTool, Eye, Sidebar, Settings,
  AlignLeft, Search, Shield, History, Info, MessageSquare, Download,
  Loader2, Clipboard, RefreshCw, Sparkles, FileText, Bookmark, Paperclip
} from 'lucide-react';
import { translations } from './utils/localization';
import type { Locale } from './utils/localization';
import { getPdfInfo, applyEditsToPdf, encryptPdf, extractPdfText } from './utils/pdfEngine';
import type { AnnotationItem } from './utils/pdfEngine';
import { ToolkitTab } from './components/ToolkitTab';
import { PdfPageRenderer } from './components/PdfPageRenderer';
import { LoadingScreen } from './components/LoadingScreen';

interface HistoryItem {
  id: string;
  action: string;
  time: string;
}

export default function App() {
  // Localization & Theme Settings
  const [locale, setLocale] = useState<Locale>('th');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const t = translations[locale];

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'general' | 'appearance' | 'advanced'>('general');
  const [settingsDpi, setSettingsDpi] = useState<number>(150);
  const [settingsDefaultPageSize, setSettingsDefaultPageSize] = useState<string>('a4');
  const [settingsLatinSpacing, setSettingsLatinSpacing] = useState<boolean>(false);

  // 10 Mode Tabs
  const [activeTab, setActiveTab] = useState<'home' | 'edit' | 'comment' | 'view' | 'forms' | 'security' | 'review' | 'ocr' | 'share' | 'toolkit'>('home');
  const [activeTool, setActiveTool] = useState<'select' | 'hand' | 'text' | 'rect' | 'circle' | 'arrow' | 'freehand' | 'signature' | 'redact'>('select');

  // File State
  const [currentFile, setCurrentFile] = useState<ArrayBuffer | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [pdfInfo, setPdfInfo] = useState<{ pageCount: number; title: string; author?: string; creator?: string } | null>(null);
  const [activePagePos, setActivePagePos] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(100);

  // Annotations, Reordering, and Blank Pages States
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [blankPagesMap, setBlankPagesMap] = useState<Record<number, { width: number; height: number }>>({});

  // History State for Undo/Redo
  interface HistoryState {
    pageOrder: number[];
    annotations: AnnotationItem[];
    pageRotations: Record<number, number>;
    blankPagesMap: Record<number, { width: number; height: number }>;
  }
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  const saveHistory = (
    customPageOrder?: number[],
    customAnnotations?: AnnotationItem[],
    customPageRotations?: Record<number, number>,
    customBlankPagesMap?: Record<number, { width: number; height: number }>
  ) => {
    const stateToSave: HistoryState = {
      pageOrder: [...(customPageOrder || pageOrder)],
      annotations: JSON.parse(JSON.stringify(customAnnotations || annotations)),
      pageRotations: { ...(customPageRotations || pageRotations) },
      blankPagesMap: { ...(customBlankPagesMap || blankPagesMap) }
    };
    setUndoStack(prev => [...prev, stateToSave]);
    setRedoStack([]); // Clear redo stack on new action
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevState = undoStack[undoStack.length - 1];
    
    const currentState: HistoryState = {
      pageOrder: [...pageOrder],
      annotations: JSON.parse(JSON.stringify(annotations)),
      pageRotations: { ...pageRotations },
      blankPagesMap: { ...blankPagesMap }
    };
    setRedoStack(prev => [...prev, currentState]);
    
    setPageOrder(prevState.pageOrder);
    setAnnotations(prevState.annotations);
    setPageRotations(prevState.pageRotations);
    setBlankPagesMap(prevState.blankPagesMap);
    setUndoStack(prev => prev.slice(0, -1));
    
    addLog(locale === 'th' ? 'ย้อนกลับการกระทำ' : 'Undid last action');
    setStatusLog(locale === 'th' ? 'ย้อนกลับสำเร็จ' : 'Undid last action');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    
    const currentState: HistoryState = {
      pageOrder: [...pageOrder],
      annotations: JSON.parse(JSON.stringify(annotations)),
      pageRotations: { ...pageRotations },
      blankPagesMap: { ...blankPagesMap }
    };
    setUndoStack(prev => [...prev, currentState]);
    
    setPageOrder(nextState.pageOrder);
    setAnnotations(nextState.annotations);
    setPageRotations(nextState.pageRotations);
    setBlankPagesMap(nextState.blankPagesMap);
    setRedoStack(prev => prev.slice(0, -1));
    
    addLog(locale === 'th' ? 'ทำซ้ำการกระทำ' : 'Redid last action');
    setStatusLog(locale === 'th' ? 'ทำซ้ำสำเร็จ' : 'Redid last action');
  };

  // Interactive drawing states
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragAnn, setCurrentDragAnn] = useState<Partial<AnnotationItem> | null>(null);
  const [resizingState, setResizingState] = useState<{
    annId: string;
    handle: string;
    startX: number;
    startY: number;
    startAnnX: number;
    startAnnY: number;
    startAnnW: number;
    startAnnH: number;
  } | null>(null);
  const [movingState, setMovingState] = useState<{
    annId: string;
    startX: number;
    startY: number;
    startAnnX: number;
    startAnnY: number;
  } | null>(null);

  // Default drawing properties
  const [inspectorColor, setInspectorColor] = useState('#ff0055');
  const [inspectorFill, setInspectorFill] = useState('');
  const [inspectorFontSize, setInspectorFontSize] = useState(14);
  const [inspectorStrokeWidth, setInspectorStrokeWidth] = useState(2);
  const [inspectorOpacity, setInspectorOpacity] = useState(1);

  // Expandable Sidebars State
  const [sidebarTabLeft, setSidebarTabLeft] = useState<'pages' | 'bookmarks' | 'layers' | 'attachments' | 'toolkit'>('pages');
  const [sidebarTabRight, setSidebarTabRight] = useState<'inspector' | 'comments' | 'search' | 'security' | 'history'>('inspector');
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(true);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  const handleLeftTabClick = (tab: 'pages' | 'bookmarks' | 'layers' | 'attachments' | 'toolkit') => {
    if (sidebarTabLeft === tab) {
      setIsLeftCollapsed(prev => !prev);
    } else {
      setSidebarTabLeft(tab);
      setIsLeftCollapsed(false);
    }
  };

  // Modals & Protection States
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');

  // PDF Text Extraction & Search states
  const [pageTextMap, setPageTextMap] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);

  // OCR Browser Engine states
  const [ocrReady, setOcrReady] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrLang, setOcrLang] = useState('eng+tha');
  const [ocrExtractedText, setOcrExtractedText] = useState('');

  // History Log state
  const [historyLog, setHistoryLog] = useState<HistoryItem[]>([]);

  // Status message log
  const [statusLog, setStatusLog] = useState('Idle');
  const [isDragActive, setIsDragActive] = useState(false);

  // Global Loading Screen state
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // File metadata input values in inspector
  const [metaTitle, setMetaTitle] = useState('');
  const [metaAuthor, setMetaAuthor] = useState('');

  // Refs
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Log action helper
  const addLog = (action: string) => {
    const time = new Date().toLocaleTimeString();
    setHistoryLog(prev => [{ id: Math.random().toString(), action, time }, ...prev]);
  };

  // Load PDF file
  const handleFileLoad = async (file: File) => {
    setLoadingVisible(true);
    setLoadingStatus(locale === 'th' ? `กำลังโหลดไฟล์ ${file.name}...` : `Loading ${file.name}...`);
    setStatusLog(locale === 'th' ? `กำลังโหลดไฟล์ ${file.name}...` : `Loading file ${file.name}...`);
    setCurrentFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = async () => {
      if (reader.result instanceof ArrayBuffer) {
        try {
          setLoadingStatus(locale === 'th' ? 'กำลังวิเคราะห์โครงสร้างเอกสาร...' : 'Analysing document structure...');
          // Fetch document properties
          const info = await getPdfInfo(reader.result);
          setPdfInfo({ 
            pageCount: info.pageCount, 
            title: info.title || file.name,
            author: info.author,
            creator: info.creator
          });
          setMetaTitle(info.title || file.name);
          setMetaAuthor(info.author || '');
          setCurrentFile(reader.result);

          // Initialize page order array
          setPageOrder(Array.from({ length: info.pageCount }, (_, i) => i));
          setBlankPagesMap({});
          
          setActivePagePos(0);
          setAnnotations([]);
          setPageRotations(info.initialRotations || {});
          setHistoryLog([]);
          
          addLog(locale === 'th' ? `เปิดเอกสาร ${file.name}` : `Opened document ${file.name}`);
          setStatusLog(locale === 'th' ? 'โหลดเอกสารสำเร็จ' : 'Document loaded successfully');

          // Extract text in the background for searching
          try {
            setLoadingStatus(locale === 'th' ? 'กำลังดึงข้อความสำหรับการค้นหา...' : 'Indexing document text...');
            const extractedTextMap = await extractPdfText(reader.result);
            setPageTextMap(extractedTextMap);
          } catch (textErr) {
            console.error("Text extraction failed", textErr);
          }
        } catch (e) {
          console.error(e);
          alert(locale === 'th' ? 'เกิดข้อผิดพลาดในการโหลดไฟล์ PDF' : 'Error loading PDF file. It might be password protected.');
          setStatusLog('Error loading PDF');
        } finally {
          setLoadingVisible(false);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        handleFileLoad(file);
      } else {
        alert(locale === 'th' ? 'กรุณาอัปโหลดไฟล์ PDF เท่านั้น' : 'Please upload a PDF file.');
      }
    }
  };

  // Home Page modifications
  const handleRotatePage = (direction: 'left' | 'right') => {
    if (pdfInfo === null || pageOrder.length === 0) return;
    const targetOrigIdx = pageOrder[activePagePos];
    if (targetOrigIdx < 0) return; // Cannot rotate blank pages visually

    saveHistory();
    setPageRotations(prev => {
      const current = prev[targetOrigIdx] || 0;
      const change = direction === 'right' ? 90 : -90;
      return { ...prev, [targetOrigIdx]: (current + change + 360) % 360 };
    });
    addLog(locale === 'th' ? `หมุนหน้า ${activePagePos + 1} ไปทาง${direction === 'right' ? 'ขวา' : 'ซ้าย'}` : `Rotated page ${activePagePos + 1} ${direction}`);
    setStatusLog(locale === 'th' ? `หมุนหน้า ${activePagePos + 1}` : `Rotated page ${activePagePos + 1}`);
  };

  const handleDeletePage = () => {
    if (pdfInfo === null || pageOrder.length === 0) return;
    if (window.confirm(locale === 'th' ? `คุณแน่ใจหรือไม่ว่าต้องการลบหน้า ${activePagePos + 1}?` : `Are you sure you want to delete page ${activePagePos + 1}?`)) {
      saveHistory();
      setPageOrder(prev => prev.filter((_, idx) => idx !== activePagePos));
      addLog(locale === 'th' ? `ลบหน้า ${activePagePos + 1}` : `Deleted page ${activePagePos + 1}`);
      
      if (activePagePos > 0) {
        setActivePagePos(prev => prev - 1);
      } else {
        setActivePagePos(0);
      }
      setStatusLog(locale === 'th' ? `ลบหน้าสำเร็จ` : `Page deleted`);
    }
  };

  const handleAddBlankPage = () => {
    if (pdfInfo === null) return;
    saveHistory();
    // Generate a unique negative ID for this blank page to distinguish it
    const newBlankId = -1 * (Object.keys(blankPagesMap).length + 1);
    setBlankPagesMap(prev => ({
      ...prev,
      [newBlankId]: { width: 595, height: 842 } // Standard A4 points
    }));
    
    setPageOrder(prev => {
      const list = [...prev];
      list.splice(activePagePos + 1, 0, newBlankId);
      return list;
    });

    addLog(locale === 'th' ? `เพิ่มหน้าเปล่าใหม่หลังหน้า ${activePagePos + 1}` : `Added blank page after page ${activePagePos + 1}`);
    setStatusLog(locale === 'th' ? `แทรกหน้าว่างหลังหน้า ${activePagePos + 1}` : `Blank page inserted`);
    setActivePagePos(prev => prev + 1);
  };

  const handleReversePages = () => {
    if (pageOrder.length < 2) return;
    saveHistory();
    setPageOrder(prev => [...prev].reverse());
    addLog(locale === 'th' ? 'กลับลำดับหน้ากระดาษทั้งหมด' : 'Reversed page order');
    setStatusLog(locale === 'th' ? 'กลับลำดับหน้าสำเร็จ' : 'Page order reversed');
  };

  // Compile and Save/Download PDF
  const handleSaveAndDownload = async () => {
    if (!currentFile || pageOrder.length === 0) return;
    setLoadingVisible(true);
    setLoadingStatus(locale === 'th' ? 'กำลังประมวลผลและรวบรวมเอกสาร...' : 'Compiling document...');
    setStatusLog(locale === 'th' ? 'กำลังประมวลผลและสร้างไฟล์ PDF...' : 'Processing and compiling PDF...');
    try {
      setLoadingStatus(locale === 'th' ? 'กำลังนำการเปลี่ยนแปลงไปใช้...' : 'Applying edits to PDF...');
      let finalBuffer = await applyEditsToPdf(
        currentFile,
        annotations,
        pageRotations,
        pageOrder,
        blankPagesMap,
        { title: metaTitle, author: metaAuthor }
      );

      // Apply password protection if defined
      if (pdfPassword) {
        setLoadingStatus(locale === 'th' ? 'กำลังเข้ารหัสเอกสาร...' : 'Encrypting document...');
        finalBuffer = await encryptPdf(finalBuffer.buffer as ArrayBuffer, pdfPassword);
      }

      setLoadingStatus(locale === 'th' ? 'กำลังสร้างไฟล์สำหรับดาวน์โหลด...' : 'Preparing download...');
      // Download file in browser
      const blob = new Blob([finalBuffer.buffer as ArrayBuffer], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = currentFileName.replace('.pdf', '_edited.pdf') || 'edited_document.pdf';
      link.click();
      addLog(locale === 'th' ? 'ส่งออกไฟล์ PDF ที่แก้ไข' : 'Exported edited PDF');
      setStatusLog(locale === 'th' ? 'บันทึกไฟล์เรียบร้อย!' : 'Saved successfully!');
    } catch (e) {
      console.error(e);
      alert('Save failed: ' + String(e));
      setStatusLog('Save failed');
    } finally {
      setLoadingVisible(false);
    }
  };

  // Merge/Split output save handler
  const handleSaveToolOutput = (buffer: Uint8Array, fileName: string) => {
    setLoadingVisible(true);
    setLoadingStatus(locale === 'th' ? `กำลังสร้างไฟล์ ${fileName}...` : `Creating ${fileName}...`);
    setTimeout(() => {
      try {
        const blob = new Blob([buffer.buffer as ArrayBuffer], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        addLog(locale === 'th' ? `บันทึกไฟล์เครื่องมือ ${fileName}` : `Saved tool output ${fileName}`);
      } finally {
        setLoadingVisible(false);
      }
    }, 400);
  };

  // Annotation interaction triggers
  const handleWorkspacePointerDown = (e: React.MouseEvent<HTMLDivElement>, origPageIdx: number) => {
    if (activeTool === 'select' || activeTool === 'hand') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (activeTool === 'text') {
      const textVal = prompt(locale === 'th' ? 'ป้อนข้อความ:' : 'Enter text:');
      if (textVal) {
        saveHistory();
        const newAnn: AnnotationItem = {
          id: Math.random().toString(),
          type: 'text',
          pageIndex: origPageIdx,
          x,
          y,
          text: textVal,
          color: inspectorColor,
          fontSize: inspectorFontSize,
          opacity: inspectorOpacity
        };
        setAnnotations(prev => [...prev, newAnn]);
        addLog(locale === 'th' ? `เพิ่มกล่องข้อความ "${textVal}"` : `Added text box "${textVal}"`);
      }
      setActiveTool('select');
      return;
    }

    if (activeTool === 'signature') {
      if (!savedSignature) {
        setShowSignatureModal(true);
        return;
      }
      saveHistory();
      const newAnn: AnnotationItem = {
        id: Math.random().toString(),
        type: 'signature',
        pageIndex: origPageIdx,
        x: x - 10,
        y: y - 5,
        width: 20,
        height: 10,
        imageUri: savedSignature,
        opacity: inspectorOpacity
      };
      setAnnotations(prev => [...prev, newAnn]);
      addLog(locale === 'th' ? 'วางลายมือชื่อลงบนเอกสาร' : 'Placed digital signature');
      setActiveTool('select');
      return;
    }

    // Shapes drag draw initialization
    setIsDrawing(true);
    setDragStart({ x, y });
    setDrawPoints([{ x, y }]);
    
    const tempAnn: Partial<AnnotationItem> = {
      id: 'temp-draw',
      type: activeTool as any,
      pageIndex: origPageIdx,
      x,
      y,
      width: 0,
      height: 0,
      color: inspectorColor,
      fillColor: inspectorFill || undefined,
      strokeWidth: inspectorStrokeWidth,
      opacity: inspectorOpacity,
      points: [{ x, y }]
    };
    setCurrentDragAnn(tempAnn);
  };

  const handleAnnMoveStart = (e: React.MouseEvent, ann: AnnotationItem) => {
    e.stopPropagation();
    setSelectedAnnId(ann.id);
    if (activeTool !== 'select') return;

    setMovingState({
      annId: ann.id,
      startX: e.clientX,
      startY: e.clientY,
      startAnnX: ann.x,
      startAnnY: ann.y
    });
  };

  const handleResizeStart = (e: React.MouseEvent, ann: AnnotationItem, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedAnnId(ann.id);
    setResizingState({
      annId: ann.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startAnnX: ann.x,
      startAnnY: ann.y,
      startAnnW: ann.width || 10,
      startAnnH: ann.height || 10
    });
  };

  const handleWorkspacePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (movingState) {
      const rect = e.currentTarget.getBoundingClientRect();
      const deltaX = ((e.clientX - movingState.startX) / rect.width) * 100;
      const deltaY = ((e.clientY - movingState.startY) / rect.height) * 100;

      const newX = Math.max(0, Math.min(98, movingState.startAnnX + deltaX));
      const newY = Math.max(0, Math.min(98, movingState.startAnnY + deltaY));

      setAnnotations(prev => prev.map(ann => ann.id === movingState.annId ? {
        ...ann,
        x: newX,
        y: newY
      } : ann));
      return;
    }

    if (resizingState) {
      const rect = e.currentTarget.getBoundingClientRect();
      const deltaX = ((e.clientX - resizingState.startX) / rect.width) * 100;
      const deltaY = ((e.clientY - resizingState.startY) / rect.height) * 100;

      let newX = resizingState.startAnnX;
      let newY = resizingState.startAnnY;
      let newW = resizingState.startAnnW;
      let newH = resizingState.startAnnH;

      const h = resizingState.handle;
      if (h.includes('e')) newW = Math.max(0.5, resizingState.startAnnW + deltaX);
      if (h.includes('s')) newH = Math.max(0.5, resizingState.startAnnH + deltaY);
      if (h.includes('w')) {
        const potentialW = resizingState.startAnnW - deltaX;
        if (potentialW >= 0.5) {
          newW = potentialW;
          newX = resizingState.startAnnX + deltaX;
        }
      }
      if (h.includes('n')) {
        const potentialH = resizingState.startAnnH - deltaY;
        if (potentialH >= 0.5) {
          newH = potentialH;
          newY = resizingState.startAnnY + deltaY;
        }
      }

      setAnnotations(prev => prev.map(ann => ann.id === resizingState.annId ? {
        ...ann,
        x: newX,
        y: newY,
        width: newW,
        height: newH
      } : ann));
      return;
    }

    if (!isDrawing || !dragStart || !currentDragAnn) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = ((e.clientX - rect.left) / rect.width) * 100;
    const currentY = ((e.clientY - rect.top) / rect.height) * 100;

    if (activeTool === 'freehand') {
      const nextPoints = [...drawPoints, { x: currentX, y: currentY }];
      setDrawPoints(nextPoints);
      setCurrentDragAnn(prev => ({
        ...prev,
        points: nextPoints
      }));
    } else {
      const x = Math.min(dragStart.x, currentX);
      const y = Math.min(dragStart.y, currentY);
      const width = Math.abs(dragStart.x - currentX);
      const height = Math.abs(dragStart.y - currentY);
      
      setCurrentDragAnn(prev => ({
        ...prev,
        x,
        y,
        width,
        height
      }));
    }
  };

  const handleWorkspacePointerUp = () => {
    if (movingState) {
      saveHistory();
      setMovingState(null);
      return;
    }

    if (resizingState) {
      saveHistory();
      setResizingState(null);
      return;
    }

    if (!isDrawing || !currentDragAnn) return;
    setIsDrawing(false);
    setDragStart(null);

    const finalized: AnnotationItem = {
      id: Math.random().toString(),
      type: currentDragAnn.type!,
      pageIndex: currentDragAnn.pageIndex!,
      x: currentDragAnn.x!,
      y: currentDragAnn.y!,
      width: currentDragAnn.width,
      height: currentDragAnn.height,
      color: currentDragAnn.color,
      fillColor: currentDragAnn.fillColor,
      strokeWidth: currentDragAnn.strokeWidth,
      opacity: currentDragAnn.opacity,
      points: currentDragAnn.points
    };

    saveHistory();
    setAnnotations(prev => [...prev, finalized]);
    addLog(locale === 'th' ? `วาดรูปทรง ${finalized.type.toUpperCase()}` : `Drew shape annotation: ${finalized.type}`);
    setCurrentDragAnn(null);
    setActiveTool('select');
  };

  // Signature Pad Handlers
  const handleStartSignature = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    (canvas as any).isDrawing = true;
  };

  const handleDrawSignature = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !(canvas as any).isDrawing) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleEndSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (canvas) (canvas as any).isDrawing = false;
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
  };

  const saveSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const uri = canvas.toDataURL('image/png');
    setSavedSignature(uri);
    setShowSignatureModal(false);
    setActiveTool('signature');
  };

  useEffect(() => {
    if (showSignatureModal && signatureCanvasRef.current) {
      clearSignature();
    }
  }, [showSignatureModal]);

  // Selected annotation settings update
  const updateSelectedAnnotation = (updates: Partial<AnnotationItem>) => {
    if (!selectedAnnId) return;
    setAnnotations(prev => prev.map(ann => ann.id === selectedAnnId ? { ...ann, ...updates } : ann));
  };

  const selectedAnn = annotations.find(a => a.id === selectedAnnId);

  // Search Logic (Searches both page text map and annotations)
  const executeSearch = () => {
    if (!searchQuery) return;
    const results: { page: number; text: string }[] = [];
    
    // 1. Search page text map
    Object.keys(pageTextMap).forEach((key) => {
      const pageIdx = Number(key);
      const text = pageTextMap[pageIdx] || '';
      const match = matchCase
        ? text.includes(searchQuery)
        : text.toLowerCase().includes(searchQuery.toLowerCase());
      if (match) {
        const idx = matchCase 
          ? text.indexOf(searchQuery)
          : text.toLowerCase().indexOf(searchQuery.toLowerCase());
        const snippet = '...' + text.substring(Math.max(0, idx - 15), Math.min(text.length, idx + searchQuery.length + 15)) + '...';
        results.push({ page: pageIdx, text: snippet });
      }
    });

    // 2. Search annotations
    annotations.forEach(ann => {
      if (ann.type === 'text' && ann.text) {
        const match = matchCase
          ? ann.text.includes(searchQuery)
          : ann.text.toLowerCase().includes(searchQuery.toLowerCase());
        if (match) {
          results.push({ page: ann.pageIndex, text: `[Annotation]: "${ann.text}"` });
        }
      }
    });

    setSearchResults(results);
    addLog(locale === 'th' ? `ค้นหาคำว่า "${searchQuery}"` : `Searched for "${searchQuery}"`);
  };

  // OCR Dynamic Script Injection & Runner
  useEffect(() => {
    if (activeTab === 'ocr') {
      if (!(window as any).Tesseract) {
        setStatusLog(locale === 'th' ? 'กำลังเปิดใช้งานระบบรู้จำอักษร (OCR)...' : 'Initializing OCR Engine...');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = () => {
          setStatusLog(locale === 'th' ? 'ระบบรู้จำอักษร (OCR) พร้อมใช้งาน' : 'OCR Engine Ready');
          setOcrReady(true);
        };
        document.head.appendChild(script);
      } else {
        setOcrReady(true);
      }
    }
  }, [activeTab, locale]);

  const handleRunOcr = async () => {
    if (!currentFile || !(window as any).Tesseract) return;
    const targetOrigIdx = pageOrder[activePagePos];
    if (targetOrigIdx < 0) {
      alert(locale === 'th' ? 'ไม่สามารถสแกนหน้าว่างได้' : 'Cannot run OCR on a blank page.');
      return;
    }

    setIsOcrProcessing(true);
    setLoadingVisible(true);
    setLoadingStatus(locale === 'th' ? 'กำลังสแกนและถอดความตัวอักษร...' : 'Running OCR text recognition...');
    setStatusLog(locale === 'th' ? 'กำลังสแกนและถอดความตัวอักษร...' : 'Running text recognition (OCR)...');
    
    try {
      // Create hidden canvas for rendering page at high resolution scale 2.0
      const canvas = document.createElement('canvas');
      const scale = 2.0; // Higher scale yields better OCR accuracy
      setLoadingStatus(locale === 'th' ? 'กำลังเรนเดอร์หน้าเอกสารสำหรับสแกน...' : 'Rendering page for scan...');
      setStatusLog(locale === 'th' ? 'กำลังดึงข้อมูลหน้าและเริ่มวิเคราะห์...' : 'Extracting page content and analyzing...');
      // Call core pdf-page renderer helper to output pixel bytes onto canvas
      // This is a direct canvas generation
      const pdfjsLoading = (window as any).pdfjsLib; // fetch loaded lib
      
      const loadingTask = pdfjsLoading.getDocument({ data: new Uint8Array(currentFile.slice(0)) });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(targetOrigIdx + 1);
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;
        
        // Execute Tesseract
        setLoadingStatus(locale === 'th' ? 'กำลังวิเคราะห์และถอดรหัสตัวอักษร (Tesseract)...' : 'Analysing text with Tesseract AI...');
        const worker = await (window as any).Tesseract.createWorker(ocrLang);
        const ret = await worker.recognize(canvas);
        setOcrExtractedText(ret.data.text);
        await worker.terminate();

        addLog(locale === 'th' ? `ทำ OCR หน้า ${activePagePos + 1}` : `Ran OCR on page ${activePagePos + 1}`);
        setStatusLog(locale === 'th' ? 'สแกนตัวอักษรเสร็จสิ้น' : 'OCR scan complete');
      }
    } catch (e) {
      console.error(e);
      alert('OCR failed: ' + String(e));
      setStatusLog('OCR failed');
    } finally {
      setIsOcrProcessing(false);
      setLoadingVisible(false);
    }
  };

  return (
    <div className="app-container">
      <LoadingScreen visible={loadingVisible} statusText={loadingStatus} showProgress />
      {/* Top Banner Header */}
      <header className="app-banner">
        <div className="banner-left">
          <div className="app-logo">L</div>
          <h1 className="app-title">Lyncub PDF</h1>
          <div className="document-indicator">
            {currentFile ? currentFileName : t.workspace.noDocuments}
          </div>
        </div>

        <div className="banner-right">
          {currentFile && (
            <button className="btn-primary" onClick={handleSaveAndDownload}>
              <Save size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              {t.common.save}
            </button>
          )}
          <button className="theme-toggle" onClick={() => setShowSettingsModal(true)} title="Open Settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* 10 Mode Tabs Nav Bar */}
      <nav className="ribbon-tabs-bar">
        <button className={`ribbon-tab ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          {locale === 'th' ? 'หน้าหลัก' : 'Home'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'edit' ? 'active' : ''}`} onClick={() => setActiveTab('edit')}>
          {locale === 'th' ? 'แก้ไข' : 'Edit'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'comment' ? 'active' : ''}`} onClick={() => setActiveTab('comment')}>
          {locale === 'th' ? 'ความคิดเห็น' : 'Comment'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'view' ? 'active' : ''}`} onClick={() => setActiveTab('view')}>
          {locale === 'th' ? 'มุมมอง' : 'View'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'forms' ? 'active' : ''}`} onClick={() => setActiveTab('forms')}>
          {locale === 'th' ? 'ฟอร์ม' : 'Forms'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
          {locale === 'th' ? 'ความปลอดภัย' : 'Security'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'review' ? 'active' : ''}`} onClick={() => setActiveTab('review')}>
          {locale === 'th' ? 'ตรวจทาน' : 'Review'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'ocr' ? 'active' : ''}`} onClick={() => setActiveTab('ocr')}>
          OCR
        </button>
        <button className={`ribbon-tab ${activeTab === 'share' ? 'active' : ''}`} onClick={() => setActiveTab('share')}>
          {locale === 'th' ? 'แชร์' : 'Share'}
        </button>
        <button className={`ribbon-tab ${activeTab === 'toolkit' ? 'active' : ''}`} onClick={() => setActiveTab('toolkit')}>
          {locale === 'th' ? 'ชุดเครื่องมือ' : 'Toolkit'}
        </button>
      </nav>

      {/* Ribbon Tool Shelf - Contextual actions */}
      <div className="ribbon-tool-shelf">
        {activeTab === 'home' && (
          <>
            {/* GROUP: ประวัติ */}
            <div className="shelf-group">
              <div className="shelf-buttons">
                <button className="shelf-btn" onClick={handleUndo} disabled={undoStack.length === 0} title={locale === 'th' ? 'ย้อนกลับ' : 'Undo'}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                  <span>{locale === 'th' ? 'ย้อนกลับ' : 'Undo'}</span>
                </button>
                <button className="shelf-btn" onClick={handleRedo} disabled={redoStack.length === 0} title={locale === 'th' ? 'ทำซ้ำ' : 'Redo'}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
                  <span>{locale === 'th' ? 'ทำซ้ำ' : 'Redo'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'ประวัติ' : 'History'}</span>
            </div>

            {/* GROUP: ไฟล์ */}
            <div className="shelf-group">
              <div className="shelf-buttons">
                <button className="shelf-btn" onClick={() => { setCurrentFile(null); setCurrentFileName(''); setPdfInfo(null); setPageOrder([]); setAnnotations([]); setHistoryLog([]); setStatusLog('Ready'); }} title={locale === 'th' ? 'สร้างเอกสารใหม่' : 'New document'}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  <span>{locale === 'th' ? 'สร้างใหม่' : 'New'}</span>
                </button>
                <button className="shelf-btn" onClick={() => fileInputRef.current?.click()}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14"/><path d="M5 2h9l4 4v3"/><path d="M14 2v4h4"/><path d="M14 22v-7"/><path d="m9 18 3-3 3 3"/></svg>
                  <span>{locale === 'th' ? 'เปิด' : 'Open'}</span>
                </button>
                <input type="file" ref={fileInputRef} accept=".pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleFileLoad(e.target.files[0])} />
                <button className="shelf-btn" onClick={handleSaveAndDownload} disabled={!currentFile}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  <span>{locale === 'th' ? 'บันทึก' : 'Save'}</span>
                </button>
                <button className="shelf-btn" onClick={handleSaveAndDownload} disabled={!currentFile}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><path d="M12 17v-5m-2 3 2-3 2 3" /><line x1="9" y1="21" x2="9" y2="17" /></svg>
                  <span>{locale === 'th' ? 'บันทึกเป็น' : 'Save As'}</span>
                </button>
                <button className="shelf-btn" disabled={!currentFile} title={locale === 'th' ? 'พิมพ์ (เร็วๆ นี้)' : 'Print (soon)'} onClick={() => window.print()}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  <span>{locale === 'th' ? 'พิมพ์' : 'Print'}</span>
                </button>
                <button className="shelf-btn" onClick={handleSaveAndDownload} disabled={!currentFile}>
                  <Download />
                  <span>{locale === 'th' ? 'ส่งออก' : 'Export'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'ไฟล์' : 'File'}</span>
            </div>

            {/* GROUP: นำทาง (Tools) */}
            <div className="shelf-group">
              <div className="shelf-buttons">
                <button className={`shelf-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} disabled={!currentFile}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>
                  <span>{locale === 'th' ? 'เลือก' : 'Select'}</span>
                </button>
                <button className={`shelf-btn ${activeTool === 'hand' ? 'active' : ''}`} onClick={() => setActiveTool('hand')} disabled={!currentFile}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
                  <span>{locale === 'th' ? 'เลื่อนหน้า' : 'Hand'}</span>
                </button>
                <button className={`shelf-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => setActiveTool('text')} disabled={!currentFile}>
                  <Type />
                  <span>{locale === 'th' ? 'เลือกข้อความ' : 'Text'}</span>
                </button>
                <button className={`shelf-btn ${activeTool === 'signature' ? 'active' : ''}`} onClick={() => setActiveTool('signature')} disabled={!currentFile}>
                  <PenTool />
                  <span>{locale === 'th' ? 'ตัดแปะ' : 'Stamp'}</span>
                </button>
                <button className="shelf-btn" onClick={() => { setSidebarTabRight('search'); setIsRightCollapsed(false); }} disabled={!currentFile}>
                  <Search />
                  <span>{locale === 'th' ? 'ค้นหา' : 'Search'}</span>
                </button>
                <button className="shelf-btn" onClick={() => setZoom(z => Math.min(1000, z + 50))} disabled={!currentFile}>
                  <ZoomIn />
                  <span>{locale === 'th' ? 'ขยาย' : 'Zoom +'}</span>
                </button>
                <button className="shelf-btn" onClick={() => setZoom(z => Math.max(10, z - 25))} disabled={!currentFile}>
                  <ZoomOut />
                  <span>{locale === 'th' ? 'ย่อ' : 'Zoom -'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'นำทาง' : 'Tools'}</span>
            </div>
          </>
        )}

        {activeTab === 'edit' && (
          <>
            {/* GROUP: เนื้อหา */}
            <div className="shelf-group">
              <div className="shelf-buttons">
                {/* แก้ไขข้อความ - กำลังพัฒนา */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: 0.5, cursor: 'not-allowed' }}>
                  <button className={`shelf-btn`} disabled style={{ cursor: 'not-allowed' }}>
                    <Type />
                    <span>{locale === 'th' ? 'แก้ไขข้อความ' : 'Edit Text'}</span>
                  </button>
                  <span style={{ fontSize: '9px', color: 'var(--brand-primary)', fontWeight: 600 }}>{locale === 'th' ? 'กำลังพัฒนา' : 'Coming Soon'}</span>
                </div>
                <button className={`shelf-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => setActiveTool('text')} disabled={!currentFile}>
                  <Type />
                  <span>{locale === 'th' ? 'เพิ่มข้อความ' : 'Add Text'}</span>
                </button>
                <button className="shelf-btn" title={locale === 'th' ? 'แทรกรูปภาพ (เร็วๆ นี้)' : 'Insert image (coming soon)'} disabled>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>{locale === 'th' ? 'แทรกรูปภาพ' : 'Add Image'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'เนื้อหา' : 'Content'}</span>
            </div>

            {/* GROUP: หน้า */}
            <div className="shelf-group">
              <div className="shelf-buttons">
                <button className="shelf-btn" onClick={() => handleRotatePage('left')} disabled={!currentFile}>
                  <RotateCcw />
                  <span>{locale === 'th' ? 'หมุนซ้าย' : 'Rotate L'}</span>
                </button>
                <button className="shelf-btn" onClick={() => handleRotatePage('right')} disabled={!currentFile}>
                  <RotateCw />
                  <span>{locale === 'th' ? 'หมุนขวา' : 'Rotate R'}</span>
                </button>
                <button className="shelf-btn" onClick={() => {
                  // Duplicate current page
                  if (pageOrder.length === 0) return;
                  saveHistory();
                  const origIdx = pageOrder[activePagePos];
                  setPageOrder(prev => {
                    const next = [...prev];
                    next.splice(activePagePos + 1, 0, origIdx);
                    return next;
                  });
                  addLog(locale === 'th' ? `ทำซ้ำหน้า ${activePagePos + 1}` : `Duplicated page ${activePagePos + 1}`);
                  setStatusLog(locale === 'th' ? 'ทำซ้ำหน้าเรียบร้อย' : 'Page duplicated');
                }} disabled={!currentFile}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  <span>{locale === 'th' ? 'ทำซ้ำ' : 'Duplicate'}</span>
                </button>
                <button className="shelf-btn" onClick={handleDeletePage} disabled={!currentFile}>
                  <Trash2 color="var(--accent-red)" />
                  <span>{locale === 'th' ? 'ลบ' : 'Delete'}</span>
                </button>
                <button className="shelf-btn" onClick={handleAddBlankPage} disabled={!currentFile}>
                  <Plus />
                  <span>{locale === 'th' ? 'เพิ่มหน้าว่าง' : 'Blank Page'}</span>
                </button>
                <button className="shelf-btn" onClick={handleReversePages} disabled={!currentFile}>
                  <RefreshCw />
                  <span>{locale === 'th' ? 'กลับลำดับหน้า' : 'Reverse'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'หน้า' : 'Pages'}</span>
            </div>
          </>
        )}

        {activeTab === 'comment' && (
          <>
            <div className="shelf-group">
              <div className="shelf-buttons">
                <button className={`shelf-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} disabled={!currentFile}>
                  <Eye />
                  <span>{locale === 'th' ? 'เลือก' : 'Select'}</span>
                </button>
                <button className={`shelf-btn ${activeTool === 'freehand' ? 'active' : ''}`} onClick={() => setActiveTool('freehand')} disabled={!currentFile}>
                  <PenTool />
                  <span>{locale === 'th' ? 'วาดปากกา' : 'Draw'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'มาร์กอัป' : 'Markup'}</span>
            </div>

            <div className="shelf-group">
              <div className="shelf-buttons">
                <button className={`shelf-btn ${activeTool === 'rect' ? 'active' : ''}`} onClick={() => setActiveTool('rect')} disabled={!currentFile}>
                  <Square />
                  <span>{locale === 'th' ? 'สี่เหลี่ยม' : 'Rect'}</span>
                </button>
                <button className={`shelf-btn ${activeTool === 'circle' ? 'active' : ''}`} onClick={() => setActiveTool('circle')} disabled={!currentFile}>
                  <CircleIcon />
                  <span>{locale === 'th' ? 'วงกลม' : 'Circle'}</span>
                </button>
                <button className={`shelf-btn ${activeTool === 'arrow' ? 'active' : ''}`} onClick={() => setActiveTool('arrow')} disabled={!currentFile}>
                  <ArrowUpRight />
                  <span>{locale === 'th' ? 'ลูกศร' : 'Arrow'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'รูปร่างเรขาคณิต' : 'Shapes'}</span>
            </div>

            <div className="shelf-group">
              <div className="shelf-buttons">
                <button className="shelf-btn" onClick={() => setAnnotations([])} disabled={!currentFile}>
                  <Trash2 />
                  <span>{locale === 'th' ? 'ล้างทั้งหมด' : 'Clear All'}</span>
                </button>
              </div>
              <span className="shelf-group-label">{locale === 'th' ? 'ล้างคำอธิบาย' : 'Clean up'}</span>
            </div>
          </>
        )}

        {activeTab === 'view' && (
          <div className="shelf-group">
            <div className="shelf-buttons">
              <button className={`shelf-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} disabled={!currentFile}>
                <Eye />
                <span>{locale === 'th' ? 'ดูเอกสาร' : 'Select'}</span>
              </button>
              <button className={`shelf-btn ${activeTool === 'hand' ? 'active' : ''}`} onClick={() => setActiveTool('hand')} disabled={!currentFile}>
                <AlignLeft />
                <span>{locale === 'th' ? 'เลื่อนหน้า' : 'Pan'}</span>
              </button>
            </div>
            <span className="shelf-group-label">{locale === 'th' ? 'มุมมอง' : 'Display'}</span>
          </div>
        )}

        {activeTab === 'forms' && (
          <div className="shelf-group">
            <div className="shelf-buttons">
              <button className="shelf-btn" onClick={() => {
                if (savedSignature) {
                  setActiveTool('signature');
                } else {
                  setShowSignatureModal(true);
                }
              }} disabled={!currentFile}>
                <Palette />
                <span>{locale === 'th' ? 'ลงลายเซ็น' : 'Signature'}</span>
              </button>
            </div>
            <span className="shelf-group-label">{locale === 'th' ? 'ช่องฟิลด์' : 'Fields'}</span>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="shelf-group">
            <div className="shelf-buttons">
              <button className={`shelf-btn ${activeTool === 'redact' ? 'active' : ''}`} onClick={() => setActiveTool('redact')} disabled={!currentFile}>
                <Square color="var(--accent-red)" />
                <span>{locale === 'th' ? 'ทำเครื่องหมาย' : 'Mark Redact'}</span>
              </button>
              <button className="shelf-btn" onClick={() => setShowPasswordModal(true)} disabled={!currentFile}>
                <Lock />
                <span>{pdfPassword ? locale === 'th' ? 'เปลี่ยนรหัส' : 'Change Pass' : locale === 'th' ? 'ตั้งรหัสผ่าน' : 'Encrypt'}</span>
              </button>
              {pdfPassword && (
                <button className="shelf-btn" onClick={() => {
                  setPdfPassword('');
                  alert(locale === 'th' ? 'ยกเลิกการล็อกรหัสผ่านแล้ว' : 'Password unlocked.');
                }} disabled={!currentFile}>
                  <Unlock color="var(--accent-green)" />
                  <span>{t.security.decrypt}</span>
                </button>
              )}
            </div>
            <span className="shelf-group-label">{locale === 'th' ? 'การป้องกัน' : 'Protection'}</span>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="shelf-group">
            <div className="shelf-buttons">
              <button className="shelf-btn" onClick={() => setSidebarTabRight('inspector')} disabled={!currentFile}>
                <Info />
                <span>{locale === 'th' ? 'ดูข้อมูลเมตา' : 'Metadata'}</span>
              </button>
            </div>
            <span className="shelf-group-label">{locale === 'th' ? 'ตรวจสอบเอกสาร' : 'Inspect'}</span>
          </div>
        )}

        {activeTab === 'ocr' && (
          <div className="shelf-group">
            <div className="shelf-buttons" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select value={ocrLang} onChange={(e) => setOcrLang(e.target.value)} disabled={!currentFile} style={{ padding: '6px', fontSize: '12px' }}>
                <option value="eng">English (eng)</option>
                <option value="tha">ไทย (tha)</option>
                <option value="eng+tha">Bilingual (eng+tha)</option>
              </select>
              <button className="btn-primary" onClick={handleRunOcr} disabled={!currentFile || !ocrReady || isOcrProcessing} style={{ padding: '6px 14px' }}>
                {isOcrProcessing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} />
                    {locale === 'th' ? 'กำลังประมวลผล...' : 'Processing...'}
                  </>
                ) : (
                  locale === 'th' ? 'ถอดความหน้าปัจจุบัน' : 'OCR Current Page'
                )}
              </button>
            </div>
            <span className="shelf-group-label">OCR Text Recognition</span>
          </div>
        )}

        {activeTab === 'share' && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '12px' }}>
            📤 Export Formats: (Supported: Export as PDF. Excel/Word exports coming soon).
          </div>
        )}

        {activeTab === 'toolkit' && (
          <ToolkitTab 
            locale={locale} 
            currentFile={currentFile} 
            currentFileName={currentFileName}
            pageCount={pageOrder.length}
            onSaveFile={handleSaveToolOutput}
          />
        )}
      </div>

      {/* Workbench Content Body containing Dual Sidebars and Canvas Workspace */}
      <div className="workbench-body">
        
        {/* LEFT TAB STRIP (Always visible) */}
        <div className="sidebar-tab-strip-left">
          <button 
            className={`tab-strip-btn ${!isLeftCollapsed && sidebarTabLeft === 'pages' ? 'active' : ''}`}
            onClick={() => handleLeftTabClick('pages')}
          >
            <FileText size={20} />
            <span className="tooltip">{locale === 'th' ? 'หน้า' : 'Pages'}</span>
          </button>
          <button 
            className={`tab-strip-btn ${!isLeftCollapsed && sidebarTabLeft === 'bookmarks' ? 'active' : ''}`}
            onClick={() => handleLeftTabClick('bookmarks')}
          >
            <Bookmark size={20} />
            <span className="tooltip">{locale === 'th' ? 'บุ๊กมาร์ก' : 'Bookmarks'}</span>
          </button>
          <button 
            className={`tab-strip-btn ${!isLeftCollapsed && sidebarTabLeft === 'layers' ? 'active' : ''}`}
            onClick={() => handleLeftTabClick('layers')}
          >
            <Layers size={20} />
            <span className="tooltip">{locale === 'th' ? 'เลเยอร์' : 'Layers'}</span>
          </button>
          <button 
            className={`tab-strip-btn ${!isLeftCollapsed && sidebarTabLeft === 'attachments' ? 'active' : ''}`}
            onClick={() => handleLeftTabClick('attachments')}
          >
            <Paperclip size={20} />
            <span className="tooltip">{locale === 'th' ? 'ไฟล์แนบ' : 'Attachments'}</span>
          </button>
          <button 
            className={`tab-strip-btn ${!isLeftCollapsed && sidebarTabLeft === 'toolkit' ? 'active' : ''}`}
            onClick={() => handleLeftTabClick('toolkit')}
            style={{ backgroundColor: !isLeftCollapsed && sidebarTabLeft === 'toolkit' ? 'rgba(168, 85, 247, 0.2)' : 'transparent', color: !isLeftCollapsed && sidebarTabLeft === 'toolkit' ? '#a855f7' : 'inherit' }}
          >
            <Sparkles size={20} />
            <span className="tooltip">{locale === 'th' ? 'ชุดเครื่องมือ' : 'Toolkit'}</span>
          </button>
        </div>

        {/* LEFT SIDEBAR PANEL: Displays content of active tab */}
        <aside className={`sidebar-panel-left ${isLeftCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-panel-header" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-primary)', margin: 0 }}>
              {sidebarTabLeft === 'pages' && (locale === 'th' ? 'หน้ากระดาษทั้งหมด' : 'Pages')}
              {sidebarTabLeft === 'bookmarks' && (locale === 'th' ? 'สารบัญโครงร่าง' : 'Outline')}
              {sidebarTabLeft === 'layers' && (locale === 'th' ? 'เลเยอร์เอกสาร' : 'Document Layers')}
              {sidebarTabLeft === 'attachments' && (locale === 'th' ? 'ไฟล์แนบทั้งหมด' : 'Attachments')}
              {sidebarTabLeft === 'toolkit' && (locale === 'th' ? 'ชุดเครื่องมือเสริม' : 'Toolkit Panel')}
            </h3>
            <button 
              onClick={() => setIsLeftCollapsed(true)}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Close panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="sidebar-scrollable-content" style={{ padding: '12px' }}>
            {sidebarTabLeft === 'pages' && (
              currentFile && pdfInfo ? (
                <div className="sidebar-pages-grid">
                  {pageOrder.map((origIdx, pos) => {
                    return (
                      <div 
                        key={origIdx} 
                        className={`sidebar-thumbnail-node ${activePagePos === pos ? 'active' : ''}`}
                        onClick={() => setActivePagePos(pos)}
                      >
                        <div className="thumbnail-frame" style={{ aspectRatio: '595/842', backgroundColor: '#ffffff', border: '1px solid var(--border-color)' }}>
                          {origIdx >= 0 ? (
                            <PdfPageRenderer 
                              arrayBuffer={currentFile} 
                              pageIndex={origIdx} 
                              zoom={25} 
                              rotation={pageRotations[origIdx] || 0}
                            />
                          ) : (
                            <div style={{ fontSize: '9px', color: '#999', fontWeight: 600, display: 'grid', placeItems: 'center', height: '100%' }}>Blank</div>
                          )}
                        </div>
                        <span className="thumbnail-page-number">Page {pos + 1}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '20px' }}>
                  {locale === 'th' ? 'กรุณาอัปโหลดไฟล์ PDF เพื่อแสดงหน้าเอกสาร' : 'Please upload a PDF to view pages.'}
                </div>
              )
            )}

            {sidebarTabLeft === 'bookmarks' && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {locale === 'th' ? 'ไม่มีข้อมูลโครงสร้างสารบัญในไฟล์นี้' : 'No outline found in this document.'}
              </div>
            )}

            {sidebarTabLeft === 'layers' && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <input type="checkbox" defaultChecked />
                  <span>{locale === 'th' ? 'เลเยอร์หลัก (ข้อความและโครงสร้าง)' : 'Base Document Content'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" defaultChecked />
                  <span>{locale === 'th' ? 'เลเยอร์คำอธิบาย (Annotations)' : 'Interactive Annotations'}</span>
                </div>
              </div>
            )}

            {sidebarTabLeft === 'attachments' && (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '20px' }}>
                {locale === 'th' ? 'ไม่มีไฟล์แนบในเอกสารนี้' : 'No attachments found in this document.'}
              </div>
            )}

            {sidebarTabLeft === 'toolkit' && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <p style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--brand-primary)' }}>
                  {locale === 'th' ? 'เครื่องมือด่วน (Quick Tools)' : 'Quick Actions'}
                </p>
                <button 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '6px', fontSize: '11px', marginBottom: '6px' }}
                  onClick={() => setActiveTab('toolkit')}
                >
                  {locale === 'th' ? 'เปิดชุดเครื่องมือเต็มรูปแบบ' : 'Open Full Toolkit'}
                </button>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '10px' }}>
                  {locale === 'th' ? 'ผสานไฟล์ หมุน แยก หรือครอบตัดหน้ากระดาษได้ง่ายๆ' : 'Easily merge, rotate, split, or crop PDF documents.'}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* CENTER CANVAS WORKSPACE */}
        <main 
          className="pdf-center-workspace"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          {isDragActive && (
            <div style={{
              position: 'absolute',
              inset: 20,
              border: '3px dashed var(--brand-primary)',
              borderRadius: 'var(--radius-xl)',
              backgroundColor: 'oklch(from var(--brand-primary) l c h / 0.12)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 90,
              backdropFilter: 'blur(4px)'
            }}>
              <h2 style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>
                {locale === 'th' ? 'วางไฟล์เอกสาร PDF ที่นี่' : 'Drop PDF files here'}
              </h2>
            </div>
          )}

          {!currentFile || pageOrder.length === 0 ? (
            <div
              className={`dropzone-container${isDragActive ? ' drag-over' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              {/* PDF Icon Circle */}
              <div className="dropzone-icon-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <line x1="10" y1="9" x2="8" y2="9"/>
                </svg>
              </div>

              <h2 className="dropzone-title">
                {locale === 'th' ? 'เปิดไฟล์ PDF เพื่อเริ่มต้น' : 'Open a PDF to get started'}
              </h2>
              <p className="dropzone-subtitle">
                {locale === 'th'
                  ? 'Lyncub PDF คือโปรแกรมแก้ไข PDF ฟรี ที่ให้คุณดูไฟล์ ใส่คำอธิบาย ค้นหา ปรับแต่ง และจัดการหน้า เอกสารได้โดยตรงบนอุปกรณ์ของคุณ'
                  : 'A free PDF editor to view, annotate, search, edit, and manage pages directly in your browser'}
              </p>

              <button
                className="dropzone-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, verticalAlign: 'middle' }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                {locale === 'th' ? 'เลือกไฟล์ PDF' : 'Choose PDF File'}
              </button>

              <p className="dropzone-drag-hint">
                {locale === 'th' ? 'หรือลากและวางไฟล์ PDF ที่นี่' : 'or drag and drop your PDF here'}
              </p>

              {/* Privacy badge */}
              <div className="dropzone-privacy-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, flexShrink: 0 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <div>
                  <strong>{locale === 'th' ? 'ส่วนตัวและปลอดภัย 100%' : '100% Private & Secure'}</strong>
                  <p>{locale === 'th' ? 'ไฟล์ของคุณจะถูกประมวลผลบนอุปกรณ์ของคุณเท่านั้น เราไม่อัปโหลดหรือเก็บข้อมูลของคุณไว้บนเซิร์ฟเวอร์' : 'Your files are processed locally on your device. We never upload or store your data on any server.'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="pdf-viewer-container">
              {pageOrder.map((origIdx, pos) => {
                return (
                  <div 
                    key={origIdx} 
                    className={`workspace-page-card ${activePagePos === pos ? 'active' : ''}`}
                    onClick={() => setActivePagePos(pos)}
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      backgroundColor: 'white',
                      ...(origIdx < 0 ? {
                        width: `${(zoom / 100) * 595}px`,
                        height: `${(zoom / 100) * 842}px`,
                      } : {})
                    }}
                  >
                    {/* Floating Page Toolbar */}
                    <div style={{
                      position: 'absolute',
                      top: '-30px',
                      right: '0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      zIndex: 80,
                      backgroundColor: 'var(--surface-color)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      boxShadow: 'var(--shadow-sm)',
                      border: '1px solid var(--border-color)'
                    }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {locale === 'th' ? `หน้า ${pos + 1}` : `Page ${pos + 1}`}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActivePagePos(pos); handleRotatePage('right'); }} 
                        title="Rotate Page 90°"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: 'var(--brand-primary)' }}
                      >
                        <RotateCw size={14} />
                      </button>
                    </div>

                    {origIdx >= 0 ? (
                      <PdfPageRenderer 
                        arrayBuffer={currentFile} 
                        pageIndex={origIdx} 
                        zoom={zoom} 
                        rotation={pageRotations[origIdx] || 0}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '24px', fontWeight: 600 }}>
                        {locale === 'th' ? 'หน้าเปล่า' : 'Blank Page'}
                      </div>
                    )}

                    {/* Annotations Draw Layer */}
                    <div 
                      className="drawing-events-layer"
                      onMouseDown={(e) => handleWorkspacePointerDown(e, origIdx)}
                      onMouseMove={handleWorkspacePointerMove}
                      onMouseUp={handleWorkspacePointerUp}
                    >
                      {annotations
                        .filter(ann => ann.pageIndex === origPageIdxGetter(origIdx))
                        .map(ann => {
                          const isSelected = selectedAnnId === ann.id;
                          return (
                            <div 
                              key={ann.id}
                              className={`annotation-node ${isSelected ? 'selected' : ''}`}
                              onMouseDown={(e) => handleAnnMoveStart(e, ann)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAnnId(ann.id);
                              }}
                              style={{
                                left: `${ann.x}%`,
                                top: `${ann.y}%`,
                                width: ann.width ? `${ann.width}%` : 'auto',
                                height: ann.height ? `${ann.height}%` : 'auto',
                                opacity: ann.opacity ?? 1,
                                color: ann.color,
                              }}
                            >
                              {ann.type === 'text' && (
                                <div style={{ padding: '4px', fontSize: `${ann.fontSize || 14}px`, whiteSpace: 'pre-wrap' }}>
                                  {ann.text}
                                </div>
                              )}

                              {ann.type === 'rect' && (
                                <svg className="shape-svg" style={{ width: '100%', height: '100%' }}>
                                  <rect 
                                    x="0" 
                                    y="0" 
                                    width="100%" 
                                    height="100%" 
                                    stroke={ann.color} 
                                    strokeWidth={ann.strokeWidth || 2}
                                    fill={ann.fillColor || 'transparent'} 
                                  />
                                </svg>
                              )}

                              {ann.type === 'circle' && (
                                <svg className="shape-svg" style={{ width: '100%', height: '100%' }}>
                                  <ellipse 
                                    cx="50%" 
                                    cy="50%" 
                                    rx="48%" 
                                    ry="48%" 
                                    stroke={ann.color} 
                                    strokeWidth={ann.strokeWidth || 2}
                                    fill={ann.fillColor || 'transparent'} 
                                  />
                                </svg>
                              )}

                              {ann.type === 'arrow' && (
                                <svg className="shape-svg" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                  <line 
                                    x1="0%" 
                                    y1="0%" 
                                    x2="100%" 
                                    y2="100%" 
                                    stroke={ann.color} 
                                    strokeWidth={ann.strokeWidth || 2} 
                                  />
                                </svg>
                              )}

                              {ann.type === 'freehand' && ann.points && (
                                <svg className="shape-svg" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                  <polyline
                                    fill="none"
                                    stroke={ann.color}
                                    strokeWidth={ann.strokeWidth || 2}
                                    points={ann.points.map(p => `${p.x} ${p.y}`).join(',')}
                                  />
                                </svg>
                              )}

                              {ann.type === 'signature' && ann.imageUri && (
                                <img 
                                  src={ann.imageUri} 
                                  alt="signature" 
                                  style={{ width: '100%', height: '100%', pointerEvents: 'none' }} 
                                />
                              )}

                              {ann.type === 'redact' && (
                                <div style={{ width: '100%', height: '100%', backgroundColor: '#000000', color: 'red', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid red' }}>
                                  REDACT
                                </div>
                              )}

                              {isSelected && (
                                <>
                                  <div className="annotation-resize-handle nw" onMouseDown={(e) => handleResizeStart(e, ann, 'nw')} />
                                  <div className="annotation-resize-handle n"  onMouseDown={(e) => handleResizeStart(e, ann, 'n')} />
                                  <div className="annotation-resize-handle ne" onMouseDown={(e) => handleResizeStart(e, ann, 'ne')} />
                                  <div className="annotation-resize-handle e"  onMouseDown={(e) => handleResizeStart(e, ann, 'e')} />
                                  <div className="annotation-resize-handle se" onMouseDown={(e) => handleResizeStart(e, ann, 'se')} />
                                  <div className="annotation-resize-handle s"  onMouseDown={(e) => handleResizeStart(e, ann, 's')} />
                                  <div className="annotation-resize-handle sw" onMouseDown={(e) => handleResizeStart(e, ann, 'sw')} />
                                  <div className="annotation-resize-handle w"  onMouseDown={(e) => handleResizeStart(e, ann, 'w')} />
                                </>
                              )}
                            </div>
                          );
                        })}

                      {/* Current drawing preview */}
                      {isDrawing && currentDragAnn && currentDragAnn.pageIndex === origIdx && (
                        <div 
                          className="annotation-node selected"
                          style={{
                            left: `${currentDragAnn.x}%`,
                            top: `${currentDragAnn.y}%`,
                            width: `${currentDragAnn.width}%`,
                            height: `${currentDragAnn.height}%`,
                            opacity: currentDragAnn.opacity ?? 0.7
                          }}
                        >
                          {currentDragAnn.type === 'rect' && (
                            <svg className="shape-svg" style={{ width: '100%', height: '100%' }}>
                              <rect 
                                x="0" 
                                y="0" 
                                width="100%" 
                                height="100%" 
                                stroke={currentDragAnn.color} 
                                strokeWidth={currentDragAnn.strokeWidth || 2}
                                fill={currentDragAnn.fillColor || 'transparent'} 
                              />
                            </svg>
                          )}
                          {currentDragAnn.type === 'circle' && (
                            <svg className="shape-svg" style={{ width: '100%', height: '100%' }}>
                              <ellipse 
                                cx="50%" 
                                cy="50%" 
                                rx="48%" 
                                ry="48%" 
                                stroke={currentDragAnn.color} 
                                strokeWidth={currentDragAnn.strokeWidth || 2}
                                fill={currentDragAnn.fillColor || 'transparent'} 
                              />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR: inspector panel properties */}
        <aside className={`sidebar-panel-right ${isRightCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-panel-header">
            <button className={`sidebar-tab-btn ${sidebarTabRight === 'inspector' ? 'active' : ''}`} onClick={() => setSidebarTabRight('inspector')} title="Properties">
              <Info size={14} />
            </button>
            <button className={`sidebar-tab-btn ${sidebarTabRight === 'comments' ? 'active' : ''}`} onClick={() => setSidebarTabRight('comments')} title="Comments">
              <MessageSquare size={14} />
            </button>
            <button className={`sidebar-tab-btn ${sidebarTabRight === 'search' ? 'active' : ''}`} onClick={() => setSidebarTabRight('search')} title="Search text">
              <Search size={14} />
            </button>
            <button className={`sidebar-tab-btn ${sidebarTabRight === 'security' ? 'active' : ''}`} onClick={() => setSidebarTabRight('security')} title="Security">
              <Shield size={14} />
            </button>
            <button className={`sidebar-tab-btn ${sidebarTabRight === 'history' ? 'active' : ''}`} onClick={() => setSidebarTabRight('history')} title="History logs">
              <History size={14} />
            </button>
          </div>

          <div className="sidebar-scrollable-content">
            {sidebarTabRight === 'inspector' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  {locale === 'th' ? 'คุณสมบัติเอกสาร' : 'DOCUMENT PROPERTIES'}
                </span>

                {pdfInfo ? (
                  <>
                    <div className="inspector-row">
                      <span className="inspector-key">{locale === 'th' ? 'ชื่อไฟล์' : 'Filename'}</span>
                      <span className="inspector-val">{currentFileName}</span>
                    </div>
                    <div className="inspector-row">
                      <span className="inspector-key">{locale === 'th' ? 'จำนวนหน้า' : 'Total Pages'}</span>
                      <span className="inspector-val">{pageOrder.length}</span>
                    </div>

                    <div className="inspector-group" style={{ marginTop: '8px' }}>
                      <label className="inspector-label">{locale === 'th' ? 'ชื่อเรื่อง (Title)' : 'Title'}</label>
                      <input 
                        type="text" 
                        className="text-input" 
                        value={metaTitle} 
                        onChange={(e) => {
                          setMetaTitle(e.target.value);
                          setPdfInfo(prev => prev ? { ...prev, title: e.target.value } : null);
                        }} 
                      />
                    </div>

                    <div className="inspector-group">
                      <label className="inspector-label">{locale === 'th' ? 'ผู้เขียน (Author)' : 'Author'}</label>
                      <input 
                        type="text" 
                        className="text-input" 
                        value={metaAuthor} 
                        onChange={(e) => setMetaAuthor(e.target.value)} 
                      />
                    </div>

                    {!selectedAnnId && (
                      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                          {locale === 'th' ? 'คุณสมบัติเครื่องมือเริ่มต้น' : 'DEFAULT TOOL PROPERTIES'}
                        </span>
                        
                        <div className="inspector-group">
                          <span className="inspector-label">{t.inspector.color} ({locale === 'th' ? 'เส้นขอบ' : 'Border'})</span>
                          <div className="color-palette" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {['#ff0055', '#0077ff', '#00ff77', '#ffb700', '#7700ff', '#000000'].map(c => (
                              <button 
                                key={c}
                                className={`color-swatch ${inspectorColor === c ? 'active' : ''}`}
                                style={{ backgroundColor: c }}
                                onClick={() => setInspectorColor(c)}
                              />
                            ))}
                            <input 
                              type="color" 
                              value={inspectorColor} 
                              onChange={(e) => setInspectorColor(e.target.value)} 
                              title="Custom Color"
                              style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                            />
                          </div>
                        </div>

                        <div className="inspector-group">
                          <span className="inspector-label">{t.inspector.fillColor} ({locale === 'th' ? 'สีพื้น' : 'Fill'})</span>
                          <div className="color-palette" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button 
                              className={`color-swatch ${inspectorFill === '' ? 'active' : ''}`}
                              style={{ backgroundColor: 'transparent', border: '1px dashed var(--text-tertiary)' }}
                              onClick={() => setInspectorFill('')}
                              title="Transparent"
                            />
                            {['#ff005533', '#0077ff33', '#00ff7733', '#ffb70033', '#ffffff88'].map(c => (
                              <button 
                                key={c}
                                className={`color-swatch ${inspectorFill === c ? 'active' : ''}`}
                                style={{ backgroundColor: c }}
                                onClick={() => setInspectorFill(c)}
                              />
                            ))}
                            <input 
                              type="color" 
                              value={inspectorFill && inspectorFill.length === 7 ? inspectorFill : '#ffffff'} 
                              onChange={(e) => setInspectorFill(e.target.value)} 
                              title="Custom Fill Color"
                              style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                            />
                          </div>
                        </div>

                        <div className="inspector-group">
                          <span className="inspector-label">{t.inspector.fontSize}</span>
                          <input 
                            type="number" 
                            className="number-input" 
                            value={inspectorFontSize} 
                            onChange={(e) => setInspectorFontSize(parseInt(e.target.value) || 12)}
                          />
                        </div>

                        <div className="inspector-group">
                          <span className="inspector-label">{locale === 'th' ? 'ความหนาของเส้น' : 'Stroke Width'}</span>
                          <input 
                            type="number" 
                            className="number-input" 
                            value={inspectorStrokeWidth} 
                            onChange={(e) => setInspectorStrokeWidth(parseInt(e.target.value) || 1)}
                          />
                        </div>

                        <div className="inspector-group">
                          <span className="inspector-label">{t.inspector.opacity} ({Math.round(inspectorOpacity * 100)}%)</span>
                          <input 
                            type="range" 
                            min="0.1" 
                            max="1" 
                            step="0.1"
                            className="slider-input"
                            value={inspectorOpacity}
                            onChange={(e) => setInspectorOpacity(parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {locale === 'th' ? 'ยังไม่ได้เปิดเอกสาร' : 'No document opened.'}
                  </span>
                )}

                {/* Selected element editor settings */}
                {selectedAnnId && selectedAnn && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                        {selectedAnn.type.toUpperCase()} ({locale === 'th' ? 'รูปทรงที่เลือก' : 'SELECTED'})
                      </span>
                      <button onClick={() => {
                        saveHistory();
                        setAnnotations(prev => prev.filter(a => a.id !== selectedAnnId));
                        setSelectedAnnId(null);
                      }} style={{ color: 'var(--accent-red)', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        {locale === 'th' ? 'ลบรูปทรง' : 'Delete'}
                      </button>
                    </div>

                    {selectedAnn.type === 'rect' && (
                      <button 
                        className="btn-primary" 
                        style={{ padding: '6px 12px', fontSize: '11px', backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onClick={() => updateSelectedAnnotation({ fillColor: '#ffffff', opacity: 1 })}
                      >
                        <span>⬜</span>
                        <span>{locale === 'th' ? 'ถมสีพื้นหลังขาว (ปิดข้อความ)' : 'Solid White Fill (Cover Text)'}</span>
                      </button>
                    )}

                    {/* Border Color */}
                    <div className="inspector-group">
                      <span className="inspector-label">{locale === 'th' ? 'สีเส้นขอบ (Border Color)' : 'Border Color'}</span>
                      <div className="color-palette" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {['#ff0055', '#0077ff', '#00ff77', '#ffb700', '#7700ff', '#000000', '#ffffff'].map(c => (
                          <button 
                            key={c}
                            className={`color-swatch ${selectedAnn.color === c ? 'active' : ''}`}
                            style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #ccc' : 'none' }}
                            onClick={() => updateSelectedAnnotation({ color: c })}
                          />
                        ))}
                        <input 
                          type="color" 
                          value={selectedAnn.color || '#ff0055'} 
                          onChange={(e) => updateSelectedAnnotation({ color: e.target.value })} 
                          title="Custom Color"
                          style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                        />
                      </div>
                    </div>

                    {/* Fill Color */}
                    <div className="inspector-group">
                      <span className="inspector-label">{locale === 'th' ? 'สีพื้นหลัง (Fill Color)' : 'Fill Color'}</span>
                      <div className="color-palette" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button 
                          className={`color-swatch ${!selectedAnn.fillColor || selectedAnn.fillColor === 'transparent' ? 'active' : ''}`}
                          style={{ backgroundColor: 'transparent', border: '1px dashed var(--text-tertiary)' }}
                          onClick={() => updateSelectedAnnotation({ fillColor: 'transparent' })}
                          title="Transparent"
                        />
                        {['#ffffff', '#ff005533', '#0077ff33', '#00ff7733', '#ffb70033', '#00000088'].map(c => (
                          <button 
                            key={c}
                            className={`color-swatch ${selectedAnn.fillColor === c ? 'active' : ''}`}
                            style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #ccc' : 'none' }}
                            onClick={() => updateSelectedAnnotation({ fillColor: c })}
                          />
                        ))}
                        <input 
                          type="color" 
                          value={selectedAnn.fillColor && selectedAnn.fillColor !== 'transparent' && selectedAnn.fillColor.length === 7 ? selectedAnn.fillColor : '#ffffff'} 
                          onChange={(e) => updateSelectedAnnotation({ fillColor: e.target.value })} 
                          title="Custom Fill Color"
                          style={{ width: '24px', height: '24px', padding: 0, border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                        />
                      </div>
                    </div>

                    {/* Stroke Width */}
                    <div className="inspector-group">
                      <span className="inspector-label">{locale === 'th' ? 'ความหนาเส้นขอบ (px)' : 'Stroke Width (px)'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="range" 
                          min="1" 
                          max="100" 
                          className="slider-input" 
                          style={{ flex: 1 }}
                          value={selectedAnn.strokeWidth || 2} 
                          onChange={(e) => updateSelectedAnnotation({ strokeWidth: parseInt(e.target.value) || 1 })}
                        />
                        <input 
                          type="number" 
                          min="1" 
                          max="100"
                          style={{ width: '48px', padding: '2px 4px', fontSize: '11px', textAlign: 'center' }}
                          value={selectedAnn.strokeWidth || 2}
                          onChange={(e) => updateSelectedAnnotation({ strokeWidth: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                    </div>

                    {/* Opacity */}
                    <div className="inspector-group">
                      <span className="inspector-label">{locale === 'th' ? 'ความโปร่งแสง' : 'Opacity'} ({Math.round((selectedAnn.opacity ?? 1) * 100)}%)</span>
                      <input 
                        type="range" 
                        min="0.1" 
                        max="1" 
                        step="0.05"
                        className="slider-input"
                        value={selectedAnn.opacity ?? 1}
                        onChange={(e) => updateSelectedAnnotation({ opacity: parseFloat(e.target.value) })}
                      />
                    </div>

                    {/* Fine Dimensions */}
                    <div className="inspector-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span className="inspector-label">{locale === 'th' ? 'ความกว้าง (%)' : 'Width (%)'}</span>
                        <input 
                          type="number" 
                          step="0.5" 
                          min="0.5" 
                          max="500"
                          style={{ width: '100%', padding: '4px', fontSize: '11px' }}
                          value={Math.round((selectedAnn.width || 0) * 10) / 10}
                          onChange={(e) => updateSelectedAnnotation({ width: parseFloat(e.target.value) || 1 })}
                        />
                      </div>
                      <div>
                        <span className="inspector-label">{locale === 'th' ? 'ความสูง (%)' : 'Height (%)'}</span>
                        <input 
                          type="number" 
                          step="0.5" 
                          min="0.5" 
                          max="500"
                          style={{ width: '100%', padding: '4px', fontSize: '11px' }}
                          value={Math.round((selectedAnn.height || 0) * 10) / 10}
                          onChange={(e) => updateSelectedAnnotation({ height: parseFloat(e.target.value) || 1 })}
                        />
                      </div>
                    </div>

                    {/* Fine Position */}
                    <div className="inspector-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span className="inspector-label">{locale === 'th' ? 'ตำแหน่ง X (%)' : 'Pos X (%)'}</span>
                        <input 
                          type="number" 
                          step="0.5" 
                          min="0" 
                          max="100"
                          style={{ width: '100%', padding: '4px', fontSize: '11px' }}
                          value={Math.round((selectedAnn.x || 0) * 10) / 10}
                          onChange={(e) => updateSelectedAnnotation({ x: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <span className="inspector-label">{locale === 'th' ? 'ตำแหน่ง Y (%)' : 'Pos Y (%)'}</span>
                        <input 
                          type="number" 
                          step="0.5" 
                          min="0" 
                          max="100"
                          style={{ width: '100%', padding: '4px', fontSize: '11px' }}
                          value={Math.round((selectedAnn.y || 0) * 10) / 10}
                          onChange={(e) => updateSelectedAnnotation({ y: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {sidebarTabRight === 'comments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)', marginBottom: '4px' }}>
                  {locale === 'th' ? 'รายการคำอธิบายประกอบ' : 'ANNOTATIONS LIST'}
                </span>
                {annotations.length === 0 ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    (ไม่มีคำอธิบายหรือรูปภาพ)
                  </span>
                ) : (
                  annotations.map(ann => (
                    <div key={ann.id} className="history-entry-item" onClick={() => setSelectedAnnId(ann.id)} style={{ cursor: 'pointer' }}>
                      <span>[{ann.type.toUpperCase()}] Page {pageOrder.indexOf(ann.pageIndex) + 1}</span>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setAnnotations(prev => prev.filter(a => a.id !== ann.id));
                        if (selectedAnnId === ann.id) setSelectedAnnId(null);
                      }} style={{ color: 'var(--accent-red)' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {sidebarTabRight === 'search' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  {locale === 'th' ? 'ค้นหาข้อความใน PDF' : 'SEARCH PDF TEXT'}
                </span>

                <div className="inspector-group">
                  <input 
                    type="text" 
                    placeholder="พิมพ์คำค้นหา..." 
                    className="text-input" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                  <input 
                    type="checkbox" 
                    id="match-case" 
                    checked={matchCase}
                    onChange={(e) => setMatchCase(e.target.checked)}
                  />
                  <label htmlFor="match-case">Match Case</label>
                  <button className="btn-primary" onClick={executeSearch} style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: '11px' }}>
                    Search
                  </button>
                </div>

                {searchResults.length > 0 ? (
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>ผลการค้นหา:</span>
                    {searchResults.map((r, i) => (
                      <div key={i} className="history-entry-item" onClick={() => setActivePagePos(pageOrder.indexOf(r.page))} style={{ cursor: 'pointer', marginTop: '6px' }}>
                        <span>Page {pageOrder.indexOf(r.page) + 1}: "{r.text}"</span>
                      </div>
                    ))}
                  </div>
                ) : searchQuery && (
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>ไม่มีผลลัพธ์ที่ตรงกัน</span>
                )}
              </div>
            )}

            {sidebarTabRight === 'security' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)' }}>
                  {locale === 'th' ? 'ความปลอดภัยและข้อจำกัด' : 'SECURITY POLICIES'}
                </span>
                <div className="inspector-row">
                  <span className="inspector-key">Encryption Policy</span>
                  <span className="inspector-val" style={{ color: pdfPassword ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                    {pdfPassword ? 'Locked (Password)' : 'None (Open)'}
                  </span>
                </div>
                <div className="inspector-row">
                  <span className="inspector-key">Printing Permission</span>
                  <span className="inspector-val">Allowed</span>
                </div>
                <div className="inspector-row">
                  <span className="inspector-key">Modifying Permission</span>
                  <span className="inspector-val">Allowed</span>
                </div>
              </div>
            )}

            {sidebarTabRight === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-primary)', marginBottom: '4px' }}>
                  {locale === 'th' ? 'ประวัติการดำเนินการ' : 'ACTION LOGS'}
                </span>
                {historyLog.length === 0 ? (
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    (ไม่มีประวัติบันทึกการกระทำ)
                  </span>
                ) : (
                  historyLog.map(item => (
                    <div key={item.id} className="history-entry-item">
                      <span>{item.action}</span>
                      <span className="history-entry-time">{item.time}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>

      </div>

      {/* FOOTER STATUS BAR */}
      <footer className="app-footer-bar">
        <div className="footer-section">
          <button onClick={() => setIsLeftCollapsed(c => !c)}>
            <Sidebar size={16} />
          </button>
          <span>v0.0.103</span>
          <span>|</span>
          <span>Status: <strong>{statusLog}</strong></span>
          <span>|</span>
          <span>Tool: <strong>{activeTool.toUpperCase()}</strong></span>
        </div>

        {currentFile && (
          <div className="footer-section">
            <span>A4: 595 x 842 pt</span>
            <span>|</span>
            <span>Page {activePagePos + 1} of {pageOrder.length}</span>
            <span>|</span>
            <div className="zoom-slider-container">
              <ZoomOut size={12} onClick={() => setZoom(z => Math.max(10, z - 25))} style={{ cursor: 'pointer' }} />
              <input 
                type="range" 
                min="10" 
                max="1000" 
                step="10" 
                className="zoom-slider-bar" 
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value))}
              />
              <select 
                value={zoom} 
                onChange={(e) => setZoom(parseInt(e.target.value))}
                style={{ background: 'none', border: 'none', color: 'inherit', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
              >
                <option value={10}>10%</option>
                <option value={25}>25%</option>
                <option value={50}>50%</option>
                <option value={75}>75%</option>
                <option value={100}>100%</option>
                <option value={125}>125%</option>
                <option value={150}>150%</option>
                <option value={200}>200%</option>
                <option value={300}>300%</option>
                <option value={400}>400%</option>
                <option value={500}>500%</option>
                <option value={750}>750%</option>
                <option value={1000}>1000%</option>
              </select>
              <ZoomIn size={12} onClick={() => setZoom(z => Math.min(1000, z + 50))} style={{ cursor: 'pointer' }} />
            </div>
            <span>|</span>
            <button onClick={() => setIsRightCollapsed(c => !c)}>
              <Sidebar size={16} />
            </button>
          </div>
        )}
      </footer>

      {/* SETTINGS DIALOG MODAL */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="settings-modal-card">
            <div className="modal-header">
              <h2 className="modal-title">{t.common.settings}</h2>
              <button onClick={() => setShowSettingsModal(false)} style={{ fontSize: '18px', fontWeight: 'bold' }}>×</button>
            </div>
            
            <div className="settings-modal-layout">
              <div className="settings-modal-sidebar">
                <button 
                  className={`settings-sidebar-btn ${settingsActiveTab === 'general' ? 'active' : ''}`}
                  onClick={() => setSettingsActiveTab('general')}
                >
                  General
                </button>
                <button 
                  className={`settings-sidebar-btn ${settingsActiveTab === 'appearance' ? 'active' : ''}`}
                  onClick={() => setSettingsActiveTab('appearance')}
                >
                  Appearance
                </button>
                <button 
                  className={`settings-sidebar-btn ${settingsActiveTab === 'advanced' ? 'active' : ''}`}
                  onClick={() => setSettingsActiveTab('advanced')}
                >
                  Advanced
                </button>
              </div>

              <div className="settings-modal-content">
                {settingsActiveTab === 'general' && (
                  <div className="inspector-group">
                    <label className="inspector-label">{locale === 'th' ? 'ภาษาของแอป' : 'App Language'}</label>
                    <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                      <option value="en">English</option>
                      <option value="th">ไทย (Thai)</option>
                    </select>
                    <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      {locale === 'th' ? 'เลือกภาษาที่ใช้แสดงผลในแอปพลิเคชัน' : 'Choose the language used throughout the app.'}
                    </p>
                  </div>
                )}

                {settingsActiveTab === 'appearance' && (
                  <div className="inspector-group">
                    <label className="inspector-label">UI Theme Color</label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <button 
                        className="btn-secondary" 
                        style={{ border: theme === 'light' ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)' }}
                        onClick={() => setTheme('light')}
                      >
                        Light Mode
                      </button>
                      <button 
                        className="btn-secondary" 
                        style={{ border: theme === 'dark' ? '2px solid var(--brand-primary)' : '1px solid var(--border-color)' }}
                        onClick={() => setTheme('dark')}
                      >
                        Dark Mode
                      </button>
                    </div>
                  </div>
                )}

                {settingsActiveTab === 'advanced' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="inspector-group">
                      <label className="inspector-label">Snapshot DPI Quality</label>
                      <select value={settingsDpi} onChange={(e) => setSettingsDpi(parseInt(e.target.value))}>
                        <option value="72">72 DPI (Low)</option>
                        <option value="150">150 DPI (Normal)</option>
                        <option value="300">300 DPI (High Quality)</option>
                      </select>
                    </div>

                    <div className="inspector-group">
                      <label className="inspector-label">Default New Page Dimensions</label>
                      <select value={settingsDefaultPageSize} onChange={(e) => setSettingsDefaultPageSize(e.target.value)}>
                        <option value="a4">A4 (Standard International)</option>
                        <option value="letter">Letter (Standard US)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                      <input 
                        type="checkbox" 
                        id="latin-spacing" 
                        checked={settingsLatinSpacing}
                        onChange={(e) => setSettingsLatinSpacing(e.target.checked)}
                      />
                      <label htmlFor="latin-spacing">Disable word-level space justification</label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowSettingsModal(false)}>
                {t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Digital Signature Drawing Modal */}
      {showSignatureModal && (
        <div className="modal-overlay">
          <div style={{
            background: 'var(--bg-primary)',
            padding: '24px',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)',
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--brand-primary)' }}>
              {locale === 'th' ? 'วาดลายมือชื่อของคุณ' : 'Draw Your Signature'}
            </h3>
            
            <canvas 
              ref={signatureCanvasRef}
              width="370"
              height="180"
              onMouseDown={handleStartSignature}
              onMouseMove={handleDrawSignature}
              onMouseUp={handleEndSignature}
              onMouseLeave={handleEndSignature}
              style={{
                backgroundColor: 'white',
                border: '2px dashed var(--border-color)',
                borderRadius: 'var(--radius-md)',
                cursor: 'crosshair'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setShowSignatureModal(false)}>
                {t.common.cancel}
              </button>
              <button className="btn-secondary" onClick={clearSignature}>
                {locale === 'th' ? 'ล้าง' : 'Clear'}
              </button>
              <button className="btn-primary" onClick={saveSignature}>
                {locale === 'th' ? 'ตกลง' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password input modal */}
      {showPasswordModal && (
        <div className="modal-overlay">
          <div style={{
            background: 'var(--bg-primary)',
            padding: '24px',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)',
            width: '100%',
            maxWidth: '360px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--brand-primary)' }}>
              {t.security.encrypt}
            </h3>

            <div className="inspector-group">
              <label className="inspector-label">{t.security.password}</label>
              <input 
                type="password"
                className="text-input"
                placeholder={locale === 'th' ? 'ป้อนรหัสป้องกัน PDF...' : 'Enter PDF password...'}
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => {
                setShowPasswordModal(false);
                setPdfPassword('');
              }}>
                {t.common.cancel}
              </button>
              <button className="btn-primary" onClick={() => setShowPasswordModal(false)}>
                {locale === 'th' ? 'ตั้งค่ารหัส' : 'Apply Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCR text display modal */}
      {ocrExtractedText && (
        <div className="modal-overlay">
          <div style={{
            background: 'var(--bg-primary)',
            padding: '24px',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-lg)',
            width: '90%',
            maxWidth: '500px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} />
              {locale === 'th' ? 'ผลลัพธ์การรู้จำอักษร (OCR)' : 'OCR Extracted Text'}
            </h3>
            
            <textarea
              readOnly
              value={ocrExtractedText}
              style={{
                width: '100%',
                height: '200px',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                fontSize: '13px',
                resize: 'none',
                outline: 'none',
                fontFamily: 'var(--font-serif)'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                className="btn-secondary" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  navigator.clipboard.writeText(ocrExtractedText);
                  alert(locale === 'th' ? 'คัดลอกข้อความลงคลิปบอร์ดแล้ว' : 'Copied text to clipboard!');
                }}
              >
                <Clipboard size={14} />
                {locale === 'th' ? 'คัดลอกข้อความ' : 'Copy Text'}
              </button>
              <button className="btn-primary" onClick={() => setOcrExtractedText('')}>
                {locale === 'th' ? 'ปิด' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Helper to handle blank page index translation securely
function origPageIdxGetter(idx: number): number {
  return idx;
}
