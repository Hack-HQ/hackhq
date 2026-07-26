import {
  isActiveHackathon,
  type Hackathon,
  type HackState,
} from "./types-hq";

export type DeckStatusFilter = "all" | HackState;
export type DeckFormatFilter = "all" | "In-Person" | "Virtual";

/**
 * Active listings for the deck list. When every filter is at its default,
 * featured hackathons float to the top; any status/format/search query keeps
 * the upstream relative order (state + daysLeft from loadHackathons).
 */
export function filterDeckHackathons(
  hackathons: Hackathon[],
  opts: { q: string; status: DeckStatusFilter; format: DeckFormatFilter },
): Hackathon[] {
  const needle = opts.q.trim().toLowerCase();
  const filtered = hackathons.filter(isActiveHackathon).filter((h) => {
    if (opts.status !== "all" && h.state !== opts.status) return false;
    if (opts.format !== "all" && h.format !== opts.format) return false;
    if (!needle) return true;
    return [h.title, h.host, h.location, ...h.themes]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const defaults =
    opts.status === "all" && opts.format === "all" && needle === "";
  if (!defaults) return filtered;

  // Stable: featured first, otherwise leave loadHackathons order intact.
  return [...filtered].sort(
    (a, b) => Number(b.featured) - Number(a.featured),
  );
}
