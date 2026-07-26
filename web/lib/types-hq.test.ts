import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deadlineDisplay,
  eventDateDisplay,
  isActiveHackathon,
  submitGalleryPhotoUrl,
  submitIssueUrl,
  type Hackathon,
} from "./types-hq";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "..",
  ".github",
  "ISSUE_TEMPLATE",
  "link_only.yaml",
);

const GALLERY_TEMPLATE_PATH = path.join(
  process.cwd(),
  "..",
  ".github",
  "ISSUE_TEMPLATE",
  "gallery_photo.yaml",
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

describe("submitGalleryPhotoUrl", () => {
  it("targets the gallery_photo issue form", () => {
    const u = new URL(submitGalleryPhotoUrl({ hackathon: "HackMIT 2026" }));
    expect(u.pathname).toMatch(/\/issues\/new$/);
    expect(u.searchParams.get("template")).toBe("gallery_photo.yaml");
  });

  it("prefills title and hackathon to match the template prefix", () => {
    const u = new URL(submitGalleryPhotoUrl({ hackathon: "HackMIT 2026" }));
    expect(u.searchParams.get("title")).toBe("Photo: HackMIT 2026");
    expect(u.searchParams.get("hackathon")).toBe("HackMIT 2026");
  });

  it("prefills optional credit fields when provided", () => {
    const u = new URL(
      submitGalleryPhotoUrl({
        hackathon: "YHack",
        caption: "Demo night",
        credit: "Ada",
        creditUrl: "https://example.com/ada",
      }),
    );
    expect(u.searchParams.get("caption")).toBe("Demo night");
    expect(u.searchParams.get("credit")).toBe("Ada");
    expect(u.searchParams.get("credit_url")).toBe("https://example.com/ada");
  });

  it("uses field ids the gallery_photo template declares", () => {
    const template = fs.readFileSync(GALLERY_TEMPLATE_PATH, "utf8");
    const ids = [...template.matchAll(/^\s*id:\s*(\S+)/gm)].map((m) => m[1]);
    const params = new URL(
      submitGalleryPhotoUrl({
        hackathon: "X",
        caption: "c",
        credit: "n",
        creditUrl: "https://x.dev",
      }),
    ).searchParams;
    for (const key of params.keys()) {
      if (key === "template" || key === "title") continue;
      expect(ids, `gallery_photo.yaml has no field id "${key}"`).toContain(key);
    }
  });
});

function hackStub(over: Partial<Hackathon>): Hackathon {
  return {
    id: "1",
    host: "X",
    title: "T",
    tagline: null,
    url: "https://x.dev",
    location: "Online",
    format: "Virtual",
    prize: null,
    prizeValue: 0,
    state: "open",
    deadline: null,
    startDate: null,
    endDate: null,
    daysLeft: null,
    lat: null,
    lng: null,
    themes: [],
    postedAt: 0,
    ...over,
  };
}

describe("eventDateDisplay", () => {
  it("formats a start/end range", () => {
    expect(
      eventDateDisplay(
        hackStub({ startDate: "2026-09-12", endDate: "2026-09-14" }),
      ),
    ).toBe("Sep 12, 2026 - Sep 14, 2026");
  });

  it("formats a one-day event once", () => {
    expect(
      eventDateDisplay(
        hackStub({ startDate: "2026-09-12", endDate: "2026-09-12" }),
      ),
    ).toBe("Sep 12, 2026");
  });

  it("returns null when event dates are absent", () => {
    expect(eventDateDisplay(hackStub({}))).toBeNull();
  });
});

describe("isActiveHackathon", () => {
  it("excludes only closed listings from discovery surfaces", () => {
    expect(isActiveHackathon(hackStub({ state: "open" }))).toBe(true);
    expect(isActiveHackathon(hackStub({ state: "opens_soon" }))).toBe(true);
    expect(isActiveHackathon(hackStub({ state: "closing_soon" }))).toBe(true);
    expect(isActiveHackathon(hackStub({ state: "closed" }))).toBe(false);
  });
});

describe("deadlineDisplay", () => {
  it("formats a deadline and omits a missing value", () => {
    expect(deadlineDisplay(hackStub({ deadline: "2026-09-10" }))).toBe("Sep 10, 2026");
    expect(deadlineDisplay(hackStub({}))).toBeNull();
  });
});
