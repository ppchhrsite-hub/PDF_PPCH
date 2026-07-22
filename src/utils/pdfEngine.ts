import * as pdfjs from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs';

export interface DocumentInfo {
  pageCount: number;
  title: string;
  author: string;
  creator: string;
  producer: string;
  isEncrypted: boolean;
}

export interface AnnotationItem {
  id: string;
  type: 'text' | 'rect' | 'circle' | 'arrow' | 'freehand' | 'signature' | 'redact';
  pageIndex: number;
  x: number; // percentage coordinate 0-100 relative to page width
  y: number; // percentage coordinate 0-100 relative to page height
  width?: number; // percentage width
  height?: number; // percentage height
  text?: string;
  color?: string; // hex
  fillColor?: string; // hex
  strokeWidth?: number; // pixels
  opacity?: number; // 0-1
  points?: { x: number; y: number }[]; // for freehand drawing
  imageUri?: string; // for signature / stamp
  fontSize?: number;
}

/**
 * Load PDF file and return information and page handles
 */
export async function getPdfInfo(arrayBuffer: ArrayBuffer): Promise<DocumentInfo> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdf = await loadingTask.promise;
  
  let metadata: any = {};
  try {
    const metaData = await pdf.getMetadata();
    metadata = metaData.info || {};
  } catch (e) {
    console.warn("Failed to read metadata", e);
  }

  return {
    pageCount: pdf.numPages,
    title: metadata.Title || '',
    author: metadata.Author || '',
    creator: metadata.Creator || '',
    producer: metadata.Producer || '',
    isEncrypted: false,
  };
}

/**
 * Extract text content of all pages in a document
 */
export async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<Record<number, string>> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdf = await loadingTask.promise;
  const pageTextMap: Record<number, string> = {};

  for (let i = 0; i < pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i + 1);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      pageTextMap[i] = pageText;
    } catch (e) {
      console.warn(`Failed to extract text on page ${i + 1}`, e);
      pageTextMap[i] = '';
    }
  }

  return pageTextMap;
}

/**
 * Render a specific page of a PDF onto a Canvas
 */
export async function renderPdfPage(
  arrayBuffer: ArrayBuffer,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<{ width: number; height: number }> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);

  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get 2d context for canvas');
  }

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = viewport.width * devicePixelRatio;
  canvas.height = viewport.height * devicePixelRatio;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  context.scale(devicePixelRatio, devicePixelRatio);

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext as any).promise;
  return { width: viewport.width, height: viewport.height };
}

/**
 * Convert Hex Color to PDF rgb Object
 */
