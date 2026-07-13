import { describe, it, expect } from "vitest";
import { countKnownTracked } from "./tracker-utils";

describe("countKnownTracked", () => {
  it("ignores stale IDs missing from the current listing set", () => {
    const tracked = { a: "interested", stale: "going" };
    expect(countKnownTracked(tracked, ["a"])).toBe(1);
  });

  it("returns zero when every tracked ID is stale", () => {
    const tracked = { gone: "interested" };
    expect(countKnownTracked(tracked, ["a", "b"])).toBe(0);
  });

  it("counts all IDs when every tracked entry is known", () => {
    const tracked = { a: "interested", b: "going" };
    expect(countKnownTracked(tracked, ["a", "b", "c"])).toBe(2);
  });
});
