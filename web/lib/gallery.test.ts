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

/* A gallery.json row from a submitter who asked to be credited. Note the image
   path deliberately spells no form of "credit": the assertions below search the
   serialized payload for that substring, and a filename would answer for it. */
const CREDITED_ROW = {
  image: "assets/gallery/hackmit-2026-a.jpg",
  hackathon: "HackMIT 2026",
  caption: "Demoing at 3am",
  credit: "Ada Lovelace",
  credit_url: "https://example.com/ada",
};

describe("the gallery value that crosses into the client canvas", () => {
  it("still carries credit through the parse", () => {
    // Half the guarantee, kept deliberately separate from the half below:
    // attribution is not dropped. The site promises to show photos "with the
    // credit you provide" (app/terms/page.tsx), and the README collage renders
    // it, so parseGalleryPhotos must keep both fields.
    const [parsed] = parseGalleryPhotos([CREDITED_ROW]);
    expect(parsed?.credit).toBe("Ada Lovelace");
    expect(parsed?.creditUrl).toBe("https://example.com/ada");
  });

  it("keeps credit out of the packed payload the browser receives", () => {
    // The other half. app/page.tsx packs on the server and hands HomeClient
    // this PackedGallery rather than the photos, so this object is what React
    // serializes into the RSC flight payload every visitor downloads. Assert on
    // the serialization, because that is the thing that leaks.
    const wire = JSON.stringify(packGalleryTiles(parseGalleryPhotos([CREDITED_ROW])));
    expect(wire).not.toContain("credit");
    expect(wire).not.toContain("creditUrl");
    expect(wire).not.toContain("credit_url");
    expect(wire).not.toContain("Ada Lovelace");
    expect(wire).not.toContain("example.com/ada");
    // …and the tiles really were built from that photo, so the check above is
    // not passing on an empty pack.
    expect(wire).toContain("/repo-assets/gallery/hackmit-2026-a.jpg");
  });

  it("projects a tile to exactly the fields the canvas draws", () => {
    // Pins the projection rather than today's field names: the next optional
    // field added to GalleryPhoto fails here instead of quietly riding along.
    const packed = packGalleryTiles(parseGalleryPhotos([CREDITED_ROW]));
    expect(packed.items.length).toBeGreaterThan(0);
    for (const item of packed.items) {
      expect(Object.keys(item).sort()).toEqual([
        "alt",
        "col",
        "colSpan",
        "key",
        "row",
        "rowSpan",
        "src",
      ]);
    }
  });
});