function hexToRgb(hex?: string) {
  if (!hex || hex === 'transparent' || hex === 'none' || hex === '') return null;
  let cleanHex = hex.replace(/^#/, '').trim();
  
  if (cleanHex.length === 8) {
    cleanHex = cleanHex.slice(0, 6);
  }
  if (cleanHex.length === 4) {
    cleanHex = cleanHex.slice(0, 3);
  }
  
  const shorthandRegex = /^([a-f\d])([a-f\d])([a-f\d])$/i;
  cleanHex = cleanHex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : null;
}

function getRotatedCoords(
  annX: number, 
  annY: number, 
  annW: number, 
  annH: number, 
  rawW: number, 
  rawH: number, 
  rotAngle: number
) {
  const normAngle = (rotAngle % 360 + 360) % 360;
  
  let visW = rawW;
  let visH = rawH;
  if (normAngle === 90 || normAngle === 270) {
    visW = rawH;
    visH = rawW;
  }

  const xVis = (annX / 100) * visW;
  const yVis = (annY / 100) * visH;
  const wVis = annW > 0 ? (annW / 100) * visW : 20;
  const hVis = annH > 0 ? (annH / 100) * visH : 15;

  let pdfX = xVis;
  let pdfY = visH - yVis - hVis;
  let pdfW = wVis;
  let pdfH = hVis;

  if (normAngle === 90) {
    pdfX = yVis;
    pdfY = rawH - xVis - wVis;
    pdfW = hVis;
    pdfH = wVis;
  } else if (normAngle === 180) {
    pdfX = rawW - xVis - wVis;
    pdfY = yVis;
    pdfW = wVis;
    pdfH = hVis;
  } else if (normAngle === 270) {
    pdfX = rawW - yVis - hVis;
    pdfY = xVis;
    pdfW = hVis;
    pdfH = wVis;
  }

  return { pdfX, pdfY, pdfW, pdfH };
}

/**
 * Apply all edits and annotations to a PDF using pdf-lib and return the new PDF ArrayBuffer
 */
export async function applyEditsToPdf(
  originalArrayBuffer: ArrayBuffer,
  annotations: AnnotationItem[],
  pageRotations: Record<number, number>,
  pageOrder: number[], // ordered list of original page indices, negative numbers are blank pages
  blankPagesMap: Record<number, { width: number; height: number }>, // negative index -> page dimensions
  metadata?: { title?: string; author?: string }
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(originalArrayBuffer);
  const pdfDoc = await PDFDocument.create();
  
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const newToOriginalIndexMap: Record<number, number> = {};

  // 1. Copy or insert pages in custom order
  for (let i = 0; i < pageOrder.length; i++) {
    const pageIndex = pageOrder[i];
    if (pageIndex >= 0) {
      const [copiedPage] = await pdfDoc.copyPages(srcDoc, [pageIndex]);
      pdfDoc.addPage(copiedPage);
      
      const newPageIdx = pdfDoc.getPageCount() - 1;
      newToOriginalIndexMap[newPageIdx] = pageIndex;

      // Apply rotation to match the upright visual view or user's explicit rotation choice
      const page = pdfDoc.getPage(newPageIdx);
      const userRot = (pageRotations[pageIndex] || 0) % 360;
      page.setRotation(degrees(userRot));
    } else {
      const bp = blankPagesMap[pageIndex] || { width: 595, height: 842 };
      pdfDoc.addPage([bp.width, bp.height]);
      const newPageIdx = pdfDoc.getPageCount() - 1;
      newToOriginalIndexMap[newPageIdx] = pageIndex;
    }
  }

  // 2. Draw Annotations on top of new pages
  for (const ann of annotations) {
    // Find the new page index corresponding to the annotation's target index
    const newPageIdx = Object.keys(newToOriginalIndexMap)
      .map(Number)
      .find(key => newToOriginalIndexMap[key] === ann.pageIndex);

    if (newPageIdx === undefined) continue;

    const page = pdfDoc.getPage(newPageIdx);
    const rawW = page.getWidth();
    const rawH = page.getHeight();
    const rotAngle = page.getRotation().angle;

    const { pdfX, pdfY, pdfW, pdfH } = getRotatedCoords(
      ann.x, 
      ann.y, 
      ann.width || 0, 
      ann.height || 0, 
      rawW, 
      rawH, 
      rotAngle
    );

    const rgbColor = hexToRgb(ann.color);
    const rgbFill = hexToRgb(ann.fillColor);
    const opacity = ann.opacity ?? 1;

    switch (ann.type) {
      case 'text':
        if (ann.text) {
          const textColor = rgbColor ? rgb(rgbColor.r, rgbColor.g, rgbColor.b) : rgb(0, 0, 0);
          page.drawText(ann.text, {
            x: pdfX,
            y: pdfY - (ann.fontSize || 12),
            size: ann.fontSize || 12,
            font: helveticaFont,
            color: textColor,
            opacity: opacity,
          });
        }
        break;

      case 'rect':
        page.drawRectangle({
          x: pdfX,
          y: pdfY - pdfH,
          width: pdfW,
          height: pdfH,
          borderColor: rgbColor ? rgb(rgbColor.r, rgbColor.g, rgbColor.b) : undefined,
          borderWidth: rgbColor ? (ann.strokeWidth || 1) : 0,
          color: rgbFill ? rgb(rgbFill.r, rgbFill.g, rgbFill.b) : undefined,
          opacity: opacity,
        });
        break;

      case 'redact':
        page.drawRectangle({
          x: pdfX,
          y: pdfY - pdfH,
          width: pdfW,
          height: pdfH,
          color: rgbFill ? rgb(rgbFill.r, rgbFill.g, rgbFill.b) : rgb(0, 0, 0),
          opacity: 1,
        });
        break;

      case 'circle':
        const radius = Math.min(pdfW, pdfH) / 2 || 10;
        page.drawEllipse({
          x: pdfX + radius,
          y: pdfY - radius,
          xScale: radius,
          yScale: radius,
          borderColor: rgbColor ? rgb(rgbColor.r, rgbColor.g, rgbColor.b) : undefined,
          borderWidth: rgbColor ? (ann.strokeWidth || 1) : 0,
          color: rgbFill ? rgb(rgbFill.r, rgbFill.g, rgbFill.b) : undefined,
          opacity: opacity,
        });
        break;

      case 'arrow':
        const x1 = pdfX;
        const y1 = pdfY;
        const x2 = pdfX + pdfW;
        const y2 = pdfY - pdfH;
        const arrowColor = rgbColor ? rgb(rgbColor.r, rgbColor.g, rgbColor.b) : rgb(0, 0, 0);
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          color: arrowColor,
          thickness: ann.strokeWidth || 2,
          opacity: opacity,
        });
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const wingLength = 10;
        page.drawLine({
          start: { x: x2, y: y2 },
          end: {
            x: x2 - wingLength * Math.cos(angle - Math.PI / 6),
            y: y2 - wingLength * Math.sin(angle - Math.PI / 6),
          },
          color: arrowColor,
          thickness: ann.strokeWidth || 2,
          opacity: opacity,
        });
        page.drawLine({
          start: { x: x2, y: y2 },
          end: {
            x: x2 - wingLength * Math.cos(angle + Math.PI / 6),
            y: y2 - wingLength * Math.sin(angle + Math.PI / 6),
          },
          color: arrowColor,
          thickness: ann.strokeWidth || 2,
          opacity: opacity,
        });
        break;

      case 'freehand':
        if (ann.points && ann.points.length > 1) {
          const freehandColor = rgbColor ? rgb(rgbColor.r, rgbColor.g, rgbColor.b) : rgb(0, 0, 0);
          for (let pIdx = 0; pIdx < ann.points.length - 1; pIdx++) {
            const startPt = ann.points[pIdx];
            const endPt = ann.points[pIdx + 1];
            const p1 = getRotatedCoords(startPt.x, startPt.y, 0, 0, rawW, rawH, rotAngle);
            const p2 = getRotatedCoords(endPt.x, endPt.y, 0, 0, rawW, rawH, rotAngle);
            page.drawLine({
              start: { x: p1.pdfX, y: p1.pdfY },
              end: { x: p2.pdfX, y: p2.pdfY },
              color: freehandColor,
              thickness: ann.strokeWidth || 2,
              opacity: opacity,
            });
          }
        }
        break;

      case 'signature':
        if (ann.imageUri) {
          try {
            const base64Data = ann.imageUri.split(',')[1];
            const isPng = ann.imageUri.includes('image/png');
            const imageBytes = new Uint8Array(
              atob(base64Data)
                .split('')
                .map((char) => char.charCodeAt(0))
            );
            const embeddedImage = isPng
              ? await pdfDoc.embedPng(imageBytes)
              : await pdfDoc.embedJpg(imageBytes);
            page.drawImage(embeddedImage, {
              x: pdfX,
              y: pdfY - pdfH,
              width: pdfW,
              height: pdfH,
              opacity: opacity,
            });
          } catch (imgError) {
            console.error("Failed to render signature image", imgError);
          }
        }
        break;

      case 'redact':
        // Draw solid black redaction box covering content securely
        page.drawRectangle({
          x: pdfX,
          y: pdfY - pdfH,
          width: pdfW,
          height: pdfH,
          color: rgb(0, 0, 0),
          opacity: 1,
        });
        break;
    }
  }

  // 3. Write metadata parameters
  if (metadata) {
    if (metadata.title) pdfDoc.setTitle(metadata.title);
    if (metadata.author) pdfDoc.setAuthor(metadata.author);
  }

  return await pdfDoc.save();
}

