/**
 * SignatureWizard — PURE presentational component.
 * Business logic lives in useSignatureFlow; this component only renders states.
 *
 * Fixed issues from earlier scaffold:
 *   - imports consolidated to @/shared/ui barrel (no subpath imports)
 *   - side effects (request, setTimeout) moved to useEffect; no side effects
 *     during render (React strict mode would run them twice, causing duplicate
 *     challenge requests which the server rejects via ChallengeActiveError)
 */

import { useEffect, useRef, useState } from "react";
import { useSignatureFlow } from "../hooks/useSignatureFlow";
import { BudgetsApi } from "@/features/budgets/api/budgets.api";
import { Modal, Button, Input, Spinner } from "@/shared/ui";
import { SignatureCanvas, SignatureCanvasHandle } from "./SignatureCanvas";

interface Props {
  open: boolean;
  budgetId: number | null;
  budgetsApi: BudgetsApi;
  onClose: () => void;
  onSigned: () => void;
  consentimiento?: string;
}

const DEFAULT_CONSENT = "Acepto este presupuesto y autorizo el inicio de los trabajos descritos según las condiciones acordadas.";

export function SignatureWizard({ open, budgetId, budgetsApi, onClose, onSigned, consentimiento }: Props) {
  const consent = consentimiento ?? DEFAULT_CONSENT;
  const flow = useSignatureFlow(budgetsApi, consent);
  const [canvasData, setCanvasData] = useState("");
  const [password, setPassword]     = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const canvasRef = useRef<SignatureCanvasHandle>(null);

  // Kick off the challenge request exactly once per open+budget combination.
  // Using effect prevents duplicate requests in Strict Mode.
  useEffect(() => {
    if (open && budgetId != null && flow.state.kind === "idle") {
      flow.request(budgetId);
    }
  }, [open, budgetId, flow]);

  const handleClose = () => {
    flow.reset();
    setCanvasData(""); setPassword(""); setConsentAccepted(false);
    canvasRef.current?.clear();
    onClose();
  };

  // Auto-advance out of the success state. Must be a layout-friendly side effect.
  useEffect(() => {
    if (flow.state.kind !== "done") return;
    const t = setTimeout(() => { handleClose(); onSigned(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.state.kind]);

  return (
    <Modal open={open} onClose={handleClose} title={titleFor(flow.state.kind)} width={560}>
      {(flow.state.kind === "idle" || flow.state.kind === "requesting") && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spinner size={32} />
          <p style={{ marginTop: 14, fontSize: 13, color: "#71685e" }}>Preparando firma segura…</p>
        </div>
      )}

      {flow.state.kind === "drawing" && (
        <>
          <p style={{ fontSize: 13, color: "#71685e", marginBottom: 16 }}>
            Dibuja tu firma en el recuadro. Pulsa <strong>Siguiente</strong> cuando esté lista.
          </p>
          <SignatureCanvas ref={canvasRef} onChange={setCanvasData} width={500} height={180} />
          <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
            <Button disabled={!canvasData} onClick={() => flow.submitCanvas(canvasData)}>Siguiente →</Button>
          </footer>
        </>
      )}

      {flow.state.kind === "confirming" && (
        <>
          <div style={{ marginBottom: 16, padding: 12, background: "#f8efe4", borderRadius: 8, fontSize: 12, color: "#71685e", fontStyle: "italic" }}>
            {consent}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 12, color: "#71685e", cursor: "pointer" }}>
            <input type="checkbox" checked={consentAccepted} onChange={e => setConsentAccepted(e.target.checked)} />
            He leído y acepto el texto del consentimiento.
          </label>

          <Input label="Contraseña" type="password" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} />

          <p style={{ fontSize: 11, color: "#71685e", marginTop: -6, marginBottom: 16 }}>
            Tu contraseña se usa para confirmar tu identidad en el momento de la firma.
            Se hashea con bcrypt; nunca se almacena en claro.
          </p>

          <footer style={{ display: "flex", justifyContent: "space-between" }}>
            <Button variant="ghost" onClick={flow.back}>← Volver</Button>
            <Button disabled={!password || !consentAccepted} onClick={() => flow.submit(password)}>
              ✍ Firmar documento
            </Button>
          </footer>
        </>
      )}

      {flow.state.kind === "signing" && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spinner size={32} />
          <p style={{ marginTop: 14, fontSize: 13, color: "#71685e" }}>Verificando y sellando electrónicamente…</p>
        </div>
      )}

      {flow.state.kind === "done" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 48, color: "#34d399", marginBottom: 12 }}>✓</div>
          <h3 style={{ fontSize: 18, color: "#302d29", marginBottom: 8 }}>Firma completada</h3>
          <p style={{ fontSize: 12, color: "#71685e", marginBottom: 10 }}>Hash del documento:</p>
          <code style={{ display: "block", fontFamily: "monospace", fontSize: 10, color: "#c17248", wordBreak: "break-all", padding: 8, background: "#f8efe4", borderRadius: 6 }}>
            {flow.state.hash}
          </code>
        </div>
      )}

      {flow.state.kind === "error" && (
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 40, color: "#f87171", marginBottom: 10 }}>✕</div>
          <h3 style={{ fontSize: 15, color: "#f87171", marginBottom: 8 }}>No se pudo completar</h3>
          <p style={{ fontSize: 12, color: "#71685e", marginBottom: 20 }}>{flow.state.reason}</p>
          <Button onClick={handleClose}>Cerrar</Button>
        </div>
      )}
    </Modal>
  );
}

function titleFor(kind: string): string {
  switch (kind) {
    case "idle":
    case "requesting": return "Preparando firma…";
    case "drawing":    return "1 · Dibuja tu firma";
    case "confirming": return "2 · Confirma con contraseña";
    case "signing":    return "3 · Procesando";
    case "done":       return "✓ Firmado";
    case "error":      return "Error";
    default:           return "Firma electrónica";
  }
}
