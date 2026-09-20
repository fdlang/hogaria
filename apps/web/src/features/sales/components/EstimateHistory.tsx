import { useState } from "react";
import { Button } from "@/shared/ui";
import { SalesApi, type EstimateDTO } from "../api/sales.api";
import { EstimateContent, EstimateDocuments } from "./EstimateContent";

export function EstimateHistory({ api, id }: { api: SalesApi; id: number }) {
  const [items, setItems] = useState<EstimateDTO[] | null>(null);
  const [selected, setSelected] = useState<EstimateDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section aria-label="Histórico de versiones">
    <Button small variant="ghost" loading={busy} onClick={async () => {
      if (items) { setItems(null); setSelected(null); return; }
      setBusy(true); setError("");
      try { setItems(await api.history(id)); }
      catch { setError("No se pudo cargar el histórico. Puedes volver a intentarlo."); }
      finally { setBusy(false); }
    }}>{items ? "Ocultar histórico" : "Ver histórico de versiones"}</Button>
    {error && <p role="alert">{error}</p>}
    {items && <><p>Las versiones publicadas se conservan sin modificar.</p>
      {items.length === 0 && <p>Aún no hay versiones publicadas.</p>}
      {items.map(item => <Button key={item.versionActual} small variant="ghost" onClick={() => setSelected(item)}>Versión {item.versionActual}</Button>)}
    </>}
    {selected && <div><h3>Versión {selected.versionActual} · consulta histórica</h3><EstimateDocuments api={api} item={selected} /><EstimateContent item={selected} /></div>}
  </section>;
}
