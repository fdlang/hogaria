import { Button } from "@/shared/ui";

export function CatalogLoadState({ loading, error, reload }: {
  loading: boolean; error: string; reload: () => Promise<void>;
}) {
  if (loading) return <p role="status">Cargando catálogo…</p>;
  if (error) return <div role="alert">
    <p>{error}</p>
    <Button small variant="ghost" onClick={() => void reload()}>Reintentar catálogo</Button>
  </div>;
  return null;
}
