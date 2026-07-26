import { describe, expect, it } from "vitest";
import {
  GALLERY_COLS,
  GALLERY_ROWS,
  SLOT_TEMPLATE,
  galleryPublicSrc,
  packGalleryTiles,
  parseGalleryPhotos,
  type GalleryPhoto,
} from "./gallery";

function photo(n: number): GalleryPhoto {
  return {
    image: `assets/gallery/photo-${n}.jpg`,
    hackathon: `Hack ${n}`,
  };
}

/** Every cell of a cols×rows grid is covered exactly once. */
function coversExactly(items: ReturnType<typeof packGalleryTiles>["items"], cols: number, rows: number) {
  const cells = new Set<string>();
  for (const it of items) {
    for (let r = it.row; r < it.row + it.rowSpan; r++) {
      for (let c = it.col; c < it.col + it.colSpan; c++) {
        const key = `${c},${r}`;
        expect(cells.has(key), `overlap at ${key}`).toBe(false);
        cells.add(key);
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(cols);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(rows);
      }
    }
  }
  expect(cells.size).toBe(cols * rows);
}

describe("galleryPublicSrc", () => {
  it("maps assets/ paths into the public repo-assets URL", () => {
    expect(galleryPublicSrc("assets/gallery/lahacks-ucla.jpg")).toBe(
      "/repo-assets/gallery/lahacks-ucla.jpg",
    );
  });
});

describe("parseGalleryPhotos", () => {
  it("keeps only rows with an assets/gallery image and a hackathon name", () => {
    const photos = parseGalleryPhotos([
      {
        image: "assets/gallery/a.jpg",
        hackathon: "A",
        credit: "X",
        credit_url: "https://example.com",
      },
      { image: "assets/other/b.jpg", hackathon: "B" },
      { image: "assets/gallery/c.jpg", hackathon: "" },
      { image: "assets/gallery/a.jpg", hackathon: "Dup" },
      null,
      "nope",
    ]);
    expect(photos).toEqual([
      {
        image: "assets/gallery/a.jpg",
        hackathon: "A",
        credit: "X",
        creditUrl: "https://example.com",
      },
    ]);
  });

  it("returns empty for a non-array", () => {
    expect(parseGalleryPhotos(null)).toEqual([]);
  });
});

describe("packGalleryTiles", () => {
  it("uses one 6×6 stack for up to eight photos and covers every cell", () => {
    const packed = packGalleryTiles(Array.from({ length: 8 }, (_, i) => photo(i)));
    expect(packed.cols).toBe(GALLERY_COLS);
    expect(packed.rows).toBe(GALLERY_ROWS);
    expect(packed.items).toHaveLength(SLOT_TEMPLATE.length);
    coversExactly(packed.items, packed.cols, packed.rows);
  });

  it("stacks the template when there are more than eight photos", () => {
    const packed = packGalleryTiles(Array.from({ length: 9 }, (_, i) => photo(i)));
    expect(packed.rows).toBe(GALLERY_ROWS * 2);
    expect(packed.items).toHaveLength(SLOT_TEMPLATE.length * 2);
    coversExactly(packed.items, packed.cols, packed.rows);
  });

  it("cycles photos to fill a stack when N is not a multiple of eight", () => {
    const packed = packGalleryTiles([photo(0), photo(1), photo(2)]);
    expect(packed.items).toHaveLength(SLOT_TEMPLATE.length);
    const keys = new Set(packed.items.map((it) => it.src));
    expect(keys.size).toBe(3);
    coversExactly(packed.items, packed.cols, packed.rows);
  });

  it("returns an empty pack for no photos", () => {
    expect(packGalleryTiles([])).toEqual({
      items: [],
      cols: GALLERY_COLS,
      rows: GALLERY_ROWS,
    });
  });

  it("preserves the original slot geometry for the first stack", () => {
    const packed = packGalleryTiles(Array.from({ length: 8 }, (_, i) => photo(i)));
    for (let i = 0; i < SLOT_TEMPLATE.length; i++) {
      const slot = SLOT_TEMPLATE[i]!;
      const item = packed.items[i]!;
      expect(item.col).toBe(slot.col);
      expect(item.colSpan).toBe(slot.colSpan);
      expect(item.row).toBe(slot.row);
      expect(item.rowSpan).toBe(slot.rowSpan);
    }
  });
});
