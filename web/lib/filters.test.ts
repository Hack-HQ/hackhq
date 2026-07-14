import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  applyFilters,
  isFiltering,
  matches,
  splitByMappability,
} from "./filters";
import type { Hackathon } from "./types-hq";

function hack(over: Partial<Hackathon> = {}): Hackathon {
  return {
    id: "1",
    host: "MIT",
    title: "HackMIT",
    tagline: null,
    url: "https://hackmit.org",
    location: "Cambridge, MA",
    format: "In-Person",
    prize: "$40K",
    prizeValue: 40000,
    state: "open",
    deadline: "2026-09-01",
    daysLeft: 30,
    lat: 42.3736,
    lng: -71.1097,
    themes: ["AI"],
    postedAt: 0,
    ...over,
  } as Hackathon;
}

describe("matches", () => {
  it("passes everything when nothing is set", () => {
    expect(matches(hack(), NO_FILTERS)).toBe(true);
  });

  it("filters by status and format", () => {
    expect(matches(hack({ state: "closed" }), { ...NO_FILTERS, status: "open" })).toBe(false);
    expect(matches(hack({ format: "Virtual" }), { ...NO_FILTERS, format: "In-Person" })).toBe(false);
    expect(matches(hack({ format: "Virtual" }), { ...NO_FILTERS, format: "Virtual" })).toBe(true);
  });

  it("searches title, host, location and themes", () => {
    const h = hack();
    for (const q of ["hackmit", "MIT", "cambridge", "ai"]) {
      expect(matches(h, { ...NO_FILTERS, q }), `should match ${q}`).toBe(true);
    }
    expect(matches(h, { ...NO_FILTERS, q: "berlin" })).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(matches(hack(), { ...NO_FILTERS, q: "  HaCkMiT  " })).toBe(true);
  });
});

describe("isFiltering", () => {
  it("is false only when nothing narrows the list", () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    expect(isFiltering({ ...NO_FILTERS, q: "   " })).toBe(false);
    expect(isFiltering({ ...NO_FILTERS, q: "ai" })).toBe(true);
    expect(isFiltering({ ...NO_FILTERS, status: "open" })).toBe(true);
  });
});

describe("splitByMappability", () => {
  it("separates what the globe can pin from what it cannot", () => {
    const inPerson = hack({ id: "a" });
    const virtual = hack({ id: "b", format: "Virtual", lat: null, lng: null });
    // An in-person event we failed to geocode: not virtual, still unpinnable.
    const unplaced = hack({ id: "c", location: "Atlantis, XX", lat: null, lng: null });

    const { onMap, offMap } = splitByMappability([inPerson, virtual, unplaced]);
    expect(onMap.map((h) => h.id)).toEqual(["a"]);
    expect(offMap.map((h) => h.id)).toEqual(["b", "c"]);
  });

  it("keeps virtual events reachable once the list is filtered", () => {
    // The point of the panel (#18): filtering the globe must not make an online
    // hackathon disappear from the page — it never had a pin to lose.
    const list = [hack({ id: "a" }), hack({ id: "b", format: "Virtual", lat: null, lng: null })];
    const filtered = applyFilters(list, { ...NO_FILTERS, q: "hackmit" });
    expect(splitByMappability(filtered).offMap.map((h) => h.id)).toEqual(["b"]);
  });
});
