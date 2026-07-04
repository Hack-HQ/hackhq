/** Client-safe types + display helpers shared across HackHQ components. */

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
  daysLeft: number | null;
  lat: number | null;
  lng: number | null;
  themes: string[];
  postedAt: number;
};

export type SiteStats = {
  total: number;
  open: number;
  closingSoon: number;
  prizeDisplay: string;
  cities: number;
};

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
  const d = new Date(`${h.deadline}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Prefilled GitHub issue for the Submit flow - keeps the engine, new surface. */
export function submitIssueUrl(name = "", url = ""): string {
  const title = encodeURIComponent(
    name ? `[Hackathon] ${name}` : "[Hackathon] Add a new event",
  );
  const body = encodeURIComponent(
    `**Hackathon name:** ${name || "…"}\n**URL:** ${url || "…"}\n**Location (City, ST or Online):** …\n**Deadline:** …\n**Prize pool:** …\n\n_Submitted via hackhq.dev - the pipeline will extract the rest._`,
  );
  return `https://github.com/Jose-Gael-Cruz-Lopez/hackhq/issues/new?title=${title}&body=${body}`;
}

export const REPO_URL = "https://github.com/Jose-Gael-Cruz-Lopez/hackhq";
