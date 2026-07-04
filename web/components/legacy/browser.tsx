"use client";

import { useMemo, useState } from "react";
import { Opportunity, Status, STATUS_LABELS } from "@/lib/types";
import { OpportunityCard } from "./opportunity-card";
import StatsBanner from "./stats-banner";

const STATUSES: Status[] = ["CLOSING_SOON", "OPEN", "OPENS_SOON"];

const STATUS_DOT: Record<Status, string> = {
  CLOSING_SOON: "bg-red-500",
  OPEN: "bg-emerald-500",
  OPENS_SOON: "bg-amber-500",
  CLOSED: "bg-zinc-400",
};

export function Browser({
  opportunities,
  statsBannerSrc,
}: {
  opportunities: Opportunity[];
  statsBannerSrc: string | null;
}) {
  const [query, setQuery] = useState("");
  const [activeStatuses, setActiveStatuses] = useState<Set<Status>>(new Set());
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const toggleStatus = (s: Status) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return opportunities
      .filter((o) => o.status !== "CLOSED")
      .filter((o) => (featuredOnly ? o.featured : true))
      .filter((o) =>
        activeStatuses.size === 0 ? true : activeStatuses.has(o.status),
      )
      .filter((o) => {
        if (!q) return true;
        return (
          o.organization.toLowerCase().includes(q) ||
          o.title.toLowerCase().includes(q) ||
          o.type.toLowerCase().includes(q) ||
          o.location.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Featured pinned to top
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        // Closing soon first, then by upcoming deadline ascending, nulls last
        const statusOrder: Record<Status, number> = {
          CLOSING_SOON: 0,
          OPEN: 1,
          OPENS_SOON: 2,
          CLOSED: 3,
        };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        if (a.daysUntilDeadline === null && b.daysUntilDeadline === null)
          return 0;
        if (a.daysUntilDeadline === null) return 1;
        if (b.daysUntilDeadline === null) return -1;
        return a.daysUntilDeadline - b.daysUntilDeadline;
      });
  }, [opportunities, query, activeStatuses, featuredOnly]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      OPEN: 0,
      CLOSING_SOON: 0,
      OPENS_SOON: 0,
      CLOSED: 0,
    };
    for (const o of opportunities) c[o.status]++;
    return c;
  }, [opportunities]);

  const featuredCount = useMemo(
    () => opportunities.filter((o) => o.featured && o.status !== "CLOSED").length,
    [opportunities],
  );

  return (
    <div className="flex flex-col gap-6">
      <StatsBanner statsBannerSrc={statsBannerSrc} compact />

      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by host, hackathon, location…"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:placeholder:text-zinc-600 dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
        />

        <div className="flex flex-wrap gap-2">
          {featuredCount > 0 && (
            <Pill
              active={featuredOnly}
              onClick={() => setFeaturedOnly((v) => !v)}
            >
              ⭐ Featured ({featuredCount})
            </Pill>
          )}
          {STATUSES.map((s) => (
            <Pill
              key={s}
              active={activeStatuses.has(s)}
              onClick={() => toggleStatus(s)}
              dotClass={STATUS_DOT[s]}
            >
              {STATUS_LABELS[s]} ({counts[s]})
            </Pill>
          ))}
          {(activeStatuses.size > 0 || query || featuredOnly) && (
            <button
              onClick={() => {
                setActiveStatuses(new Set());
                setQuery("");
                setFeaturedOnly(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        Showing <span className="font-medium text-zinc-900 dark:text-zinc-100">{filtered.length}</span>{" "}
        {filtered.length === 1 ? "hackathon" : "hackathons"}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          No matches. Try clearing some filters.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  children,
  active,
  onClick,
  dotClass,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  dotClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
          : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {dotClass && (
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden />
      )}
      {children}
    </button>
  );
}
