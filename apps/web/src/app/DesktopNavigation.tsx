import { useEffect, useRef, useState } from "react";
import { isNavigationActive, type NavigationGroup } from "./navigation";

export function DesktopNavigation({ groups, currentPath, grouped }: {
  groups: NavigationGroup[]; currentPath: string; grouped: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => { setOpen(null); }, [currentPath]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <nav ref={navRef} className="private-nav" aria-label="Navegación privada"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(null); }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        navRef.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
        setOpen(null);
      }
    }}>
    {groups.map((group, index) => {
      if (!grouped || group.links.length === 1) return group.links.map(link =>
        <a key={link.to} href={link.to} className="private-nav-link"
          aria-current={isNavigationActive(currentPath, link.to) ? "page" : undefined}>{link.label}</a>);
      const expanded = open === group.label;
      const active = group.links.some(link => isNavigationActive(currentPath, link.to));
      const id = "private-nav-group-" + index;
      return <div className="private-nav-group" key={group.label}>
        <button type="button" className="private-nav-trigger" data-active={active || undefined}
          aria-expanded={expanded} aria-controls={id}
          onClick={() => setOpen(expanded ? null : group.label)}>
          {group.label}<span className="private-nav-chevron" aria-hidden="true" />
        </button>
        <div id={id} className="private-nav-dropdown" hidden={!expanded}>
          {group.links.map(link => <a key={link.to} href={link.to} tabIndex={0}
            aria-current={isNavigationActive(currentPath, link.to) ? "page" : undefined}
            onClick={() => setOpen(null)}>{link.label}</a>)}
        </div>
      </div>;
    })}
  </nav>;
}
