import type { ReactNode } from "react";

/** Top-of-page title block shared by every management view. */
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return <section className="page-title-row">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {children}
  </section>;
}

/** Heading row of a `.panel`: eyebrow, title (h2 or h3), optional description and trailing content. */
export function PanelHeading({ eyebrow, title, description, level = 2, children }: { eyebrow: ReactNode; title: ReactNode; description?: ReactNode; level?: 2 | 3; children?: ReactNode }) {
  const Title = level === 2 ? "h2" : "h3";
  return <div className="panel-heading">
    <div><span className="eyebrow">{eyebrow}</span><Title>{title}</Title>{description && <p>{description}</p>}</div>
    {children}
  </div>;
}

export function SectionHeading({ title, id, description, children }: { title: string; id?: string; description?: string; children?: ReactNode }) {
  return <div className="section-heading">
    <div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>
    {children}
  </div>;
}
