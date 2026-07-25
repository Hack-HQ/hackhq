import { describe, expect, it } from "vitest";
import {
  isHackathonId,
  isStage,
  parseTrackerEntries,
  sanitizeTrackerMap,
  sanitizeWinMap,
  splitEntries,
  toTrackerEntries,
} from "./tracker";

const ID_A = "57177cd1-cff8-4e80-b701-6811dbcdb1a4";
const ID_B = "4c7865aa-543e-4ac8-9f47-808da1bffddc";

describe("isStage", () => {
  it("accepts the four pipeline stages and nothing else", () => {
    expect(isStage("interested")).toBe(true);
    expect(isStage("going")).toBe(true);
    expect(isStage("won")).toBe(false);
    expect(isStage(undefined)).toBe(false);
  });
});

describe("isHackathonId", () => {
  it("accepts a listing UUID and rejects anything that isn't one", () => {
    expect(isHackathonId(ID_A)).toBe(true);
    expect(isHackathonId(ID_A.toUpperCase())).toBe(true);
    expect(isHackathonId("not-a-uuid")).toBe(false);
    // A SQL fragment must not reach a query as an id.
    expect(isHackathonId("' or 1=1 --")).toBe(false);
    expect(isHackathonId(null)).toBe(false);
  });
});

describe("sanitizeTrackerMap", () => {
  it("keeps known stages and drops everything else", () => {
    expect(
      sanitizeTrackerMap({ [ID_A]: "going", [ID_B]: "nonsense", x: 3 }),
    ).toEqual({ [ID_A]: "going" });
  });

  it("returns an empty map for a non-object", () => {
    expect(sanitizeTrackerMap(null)).toEqual({});
    expect(sanitizeTrackerMap("[]")).toEqual({});
  });
});

describe("sanitizeWinMap", () => {
  it("keeps only entries that are exactly true", () => {
    expect(
      sanitizeWinMap({ [ID_A]: true, [ID_B]: false, c: "true", d: 1 }),
    ).toEqual({ [ID_A]: true });
  });
});

describe("parseTrackerEntries", () => {
  it("keeps valid rows and defaults a missing win flag to false", () => {
    expect(
      parseTrackerEntries([{ hackathonId: ID_A, stage: "applied" }]),
    ).toEqual([{ hackathonId: ID_A, stage: "applied", isWin: false }]);
  });

  it("drops invalid rows without losing the valid ones", () => {
    const entries = parseTrackerEntries([
      { hackathonId: ID_A, stage: "going", isWin: true },
      { hackathonId: "nope", stage: "going" },
      { hackathonId: ID_B, stage: "invented" },
      null,
      "junk",
    ]);
    expect(entries).toEqual([
      { hackathonId: ID_A, stage: "going", isWin: true },
    ]);
  });

  it("keeps the first of a duplicated id, so an upsert can't conflict with itself", () => {
    const entries = parseTrackerEntries([
      { hackathonId: ID_A, stage: "going" },
      { hackathonId: ID_A, stage: "interested" },
    ]);
    expect(entries).toEqual([
      { hackathonId: ID_A, stage: "going", isWin: false },
    ]);
  });

  it("returns an empty list for a non-array", () => {
    expect(parseTrackerEntries({ hackathonId: ID_A })).toEqual([]);
  });
});

describe("splitEntries", () => {
  it("splits rows into the stage map and the win map", () => {
    expect(
      splitEntries([
        { hackathonId: ID_A, stage: "going", isWin: true },
        { hackathonId: ID_B, stage: "applied", isWin: false },
      ]),
    ).toEqual({
      tracked: { [ID_A]: "going", [ID_B]: "applied" },
      wins: { [ID_A]: true },
    });
  });
});

describe("toTrackerEntries", () => {
  it("pairs each stage with its win flag", () => {
    expect(
      toTrackerEntries({ [ID_A]: "going", [ID_B]: "applied" }, { [ID_A]: true }),
    ).toEqual([
      { hackathonId: ID_A, stage: "going", isWin: true },
      { hackathonId: ID_B, stage: "applied", isWin: false },
    ]);
  });

  it("drops ids that aren't UUIDs, so a hand-edited localStorage can't poison the import", () => {
    expect(toTrackerEntries({ "hack-1": "going" }, {})).toEqual([]);
  });

  it("drops ids missing from the known listing set", () => {
    expect(
      toTrackerEntries({ [ID_A]: "going", [ID_B]: "applied" }, {}, [ID_A]),
    ).toEqual([{ hackathonId: ID_A, stage: "going", isWin: false }]);
  });
});
