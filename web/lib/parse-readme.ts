import crypto from "node:crypto";
import readmeData from "./generated/readme.json";
import listingsData from "./generated/listings.json";
import assetManifest from "./generated/asset-manifest.json";
import {
  GalleryPhoto,
  Opportunity,
  Section,
  Status,
  SECTION_LABELS,
} from "./types";
import { REPO_RAW_BASE } from "./repo";

// The README, listings.json, and the assets tree live at the repo root, one
// level ABOVE this Next.js project (web/). Rather than read them from disk at
// request time — which fails outright on a runtime with no filesystem, such as
// Cloudflare Workers — they are copied into lib/generated/ at build time
// (scripts/prepare-repo-data.mjs) and imported here as compile-time constants.
// This also sidesteps the old Turbopack NFT concern (#77 item 5), where a plain
// `fs` read climbing out of the project via `..` made the tracer give up and
// bundle the entire repo: there is no request-time `fs` read left to trace.
const ASSET_MANIFEST = new Set<string>(assetManifest as string[]);

const TABLE_RE = /<!-- (\w+)_TABLE_START -->([\s\S]*?)<!-- \1_TABLE_END -->/g;

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const DATE_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/g;
const GALLERY_BLOCK_RE =
  /<!-- GALLERY_START -->([\s\S]*?)<!-- GALLERY_END -->/;
const IMG_TAG_RE = /<img\s+[^>]*>/gi;

function parseImgAttributes(tag: string): { src: string; alt: string } | null {
  const srcMatch = tag.match(/(?:^|\s)src="([^"]+)"/i);
  if (!srcMatch) return null;
  const altMatch = tag.match(/(?:^|\s)alt="([^"]*)"/i);
  return {
    src: srcMatch[1] ?? "",
    alt: altMatch?.[1] || "Hackathon photo",
  };
}

function parseStatus(cell: string): Status {
  if (cell.includes("CLOSING SOON")) return "CLOSING_SOON";
  if (cell.includes("OPENS SOON")) return "OPENS_SOON";
  if (cell.includes("CLOSED")) return "CLOSED";
  return "OPEN";
}

function extractUrl(cell: string): string {
  const m = cell.match(/href="([^"]+)"/);
  return m ? (m[1] ?? "") : "";
}

function earliestUpcomingDate(text: string, today: Date): Date | null {
  let earliest: Date | null = null;
  const re = new RegExp(DATE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const monthIdx = MONTH_MAP[(m[1] ?? "").toLowerCase().replace(".", "")];
    if (monthIdx === undefined) continue;
    const day = parseInt(m[2] ?? "", 10);
    const year = parseInt(m[3] ?? "", 10);
    const d = new Date(year, monthIdx, day);
    if (d >= today && (!earliest || d < earliest)) earliest = d;
  }
  return earliest;
}

function cleanTitle(text: string): string {
  return text
    .replace(/^\s*⭐\s*/, "")
    .replace(/\s*—\s*Deadline:.*$/i, "")
    .replace(/\s*—\s*"?Application Coming.*$/i, "")
    .trim();
}

/** Split a markdown table row on unescaped pipe delimiters. */
function splitTableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner
    .split(/(?<!\\)\|/)
    .map((s) => s.trim().replace(/\\\|/g, "|"));
}

/**
 * Featured flags come from the structured source of truth (listings.json),
 * not the README markup. This is the single place to swap to Supabase later:
 * replace the file read with a query that returns featured URLs.
 */
function loadFeaturedUrls(): Set<string> {
  const listings = listingsData as Array<{
    url?: string;
    featured?: boolean;
  }>;
  return new Set(
    listings
      .filter((l) => l.featured === true && typeof l.url === "string")
      .map((l) => l.url as string),
  );
}

function inlineDeadline(text: string): string {
  const m = text.match(/Deadline:\s*([^|]+?)(?:\s*\(Event:|$)/i);
  return m ? (m[1] ?? "").trim() : "";
}

function stableId(...parts: string[]): string {
  return crypto.createHash("md5").update(parts.join("|")).digest("hex").slice(0, 10);
}

export function resolveAssetSrc(src: string): string {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://")) return src;

  const relative = src.replace(/^\/+/, "");
  // Local-first: an asset that prepare-repo-data.mjs found under ../assets is
  // copied into public/repo-assets and served statically. The manifest replaces
  // an fs.existsSync so the decision needs no filesystem at request time.
  if (relative.startsWith("assets/") && ASSET_MANIFEST.has(relative)) {
    return `/repo-assets/${relative.replace(/^assets\//, "")}`;
  }

  return `${REPO_RAW_BASE}${relative}`;
}

function extractStatsBannerSrc(markdown: string): string | null {
  const tag = markdown.match(/<img\s+[^>]*alt="Hackathon stats"[^>]*>/i);
  if (!tag) return null;
  const src = tag[0].match(/src="([^"]+)"/i);
  return src ? resolveAssetSrc(src[1] ?? "") : null;
}

