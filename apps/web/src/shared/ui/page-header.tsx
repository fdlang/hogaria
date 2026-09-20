/**
 * PageHeader — consistent page title + subtitle + action slot.
 * Used by every admin/client/profesional page to enforce visual consistency.
 */

import { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <header className="private-page-header">
      <div className="private-page-header__copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="private-page-header__actions">{actions}</div>}
    </header>
  );
}
