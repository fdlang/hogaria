import { useEffect, useRef, useState } from "react";
import { Button, Input, Modal } from "@/shared/ui";
import { SignatureCanvas, type SignatureCanvasHandle } from "@/features/signatures/components/SignatureCanvas";
import { SalesApi, type EstimateDTO } from "../api/sales.api";

const consent = "Acepto la propuesta mostrada y autorizo el inicio de los trabajos descritos en sus condiciones.";
export function ClientEstimates({ api }: { api: SalesApi }) {
  const [items, setItems] = useState<EstimateDTO[]>([]); const [error, setError] = useState(""); const [selected, setSelected] = useState<EstimateDTO | null>(null); const [signature, setSignature] = useState(""); const [password, setPassword] = useState(""); const [accepted, setAccepted] = useState(false); const [saving, setSaving] = useState(false); const canvas = useRef<SignatureCanvasHandle>(null);
  const refresh = () => api.estimates().then(setItems).catch(e => setError(e.message ?? "No se pudieron cargar las propuestas"));
  useEffect(() => { void refresh(); }, []);
  const close = () => { setSelected(null); setSignature(""); setPassword(""); setAccepted(false); canvas.current?.clear(); };
  const sign = async () => { if (!selected || !signature || !password || !accepted) return; try { setSaving(true); const result = await api.signEstimate(selected.id, { password, canvasSignature: signature, consentimiento: consent }); setItems(items.map(item => item.id === result.estimate.id ? result.estimate : item)); close(); } catch (e) { setError((e as { message?: string }).message ?? "No se pudo firmar la propuesta"); } finally { setSaving(false); } };
  return <section><p className="eyebrow">Propuestas</p><h1>Mis propuestas</h1>{error && <p role="alert">{error}</p>}{items.length ? items.map(item => <article key={item.id} style={{ padding:"18px 0", borderBottom:"1px solid var(--line)", display:"flex", justifyContent:"space-between", gap:16 }}><div><strong>{item.titulo}</strong><p style={{ margin:"6px 0", color:"#71685e" }}>{item.numero} · versión {item.versionActual} · {item.estado}</p></div>{item.estado === "enviado" && <Button onClick={() => setSelected(item)}>Firmar propuesta</Button>}</article>) : <p>Aún no tienes propuestas disponibles.</p>}
    <Modal open={selected !== null} onClose={close} title="Firma de propuesta" width={620}><p style={{ color:"#71685e" }}>Dibuja tu firma, acepta el consentimiento y confirma tu contraseña. La versión enviada quedará sellada y no podrá modificarse.</p><SignatureCanvas ref={canvas} onChange={setSignature} width={540} height={170}/><label style={{ display:"flex", gap:8, margin:"16px 0", fontSize:13 }}><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>{consent}</label><Input label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/><footer style={{ display:"flex", justifyContent:"space-between", marginTop:20 }}><Button variant="ghost" onClick={close}>Cancelar</Button><Button disabled={!signature || !password || !accepted} loading={saving} onClick={() => void sign()}>Firmar y aceptar</Button></footer></Modal>
  </section>;
}
