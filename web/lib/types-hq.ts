/** Client-safe types + display helpers shared across HackHQ components. */

import { REPO_URL } from "./repo";

export type HackState = "open" | "opens_soon" | "closing_soon" | "closed";

export type Hackathon = {
  id: string;
  host: string;
  title: string;
  tagline: string | null;
  url: string;
  location: string;
  format: "In-Person" | "Virtual" | "Hybrid";
  prize: string | null;
  prizeValue: number;
  state: HackState;
  deadline: string | null;
  startDate: string | null;
  endDate: string | null;
  daysLeft: number | null;
  lat: number | null;
  lng: number | null;
  themes: string[];
  postedAt: number;
  /** Editorial spotlight from listings.json — deck default view sorts these first. */
  featured: boolean;
};

export type SiteStats = {
  total: number;
  open: number;
  closingSoon: number;
  prizeDisplay: string;
  cities: number;
};

/** Whether a listing belongs in active discovery surfaces such as the deck and globe. */
export function isActiveHackathon(hackathon: Pick<Hackathon, "state">): boolean {
  return hackathon.state !== "closed";
}

export const STATE_META: Record<
  HackState,
  { label: string; color: string; dim?: boolean }
> = {
  open: { label: "OPEN", color: "#17b26a" },
  opens_soon: { label: "OPENS SOON", color: "#f5a623" },
  closing_soon: { label: "CLOSING SOON", color: "#ed5b29" },
  closed: { label: "CLOSED", color: "#6b6560", dim: true },
};

export function countdown(h: Hackathon): string | null {
  if (h.daysLeft === null) return null;
  if (h.daysLeft < 0) return "closed";
  if (h.daysLeft === 0) return "closes today";
  if (h.daysLeft === 1) return "1 day left";
  if (h.daysLeft <= 45) return `${h.daysLeft} days left`;
  return null;
}

export function deadlineDisplay(h: Hackathon): string | null {
  if (!h.deadline) return null;
  return dateDisplay(h.deadline);
}

export function eventDateDisplay(h: Hackathon): string | null {
  if (!h.startDate && !h.endDate) return null;
  if (h.startDate && h.endDate) {
    if (h.startDate === h.endDate) return dateDisplay(h.startDate);
    return rangeDisplay(h.startDate, h.endDate);
  }
  if (h.startDate) return `Starts ${dateDisplay(h.startDate)}`;
  return `Ends ${dateDisplay(h.endDate!)}`;
}

/** Compact range: "Oct 16-17, 2026" / "Oct 30 - Nov 2, 2026", falling back to
    both-sides-dated only across a year boundary. The verbose form repeated the
    month and year ("Oct 16, 2026 - Oct 17, 2026") and wrapped inside the
    deck's fixed date column. */
function rangeDisplay(startIso: string, endIso: string): string {
  const s = new Date(`${startIso}T12:00:00`);
  const e = new Date(`${endIso}T12:00:00`);
  if (s.getFullYear() !== e.getFullYear()) {
    return `${dateDisplay(startIso)} - ${dateDisplay(endIso)}`;
  }
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (s.getMonth() === e.getMonth()) {
    return `${month(s)} ${s.getDate()}-${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${month(s)} ${s.getDate()} - ${month(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

function dateDisplay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Prefilled GitHub issue for the Submit flow - keeps the engine, new surface.
 *
 * Targets the `link_only` issue FORM, not a free-text issue. That is the whole
 * point: the form applies the `auto_extract` + `community` labels and produces
 * the structured fields the pipeline reads. A free-text issue has neither, so a
 * maintainer approving one used to fall through to contribution_approved.py,
 * which looks for a form field that isn't there and fails with "Missing
 * required field: URL". Every submission made from the website died that way.
 *
 * `url` matches the `id:` of the input in .github/ISSUE_TEMPLATE/link_only.yaml
 * — GitHub prefills a form field by its id. Renaming that id silently stops the
 * prefill, so lib/types-hq.test.ts pins the two together.
 */
export function submitIssueUrl(name = "", url = ""): string {
  const params = new URLSearchParams({ template: "link_only.yaml" });
  // The template's own title prefix is "Add: ", so match it rather than
  // fighting it — a maintainer scanning the issue list sees one consistent shape.
  if (name.trim()) params.set("title", `Add: ${name.trim()}`);
  if (url.trim()) params.set("url", url.trim());
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

/**
 * Prefilled GitHub issue for sharing a gallery photo.
 *
 * Targets gallery_photo.yaml. The image itself cannot be attached via query
 * params — GitHub only prefills text fields — so the form opens with the
 * hackathon (and optional credit fields) filled and the submitter drops the
 * JPG/PNG onto the issue. Field ids must match the template; the test pins them.
 */
export function submitGalleryPhotoUrl(fields: {
  hackathon?: string;
  caption?: string;
  credit?: string;
  creditUrl?: string;
} = {}): string {
  const params = new URLSearchParams({ template: "gallery_photo.yaml" });
  const hackathon = fields.hackathon?.trim() ?? "";
  if (hackathon) {
    params.set("title", `Photo: ${hackathon}`);
    params.set("hackathon", hackathon);
  }
  const caption = fields.caption?.trim() ?? "";
  if (caption) params.set("caption", caption);
  const credit = fields.credit?.trim() ?? "";
  if (credit) params.set("credit", credit);
  const creditUrl = fields.creditUrl?.trim() ?? "";
  if (creditUrl) params.set("credit_url", creditUrl);
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

export { REPO_URL };
