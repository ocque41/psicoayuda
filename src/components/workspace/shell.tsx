import type { ReactNode } from "react";
import { WorkspaceNav, type WorkspaceRole } from "./nav";

export function WorkspaceShell({
  audience,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  audience: WorkspaceRole;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="section workspace-section"
      data-workspace-audience={audience}
    >
      <div className="container workspace-shell">
        <WorkspaceNav audience={audience} />
        <div className="workspace-content">
          <header className="workspace-heading">
            <div>
              <p className="eyebrow">{eyebrow || "Nido · Tu espacio"}</p>
              <h1>{title}</h1>
              {description ? <p className="lead">{description}</p> : null}
            </div>
            {actions ? (
              <div className="workspace-heading-actions">{actions}</div>
            ) : null}
          </header>
          {children}
        </div>
      </div>
    </section>
  );
}
