import { useEffect, useState } from "react";
import { SalesApi, type EstimateDTO } from "../api/sales.api";

export function ClientEstimates({ api }: { api: SalesApi }) {
  const [items, setItems] = useState<EstimateDTO[]>([]); const [error, setError] = useState("");
  useEffect(() => { api.estimates().then(setItems).catch(e => setError(e.message ?? "No se pudieron cargar las propuestas")); }, [api]);
  return <section><p className="eyebrow">Propuestas</p><h1>Mis propuestas</h1>{error && <p role="alert">{error}</p>}{items.length ? items.map(item => <article key={item.id} style={{ padding:"18px 0", borderBottom:"1px solid var(--line)" }}><strong>{item.titulo}</strong><p style={{ margin:"6px 0", color:"#71685e" }}>{item.numero} · versión {item.versionActual} · {item.estado}</p></article>) : <p>Aún no tienes propuestas disponibles.</p>}</section>;
}
