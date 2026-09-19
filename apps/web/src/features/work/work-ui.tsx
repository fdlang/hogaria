import {
  useEffect,
  useRef,
  useState,
  type DependencyList,
  type FormEvent,
  type ReactNode,
} from "react";
export function message(error: unknown) {
  return (
    (error as { message?: string })?.message ??
    "No se pudo completar la operación"
  );
}
// Clear stale data when scope changes; ignore late responses and unmounted requests.
export function useWorkQuery<T>(load: () => Promise<T>, deps: DependencyList) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setValue(undefined);
    setLoading(true);
    setError("");
    load()
      .then((v) => {
        if (active) setValue(v);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, deps);
  return { value, error, loading };
}
export function WorkForm({
  children,
  onSubmit,
  submit = "Guardar",
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
  submit?: string;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await onSubmit(new FormData(event.currentTarget));
      setSuccess(true);
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={handle} className="work-form">
      <fieldset disabled={busy}>
        {children}
        <button type="submit">{busy ? "Guardando…" : submit}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">Guardado correctamente.</p>}
    </form>
  );
}
export function Field({
  name,
  label,
  type = "text",
  value,
  required = true,
  step,
  min,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  step?: string;
  min?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        step={step}
        min={min}
        maxLength={2000}
      />
    </label>
  );
}
export const val = (data: FormData, key: string) => String(data.get(key) ?? "");
export const num = (data: FormData, key: string) => Number(val(data, key));
export const money = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const when = (iso: string) => new Date(iso).toLocaleString("es-ES");
export function localDate(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 23);
}
export function interval(
  data: FormData,
  original?: { startedAt: string; endedAt: string | null },
) {
  const timestamp = (key: "startedAt" | "endedAt") => {
    const value = val(data, key),
      before = original?.[key];
    // Keep the exact instant if an unchanged local field is in a repeated DST hour.
    if (
      before &&
      Date.parse(value + "Z") === Date.parse(localDate(before) + "Z")
    )
      return before;
    return new Date(value).toISOString();
  };
  return {
    startedAt: timestamp("startedAt"),
    endedAt: timestamp("endedAt"),
    breakMinutes: num(data, "breakMinutes"),
    ...(data.has("breakSeconds")
      ? { breakSeconds: num(data, "breakSeconds") }
      : {}),
    units: num(data, "units"),
    notes: val(data, "notes"),
  };
}
