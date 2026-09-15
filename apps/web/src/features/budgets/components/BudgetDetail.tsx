/**
 * BudgetDetail — read-only view of a saved presupuesto.
 * Used in both admin view-modal and client detail page.
 */

import { BudgetDTO } from "../api/budgets.api";
import type { ReactNode } from "react";
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
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#302d29", marginBottom: 4 }}>{budget.nombre}</h2>
          {budget.referencia && <code style={{ fontSize: 12, color: "#71685e" }}>{budget.referencia}</code>}
        </div>
        <BudgetStatusBadge estado={budget.estado} />
      </header>

      {/* Metadata grid */}
      <dl className="budget-detail-meta" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, fontSize: 12, marginBottom: 20, padding: 14, background: "#f8efe4", borderRadius: 8 }}>
        <Meta k="Cliente"    v={clientName} />
        <Meta k="Proyecto"   v={projectName} />
        <Meta k="Creado"     v={formatDate(budget.fechaCreacion)} />
        <Meta k="Enviado"    v={formatDate(budget.fechaEnvio)} />
        <Meta k="Validez"    v={`${budget.validezDias} días`} />
        <Meta k="IVA base"   v={`${budget.ivaDefault}%`} />
      </dl>

      {/* Partidas */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#c17248", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>
        Partidas ({budget.partidas.length})
      </h3>
      <div className="private-table-scroll"><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #d8c4ad" }}>
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
              <tr key={p.id} style={{ borderBottom: "1px solid #decdb8" }}>
                <td style={tdStyle}>
                  {p.ref && <code style={{ fontSize: 12, background: "#fffaf4", color: "#c17248", padding: "1px 5px", borderRadius: 3, marginRight: 6 }}>{p.ref}</code>}
                  <strong style={{ color: "#302d29" }}>{p.categoria}</strong> — {p.descripcion}
                  {p.nota && <div style={{ fontStyle: "italic", color: "#71685e", fontSize: 12, marginTop: 2 }}>↳ {p.nota}</div>}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#302d29" }}>{p.cantidad} {p.unidad}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#302d29" }}>{formatMoney(p.precioUnit)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#71685e" }}>{p.iva ?? budget.ivaDefault}%</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#c17248", fontWeight: 600 }}>{formatMoney(base)}</td>
              </tr>
            );
          }) as ReactNode}
        </tbody>
      </table></div>

      {/* Totals */}
      <div style={{ marginLeft: "auto", maxWidth: 320, fontSize: 13 }}>
        <Row k="Subtotal" v={formatMoney(totals.subtotal.amount)} />
        {totals.tramos.size > 1
          ? [...totals.tramos.entries()].sort((a, b) => a[0] - b[0]).map(([rate, { iva }]) => (
              <Row key={rate} k={`IVA ${rate}%`} v={formatMoney(iva.amount)} small />
            ))
          : <Row k={`IVA ${budget.ivaDefault}%`} v={formatMoney(totals.iva.amount)} />
        }
        <div style={{ borderTop: "2px solid #c17248", marginTop: 8, paddingTop: 8 }}>
          <Row k="TOTAL" v={formatMoney(totals.total.amount)} bold />
        </div>
      </div>

      {/* Terms */}
      {(budget.condicionesPago || budget.garantia || budget.notas) && (
        <section style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #d8c4ad", fontSize: 12, color: "#71685e" }}>
          {budget.condicionesPago && <p><strong style={{ color: "#302d29" }}>Pago:</strong> {budget.condicionesPago}</p>}
          {budget.garantia && <p><strong style={{ color: "#302d29" }}>Garantía:</strong> {budget.garantia}</p>}
          {budget.notas && <p style={{ marginTop: 6 }}>{budget.notas}</p>}
        </section>
      )}

      {/* Signature panel */}
      {budget.firma && (
        <section style={{ marginTop: 24, padding: 14, border: "1px solid #c17248", borderRadius: 8, background: "#c1724808" }}>
          <h4 style={{ color: "#c17248", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>
            ✓ Firmado electrónicamente
          </h4>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12, color: "#71685e" }}>
            <dt>Firmante:</dt><dd style={{ color: "#302d29" }}>{budget.firma.firmante}</dd>
            <dt>Fecha:</dt>   <dd style={{ color: "#302d29" }}>{formatDateTime(budget.firma.fechaFirma)}</dd>
            <dt>IP:</dt>      <dd style={{ color: "#302d29" }}>{budget.firma.ip}</dd>
            <dt>Hash:</dt>    <dd style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", color: "#302d29" }}>{budget.firma.hash}</dd>
          </dl>
        </section>
      )}

      {/* Actions */}
      <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24, paddingTop: 16, borderTop: "1px solid #d8c4ad" }}>
        <Button variant="ghost" onClick={onDownloadPDF}>↓ Descargar PDF</Button>
        {canSign && onSign && <Button onClick={onSign}>✍ Firmar presupuesto</Button>}
      </footer>
    </div>
  );
}

const thStyle = { padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#71685e", textTransform: "uppercase" as const, letterSpacing: ".05em", textAlign: "left" as const };
const tdStyle = { padding: "8px 10px", verticalAlign: "top" as const };

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt style={{ fontSize: 12, color: "#71685e", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 }}>{k}</dt>
      <dd style={{ color: "#302d29", fontSize: 12 }}>{v}</dd>
    </div>
  );
}

function Row({ k, v, bold, small }: { k: string; v: string; bold?: boolean; small?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: small ? 11 : 13, padding: "4px 0" }}>
      <span style={{ color: small ? "#71685e" : "#71685e" }}>{k}</span>
      <strong style={{ color: bold ? "#c17248" : "#302d29", fontWeight: bold ? 700 : 600, fontSize: bold ? 16 : undefined }}>{v}</strong>
    </div>
  );
}
