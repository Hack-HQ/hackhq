import { describe, it, expect } from "vitest";
import { resolveAssetSrc, parseOpportunities, extractGallery } from "./parse-readme";

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

  it("falls back to raw.githubusercontent for non-assets repo-root files", () => {
    const out = resolveAssetSrc("README.md");
    expect(out).toContain("raw.githubusercontent.com");
    expect(out).toContain("README.md");
    expect(out).not.toContain("/repo-assets/");
  });

  it("maps existing assets/ files to /repo-assets/", () => {
    const out = resolveAssetSrc("assets/hackathons-banner.svg");
    expect(out).toBe("/repo-assets/hackathons-banner.svg");
  });
});

describe("extractGallery", () => {
  const gallery = (imgs: string) =>
    `<!-- GALLERY_START -->\n${imgs}\n<!-- GALLERY_END -->`;

  it("parses img tags when src precedes alt", () => {
    const photos = extractGallery(
      gallery('<img src="assets/team.jpg" alt="Team photo">'),
    );
    expect(photos).toHaveLength(1);
    expect(photos[0]?.alt).toBe("Team photo");
    expect(photos[0]?.src).toContain("team.jpg");
  });

  it("parses img tags when alt precedes src", () => {
    const photos = extractGallery(
      gallery('<img alt="Team photo" src="assets/team.jpg">'),
    );
    expect(photos).toHaveLength(1);
    expect(photos[0]?.alt).toBe("Team photo");
    expect(photos[0]?.src).toContain("team.jpg");
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

  it("parses escaped pipes in host without shifting columns", () => {
    const pipeMd = [
      "<!-- HACKATHONS_TABLE_START -->",
      "| Status | Host | Hackathon | Format | Location | Prize | Deadline | Application | Date Posted |",
      "| ------ | ---- | --------- | ------ | -------- | ----- | -------- | ----------- | ----------- |",
      '| ✅ **[OPEN]** | Foo \\| Bar | HackMIT 2026 | In-Person | Cambridge, MA | $20K | Jul 04, 2026 | <a href="https://hackmit.org/">Register</a> | Jun 27, 2026 |',
      "<!-- HACKATHONS_TABLE_END -->",
    ].join("\n");
    const ops = parseOpportunities(pipeMd);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.organization).toBe("Foo | Bar");
    expect(ops[0]?.title).toBe("HackMIT 2026");
    expect(ops[0]?.location).toBe("Cambridge, MA");
    expect(ops[0]?.url).toBe("https://hackmit.org/");
  });
});
