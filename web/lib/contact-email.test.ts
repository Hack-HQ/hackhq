import { describe, expect, it } from "vitest";
import { buildRequestMailto, REQUEST_SUBJECT_PREFIX } from "./contact-email";

function parts(href: string) {
  const rest = href.split("mailto:")[1] ?? "";
  const [address = "", query = ""] = rest.split("?");
  const params = new URLSearchParams(query);
  return { address, subject: params.get("subject") ?? "", body: params.get("body") ?? "" };
}

describe("buildRequestMailto", () => {
  it("addresses HackHQ and carries the filterable prefix", () => {
    const { address, subject } = parts(
      buildRequestMailto({ kind: "bug", name: "Jo", message: "The globe spins backwards" }),
    );
    expect(address).toBe("hackheadquarters@gmail.com");
    // The prefix is what the Gmail filter keys on - it must lead the subject.
    expect(subject.startsWith(`${REQUEST_SUBJECT_PREFIX} Bug report:`)).toBe(true);
    expect(subject).toContain("The globe spins backwards");
  });

  it("labels an idea as an idea and puts the request in the subject", () => {
    const { subject, body } = parts(
      buildRequestMailto({ kind: "idea", name: "Sam", message: "Dark mode for the deck\nmore detail here" }),
    );
    expect(subject).toBe(`${REQUEST_SUBJECT_PREFIX} Feature idea: Dark mode for the deck`);
    expect(body).toContain("Type: Feature idea");
    expect(body).toContain("From: Sam");
    expect(body).toContain("more detail here");
  });

  it("clips a long first line so the subject stays scannable", () => {
    const long = "x".repeat(80);
    const { subject } = parts(buildRequestMailto({ kind: "bug", name: "", message: long }));
    expect(subject.endsWith("...")).toBe(true);
    expect(subject.length).toBeLessThan(REQUEST_SUBJECT_PREFIX.length + 80);
  });

  it("survives an empty name without inventing one in the subject", () => {
    const { subject, body } = parts(buildRequestMailto({ kind: "idea", name: "  ", message: "hi" }));
    expect(subject).toContain("hi");
    expect(body).toContain("From: (no name given)");
  });
});
