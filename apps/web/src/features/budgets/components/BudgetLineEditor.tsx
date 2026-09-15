/**
 * BudgetLineEditor — inline editor for a single partida in the budget form.
 * Pure presentational; all state mutations go through the useBudgetForm handle.
 */

import { Input, Button } from "@/shared/ui";
import { formatMoney } from "@/shared/lib/formatters";
import { PartidaFormState } from "../hooks/useBudgets";

interface Props {
  partida: PartidaFormState;
  globalIva: number;
  index: number;
  errors: Record<string, string>;
  onChange:   (id: string, field: keyof PartidaFormState, value: unknown) => void;
  onRemove:   (id: string) => void;
  onDuplicate?: (id: string) => void;
}

export function BudgetLineEditor({ partida, globalIva, index, errors, onChange, onRemove, onDuplicate }: Props) {
  const effectiveIVA = partida.iva ?? globalIva;
  const base         = (partida.cantidad || 0) * (partida.precioUnit || 0) * (1 - ((partida.descuento || 0) / 100));
  const ivaAmount    = base * (effectiveIVA / 100);

  return (
    <article style={{
      border: "1px solid #d8c4ad", borderRadius: 10, padding: 14, marginBottom: 10, background: "#f8efe4",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {partida.ref && (
            <code style={{ fontSize: 10, background: "#fffaf4", color: "#c17248", padding: "2px 6px", borderRadius: 4 }}>
              {partida.ref}
            </code>
          )}
          <span style={{ fontSize: 11, color: "#71685e" }}>#{index + 1}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onDuplicate && <Button small variant="ghost" onClick={() => onDuplicate(partida.id)} aria-label="Duplicar">⎘</Button>}
          <Button small variant="danger" onClick={() => onRemove(partida.id)} aria-label="Eliminar">✕</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
        <Input
          label="Categoría" value={partida.categoria}
          onChange={e => onChange(partida.id, "categoria", e.target.value)}
        />
        <Input
          label="Descripción" value={partida.descripcion}
          error={errors[`partida-${index}-descripcion`]}
          onChange={e => onChange(partida.id, "descripcion", e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        <Input
          label="Cantidad" type="number" step="0.01" min="0"
          value={partida.cantidad}
          error={errors[`partida-${index}-cantidad`]}
          onChange={e => onChange(partida.id, "cantidad", parseFloat(e.target.value) || 0)}
        />
        <Input
          label="Unidad" value={partida.unidad}
          onChange={e => onChange(partida.id, "unidad", e.target.value)}
        />
        <Input
          label="Precio unit. (€)" type="number" step="0.01" min="0"
          value={partida.precioUnit}
          error={errors[`partida-${index}-precioUnit`]}
          onChange={e => onChange(partida.id, "precioUnit", parseFloat(e.target.value) || 0)}
        />
        <Input
          label="Dto. (%)" type="number" step="1" min="0" max="100"
          value={partida.descuento}
          onChange={e => onChange(partida.id, "descuento", parseFloat(e.target.value) || 0)}
        />
        <div>
          <label htmlFor={`iva-${partida.id}`} style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#71685e", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".07em" }}>
            IVA (%)
          </label>
          <select
            id={`iva-${partida.id}`}
            value={partida.iva == null ? "default" : partida.iva}
            onChange={e => onChange(partida.id, "iva", e.target.value === "default" ? null : parseFloat(e.target.value))}
            style={{ width: "100%", background: "#fffaf4", border: "1px solid #cdb69d", borderRadius: 8, padding: "9px 13px", color: "#302d29", fontSize: 14 }}
          >
            <option value="default">Usar global ({globalIva}%)</option>
            <option value="0">0% — exento</option>
            <option value="4">4% — superreducido</option>
            <option value="10">10% — reducido</option>
            <option value="21">21% — general</option>
          </select>
        </div>
      </div>

      <Input
        label="Nota (opcional)"
        value={partida.nota ?? ""}
        onChange={e => onChange(partida.id, "nota", e.target.value)}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 20, fontSize: 12, color: "#71685e", paddingTop: 8, borderTop: "1px solid #decdb8" }}>
        <span>Base: <strong style={{ color: "#302d29" }}>{formatMoney(base)}</strong></span>
        <span>IVA {effectiveIVA}%: <strong style={{ color: "#302d29" }}>{formatMoney(ivaAmount)}</strong></span>
        <span>Total: <strong style={{ color: "#c17248" }}>{formatMoney(base + ivaAmount)}</strong></span>
      </div>
    </article>
  );
}
