import { describe, expect, it } from "vitest";
import {
  RESOURCE_STAGES,
  RESOURCE_TEASER,
  RESOURCE_TOOLS,
  stageKicker,
} from "./resources";

describe("RESOURCE_STAGES", () => {
  it("gives every stage a unique id", () => {
    const ids = RESOURCE_STAGES.map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries tips and links for every stage", () => {
    for (const stage of RESOURCE_STAGES) {
      expect(stage.tips.length).toBeGreaterThan(0);
      expect(stage.links.length).toBeGreaterThan(0);
    }
  });

  it("links out over https only", () => {
    const hrefs = RESOURCE_STAGES.flatMap((s) => s.links.map((l) => l.href));
    for (const href of hrefs) expect(href.startsWith("https://")).toBe(true);
  });

  it("does not list the same link twice across the guide", () => {
    // "Hackathon Organizer Guide" once appeared under two stages with two
    // different titles, which read as two different resources.
    const hrefs = RESOURCE_STAGES.flatMap((s) => s.links.map((l) => l.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("stageKicker", () => {
  it("numbers stages from their position, starting at 01", () => {
    const kickers = RESOURCE_STAGES.map(stageKicker);
    expect(kickers[0]).toBe(`Stage 01 · ${RESOURCE_STAGES[0]?.label}`);
    expect(kickers[3]).toBe(`Stage 04 · ${RESOURCE_STAGES[3]?.label}`);
  });
});

describe("RESOURCE_TEASER", () => {
  it("points every tile at a section the page actually renders", () => {
    const targets = new Set([...RESOURCE_STAGES.map((s) => s.id), "tools"]);
    for (const tile of RESOURCE_TEASER) {
      expect(targets.has(tile.id)).toBe(true);
      expect(tile.href).toBe(`/resources#${tile.id}`);
    }
  });

  it("numbers a tile the same way the stage it links to is numbered", () => {
    // The drift this guards: a tile read "Stage 03 · Leveling up" while the
    // guide numbered that same section 04.
    for (const tile of RESOURCE_TEASER) {
      const index = RESOURCE_STAGES.findIndex((s) => s.id === tile.id);
      const stage = RESOURCE_STAGES[index];
      if (!stage) continue; // the toolkit tile is not a stage
      expect(stageKicker(stage, index).startsWith(tile.kicker)).toBe(true);
      expect(tile.title).toBe(stage.title);
    }
  });

  it("fills the 2x2 grid", () => {
    expect(RESOURCE_TEASER).toHaveLength(4);
  });
});

describe("RESOURCE_TOOLS", () => {
  it("gives every tool a non-empty checklist", () => {
    for (const tool of RESOURCE_TOOLS) {
      expect(tool.items.length).toBeGreaterThan(0);
    }
  });
});
