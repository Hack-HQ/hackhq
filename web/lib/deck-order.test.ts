import { describe, expect, it } from "vitest";
import { filterDeckHackathons } from "./deck-order";
import type { Hackathon } from "./types-hq";

function hack(over: Partial<Hackathon> & { id: string; title: string }): Hackathon {
  return {
    host: "Host",
    tagline: null,
    url: "https://example.com",
    location: "Boston, MA",
    format: "In-Person",
    prize: null,
    prizeValue: 0,
    state: "open",
    deadline: null,
    startDate: null,
    endDate: null,
    daysLeft: 10,
    lat: null,
    lng: null,
    themes: [],
    postedAt: 0,
    featured: false,
    ...over,
  };
}

const defaults = { q: "", status: "all" as const, format: "all" as const };

describe("filterDeckHackathons", () => {
  const list = [
    hack({ id: "a", title: "Alpha", featured: false, daysLeft: 3 }),
    hack({ id: "b", title: "Beta Featured", featured: true, daysLeft: 20 }),
    hack({ id: "c", title: "Closed", state: "closed", featured: true }),
    hack({ id: "d", title: "Delta Featured", featured: true, daysLeft: 5 }),
  ];

  it("puts featured first when filters are at defaults", () => {
    const ids = filterDeckHackathons(list, defaults).map((h) => h.id);
    expect(ids).toEqual(["b", "d", "a"]);
  });

  it("does not boost featured when a status filter is active", () => {
    const ids = filterDeckHackathons(list, {
      ...defaults,
      status: "open",
    }).map((h) => h.id);
    // Relative order of open items unchanged (closed dropped): a, b, d
    expect(ids).toEqual(["a", "b", "d"]);
  });

  it("does not boost featured when searching", () => {
    const ids = filterDeckHackathons(list, {
      ...defaults,
      q: "featured",
    }).map((h) => h.id);
    expect(ids).toEqual(["b", "d"]);
  });
});
