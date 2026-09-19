import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogItemDTO, SalesApi } from "@/features/sales/api/sales.api";

export function useCatalog(api: SalesApi, includeInactive = false) {
  const [items, setItems] = useState<CatalogItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    setItems([]);
    try {
      const result = await (includeInactive ? api.adminCatalog() : api.catalog());
      if (!Array.isArray(result)) throw new Error("Respuesta de catálogo inválida");
      if (id === request.current) setItems(result);
    } catch {
      if (id === request.current) setError("No se pudo cargar el catálogo. Inténtalo de nuevo.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [api, includeInactive]);
  useEffect(() => {
    void reload();
    return () => { ++request.current; };
  }, [reload]);
  return { items, loading, error, reload };
}
