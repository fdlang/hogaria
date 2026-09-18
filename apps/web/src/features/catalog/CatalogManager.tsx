import { useEffect, useState } from "react";
import { Button } from "@/shared/ui";
import { formatMoney } from "@/shared/lib/formatters";
import { SalesApi, type CatalogItemDTO } from "@/features/sales/api/sales.api";

type Form = { reference: string; category: string; description: string; unit: string; salePrice: string; vatRate: string };
const blank = (): Form => ({ reference: "", category: "", description: "", unit: "ud", salePrice: "", vatRate: "21" });

export function CatalogManager({ api }: { api: SalesApi }) {
  const [items, setItems] = useState<CatalogItemDTO[]>([]); const [form, setForm] = useState<Form>(blank); const [editing, setEditing] = useState<number | null>(null); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const load = async () => { try { setItems(await api.adminCatalog()); } catch (cause) { setError((cause as { message?: string }).message ?? "No se pudo cargar el catálogo"); } };
  useEffect(() => { void load(); }, []);
  const set = (field: keyof Form, value: string) => setForm(current => ({ ...current, [field]: value }));
  const submit = async () => {
    const payload = { reference: form.reference, category: form.category, description: form.description, unit: form.unit, salePrice: Number(form.salePrice), vatRate: Number(form.vatRate) };
    try { setSaving(true); setError(""); if (editing == null) await api.createCatalogItem(payload); else await api.updateCatalogItem(editing, payload); setForm(blank()); setEditing(null); await load(); } catch (cause) { setError((cause as { message?: string }).message ?? "No se pudo guardar la partida"); } finally { setSaving(false); }
  };
  const edit = (item: CatalogItemDTO) => { setEditing(item.id); setForm({ reference: item.reference, category: item.category, description: item.description, unit: item.unit, salePrice: String(item.salePrice), vatRate: String(item.vatRate) }); };
  const archive = async (item: CatalogItemDTO) => { if (!item.active || !window.confirm(`¿Archivar ${item.reference}? Dejará de aparecer al crear propuestas.`)) return; try { await api.archiveCatalogItem(item.id); await load(); } catch (cause) { setError((cause as { message?: string }).message ?? "No se pudo archivar la partida"); } };
  return <section><header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", marginBottom: 24 }}><div><p className="eyebrow">Administración</p><h1 style={{ margin: 0 }}>Catálogo de partidas</h1><p style={{ color: "#71685e" }}>Solo administradores. Archivar conserva el histórico de propuestas.</p></div><Button small variant="ghost" onClick={() => void load()}>Actualizar</Button></header>
    <section className="sales-card"><h2>{editing == null ? "Nueva partida" : "Editar partida"}</h2>{error && <p role="alert" style={{ color: "#a43c32" }}>{error}</p>}<div className="estimate-line__main"><label>Referencia *<input value={form.reference} onChange={e => set("reference", e.target.value)} placeholder="DEM-007" /></label><label>Categoría *<input value={form.category} onChange={e => set("category", e.target.value)} placeholder="Demoliciones" /></label><label>Descripción *<input value={form.description} onChange={e => set("description", e.target.value)} /></label><label>Unidad *<input value={form.unit} onChange={e => set("unit", e.target.value)} /></label><label>Precio sin IVA *<input type="number" min="0" step="0.01" value={form.salePrice} onChange={e => set("salePrice", e.target.value)} /></label><label>IVA (%) *<input type="number" min="0" max="100" value={form.vatRate} onChange={e => set("vatRate", e.target.value)} /></label></div><div style={{ display: "flex", gap: 8, marginTop: 16 }}><Button loading={saving} onClick={() => void submit()}>{editing == null ? "Crear partida" : "Guardar cambios"}</Button>{editing != null && <Button variant="ghost" onClick={() => { setEditing(null); setForm(blank()); }}>Cancelar</Button>}</div></section>
    <section className="sales-card sales-card--wide"><h2>Partidas registradas</h2><div className="private-table-scroll"><table><thead><tr><th>Ref.</th><th>Partida</th><th>Precio</th><th>Estado</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.id} style={{ opacity: item.active ? 1 : .55 }}><td><code>{item.reference}</code></td><td><strong>{item.description}</strong><br/><small>{item.category} · {item.unit} · IVA {item.vatRate}%</small></td><td>{formatMoney(item.salePrice)}</td><td>{item.active ? "Activa" : "Archivada"}</td><td><div style={{ display: "flex", gap: 8 }}><Button small variant="ghost" onClick={() => edit(item)}>Editar</Button>{item.active && <Button small variant="ghost" onClick={() => void archive(item)}>Archivar</Button>}</div></td></tr>)}</tbody></table></div></section>
  </section>;
}
