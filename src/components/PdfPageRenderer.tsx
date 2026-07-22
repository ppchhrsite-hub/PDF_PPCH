import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';

interface PdfPageRendererProps {
  arrayBuffer: ArrayBuffer;
  pageIndex: number;
  zoom: number;
  rotation: number;
  onRenderSuccess?: (width: number, height: number) => void;
}

export const PdfPageRenderer: React.FC<PdfPageRendererProps> = ({
  arrayBuffer,
  pageIndex,
  zoom,
  rotation,
  onRenderSuccess,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    
    const render = async () => {
      if (!canvasRef.current) return;
      setLoading(true);
      setError(null);

      // Cancel any ongoing rendering task to avoid conflicts on the same canvas
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore error
        }
      }

      try {
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdf = await loadingTask.promise;
        
        if (!active) return;
        
        const page = await pdf.getPage(pageIndex + 1);
        
        if (!active || !canvasRef.current) return;

        const scale = (zoom / 100) * 1.3;
        const intrinsicRotation = page.rotate || 0;
        const effectiveRotation = (rotation - intrinsicRotation + 360) % 360;
        const viewport = page.getViewport({ scale, rotation: effectiveRotation });
        const context = canvasRef.current.getContext('2d');
        
        if (!context) {
          throw new Error('Could not get 2d context for canvas');
        }

        const devicePixelRatio = window.devicePixelRatio || 1;
        canvasRef.current.width = viewport.width * devicePixelRatio;
        canvasRef.current.height = viewport.height * devicePixelRatio;
        canvasRef.current.style.width = `${viewport.width}px`;
        canvasRef.current.style.height = `${viewport.height}px`;

        context.scale(devicePixelRatio, devicePixelRatio);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext as any);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        
        if (active && onRenderSuccess) {
          onRenderSuccess(viewport.width, viewport.height);
        }
      } catch (err: any) {
        if (err.name === 'Heading' || err.name === 'RenderingCancelledException') {
          // Ignore cancellation errors as they are expected when input changes rapidly
          return;
        }
        console.error(`Error rendering page ${pageIndex}:`, err);
        if (active) {
          setError('Failed to render page');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    render();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [arrayBuffer, pageIndex, zoom, rotation]);

  return (
    <div style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          zIndex: 2,
        }}>
          <Loader2 className="animate-spin" size={24} color="var(--brand-primary)" />
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--accent-red)',
          fontSize: '12px',
          zIndex: 2,
        }}>
          {error}
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        className="pdf-page-canvas" 
        style={{
          display: 'block',
        }}
      />
    </div>
  );
};
