import { describe, expect, it } from "vitest";
import { NAV_LINKS, isActiveRoute } from "./nav";

describe("isActiveRoute", () => {
  it("matches the section itself", () => {
    expect(isActiveRoute("/globe", "/globe")).toBe(true);
  });

  it("matches a subpath of the section", () => {
    expect(isActiveRoute("/deck/some-hackathon", "/deck")).toBe(true);
  });

  it("does not match a different section", () => {
    expect(isActiveRoute("/deck", "/globe")).toBe(false);
  });

  it("does not match on a shared prefix", () => {
    // "/my" must not light up on "/mystery" — the boundary is the slash.
    expect(isActiveRoute("/mystery", "/my")).toBe(false);
  });

  it("matches home only exactly", () => {
    expect(isActiveRoute("/", "/")).toBe(true);
    expect(isActiveRoute("/globe", "/")).toBe(false);
  });
});

describe("NAV_LINKS", () => {
  it("carries the primary sections", () => {
    expect(NAV_LINKS.map(([, href]) => href)).toEqual([
      "/globe",
      "/deck",
      "/resources",
      "/my",
    ]);
  });
});
