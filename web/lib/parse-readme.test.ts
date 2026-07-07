import { describe, it, expect } from "vitest";
import { resolveAssetSrc, parseOpportunities } from "./parse-readme";

describe("resolveAssetSrc", () => {
  it("passes absolute URLs through unchanged", () => {
    expect(resolveAssetSrc("https://x.com/a.png")).toBe("https://x.com/a.png");
    expect(resolveAssetSrc("http://x.com/a.png")).toBe("http://x.com/a.png");
  });

  it("returns '' for empty input", () => {
    expect(resolveAssetSrc("")).toBe("");
  });

  it("falls back to raw.githubusercontent for unknown local assets", () => {
    const out = resolveAssetSrc("assets/does-not-exist-xyz.png");
    expect(out).toContain("raw.githubusercontent.com");
    expect(out).toContain("assets/does-not-exist-xyz.png");
  });
});

describe("parseOpportunities", () => {
  const md = [
    "<!-- HACKATHONS_TABLE_START -->",
    "| Status | Host | Hackathon | Format | Location | Prize | Deadline | Application | Date Posted |",
    "| ------ | ---- | --------- | ------ | -------- | ----- | -------- | ----------- | ----------- |",
    '| ✅ **[OPEN]** | MIT | HackMIT 2026 | In-Person | Cambridge, MA | $20K | Jul 04, 2026 | <a href="https://hackmit.org/">Register</a> | Jun 27, 2026 |',
    "<!-- HACKATHONS_TABLE_END -->",
  ].join("\n");

  it("parses a well-formed hackathons table", () => {
    const ops = parseOpportunities(md);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.organization).toBe("MIT");
    expect(ops[0]?.title).toBe("HackMIT 2026");
    expect(ops[0]?.status).toBe("OPEN");
    expect(ops[0]?.url).toBe("https://hackmit.org/");
  });

  it("returns [] when there is no table", () => {
    expect(parseOpportunities("just some prose, no table")).toEqual([]);
  });
});
