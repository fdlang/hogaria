/**
 * BudgetDetail — read-only view of a saved presupuesto.
 * Used in both admin view-modal and client detail page.
 */

import { BudgetDTO } from "../api/budgets.api";
import { useBudgetCalculator } from "../hooks/useBudgets";
import { Button } from "@/shared/ui";
import { BudgetStatusBadge } from "@/shared/ui/badges";
import { formatMoney, formatDate, formatDateTime } from "@/shared/lib/formatters";

interface Props {
  budget: BudgetDTO;
  clientName: string;
  projectName: string;
  onDownloadPDF: () => void;
  onSign?: () => void;     // only passed from client view
  canSign?: boolean;
}

export function BudgetDetail({ budget, clientName, projectName, onDownloadPDF, onSign, canSign }: Props) {
  const totals = useBudgetCalculator(budget.partidas, budget.ivaDefault);

  return (
    <div>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#f0ede6", marginBottom: 4 }}>{budget.nombre}</h2>
          {budget.referencia && <code style={{ fontSize: 11, color: "#555" }}>{budget.referencia}</code>}
        </div>
        <BudgetStatusBadge estado={budget.estado} />
      </header>

      {/* Metadata grid */}
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, fontSize: 12, marginBottom: 20, padding: 14, background: "#0f0f0d", borderRadius: 8 }}>
        <Meta k="Cliente"    v={clientName} />
        <Meta k="Proyecto"   v={projectName} />
        <Meta k="Creado"     v={formatDate(budget.fechaCreacion)} />
        <Meta k="Enviado"    v={formatDate(budget.fechaEnvio)} />
        <Meta k="Validez"    v={`${budget.validezDias} días`} />
        <Meta k="IVA base"   v={`${budget.ivaDefault}%`} />
      </dl>

      {/* Partidas */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#c8a96e", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>
        Partidas ({budget.partidas.length})
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #2a2a26" }}>
            <th style={thStyle}>Concepto</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Cant.</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Precio</th>
            <th style={{ ...thStyle, textAlign: "right" }}>IVA</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {budget.partidas.map(p => {
            const base = p.cantidad * p.precioUnit * (1 - p.descuento / 100);
            return (
              <tr key={p.id} style={{ borderBottom: "1px solid #1a1a18" }}>
                <td style={tdStyle}>
                  {p.ref && <code style={{ fontSize: 9, background: "#141411", color: "#c8a96e", padding: "1px 5px", borderRadius: 3, marginRight: 6 }}>{p.ref}</code>}
                  <strong style={{ color: "#f0ede6" }}>{p.categoria}</strong> — {p.descripcion}
                  {p.nota && <div style={{ fontStyle: "italic", color: "#555", fontSize: 11, marginTop: 2 }}>↳ {p.nota}</div>}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#f0ede6" }}>{p.cantidad} {p.unidad}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#f0ede6" }}>{formatMoney(p.precioUnit)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#666" }}>{p.iva ?? budget.ivaDefault}%</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#c8a96e", fontWeight: 600 }}>{formatMoney(base)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ marginLeft: "auto", maxWidth: 320, fontSize: 13 }}>
        <Row k="Subtotal" v={formatMoney(totals.subtotal.amount)} />
        {totals.tramos.size > 1
          ? [...totals.tramos.entries()].sort((a, b) => a[0] - b[0]).map(([rate, { iva }]) => (
              <Row key={rate} k={`IVA ${rate}%`} v={formatMoney(iva.amount)} small />
            ))
          : <Row k={`IVA ${budget.ivaDefault}%`} v={formatMoney(totals.iva.amount)} />
        }
        <div style={{ borderTop: "2px solid #c8a96e", marginTop: 8, paddingTop: 8 }}>
          <Row k="TOTAL" v={formatMoney(totals.total.amount)} bold />
        </div>
      </div>

      {/* Terms */}
      {(budget.condicionesPago || budget.garantia || budget.notas) && (
        <section style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #2a2a26", fontSize: 12, color: "#666" }}>
          {budget.condicionesPago && <p><strong style={{ color: "#f0ede6" }}>Pago:</strong> {budget.condicionesPago}</p>}
          {budget.garantia && <p><strong style={{ color: "#f0ede6" }}>Garantía:</strong> {budget.garantia}</p>}
          {budget.notas && <p style={{ marginTop: 6 }}>{budget.notas}</p>}
        </section>
      )}

      {/* Signature panel */}
      {budget.firma && (
        <section style={{ marginTop: 24, padding: 14, border: "1px solid #c8a96e", borderRadius: 8, background: "#c8a96e08" }}>
          <h4 style={{ color: "#c8a96e", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
            ✓ Firmado electrónicamente
          </h4>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 11, color: "#666" }}>
            <dt>Firmante:</dt><dd style={{ color: "#f0ede6" }}>{(budget.firma as { firmante: string }).firmante}</dd>
            <dt>Fecha:</dt>   <dd style={{ color: "#f0ede6" }}>{formatDateTime((budget.firma as { fechaFirma: string }).fechaFirma)}</dd>
            <dt>IP:</dt>      <dd style={{ color: "#f0ede6" }}>{(budget.firma as { ip: string }).ip}</dd>
            <dt>Hash:</dt>    <dd style={{ fontFamily: "monospace", fontSize: 10, wordBreak: "break-all", color: "#f0ede6" }}>{(budget.firma as { hash: string }).hash}</dd>
          </dl>
        </section>
      )}

      {/* Actions */}
      <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24, paddingTop: 16, borderTop: "1px solid #2a2a26" }}>
        <Button variant="ghost" onClick={onDownloadPDF}>↓ Descargar PDF</Button>
        {canSign && onSign && <Button onClick={onSign}>✍ Firmar presupuesto</Button>}
      </footer>
    </div>
  );
}

const thStyle = { padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#555", textTransform: "uppercase" as const, letterSpacing: ".05em", textAlign: "left" as const };
const tdStyle = { padding: "8px 10px", verticalAlign: "top" as const };

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>{k}</dt>
      <dd style={{ color: "#f0ede6", fontSize: 12 }}>{v}</dd>
    </div>
  );
}

function Row({ k, v, bold, small }: { k: string; v: string; bold?: boolean; small?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: small ? 11 : 13, padding: "4px 0" }}>
      <span style={{ color: small ? "#555" : "#666" }}>{k}</span>
      <strong style={{ color: bold ? "#c8a96e" : "#f0ede6", fontWeight: bold ? 700 : 600, fontSize: bold ? 16 : undefined }}>{v}</strong>
    </div>
  );
}
