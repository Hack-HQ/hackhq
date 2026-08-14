import type { ReactNode } from "react";

import { CONTACT_EMAIL } from "@/lib/contact-email";

/* ---------------------------------------------------------------------------
   Shared building blocks for the legal pages (/privacy and /terms).

   Same register as the resources page: full-width shells alternating
   bg-ink / bg-ink-soft, a coral kicker per section, display headings, and
   short scannable copy instead of a wall of grey legalese. Server components
   only - nothing here needs client JS.
--------------------------------------------------------------------------- */

export function LegalHero({
  kicker,
  title,
  intro,
  effectiveDate,
}: {
  kicker: string;
  title: ReactNode;
  intro: ReactNode;
  effectiveDate: string;
}) {
  return (
    <section className="p-2 pt-0">
      <div className="shell bg-ink px-6 py-16 sm:px-12 sm:py-24">
        <div className="kicker text-coral">{kicker}</div>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2rem,6vw,4.2rem)] text-paper">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-paper/60 sm:text-base">
          {intro}
        </p>
        <div className="kicker mt-8 text-paper/40">
          Effective {effectiveDate}
        </div>
      </div>
    </section>
  );
}

/** One numbered section shell. `index` is 1-based and drives the kicker. */
export function LegalSection({
  index,
  kicker,
  title,
  children,
}: {
  index: number;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  const soft = index % 2 === 1;
  return (
    <section className="p-2 pt-0">
      <div
        className={`shell px-6 py-14 sm:px-12 sm:py-20 ${
          soft ? "bg-ink-soft" : "bg-ink"
        }`}
      >
        <div className="kicker text-coral">
          {String(index).padStart(2, "0")} · {kicker}
        </div>
        <h2 className="display mt-3 text-[clamp(1.5rem,3.5vw,2.6rem)] text-paper">
          {title}
        </h2>
        <div className="mt-6 max-w-2xl space-y-5 text-sm leading-relaxed text-paper/70">
          {children}
        </div>
      </div>
    </section>
  );
}

/** A mono sub-label inside a section, for grouping without another heading. */
export function LegalLabel({ children }: { children: ReactNode }) {
  return <div className="kicker pt-4 text-paper/40 first:pt-0">{children}</div>;
}

/** Coral-dot bullet list, same rhythm as the resources tips. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-paper/80">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The one thing readers must not miss - a coral-edged callout. */
export function LegalCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-coral/40 bg-coral/5 px-5 py-4 text-sm leading-relaxed text-paper/85">
      {children}
    </div>
  );
}

/** Name / role rows for the third-party roster - the LinkRow rhythm. */
export function LegalRows({
  rows,
}: {
  rows: { name: string; when: string; role: ReactNode }[];
}) {
  return (
    <ul className="divide-y divide-white/8 border-y border-white/8">
      {rows.map((row) => (
        <li
          key={row.name}
          className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6"
        >
          <div className="w-40 shrink-0">
            <div className="text-sm font-medium text-paper">{row.name}</div>
            <div className="kicker mt-1 text-[9px] text-paper/35">
              {row.when}
            </div>
          </div>
          <p className="text-sm leading-relaxed text-paper/55">{row.role}</p>
        </li>
      ))}
    </ul>
  );
}

/** Single-sourced from lib/contact-email so the legal pages can never drift
    from the address the rest of the site uses. */
export function ContactLink() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="text-coral underline-offset-4 hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  );
}
