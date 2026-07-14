import type { Hackathon, HackState } from "./types-hq";

/**
 * The one filter the site runs on.
 *
 * The deck had this logic inline. The globe (#18) needs exactly the same rules —
 * and a second copy would quietly drift: a theme added to the deck's search but
 * not the globe's is a hackathon a visitor can find on one surface and not the
 * other, with nothing to tell them the two disagree.
 */

export type StatusFilter = "all" | HackState;
export type FormatFilter = "all" | "In-Person" | "Virtual" | "Hybrid";

export type Filters = {
  q: string;
  status: StatusFilter;
  format: FormatFilter;
};

export const NO_FILTERS: Filters = { q: "", status: "all", format: "all" };

/** Is anything actually narrowing the list? Drives the "clear all" affordance. */
export function isFiltering({ q, status, format }: Filters): boolean {
  return q.trim() !== "" || status !== "all" || format !== "all";
}

export function matches(h: Hackathon, { q, status, format }: Filters): boolean {
  if (status !== "all" && h.state !== status) return false;
  if (format !== "all" && h.format !== format) return false;

  const needle = q.trim().toLowerCase();
  if (!needle) return true;

  // Searchable text = everything a person might plausibly type: the event, who
  // runs it, where it is, and what it's about.
  return [h.title, h.host, h.location, ...h.themes]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function applyFilters(list: Hackathon[], filters: Filters): Hackathon[] {
  return list.filter((h) => matches(h, filters));
}

/**
 * Split a filtered list into what the globe can pin and what it cannot.
 *
 * `offMap` is the answer to "online events have no location" (#18): a Virtual
 * hackathon can never have a marker, so without somewhere to list it, filtering
 * the globe would make it vanish entirely rather than merely lose its pin.
 * `offMap` also catches an in-person event we simply failed to geocode, so the
 * globe never quietly drops a listing (#111).
 */
export function splitByMappability(list: Hackathon[]): {
  onMap: Hackathon[];
  offMap: Hackathon[];
} {
  const onMap: Hackathon[] = [];
  const offMap: Hackathon[] = [];
  for (const h of list) {
    if (h.lat !== null && h.lng !== null) onMap.push(h);
    else offMap.push(h);
  }
  return { onMap, offMap };
}
