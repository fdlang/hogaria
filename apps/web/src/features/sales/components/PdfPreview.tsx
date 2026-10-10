import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type PdfPreviewProps = {
  blob: Blob;
  onReady: () => void;
  onError: (error: Error) => void;
};

function PdfPage({
  document,
  pageNumber,
  pageWidth,
  totalPages,
  onRendered,
  onError,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  pageWidth: number;
  totalPages: number;
  onRendered: (pageNumber: number) => void;
  onError: (error: Error) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pageWidth <= 0) return;
    let active = true;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;

    void document.getPage(pageNumber).then(loadedPage => {
      if (!active) return;
      page = loadedPage;
      const initialViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pageWidth / initialViewport.width });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      return renderTask.promise;
    }).then(() => {
      if (active) onRendered(pageNumber);
    }).catch(error => {
      if (active && (error as { name?: string })?.name !== "RenderingCancelledException") {
        onError(error instanceof Error ? error : new Error("No se pudo renderizar la página"));
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [document, onError, onRendered, pageNumber, pageWidth]);

  return (
    <canvas
      ref={canvasRef}
      className="estimate-pdf-page"
      role="img"
      aria-label={`Página ${pageNumber} de ${totalPages}`}
    />
  );
}

export function PdfPreview({ blob, onReady, onError }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedPages = useRef(new Set<number>());
  const callbacks = useRef({ onReady, onError });
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageWidth, setPageWidth] = useState(0);

  callbacks.current = { onReady, onError };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setPageWidth(Math.max(1, container.clientWidth - 24));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let loadingTask: ReturnType<(typeof import("pdfjs-dist"))["getDocument"]> | null = null;
    renderedPages.current.clear();
    setDocument(null);

    void blob.arrayBuffer()
      .then(async data => {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        if (!active) return null;
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
        return loadingTask.promise;
      })
      .then(pdf => {
        if (!pdf || !active) return;
        setDocument(pdf);
      })
      .catch(error => {
        if (active) callbacks.current.onError(error instanceof Error ? error : new Error("PDF no válido"));
      });

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [blob]);

  const markRendered = useCallback((pageNumber: number) => {
    if (!document) return;
    renderedPages.current.add(pageNumber);
    if (renderedPages.current.size === document.numPages) callbacks.current.onReady();
  }, [document]);

  const reportError = useCallback((error: Error) => callbacks.current.onError(error), []);

  return (
    <div
      ref={containerRef}
      className="estimate-pdf-viewer"
      aria-label="Vista previa del presupuesto en PDF"
    >
      {document && Array.from({ length: document.numPages }, (_, index) => (
        <PdfPage
          key={index + 1}
          document={document}
          pageNumber={index + 1}
          pageWidth={pageWidth}
          totalPages={document.numPages}
          onRendered={markRendered}
          onError={reportError}
        />
      ))}
    </div>
  );
}
