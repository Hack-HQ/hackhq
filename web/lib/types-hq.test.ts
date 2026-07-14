import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { submitIssueUrl } from "./types-hq";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "..",
  ".github",
  "ISSUE_TEMPLATE",
  "link_only.yaml",
);

describe("submitIssueUrl", () => {
  it("targets the link_only issue form", () => {
    // Not a free-text issue: the form is what applies the auto_extract label and
    // produces the fields the pipeline parses. Without it, approving a website
    // submission fails with "Missing required field: URL" (#19).
    const u = new URL(submitIssueUrl("HackMIT", "https://hackmit.org"));
    expect(u.pathname).toMatch(/\/issues\/new$/);
    expect(u.searchParams.get("template")).toBe("link_only.yaml");
  });

  it("prefills the hackathon link and title", () => {
    const u = new URL(submitIssueUrl("HackMIT", "https://hackmit.org"));
    expect(u.searchParams.get("url")).toBe("https://hackmit.org");
    expect(u.searchParams.get("title")).toBe("Add: HackMIT");
  });

  it("omits empty fields rather than prefilling blanks", () => {
    const u = new URL(submitIssueUrl("", "  "));
    expect(u.searchParams.has("url")).toBe(false);
    expect(u.searchParams.has("title")).toBe(false);
    expect(u.searchParams.get("template")).toBe("link_only.yaml");
  });

  it("escapes values instead of breaking the query string", () => {
    const u = new URL(submitIssueUrl("A&B Hack", "https://x.dev/?a=1&b=2"));
    expect(u.searchParams.get("title")).toBe("Add: A&B Hack");
    expect(u.searchParams.get("url")).toBe("https://x.dev/?a=1&b=2");
  });

  it("uses a field id the template actually declares", () => {
    // GitHub prefills a form field by its `id:`. If the template renames the
    // input, the query param silently stops filling anything and the submitter
    // lands on a blank form — no error, just a worse experience. Pin them.
    const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
    const ids = [...template.matchAll(/^\s*id:\s*(\S+)/gm)].map((m) => m[1]);

    const params = new URL(submitIssueUrl("X", "https://x.dev")).searchParams;
    for (const key of params.keys()) {
      if (key === "template" || key === "title") continue;
      expect(ids, `link_only.yaml has no field id "${key}"`).toContain(key);
    }
  });
});
