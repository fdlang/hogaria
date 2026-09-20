import type { EstimateDTO } from "./api/sales.api";
export const estimateStatus = (state: string) =>
  ({
    borrador: "Borrador",
    en_revision: "En revisión",
    actualizando: "Actualización en preparación",
    enviado: "Enviado",
    firmado: "Firmado",
    aceptado: "Convertido en proyecto",
    rechazado: "Cambios solicitados",
    caducado: "Caducado",
  })[state] ?? state;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
export function filterEstimates(
  items: EstimateDTO[],
  query: string,
  status: string,
) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return items.filter(
    (e) =>
      (!status || e.estado === status) &&
      words.every((word) =>
        normalize(
          [
            e.numero,
            e.titulo,
            e.propuesta?.referencia ?? "",
            estimateStatus(e.estado),
          ].join(" "),
        ).includes(word),
      ),
  );
}
