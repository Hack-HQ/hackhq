import { describe, it, expect } from "vitest";
import type { Hackathon } from "./types-hq";
import {
  BLEED,
  PAGE_H,
  PAGE_W,
  buildPassport,
  cleanName,
  cityKey,
  locationArc,
  monogram,
  type TrackerMap,
} from "./passport-stamps";

/** Minimal Hackathon factory — only the fields the generator reads. */
function hack(over: Partial<Hackathon> & { id: string }): Hackathon {
  return {
    host: "Host",
    title: "Some Hackathon",
    tagline: null,
    url: "https://example.com",
    location: "Toronto, ON",
    format: "In-Person",
    prize: null,
    prizeValue: 0,
    state: "open",
    deadline: null,
    startDate: null,
    endDate: null,
    daysLeft: null,
    lat: null,
    lng: null,
    themes: [],
    postedAt: 0,
    ...over,
  };
}

describe("cleanName", () => {
  it("drops a trailing date range after ' - '", () => {
    expect(cleanName("cuHacking 2026 - Jul 10 - Jul 12, 2026")).toBe("cuHacking");
  });

  it("drops a subtitle after a colon", () => {
    expect(cleanName("Arm Create: AI Optimization Challenge")).toBe("Arm Create");
  });

  it("keeps a plain name untouched", () => {
    expect(cleanName("Healthcare Hack NYC")).toBe("Healthcare Hack NYC");
  });

  it("strips a dangling year", () => {
    expect(cleanName("PennApps 2024")).toBe("PennApps");
  });

  it("collapses whitespace", () => {
    expect(cleanName("  Hack   the  North ")).toBe("Hack the North");
  });
});

describe("monogram", () => {
  it("takes initials of significant words", () => {
    expect(monogram("Hack the North")).toBe("HN");
  });

  it("caps initials at three words", () => {
    expect(monogram("Major League Hacking Global")).toBe("MLH");
  });

  it("uses the first two letters of a single word", () => {
    expect(monogram("MHacks")).toBe("MH");
  });

  it("never returns empty", () => {
    expect(monogram("")).toBe("HQ");
  });
});

describe("locationArc", () => {
  it("formats city and region", () => {
    expect(locationArc("Ottawa, ON")).toBe("OTTAWA · ON");
  });

  it("collapses online/virtual to REMOTE", () => {
    expect(locationArc("Online")).toBe("REMOTE");
    expect(locationArc("Virtual")).toBe("REMOTE");
  });

  it("returns nothing for TBA or empty", () => {
    expect(locationArc("TBA")).toBe("");
    expect(locationArc("")).toBe("");
  });

  it("handles a city with no region", () => {
    expect(locationArc("Singapore")).toBe("SINGAPORE");
  });
});

describe("cityKey", () => {
  it("keys on the city, case-insensitively", () => {
    expect(cityKey("Ottawa, ON")).toBe("ottawa");
  });

  it("returns null for remote / TBA", () => {
    expect(cityKey("Online")).toBeNull();
    expect(cityKey("TBA")).toBeNull();
    expect(cityKey("")).toBeNull();
  });
});

