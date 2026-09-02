import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import listings from "./generated/listings.json";

/**
 * public/site-data/ is how the outside world learns what this build contains.
 *
 * The deploy workflow refuses to record a deploy as shipped until the public
 * site serves the sha in build.json, and check_site_freshness.py compares the
 * repository against listings.json id by id. Both are only as good as these
 * files being an exact copy of what the loaders import, so that is what is
 * pinned here. pretest regenerates them, so they always exist under vitest.
 */

type Listing = { id: string };

const SITE_DATA = path.join(process.cwd(), "public", "site-data");

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(SITE_DATA, name), "utf8")) as T;
}

describe("public/site-data", () => {
  it("serves the exact listings snapshot the build was made from", () => {
    const served = readJson<Listing[]>("listings.json");
    const imported = listings as Listing[];
    expect(served.map((l) => l.id)).toEqual(imported.map((l) => l.id));
    expect(served).toEqual(imported);
  });

  it("records which commit was built", () => {
    const build = readJson<{ sha: string; builtAt: string; listings: number }>(
      "build.json",
    );
    expect(build.sha).toMatch(/^(?:[0-9a-f]{40}|unknown)$/);
    expect(build.listings).toBe((listings as Listing[]).length);
    expect(Number.isNaN(Date.parse(build.builtAt))).toBe(false);
  });
});
