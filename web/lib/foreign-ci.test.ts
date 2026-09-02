import { describe, expect, it } from "vitest";
import { ALLOW_VAR, foreignCiError, FOREIGN_CI_MESSAGE } from "./foreign-ci";

/**
 * The guard that keeps a second pipeline from deploying this Worker.
 *
 * It has to fire in exactly one place — a Workers Builds build — and stay
 * silent everywhere else, because a false positive here breaks every local
 * build and the GitHub deploy along with it.
 */
describe("foreignCiError", () => {
  it("fails a Workers Builds build", () => {
    expect(foreignCiError({ WORKERS_CI: "1" })).toBe(FOREIGN_CI_MESSAGE);
  });

  it("names the dashboard step that actually fixes it", () => {
    const msg = foreignCiError({ WORKERS_CI: "1" }) ?? "";
    expect(msg).toContain("Settings -> Builds ->");
    expect(msg).toContain("deploy.yml");
    expect(msg).toContain(ALLOW_VAR);
  });

  it("stays silent on a laptop", () => {
    expect(foreignCiError({})).toBeNull();
  });

  it("stays silent in GitHub Actions", () => {
    // Actions sets CI and GITHUB_ACTIONS, never WORKERS_CI. Our own deploy
    // must not be blocked by the guard aimed at the other pipeline.
    expect(
      foreignCiError({ CI: "true", GITHUB_ACTIONS: "true", GITHUB_SHA: "abc" }),
    ).toBeNull();
  });

  it("can be overridden deliberately", () => {
    expect(foreignCiError({ WORKERS_CI: "1", [ALLOW_VAR]: "1" })).toBeNull();
    expect(foreignCiError({ WORKERS_CI: "1", [ALLOW_VAR]: "true" })).toBeNull();
  });

  it("is not overridden by an unset or empty opt-out", () => {
    expect(foreignCiError({ WORKERS_CI: "1", [ALLOW_VAR]: "" })).toBe(
      FOREIGN_CI_MESSAGE,
    );
    expect(foreignCiError({ WORKERS_CI: "1", [ALLOW_VAR]: "0" })).toBe(
      FOREIGN_CI_MESSAGE,
    );
  });
});
