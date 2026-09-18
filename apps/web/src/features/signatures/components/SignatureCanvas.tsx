import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/shared/ui";

interface Props { onChange?: (dataUrl: string) => void; width?: number; height?: number; disabled?: boolean; }
export interface SignatureCanvasHandle { clear: () => void; getData: () => string; isEmpty: () => boolean; }

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(function SignatureCanvas({ onChange, width: requestedWidth = 480, height = 160, disabled }, ref) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [width, setWidth] = useState(requestedWidth);

  useEffect(() => {
    const element = wrapperRef.current; if (!element) return;
    const resize = () => setWidth(Math.max(240, Math.min(requestedWidth, Math.floor(element.getBoundingClientRect().width))));
    resize(); const observer = new ResizeObserver(resize); observer.observe(element); return () => observer.disconnect();
  }, [requestedWidth]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const context = canvas.getContext("2d"); if (!context) return;
    context.scale(ratio, ratio); context.lineWidth = 2; context.lineCap = "round"; context.lineJoin = "round"; context.strokeStyle = "#302d29";
  }, [width, height]);
  const clear = () => { const canvas = canvasRef.current; const context = canvas?.getContext("2d"); if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height); setHasContent(false); onChange?.(""); };
  useImperativeHandle(ref, () => ({ clear, getData: () => canvasRef.current?.toDataURL("image/png") ?? "", isEmpty: () => !hasContent }), [hasContent]);
  const position = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); const context = canvasRef.current?.getContext("2d"); if (!context) return; const point = position(event); context.beginPath(); context.moveTo(point.x, point.y); setDrawing(true); };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing || disabled) return; const context = canvasRef.current?.getContext("2d"); if (!context) return; const point = position(event); context.lineTo(point.x, point.y); context.stroke(); };
  const finish = () => { if (!drawing) return; setDrawing(false); setHasContent(true); onChange?.(canvasRef.current?.toDataURL("image/png") ?? ""); };

  return <div ref={wrapperRef} style={{ width: "100%" }}>
    <canvas ref={canvasRef} aria-label="Firma manuscrita" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} style={{ display:"block", width:"100%", height, background:"#fffaf4", border:"1px dashed #d8c4ad", borderRadius:8, cursor:disabled ? "not-allowed" : "crosshair", touchAction:"none", opacity:disabled ? .5 : 1 }} />
    <p style={{ margin:"6px 0", color:"#71685e", fontSize:12 }}>Dibuja tu firma con el dedo, lápiz o ratón.</p>
    <div style={{ display:"flex", justifyContent:"flex-end" }}><Button small variant="ghost" onClick={clear} disabled={disabled || !hasContent}>Borrar firma</Button></div>
  </div>;
});