export function extractGallery(markdown: string): GalleryPhoto[] {
  const block = markdown.match(GALLERY_BLOCK_RE);
  if (!block) return [];

  const photos: GalleryPhoto[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IMG_TAG_RE.source, "gi");
  while ((m = re.exec(block[1] ?? "")) !== null) {
    const parsed = parseImgAttributes(m[0]);
    if (!parsed) continue;
    photos.push({
      src: resolveAssetSrc(parsed.src),
      alt: parsed.alt,
    });
  }
  return photos;
}

function parseTableRows(
  sectionKey: Section,
  body: string,
  today: Date,
  featuredUrls: Set<string>,
): Opportunity[] {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  if (lines.length < 3) return [];

  const headers = splitTableCells(lines[0] ?? "");

  const headerIdx = (...names: string[]) => {
    for (const name of names) {
      const idx = headers.findIndex((h) =>
        h.toLowerCase().includes(name.toLowerCase()),
      );
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idx = {
    status: headerIdx("Status"),
    org: headerIdx("Host", "Company", "Organization"),
    title: headerIdx("Hackathon", "Role", "Program", "Opportunity"),
    type: headerIdx("Format", "Type", "Prize", "Field"),
    location: headerIdx("Location"),
    application: headerIdx("Application"),
    deadline: headerIdx("Deadline"),
    datePosted: headerIdx("Date Posted"),
  };

  const dataLines = lines.slice(1).filter((l) => !/^\|\s*-+/.test(l));

  return dataLines.map((line) => {
    const cells = splitTableCells(line);
    const get = (i: number) => (i >= 0 ? cells[i] || "" : "");

    const status = parseStatus(get(idx.status));
    const organization = get(idx.org);
    const rawTitle = get(idx.title);
    const title = cleanTitle(rawTitle);
    const type = get(idx.type);
    const location = get(idx.location);
    const url = extractUrl(get(idx.application));

    const deadlineRaw =
      idx.deadline >= 0
        ? get(idx.deadline)
        : inlineDeadline(rawTitle);

    const deadlineDate = earliestUpcomingDate(deadlineRaw, today);
    const deadlineISO = deadlineDate
      ? deadlineDate.toISOString().slice(0, 10)
      : null;
    const daysUntilDeadline = deadlineDate
      ? Math.round(
          (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      id: stableId(sectionKey, organization, title, url),
      section: sectionKey,
      sectionLabel: SECTION_LABELS[sectionKey],
      status,
      organization,
      title,
      type,
      location,
      url,
      deadlineRaw,
      deadlineISO,
      daysUntilDeadline,
      featured: url ? featuredUrls.has(url) : false,
    };
  });
}

const SECTION_ALIAS: Record<string, Section> = {
  HACKATHONS: "HACKATHONS",
};

/**
 * The root README, captured at build time (scripts/prepare-repo-data.mjs) and
 * imported as a constant. If the README were genuinely absent the build fails at
 * generation, so this never has to degrade at render time.
 */
function readReadme(): string {
  return (readmeData as { content: string }).content;
}

export function loadOpportunities(): Opportunity[] {
  return parseOpportunities(readReadme());
}

export function parseOpportunities(markdown: string): Opportunity[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const featuredUrls = loadFeaturedUrls();

  const all: Opportunity[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(TABLE_RE.source, "g");
  while ((m = re.exec(markdown)) !== null) {
    const key = SECTION_ALIAS[m[1] ?? ""];
    if (!key) continue;
    all.push(...parseTableRows(key, m[2] ?? "", today, featuredUrls));
  }
  return all;
}

export function loadSiteData(): {
  opportunities: Opportunity[];
  statsBannerSrc: string | null;
  gallery: GalleryPhoto[];
} {
  const md = readReadme();
  return {
    opportunities: parseOpportunities(md),
    statsBannerSrc: extractStatsBannerSrc(md),
    gallery: extractGallery(md),
  };
}
