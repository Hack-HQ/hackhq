/* ---------------------------------------------------------------------------
   Community gallery photos.

   Source of truth is .github/scripts/gallery.json (same file the README collage
   is built from). prepare-repo-data.mjs snapshots it into lib/generated/ so the
   infinite canvas can import it on Workers with no request-time filesystem.

   The canvas needs a perfect rectangular tile with no holes - otherwise the
   modulo wrap exposes empty cells. SLOT_TEMPLATE is the hand-packed 6×6 layout
   the gallery shipped with; packGalleryTiles stacks that template vertically
   enough times to hold every photo, cycling when a stack isn't full so the
   rectangle stays complete.
--------------------------------------------------------------------------- */

import galleryData from "./generated/gallery.json";

export type GalleryPhoto = {
  /** Repo-relative path, e.g. assets/gallery/lahacks-ucla.jpg */
  image: string;
  hackathon: string;
  caption?: string;
  credit?: string;
  creditUrl?: string;
};

export type GalleryTileItem = {
  /** Public URL under /repo-assets/… */
  src: string;
  /** Stable key for React lists (the repo-relative image path). */
  key: string;
  alt: string;
  col: number;
  colSpan: number;
  row: number;
  rowSpan: number;
};

export type PackedGallery = {
  items: GalleryTileItem[];
  cols: number;
  rows: number;
};

/** One seamless 6×6 pack — every cell covered exactly once. */
export const GALLERY_COLS = 6;
export const GALLERY_ROWS = 6;

/**
 * Relative slot geometry for one 6×6 tile. Order matches the original
 * TILE_ITEMS layout in gallery-canvas.tsx so N=8 keeps the same masonry rhythm
 * (only which photo sits in which slot follows gallery.json order).
 */
export const SLOT_TEMPLATE: ReadonlyArray<{
  col: number;
  colSpan: number;
  row: number;
  rowSpan: number;
}> = [
  { col: 1, colSpan: 2, row: 1, rowSpan: 3 },
  { col: 3, colSpan: 2, row: 1, rowSpan: 2 },
  { col: 5, colSpan: 1, row: 1, rowSpan: 2 },
  { col: 6, colSpan: 1, row: 1, rowSpan: 3 },
  { col: 3, colSpan: 3, row: 3, rowSpan: 2 },
  { col: 1, colSpan: 2, row: 4, rowSpan: 3 },
  { col: 6, colSpan: 1, row: 4, rowSpan: 3 },
  { col: 3, colSpan: 3, row: 5, rowSpan: 2 },
];

type RawGalleryEntry = {
  image?: unknown;
  hackathon?: unknown;
  caption?: unknown;
  credit?: unknown;
  credit_url?: unknown;
};

/** assets/gallery/foo.jpg → /repo-assets/gallery/foo.jpg */
export function galleryPublicSrc(imagePath: string): string {
  const relative = imagePath.replace(/^\/+/, "");
  if (relative.startsWith("assets/")) {
    return `/repo-assets/${relative.slice("assets/".length)}`;
  }
  return `/${relative}`;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Coerce untrusted gallery.json into clean photos. Drop rows without a usable
 * image path + hackathon name so a bad entry can't blank the whole canvas.
 */
export function parseGalleryPhotos(value: unknown): GalleryPhoto[] {
  if (!Array.isArray(value)) return [];
  const out: GalleryPhoto[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as RawGalleryEntry;
    const image = asOptionalString(raw.image);
    const hackathon = asOptionalString(raw.hackathon);
    if (!image || !hackathon) continue;
    if (!image.startsWith("assets/gallery/")) continue;
    if (seen.has(image)) continue;
    seen.add(image);
    out.push({
      image,
      hackathon,
      caption: asOptionalString(raw.caption),
      credit: asOptionalString(raw.credit),
      creditUrl: asOptionalString(raw.credit_url),
    });
  }
  return out;
}

export function loadGalleryPhotos(): GalleryPhoto[] {
  return parseGalleryPhotos(galleryData);
}

/**
 * Map photos onto stacked copies of SLOT_TEMPLATE. One stack when there are at
 * most 8 photos; ceil(N/8) stacks otherwise. Empty input yields an empty pack
 * (the canvas shows a CTA-only empty state).
 */
export function packGalleryTiles(photos: GalleryPhoto[]): PackedGallery {
  if (photos.length === 0) {
    return { items: [], cols: GALLERY_COLS, rows: GALLERY_ROWS };
  }

  const slotsPerStack = SLOT_TEMPLATE.length;
  const stacks = Math.max(1, Math.ceil(photos.length / slotsPerStack));
  const items: GalleryTileItem[] = [];

  for (let s = 0; s < stacks; s++) {
    for (let i = 0; i < slotsPerStack; i++) {
      const photo = photos[(s * slotsPerStack + i) % photos.length]!;
      const slot = SLOT_TEMPLATE[i]!;
      const alt = photo.caption
        ? `${photo.hackathon} - ${photo.caption}`
        : photo.hackathon;
      items.push({
        src: galleryPublicSrc(photo.image),
        // Stack index keeps keys unique when a photo is cycled into a later
        // stack to fill the rectangle.
        key: `${photo.image}#${s}-${i}`,
        alt,
        col: slot.col,
        colSpan: slot.colSpan,
        row: slot.row + s * GALLERY_ROWS,
        rowSpan: slot.rowSpan,
      });
    }
  }

  return {
    items,
    cols: GALLERY_COLS,
    rows: GALLERY_ROWS * stacks,
  };
}