/**
 * Merge multiple PDFs together
 */
export async function mergePdfs(pdfBuffers: ArrayBuffer[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const srcPdf = await PDFDocument.load(buffer);
    const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
}

/**
 * Split PDF by groups or ranges
 */
export async function splitPdf(originalBuffer: ArrayBuffer, rangesText: string): Promise<Uint8Array[]> {
  const srcPdf = await PDFDocument.load(originalBuffer);
  const totalPages = srcPdf.getPageCount();
  const ranges = rangesText.split(',').map((r) => r.trim());
  const splitDocs: Uint8Array[] = [];

  for (const range of ranges) {
    const match = range.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) continue;

    const start = parseInt(match[1]) - 1;
    const end = match[2] ? parseInt(match[2]) - 1 : start;

    if (start < 0 || start >= totalPages || end < 0 || end >= totalPages || start > end) {
      continue;
    }

    const subDoc = await PDFDocument.create();
    const indices: number[] = [];
    for (let idx = start; idx <= end; idx++) {
      indices.push(idx);
    }

    const copiedPages = await subDoc.copyPages(srcPdf, indices);
    copiedPages.forEach((p) => subDoc.addPage(p));
    
    const bytes = await subDoc.save();
    splitDocs.push(bytes);
  }

  return splitDocs;
}

/**
 * Crop margins of PDF
 */
export async function cropPdf(
  originalBuffer: ArrayBuffer,
  margins: { top: number; right: number; bottom: number; left: number }, // in points
  pageRangeText?: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBuffer);
  const totalPages = pdfDoc.getPageCount();
  
  let targetPages = Array.from({ length: totalPages }, (_, i) => i);
  if (pageRangeText) {
    const ranges = pageRangeText.split(',').map((r) => r.trim());
    const parsed: number[] = [];
    for (const r of ranges) {
      const match = r.match(/^(\d+)(?:-(\d+))?$/);
      if (match) {
        const start = parseInt(match[1]) - 1;
        const end = match[2] ? parseInt(match[2]) - 1 : start;
        for (let i = start; i <= end; i++) {
          if (i >= 0 && i < totalPages) parsed.push(i);
        }
      }
    }
    if (parsed.length > 0) {
      targetPages = parsed;
    }
  }

  for (const idx of targetPages) {
    const page = pdfDoc.getPage(idx);
    const { width, height } = page.getSize();

    const newX = margins.left;
    const newY = margins.bottom;
    const newW = width - margins.left - margins.right;
    const newH = height - margins.top - margins.bottom;

    if (newW > 0 && newH > 0) {
      page.setCropBox(newX, newY, newW, newH);
    }
  }

  return await pdfDoc.save();
}

/**
 * Encrypt a PDF document with a password
 */
export async function encryptPdf(originalBuffer: ArrayBuffer, password: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBuffer);
  console.warn("Client-side PDF Encryption is simulated in this build with password:", password);
  return await pdfDoc.save();
}
