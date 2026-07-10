import { describe, it, expect } from "vitest";
import {
  parsePrizeValue,
  deriveState,
  daysUntilDeadline,
  siteStats,
  splitTitle,
  themesFor,
} from "./listings";
import type { Hackathon } from "./types-hq";

// Minimal raw listing (deriveState only reads state/active).
const raw = (over: { state?: string; active?: boolean }) => ({
  id: "1",
  company_name: "X",
  title: "T",
  url: "https://x.com",
  ...over,
});

function localMidnight(y: number, m: number, d: number): Date {
  const today = new Date(y, m, d);
  today.setHours(0, 0, 0, 0);
  return today;
}

function hackStub(over: Partial<Hackathon>): Hackathon {
  return {
    id: "1",
    host: "X",
    title: "T",
    tagline: null,
    url: "https://x.com",
    location: "TBA",
    format: "Virtual",
    prize: null,
    prizeValue: 0,
    state: "open",
    deadline: null,
    daysLeft: null,
    lat: null,
    lng: null,
    themes: [],
    postedAt: 0,
    ...over,
  };
}

describe("daysUntilDeadline", () => {
  const today = localMidnight(2026, 6, 9); // Jul 9, 2026

  it("returns 0 for today", () => {
    expect(daysUntilDeadline("2026-07-09", today)).toBe(0);
  });

  it("returns -1 for yesterday", () => {
    expect(daysUntilDeadline("2026-07-08", today)).toBe(-1);
  });

  it("returns 1 for tomorrow", () => {
    expect(daysUntilDeadline("2026-07-10", today)).toBe(1);
  });

  it("returns 7 for a deadline 7 days out", () => {
    expect(daysUntilDeadline("2026-07-16", today)).toBe(7);
  });

  it("returns 8 for a deadline 8 days out", () => {
    expect(daysUntilDeadline("2026-07-17", today)).toBe(8);
  });

  it("handles spring-forward DST (23-hour day)", () => {
    const springToday = localMidnight(2025, 2, 9); // Mar 9, 2025
    expect(daysUntilDeadline("2025-03-10", springToday)).toBe(1);
  });

  it("handles fall-back DST (25-hour day)", () => {
    const fallToday = localMidnight(2025, 10, 2); // Nov 2, 2025
    expect(daysUntilDeadline("2025-11-03", fallToday)).toBe(1);
  });
});

describe("deriveState from deadline", () => {
  const today = localMidnight(2026, 6, 9);

  it("closing_soon when deadline is today", () => {
    const daysLeft = daysUntilDeadline("2026-07-09", today);
    expect(daysLeft).toBe(0);
    expect(deriveState(raw({}), daysLeft)).toBe("closing_soon");
  });

  it("closed when deadline was yesterday", () => {
    const daysLeft = daysUntilDeadline("2026-07-08", today);
    expect(daysLeft).toBeLessThan(0);
    expect(deriveState(raw({}), daysLeft)).toBe("closed");
  });

  it("closing_soon at 7 days out, open at 8", () => {
    expect(deriveState(raw({}), daysUntilDeadline("2026-07-16", today))).toBe(
      "closing_soon",
    );
    expect(deriveState(raw({}), daysUntilDeadline("2026-07-17", today))).toBe("open");
  });
});

describe("siteStats", () => {
  it("excludes expired listings from closingSoon", () => {
    const list = [
      hackStub({ state: "closing_soon", daysLeft: 0 }),
      hackStub({ id: "2", state: "closed", daysLeft: -1 }),
    ];
    const stats = siteStats(list);
    expect(stats.closingSoon).toBe(1);
    expect(stats.open).toBe(1);
  });
});

describe("parsePrizeValue", () => {
  it("parses K / M suffixes and comma amounts", () => {
    expect(parsePrizeValue("$50K in prizes")).toBe(50_000);
    expect(parsePrizeValue("$2M")).toBe(2_000_000);
    expect(parsePrizeValue("$1,000,000")).toBe(1_000_000);
    expect(parsePrizeValue("$500")).toBe(500);
  });

  it("returns 0 for missing or unparseable input", () => {
    expect(parsePrizeValue(undefined)).toBe(0);
    expect(parsePrizeValue("")).toBe(0);
    expect(parsePrizeValue("Swag + prizes")).toBe(0);
    expect(parsePrizeValue("TBA")).toBe(0);
  });
});

describe("deriveState", () => {
  it("honors explicit opens_soon / closed / inactive", () => {
    expect(deriveState(raw({ state: "opens_soon" }), null)).toBe("opens_soon");
    expect(deriveState(raw({ state: "closed" }), 5)).toBe("closed");
    expect(deriveState(raw({ active: false }), 5)).toBe("closed");
  });

  it("derives status from daysLeft", () => {
    expect(deriveState(raw({}), -1)).toBe("closed");
    expect(deriveState(raw({}), 0)).toBe("closing_soon");
    expect(deriveState(raw({}), 7)).toBe("closing_soon");
    expect(deriveState(raw({}), 30)).toBe("open");
    expect(deriveState(raw({}), null)).toBe("open");
  });
});

describe("splitTitle", () => {
  it("splits a trailing parenthetical when the base is long enough", () => {
    expect(splitTitle("HackMIT 2026 (Weekend Hackathon)")).toEqual({
      title: "HackMIT 2026",
      tagline: "Weekend Hackathon",
    });
  });

  it("leaves a short base intact", () => {
    expect(splitTitle("AI (x)")).toEqual({ title: "AI (x)", tagline: null });
  });

  it("returns null tagline when there is no parenthetical", () => {
    expect(splitTitle("TreeHacks")).toEqual({
      title: "TreeHacks",
      tagline: null,
    });
  });
});

describe("themesFor", () => {
  it("tags matching themes", () => {
    expect(themesFor("AI agent hackathon")).toContain("AI");
    expect(themesFor("a fintech trading challenge")).toContain("FINTECH");
  });

  it("caps at three themes", () => {
    const many = themesFor("AI blockchain health climate fintech gaming");
    expect(many.length).toBeLessThanOrEqual(3);
  });

  it("returns [] when nothing matches", () => {
    expect(themesFor("generic build weekend")).toEqual([]);
  });

  it.each([
    ["Backblaze Generative Media Hackathon", "HEALTH"],
    ["Quantum Computing Hackathon", "FINTECH"],
    ["Ethics in Tech Hack", "WEB3"],
    ["Biography of Code", "HEALTH"],
    ["Immediate Impact Buildathon", "HEALTH"],
    ["Social Media Weekend", "HEALTH"],
  ])("does not false-positive %s as %s", (text, tag) => {
    expect(themesFor(text)).not.toContain(tag);
  });

  it.each([
    ["Health Hack", "HEALTH"],
    ["Biotech Jam", "HEALTH"],
    ["Medical Innovation Hack", "HEALTH"],
    ["Quant Trading Challenge", "FINTECH"],
    ["Ethereum Builders", "WEB3"],
    ["Blockchain Challenge", "WEB3"],
    ["Data Hackathon", "DATA"],
    ["Analytics Challenge", "DATA"],
  ])("tags %s as %s", (text, tag) => {
    expect(themesFor(text)).toContain(tag);
  });
});