describe("buildPassport", () => {
  const hackathons = [
    hack({ id: "a", title: "Hack the North", location: "Toronto, ON", startDate: "2024-09-13" }),
    hack({ id: "b", title: "PennApps", location: "Philadelphia, PA", startDate: "2025-09-05" }),
    hack({ id: "c", title: "MHacks", location: "Ann Arbor, MI", startDate: "2023-11-10" }),
    hack({ id: "d", title: "LA Hacks", location: "Los Angeles, CA", startDate: "2025-04-18" }),
  ];

  it("ignores interested (a bookmark earns no stamp)", () => {
    const tracked: TrackerMap = { a: "interested" };
    const p = buildPassport(tracked, hackathons);
    expect(p.stampCount).toBe(0);
    expect(p.left).toHaveLength(0);
    expect(p.right).toHaveLength(0);
  });

  it("maps applied/accepted/going to VISA/ADMITTED/HACKED", () => {
    const tracked: TrackerMap = { a: "applied", b: "accepted", d: "going" };
    const p = buildPassport(tracked, hackathons);
    const all = [...p.left, ...p.right];
    const stamp = (id: string) => all.find((s) => s.id === id)!;
    expect(stamp("a").label).toBe("VISA");
    expect(stamp("b").label).toBe("ADMITTED");
    expect(stamp("d").label).toBe("HACKED");
    expect(stamp("d").color).toBe("#ed5b29");
  });

  it("drops tracked ids that no longer exist in the listing set", () => {
    const tracked: TrackerMap = { a: "going", ghost: "going" };
    const p = buildPassport(tracked, hackathons);
    expect(p.stampCount).toBe(1);
    expect([...p.left, ...p.right].map((s) => s.id)).toEqual(["a"]);
  });

  it("counts unique cities, ignoring remote/TBA", () => {
    const withRemote = [
      ...hackathons,
      hack({ id: "e", title: "Remote Jam", location: "Online" }),
      hack({ id: "f", title: "Second Toronto", location: "Toronto, ON" }),
    ];
    const tracked: TrackerMap = { a: "going", e: "going", f: "going" };
    const p = buildPassport(tracked, withRemote);
    expect(p.stampCount).toBe(3);
    // a + f are both Toronto (one city); e is remote (uncounted).
    expect(p.cityCount).toBe(1);
  });

  it("orders stamps chronologically by event date", () => {
    const tracked: TrackerMap = { a: "going", b: "going", c: "going", d: "going" };
    const p = buildPassport(tracked, hackathons);
    const order = [...p.left, ...p.right].map((s) => s.id);
    // c (2023) < a (2024) < d (2025-04) < b (2025-09)
    expect(order).toEqual(["c", "a", "d", "b"]);
  });

  it("splits stamps across the two pages", () => {
    const tracked: TrackerMap = { a: "going", b: "going", c: "going", d: "going" };
    const p = buildPassport(tracked, hackathons);
    expect(p.left).toHaveLength(2);
    expect(p.right).toHaveLength(2);
  });

  it("returns an empty passport for no tracked hackathons", () => {
    const p = buildPassport({}, hackathons);
    expect(p).toEqual({ left: [], right: [], stampCount: 0, cityCount: 0 });
  });

  it.each([12, 20, 40])(
    "scales %i stamps to fit the page without clipping off the bottom",
    (howMany) => {
      const many = Array.from({ length: howMany }, (_, i) =>
        hack({ id: `h${i}`, title: `Hackathon ${i}`, location: `City ${i}, ST` }),
      );
      const tracked: TrackerMap = Object.fromEntries(
        many.map((h) => [h.id, "going"]),
      );
      const p = buildPassport(tracked, many);
      expect(p.stampCount).toBe(howMany);
      const all = [...p.left, ...p.right];
      expect(all).toHaveLength(howMany);
      for (const s of all) {
        expect(s.pos.size).toBeGreaterThanOrEqual(92);
        expect(s.pos.size).toBeLessThanOrEqual(206);
        // Fully within the page vertically (the page clips overflow).
        expect(s.pos.top).toBeGreaterThanOrEqual(0);
        expect(s.pos.top + s.pos.size).toBeLessThanOrEqual(PAGE_H);
        // Horizontally within a small, bounded bleed.
        expect(s.pos.left).toBeGreaterThanOrEqual(-BLEED);
        expect(s.pos.left + s.pos.size).toBeLessThanOrEqual(PAGE_W + BLEED);
      }
    },
  );
});

describe("buildPassport — derived fields (end to end)", () => {
  it("wires cleaned title -> arc + monogram and location -> sub", () => {
    const h = hack({
      id: "cu",
      title: "cuHacking 2026 - Jul 10 - Jul 12, 2026", // post-loader form
      location: "Ottawa, ON",
      startDate: "2026-07-10",
    });
    const p = buildPassport({ cu: "going" }, [h]);
    const [s] = [...p.left, ...p.right];
    expect(s!.top).toBe("CUHACKING");
    expect(s!.mono).toBe("CU");
    expect(s!.sub).toBe("OTTAWA · ON");
    expect(s!.label).toBe("HACKED");
    expect(s!.year).toBe("2026");
  });

  const yearOf = (h: Hackathon) => {
    const p = buildPassport({ [h.id]: "going" }, [h]);
    return [...p.left, ...p.right][0]!.year;
  };

  it("derives the year from an ISO event date", () => {
    expect(yearOf(hack({ id: "a", startDate: "2025-04-18" }))).toBe("2025");
  });

  it("falls back to postedAt in seconds", () => {
    // 2024-06-01T00:00:00Z in seconds.
    expect(yearOf(hack({ id: "b", postedAt: 1717200000 }))).toBe("2024");
  });

  it("falls back to postedAt in milliseconds", () => {
    // 2023-01-15T00:00:00Z in milliseconds.
    expect(yearOf(hack({ id: "c", postedAt: 1673740800000 }))).toBe("2023");
  });

  it("leaves the year blank when there is no usable date", () => {
    expect(yearOf(hack({ id: "d", postedAt: 0 }))).toBe("");
  });
});
