/**
 * Notifications — toast system with proper timer cleanup.
 *
 * The original had a memory leak (setTimeout references lost on unmount).
 * This version tracks timers in a ref and clears them all on unmount.
 */

import { createContext, useContext, useRef, useState, useCallback, useEffect, ReactNode } from "react";

export type NotifType = "info" | "success" | "warn" | "error";
export interface Notif { id: string; message: string; type: NotifType }

interface Ctx {
  notifications: ReadonlyArray<Notif>;
  push: (message: string, type?: NotifType) => string;
  dismiss: (id: string) => void;
}

const NotifContext = createContext<Ctx | null>(null);

export function NotificationsProvider({ children, ttl = 5000 }: { children: ReactNode; ttl?: number }) {
  const [items, setItems] = useState<Notif[]>([]);
  const timers = useRef<Record<string, number>>({});

  const dismiss = useCallback((id: string) => {
    setItems(list => list.filter(n => n.id !== id));
    const t = timers.current[id];
    if (t != null) { clearTimeout(t); delete timers.current[id]; }
  }, []);

  const push = useCallback((message: string, type: NotifType = "info"): string => {
    const id = crypto.randomUUID();
    setItems(list => [...list, { id, message, type }]);
    timers.current[id] = window.setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss, ttl]);

  // Critical: clear ALL timers on unmount to prevent memory leaks in React Strict Mode
  useEffect(() => () => {
    Object.values(timers.current).forEach(t => clearTimeout(t));
    timers.current = {};
  }, []);

  return (
    <NotifContext.Provider value={{ notifications: items, push, dismiss }}>
      {children}
      <NotificationStack items={items} onDismiss={dismiss} />
    </NotifContext.Provider>
  );
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotifContext);
  if (!ctx) throw new Error("useNotifications must be used within <NotificationsProvider>");
  return ctx;
}

function NotificationStack({ items, onDismiss }: { items: Notif[]; onDismiss: (id: string) => void }) {
  const colorFor: Record<NotifType, string> = { info: "#60a5fa", success: "#34d399", warn: "#fbbf24", error: "#f87171" };
  return (
    <div className="notification-stack" role="region" aria-live="polite" aria-label="Notificaciones"
      style={{ position: "fixed", top: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 3000, maxWidth: 360 }}>
      {items.map(n => (
        <div key={n.id} role="status"
          style={{ padding: "10px 14px", background: "#fffaf4", border: `1px solid ${colorFor[n.type]}`, borderRadius: 8, color: "#302d29", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{n.message}</span>
          <button aria-label="Descartar" onClick={() => onDismiss(n.id)}
            style={{ background: "none", border: "none", color: "#71685e", cursor: "pointer" }}>✕</button>
        </div>
      ))}
    </div>
  );
}
