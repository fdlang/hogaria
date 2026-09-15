/**
 * SignatureCanvas — HTML5 canvas for hand-drawn signatures.
 *
 * Supports mouse + touch + pen input. Emits the canvas data URL via onChange
 * whenever the user finishes a stroke. Parent decides what to do with it.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/shared/ui";

interface Props {
  onChange?: (dataUrl: string) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

export interface SignatureCanvasHandle {
  clear:    () => void;
  getData:  () => string;
  isEmpty:  () => boolean;
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(function SignatureCanvas(
  { onChange, width = 480, height = 160, disabled }, ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  // Imperative handle for parents that need direct access (e.g. to clear)
  useImperativeHandle(ref, () => ({
    clear: () => { clearCanvas(); onChange?.(""); setHasContent(false); },
    getData: () => canvasRef.current?.toDataURL("image/png") ?? "",
    isEmpty: () => !hasContent,
  }), [hasContent, onChange]);

  // Set up canvas on mount — device pixel ratio handling for sharp lines
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = "#302d29";
  }, [width, height]);

  const clearCanvas = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pointerPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    setDrawing(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || disabled) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y); ctx.stroke();
  };

  const onPointerUp = () => {
    if (!drawing) return;
    setDrawing(false); setHasContent(true);
    onChange?.(canvasRef.current?.toDataURL("image/png") ?? "");
  };

  const handleClear = () => {
    clearCanvas(); setHasContent(false); onChange?.("");
  };

  return (
    <div>
      <canvas ref={canvasRef}
        role="img" aria-label="Área para dibujar firma"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          display: "block",
          background: "#fffaf4",
          border: "1px dashed #d8c4ad",
          borderRadius: 8,
          cursor: disabled ? "not-allowed" : "crosshair",
          touchAction: "none", // prevent scrolling on touch devices while drawing
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <Button small variant="ghost" onClick={handleClear} disabled={disabled || !hasContent}>↺ Borrar</Button>
      </div>
    </div>
  );
});
