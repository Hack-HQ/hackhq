import { describe, it, expect } from "vitest";
import {
  parsePrizeValue,
  deriveState,
  splitTitle,
  themesFor,
} from "./listings";

// Minimal raw listing (deriveState only reads state/active).
const raw = (over: { state?: string; active?: boolean }) => ({
  id: "1",
  company_name: "X",
  title: "T",
  url: "https://x.com",
  ...over,
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
});
